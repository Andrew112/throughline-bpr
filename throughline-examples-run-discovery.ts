import Anthropic from "@anthropic-ai/sdk";
import { ONBOARDING_CORPUS } from "../fixtures/onboarding-corpus.js";
import { runDiscovery } from "../src/agents/orchestrator.js";
import { loadCorpus } from "../src/tools/retrieval.js";

/**
 * Run the full Cartographer -> Detective -> Architect pipeline against
 * the onboarding fixture corpus.
 *
 * Prereqs:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npm install
 *
 * Run:
 *   npm run discovery
 */
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY in your environment.");
    process.exit(1);
  }

  loadCorpus(ONBOARDING_CORPUS);

  const client = new Anthropic();
  const model = process.env.THROUGHLINE_MODEL ?? "claude-sonnet-4-6";

  // Per-phase token tally for the cost-attribution lesson in Module 12.
  const phaseTokens: Record<string, { input: number; output: number; calls: number }> = {
    cartography: { input: 0, output: 0, calls: 0 },
    diagnosis: { input: 0, output: 0, calls: 0 },
    redesign: { input: 0, output: 0, calls: 0 },
  };

  const t0 = Date.now();
  const result = await runDiscovery({
    client,
    model,
    scope: "Customer onboarding for new B2B SaaS accounts",
    onPhase: ({ phase, status }) => {
      const ts = new Date().toISOString().split("T")[1]?.slice(0, 8);
      console.log(`[${ts}] ${phase} :: ${status}`);
    },
    onAgentEvent: (phase, event) => {
      const bucket = phaseTokens[phase];
      if (!bucket) return;
      switch (event.type) {
        case "model_call_end":
          bucket.calls += 1;
          bucket.input += event.usage.input_tokens;
          bucket.output += event.usage.output_tokens;
          break;
        case "tool_call":
          console.log(`  ${phase} -> ${event.tool}(${truncate(JSON.stringify(event.input), 80)})`);
          break;
        case "submit_attempt":
          if (!event.ok) {
            console.log(`  ${phase} :: submit rejected (${event.issues?.length ?? 0} issues)`);
          }
          break;
      }
    },
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("\n========== DISCOVERY COMPLETE ==========");
  console.log(`Wall clock: ${elapsed}s\n`);

  console.log("---- PROCESS MAP ----");
  console.log(`Process: ${result.processMap.process_name}`);
  console.log(`Steps: ${result.processMap.steps.length}`);
  console.log(`Decisions: ${result.processMap.decisions.length}`);
  console.log(`Handoffs: ${result.processMap.handoffs.length}`);
  for (const step of result.processMap.steps) {
    console.log(`  ${step.id}: ${step.name} [${step.actor}] (${step.citations.length} cite${step.citations.length === 1 ? "" : "s"})`);
  }

  console.log("\n---- DIAGNOSIS ----");
  console.log(result.diagnosis.summary);
  console.log(`Findings: ${result.diagnosis.findings.length}`);
  for (const finding of result.diagnosis.findings) {
    console.log(`  [${finding.severity.toUpperCase()}] ${finding.id} (${finding.type})`);
    console.log(`    ${truncate(finding.description, 120)}`);
    console.log(`    affects: ${finding.affected_step_ids.join(", ")}`);
  }

  console.log("\n---- REDESIGN PROPOSAL ----");
  console.log(`Variants: ${result.redesign.variants.length}`);
  console.log(`Recommended: ${result.redesign.recommended_variant_name}\n`);
  for (const v of result.redesign.variants) {
    console.log(`  -- ${v.variant_name} --`);
    console.log(`     addresses: ${v.addresses_finding_ids.join(", ")}`);
    console.log(`     ${truncate(v.rationale, 140)}`);
    if (v.expected_improvements.cycle_time_reduction_pct !== null) {
      console.log(`     expected cycle time reduction: ${v.expected_improvements.cycle_time_reduction_pct}%`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\n---- ORCHESTRATOR WARNINGS ----");
    for (const w of result.warnings) console.log(`  ! ${w}`);
  }

  console.log("\n---- TOKEN USAGE BY PHASE ----");
  let totalInput = 0;
  let totalOutput = 0;
  for (const [phase, t] of Object.entries(phaseTokens)) {
    console.log(`  ${phase.padEnd(12)} ${t.calls} calls  ${t.input} in / ${t.output} out`);
    totalInput += t.input;
    totalOutput += t.output;
  }
  console.log(`  ${"TOTAL".padEnd(12)}             ${totalInput} in / ${totalOutput} out`);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

main().catch((err) => {
  console.error("Discovery failed:", err);
  process.exit(1);
});
