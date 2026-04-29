import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ProcessMapSchema, type ProcessMap } from "../schemas/process.js";
import { retrieveChunks } from "../tools/retrieval.js";
import { defineTool, runAgent, type AgentEvent } from "./loop.js";

const CARTOGRAPHER_SYSTEM = `You are the Cartographer, a specialist agent in the Throughline system.

Your single job: extract a faithful as-is process map from a corpus of source documents.
You do not diagnose problems. You do not propose redesigns. You report what you observe.

Discipline:
- Use the retrieve_chunks tool to gather evidence before recording any step.
- Run multiple targeted retrievals — query for actors, decisions, handoffs, and timing separately.
- Every step you record must cite at least one source chunk with a verbatim quote.
- If you cannot find evidence for a step, do not record it. Record what you observed and stop.
- Step IDs must be lowercase snake_case prefixed with 'step_' (e.g., step_intake_form).
- When you are done gathering evidence, call submit_process_map. This terminates your run.

You are paid for accuracy, not coverage. A short, well-cited map beats a sprawling, speculative one.`;

const retrieveTool = defineTool({
  name: "retrieve_chunks",
  description:
    "Search the project corpus for chunks relevant to a query. Returns the top-k chunks " +
    "with their document_id, chunk_id, source, and text. Run this multiple times with " +
    "different queries to build a complete picture.",
  input_schema: z.object({
    query: z.string().min(3).describe("Natural-language query, 3-15 words"),
    k: z.number().int().min(1).max(12).default(6),
    filter: z
      .object({ source: z.enum(["notion", "drive", "jira", "slack"]).optional() })
      .optional(),
  }),
  handler: async (input) => {
    const chunks = retrieveChunks(input);
    if (chunks.length === 0) {
      return "No chunks matched. Try a different query or remove the source filter.";
    }
    return chunks.map((c) => ({
      document_id: c.document_id,
      chunk_id: c.chunk_id,
      source: c.source,
      text: c.text,
      score: Number(c.score.toFixed(3)),
    }));
  },
});

export interface RunCartographerParams {
  client: Anthropic;
  model: string;
  scope: string;
  onEvent?: (event: AgentEvent) => void;
}

export async function runCartographer(
  params: RunCartographerParams,
): Promise<ProcessMap> {
  return runAgent({
    client: params.client,
    model: params.model,
    system: CARTOGRAPHER_SYSTEM,
    initialUserMessage: `Map the as-is process for: ${params.scope}.

Begin by retrieving chunks describing the overall process flow, then drill into actors,
decisions, handoffs, and timing. Submit your process map when you have enough evidence.`,
    tools: [retrieveTool],
    submit: {
      name: "submit_process_map",
      description: "Submit the final process map. This terminates your run.",
      result_schema: ProcessMapSchema,
    },
    onEvent: params.onEvent,
  });
}
