# Throughline Agents — Module 6 Reference Implementation

Working code for the agentic core of [Throughline](../throughline-project-design.md):
an orchestrator-worker multi-agent system for business process discovery and redesign.

This is the slice that makes Throughline *Throughline* and not generic SaaS.
Three specialist agents — **Cartographer**, **Detective**, **Architect** — coordinated
by a static orchestrator, with schema-validated handoffs at every seam.

## What's here

```
src/
  schemas/process.ts       Zod schemas for ProcessMap, Diagnosis, RedesignProposal.
                           These are the seam contracts. Read them first.
  tools/retrieval.ts       In-memory chunk retrieval (stand-in for pgvector).
  agents/
    loop.ts                The framework-free agent loop. ~200 lines, no magic.
    cartographer.ts        Extracts the as-is process map from the corpus.
    detective.ts           Diagnoses bottlenecks, redundancies, risks.
    architect.ts           Proposes redesign variants tied to findings.
    orchestrator.ts        Coordinates the three with cross-artifact integrity checks.
fixtures/
  onboarding-corpus.ts     Synthetic B2B SaaS onboarding artifacts (Notion/Drive/Jira/Slack).
examples/
  run-discovery.ts         End-to-end runnable example.
```

## Running it

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run discovery
```

You'll see something like:

```
[14:22:18] cartography :: started
  cartography -> retrieve_chunks({"query":"customer onboarding process flow","k":8})
  cartography -> retrieve_chunks({"query":"intake form and CSM responsibilities"})
  cartography -> retrieve_chunks({"query":"provisioning enterprise customers"})
[14:22:41] cartography :: complete
[14:22:41] diagnosis :: started
  ...
[14:23:15] redesign :: complete

========== DISCOVERY COMPLETE ==========
Wall clock: 57.2s

---- PROCESS MAP ----
Process: B2B SaaS Customer Onboarding
Steps: 9
...
```

A run uses on the order of 30-60K input tokens and 5-10K output tokens — call it
~$0.30 per run on Sonnet at current pricing. Cheap to iterate on.

Override the model with `THROUGHLINE_MODEL=claude-haiku-4-5` for ~10x cheaper but
worse-quality runs (instructive in itself — the curriculum's Module 8 covers this
tradeoff).

## How it maps to the curriculum

| File | Curriculum module |
|---|---|
| `agents/loop.ts` | **Module 1** (the agent loop) and **Module 2** (tool design — note the Zod-validated tool inputs, the submit-as-tool termination contract, the validation-error retry path) |
| `tools/retrieval.ts` | **Module 4** (RAG) — the contract; Module 4 swaps the in-memory implementation for pgvector + Voyage embeddings |
| `schemas/process.ts` | **Module 7** (structured outputs and self-correcting loops) — the `superRefine` cross-field validation is exactly the kind of "validation as training signal" that drives the retry loop in `loop.ts` |
| `agents/cartographer.ts`, `detective.ts`, `architect.ts` | **Module 6** (specialist agents) |
| `agents/orchestrator.ts` | **Module 6** (orchestrator-worker pattern, cross-artifact integrity checks at the seam) |
| `examples/run-discovery.ts` (the `onAgentEvent` wiring) | **Module 9** (observability) — every event a Langfuse trace would record is exposed here as a callback. Wiring Langfuse in is a 30-line change. |

## The discipline this code enforces

A few things to point out to students reading the code:

- **The submit-as-tool pattern.** Each agent ends its run by calling a `submit_*`
  tool whose schema is the artifact it must produce. Validation happens at the
  loop boundary. Failed submissions feed validation errors back to the model
  for a bounded number of retries (`maxSubmitRetries`). This is the most reliable
  termination contract in agent design — far better than "stop when the model
  says it's done."

- **Workers never call workers.** The Cartographer has no Detective tool. The
  Architect has no retrieval tool. Coordination flows only through the
  orchestrator. This is what makes the traces readable and the system debuggable.

- **Cross-artifact invariants live in the orchestrator, not the schemas.**
  `RedesignVariantSchema` cannot validate that `addresses_finding_ids` references
  *real* findings — only the orchestrator can, because only the orchestrator
  has both the diagnosis and the redesign in scope. The orchestrator surfaces
  these as `warnings` rather than throwing, because in production you want
  to log them, not blow up a 60-second run on a citation typo.

- **No framework.** The loop in `agents/loop.ts` is what every agent framework
  abstracts away. Reading it once teaches what frameworks are doing under the hood.

## Extending this

The natural next moves, ordered by leverage:

1. **Wire Langfuse into `onEvent`** (Module 9). Every event you'd want to trace
   is already being emitted — you're just routing them to `console.log` instead
   of a tracer. ~30 lines.
2. **Replace `tools/retrieval.ts`** with a real Supabase + pgvector + Voyage
   implementation (Module 4). The interface stays identical.
3. **Add the Simulator agent** — Monte Carlo on cycle time under each redesign
   variant. This is the most fun module to teach because it forces students to
   think about deterministic tools alongside LLM agents.
4. **Add MCP integration** (Module 5). The retrieval tool currently reads from
   a static corpus; in production it ingests via Notion / Google Drive / Atlassian
   MCP servers. Replace `loadCorpus` with an ingestion phase that pulls live.

## Known limitations (deliberately)

- No persistence. Production Throughline persists every artifact in Postgres
  with RLS for multi-tenant isolation (Module 12). This example holds everything
  in memory.
- No async / Inngest. The discovery run blocks the process. Production moves
  this to durable steps with mid-run resumption (Module 11).
- No evals. The judge and structural-check infrastructure from Module 9 lives
  in a separate package. Wire that in alongside this code.
- Retrieval is keyword overlap, not semantic. Module 4 fixes this; the contract
  is the same.

These omissions are intentional — adding any of them to this slice would dilute
the lesson. Each one is its own module.
