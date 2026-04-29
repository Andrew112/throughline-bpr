import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  DiagnosisSchema,
  type Diagnosis,
  type ProcessMap,
} from "../schemas/process.js";
import { retrieveChunks } from "../tools/retrieval.js";
import { defineTool, runAgent, type AgentEvent } from "./loop.js";

const DETECTIVE_SYSTEM = `You are the Detective, a specialist agent in the Throughline system.

You receive a process map produced by the Cartographer. Your single job: produce a
Diagnosis identifying bottlenecks, redundancies, compliance risks, and handoff failures.

Discipline:
- Examine each step, decision, and handoff in the map for issues.
- Use retrieve_chunks to find supporting evidence for every finding.
- Every finding must reference real step IDs from the map and cite source chunks.
- You may NOT modify the process map. If you believe the map is wrong, record it as a
  finding of type 'handoff_failure' with severity 'high'.
- Finding IDs must be lowercase snake_case prefixed with 'finding_' (e.g., finding_intake_delay).
- Severity is your judgment based on impact, not gut feeling — justify it in the description.
- Call submit_diagnosis when complete. Empty findings is acceptable if the process is clean.

You are paid for sharp, well-evidenced findings. Vague observations help no one.`;

const retrieveTool = defineTool({
  name: "retrieve_chunks",
  description:
    "Search the corpus for evidence supporting a potential finding. Use this to ground " +
    "every finding in source material — you are not allowed to invent issues from thin air.",
  input_schema: z.object({
    query: z.string().min(3),
    k: z.number().int().min(1).max(12).default(6),
    filter: z
      .object({ source: z.enum(["notion", "drive", "jira", "slack"]).optional() })
      .optional(),
  }),
  handler: async (input) => {
    const chunks = retrieveChunks(input);
    if (chunks.length === 0) {
      return "No chunks matched. Try a different query.";
    }
    return chunks.map((c) => ({
      document_id: c.document_id,
      chunk_id: c.chunk_id,
      source: c.source,
      text: c.text,
    }));
  },
});

export interface RunDetectiveParams {
  client: Anthropic;
  model: string;
  processMap: ProcessMap;
  onEvent?: (event: AgentEvent) => void;
}

export async function runDetective(params: RunDetectiveParams): Promise<Diagnosis> {
  return runAgent({
    client: params.client,
    model: params.model,
    system: DETECTIVE_SYSTEM,
    initialUserMessage: `Process map for analysis (as-is state):

${JSON.stringify(params.processMap, null, 2)}

Identify bottlenecks, redundancies, compliance risks, and handoff failures. Use
retrieve_chunks to gather evidence. Submit your diagnosis when complete.`,
    tools: [retrieveTool],
    submit: {
      name: "submit_diagnosis",
      description: "Submit the final diagnosis. This terminates your run.",
      result_schema: DiagnosisSchema,
    },
    onEvent: params.onEvent,
  });
}
