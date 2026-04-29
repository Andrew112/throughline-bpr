import Anthropic from "@anthropic-ai/sdk";
import { z, type ZodSchema } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

/**
 * The agent loop — the load-bearing primitive of an agentic system.
 *
 * Curriculum note: this 80 lines is what frameworks like LangGraph
 * abstract away. Students who write it themselves understand why
 * `stop_reason` matters, why `tool_choice` matters, why the
 * "submit final result as a tool call" pattern is the most reliable
 * termination contract in agent design.
 */

export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput> | TOutput;

export interface ToolSpec<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  input_schema: ZodSchema<TInput>;
  handler: ToolHandler<TInput, TOutput>;
}

export interface SubmitTool<TResult> {
  name: string;
  description: string;
  result_schema: ZodSchema<TResult>;
}

export interface RunAgentParams<TResult> {
  client: Anthropic;
  model: string;
  system: string;
  initialUserMessage: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: ToolSpec<any, any>[];
  /**
   * The tool the agent calls to terminate the loop with a structured artifact.
   * The result_schema is enforced on the way out — invalid submissions are
   * fed back to the agent as a tool error so it can self-correct.
   */
  submit: SubmitTool<TResult>;
  maxIterations?: number;
  maxSubmitRetries?: number;
  /** Optional hook for tracing — call site can plug in Langfuse, console, etc. */
  onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | { type: "model_call_start"; iteration: number }
  | { type: "model_call_end"; iteration: number; usage: Anthropic.Usage }
  | { type: "tool_call"; iteration: number; tool: string; input: unknown }
  | { type: "tool_result"; iteration: number; tool: string; ok: boolean }
  | { type: "submit_attempt"; iteration: number; ok: boolean; issues?: string[] }
  | { type: "terminated"; iteration: number; reason: string };

export class AgentRunError extends Error {
  constructor(message: string, readonly iteration: number) {
    super(message);
    this.name = "AgentRunError";
  }
}

export async function runAgent<TResult>(
  params: RunAgentParams<TResult>,
): Promise<TResult> {
  const {
    client,
    model,
    system,
    initialUserMessage,
    tools,
    submit,
    maxIterations = 25,
    maxSubmitRetries = 2,
    onEvent = () => {},
  } = params;

  // Build the tool list for the API: regular tools + the submit tool.
  const toolDefs: Anthropic.Tool[] = [
    ...tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchema(t.input_schema, {
        target: "openApi3",
        $refStrategy: "none",
      }) as Anthropic.Tool["input_schema"],
    })),
    {
      name: submit.name,
      description: submit.description,
      input_schema: zodToJsonSchema(submit.result_schema, {
        target: "openApi3",
        $refStrategy: "none",
      }) as Anthropic.Tool["input_schema"],
    },
  ];

  const toolByName = new Map(tools.map((t) => [t.name, t]));
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: initialUserMessage },
  ];

  let submitRetries = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    onEvent({ type: "model_call_start", iteration });

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      tools: toolDefs,
      messages,
    });

    onEvent({ type: "model_call_end", iteration, usage: response.usage });

    // Append the assistant turn verbatim — preserving content blocks is
    // required for tool_use IDs to match on the next turn.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      onEvent({ type: "terminated", iteration, reason: "end_turn_without_submit" });
      throw new AgentRunError(
        "Agent ended its turn without calling the submit tool",
        iteration,
      );
    }

    if (response.stop_reason !== "tool_use") {
      onEvent({ type: "terminated", iteration, reason: response.stop_reason ?? "unknown" });
      throw new AgentRunError(
        `Unexpected stop_reason: ${response.stop_reason}`,
        iteration,
      );
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      // Submit terminates the loop — but only if validation passes.
      if (tu.name === submit.name) {
        const parsed = submit.result_schema.safeParse(tu.input);
        if (parsed.success) {
          onEvent({ type: "submit_attempt", iteration, ok: true });
          onEvent({ type: "terminated", iteration, reason: "submitted" });
          return parsed.data;
        }

        const issues = parsed.error.issues.map(
          (i) => `${i.path.join(".") || "<root>"}: ${i.message}`,
        );
        onEvent({ type: "submit_attempt", iteration, ok: false, issues });

        if (submitRetries >= maxSubmitRetries) {
          throw new AgentRunError(
            `Submit failed validation after ${maxSubmitRetries} retries:\n${issues.join("\n")}`,
            iteration,
          );
        }
        submitRetries += 1;

        // Hand the validation errors back so the model can self-correct.
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: [
            {
              type: "text",
              text:
                "Your submission failed schema validation. Fix these issues and resubmit:\n" +
                issues.map((i) => `  - ${i}`).join("\n"),
            },
          ],
        });
        continue;
      }

      const tool = toolByName.get(tu.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: [{ type: "text", text: `Unknown tool: ${tu.name}` }],
        });
        continue;
      }

      // Validate the model's tool input before running the handler.
      const inputParse = tool.input_schema.safeParse(tu.input);
      if (!inputParse.success) {
        const issues = inputParse.error.issues
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ");
        onEvent({ type: "tool_call", iteration, tool: tu.name, input: tu.input });
        onEvent({ type: "tool_result", iteration, tool: tu.name, ok: false });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: [{ type: "text", text: `Invalid arguments: ${issues}` }],
        });
        continue;
      }

      onEvent({ type: "tool_call", iteration, tool: tu.name, input: inputParse.data });
      try {
        const output = await tool.handler(inputParse.data);
        onEvent({ type: "tool_result", iteration, tool: tu.name, ok: true });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: [
            { type: "text", text: typeof output === "string" ? output : JSON.stringify(output) },
          ],
        });
      } catch (err) {
        onEvent({ type: "tool_result", iteration, tool: tu.name, ok: false });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: [{ type: "text", text: `Tool error: ${err instanceof Error ? err.message : String(err)}` }],
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new AgentRunError(`Agent exceeded ${maxIterations} iterations`, maxIterations);
}

/**
 * Helper to declare a tool with full type inference from its Zod schema.
 * Curriculum note: forces students to think of tools as typed contracts.
 */
export function defineTool<TInput, TOutput>(spec: {
  name: string;
  description: string;
  input_schema: ZodSchema<TInput>;
  handler: ToolHandler<TInput, TOutput>;
}): ToolSpec<TInput, TOutput> {
  return spec;
}
