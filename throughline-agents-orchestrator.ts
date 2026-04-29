import type Anthropic from "@anthropic-ai/sdk";
import type {
  Diagnosis,
  ProcessMap,
  RedesignProposal,
} from "../schemas/process.js";
import { runArchitect } from "./architect.js";
import { runCartographer } from "./cartographer.js";
import { runDetective } from "./detective.js";
import type { AgentEvent } from "./loop.js";

/**
 * Orchestrator-worker discipline:
 *   1. Workers never call workers. Coordination flows only through here.
 *   2. Handoffs are validated artifacts (the schemas), not free text.
 *   3. The orchestrator owns the run lifecycle: start, dispatch, persist,
 *      decide-next, terminate.
 *   4. Cross-artifact integrity is checked HERE — at the seam — not inside
 *      a worker. This is what catches the war-story bug from the lesson plan.
 *
 * Curriculum note: this is intentionally simple. Cleverness lives in the
 * workers; the orchestrator's value is reliability and traceability.
 */

export interface DiscoveryResult {
  processMap: ProcessMap;
  diagnosis: Diagnosis;
  redesign: RedesignProposal;
  warnings: string[];
}

export type Phase = "cartography" | "diagnosis" | "redesign";

export interface OrchestratorEvent {
  phase: Phase;
  status: "started" | "complete";
}

export interface RunDiscoveryParams {
  client: Anthropic;
  model: string;
  scope: string;
  onPhase?: (event: OrchestratorEvent) => void;
  onAgentEvent?: (phase: Phase, event: AgentEvent) => void;
}

export async function runDiscovery(
  params: RunDiscoveryParams,
): Promise<DiscoveryResult> {
  const { client, model, scope, onPhase = () => {}, onAgentEvent = () => {} } = params;
  const warnings: string[] = [];

  // -------- Phase 1: Cartography --------
  onPhase({ phase: "cartography", status: "started" });
  const processMap = await runCartographer({
    client,
    model,
    scope,
    onEvent: (e) => onAgentEvent("cartography", e),
  });
  onPhase({ phase: "cartography", status: "complete" });

  // -------- Phase 2: Diagnosis --------
  onPhase({ phase: "diagnosis", status: "started" });
  const diagnosis = await runDetective({
    client,
    model,
    processMap,
    onEvent: (e) => onAgentEvent("diagnosis", e),
  });
  onPhase({ phase: "diagnosis", status: "complete" });

  // Seam check: every finding must reference real step IDs from the map.
  // The Diagnosis schema can't express this on its own — it's a cross-artifact
  // invariant that the orchestrator is uniquely positioned to enforce.
  const stepIds = new Set(processMap.steps.map((s) => s.id));
  for (const finding of diagnosis.findings) {
    const orphans = finding.affected_step_ids.filter((id) => !stepIds.has(id));
    if (orphans.length > 0) {
      warnings.push(
        `Finding ${finding.id} references non-existent step IDs: ${orphans.join(", ")}`,
      );
    }
  }

  // -------- Phase 3: Redesign --------
  onPhase({ phase: "redesign", status: "started" });
  const redesign = await runArchitect({
    client,
    model,
    processMap,
    diagnosis,
    onEvent: (e) => onAgentEvent("redesign", e),
  });
  onPhase({ phase: "redesign", status: "complete" });

  // Seam check: every variant must address findings that actually exist.
  // This is the load-bearing check that prevents the war-story bug —
  // an Architect that proposes redesigns disconnected from the diagnosis.
  const findingIds = new Set(diagnosis.findings.map((f) => f.id));
  for (const variant of redesign.variants) {
    const ghosts = variant.addresses_finding_ids.filter((id) => !findingIds.has(id));
    if (ghosts.length > 0) {
      warnings.push(
        `Variant '${variant.variant_name}' addresses non-existent finding IDs: ${ghosts.join(", ")}`,
      );
    }
  }

  // Seam check: recommended variant must exist in the proposal.
  const variantNames = new Set(redesign.variants.map((v) => v.variant_name));
  if (!variantNames.has(redesign.recommended_variant_name)) {
    warnings.push(
      `Recommended variant '${redesign.recommended_variant_name}' is not among the proposed variants`,
    );
  }

  return { processMap, diagnosis, redesign, warnings };
}
