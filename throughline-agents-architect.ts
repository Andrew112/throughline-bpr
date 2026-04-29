import type Anthropic from "@anthropic-ai/sdk";
import {
  RedesignProposalSchema,
  type Diagnosis,
  type ProcessMap,
  type RedesignProposal,
} from "../schemas/process.js";
import { runAgent, type AgentEvent } from "./loop.js";

const ARCHITECT_SYSTEM = `You are the Architect, a specialist agent in the Throughline system.

You receive: (1) the as-is process map from the Cartographer, and (2) a Diagnosis from
the Detective. Your single job: propose 1-3 redesigned process variants that address
the findings, with clear tradeoffs.

Discipline:
- Every variant MUST list the finding IDs it addresses. A redesign that doesn't address
  a real finding is not a redesign — it's a guess.
- Variants should differ meaningfully. 'Add automation' and 'Add slightly more automation'
  are not two variants.
- For each variant, provide: a name, rationale, list of concrete changes, addressed
  findings, and expected improvements (with realistic percentages where possible).
- Pick a recommended variant. Justify the recommendation in your rationale.
- Do NOT invent new findings. Work from the diagnosis you were given.
- Call submit_redesign_proposal when complete.

You have no retrieval tool. Your job is synthesis from the artifacts you were handed,
not further discovery.`;

export interface RunArchitectParams {
  client: Anthropic;
  model: string;
  processMap: ProcessMap;
  diagnosis: Diagnosis;
  onEvent?: (event: AgentEvent) => void;
}

export async function runArchitect(
  params: RunArchitectParams,
): Promise<RedesignProposal> {
  const findingIds = params.diagnosis.findings.map((f) => f.id).join(", ") || "(none)";

  return runAgent({
    client: params.client,
    model: params.model,
    system: ARCHITECT_SYSTEM,
    initialUserMessage: `As-is process map:

${JSON.stringify(params.processMap, null, 2)}

Diagnosis:

${JSON.stringify(params.diagnosis, null, 2)}

Available finding IDs to address: ${findingIds}

Propose 1-3 redesigned variants. Each must address at least one finding above.
Submit your proposal when complete.`,
    tools: [], // Architect has no tools — pure synthesis
    submit: {
      name: "submit_redesign_proposal",
      description: "Submit the final redesign proposal. This terminates your run.",
      result_schema: RedesignProposalSchema,
    },
    onEvent: params.onEvent,
  });
}
