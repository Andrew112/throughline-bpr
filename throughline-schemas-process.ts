import { z } from "zod";

/**
 * Citations are the spine of Throughline's anti-hallucination strategy.
 * Every claim an agent makes must be traceable to a source chunk. If the
 * agent cannot find evidence, it should not record the claim.
 */
export const CitationSchema = z.object({
  document_id: z.string().describe("Stable identifier of the source document"),
  chunk_id: z.string().describe("Identifier of the specific chunk within the document"),
  quote: z
    .string()
    .min(10)
    .max(280)
    .describe("Verbatim excerpt (<=280 chars) from the chunk that supports the claim"),
});
export type Citation = z.infer<typeof CitationSchema>;

/**
 * A single operational step in a process map.
 * The Cartographer agent produces these. Citations are required, not optional.
 */
export const ProcessStepSchema = z.object({
  id: z
    .string()
    .regex(/^step_[a-z0-9_]+$/, "Step IDs must match step_<snake_case>")
    .describe("Stable ID for cross-references (e.g., step_intake_form)"),
  name: z.string().min(3).describe("Imperative-mood name, e.g., 'Submit intake form'"),
  actor: z
    .string()
    .min(2)
    .describe("Role or system performing the step, e.g., 'Customer Success Manager'"),
  inputs: z.array(z.string()).describe("Artifacts or data the step requires"),
  outputs: z.array(z.string()).describe("Artifacts or data the step produces"),
  cycle_time_minutes: z
    .number()
    .nonnegative()
    .nullable()
    .describe("Estimated active+wait time in minutes, or null if unknown"),
  citations: z
    .array(CitationSchema)
    .min(1)
    .describe("At least one citation grounding the step in source material"),
});
export type ProcessStep = z.infer<typeof ProcessStepSchema>;

export const DecisionSchema = z.object({
  after_step_id: z.string().describe("The step this decision follows"),
  condition: z.string().describe("Plain-language condition being evaluated"),
  branches: z
    .array(
      z.object({
        label: z.string().describe("Outcome label, e.g., 'Approved', 'Rejected'"),
        next_step_id: z.string().describe("ID of the step taken under this outcome"),
      }),
    )
    .min(2),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const HandoffSchema = z.object({
  from_actor: z.string(),
  to_actor: z.string(),
  artifact: z.string().describe("What is handed off — a doc, a ticket, a notification"),
});
export type Handoff = z.infer<typeof HandoffSchema>;

/**
 * The Cartographer's terminal artifact. The agent ends its run by submitting one.
 *
 * NOTE: A `superRefine` validates ID integrity — every reference must point
 * to a real step. This catches hallucinated step IDs at the seam, before the
 * Detective ever sees a malformed map.
 */
export const ProcessMapSchema = z
  .object({
    process_name: z.string().min(3),
    steps: z.array(ProcessStepSchema).min(1),
    decisions: z.array(DecisionSchema),
    handoffs: z.array(HandoffSchema),
  })
  .superRefine((map, ctx) => {
    const stepIds = new Set(map.steps.map((s) => s.id));
    map.decisions.forEach((d, di) => {
      if (!stepIds.has(d.after_step_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["decisions", di, "after_step_id"],
          message: `Decision references unknown step '${d.after_step_id}'`,
        });
      }
      d.branches.forEach((b, bi) => {
        if (!stepIds.has(b.next_step_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["decisions", di, "branches", bi, "next_step_id"],
            message: `Branch references unknown step '${b.next_step_id}'`,
          });
        }
      });
    });
    const actors = new Set(map.steps.map((s) => s.actor));
    map.handoffs.forEach((h, hi) => {
      if (!actors.has(h.from_actor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["handoffs", hi, "from_actor"],
          message: `Handoff from_actor '${h.from_actor}' is not in the actor set`,
        });
      }
      if (!actors.has(h.to_actor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["handoffs", hi, "to_actor"],
          message: `Handoff to_actor '${h.to_actor}' is not in the actor set`,
        });
      }
    });
  });
export type ProcessMap = z.infer<typeof ProcessMapSchema>;

/**
 * A Detective finding. Note `affected_step_ids` — findings must point at the
 * map, not float free. This is the contract that lets the Architect later
 * tie redesigns to specific findings.
 */
export const FindingSchema = z.object({
  id: z.string().regex(/^finding_[a-z0-9_]+$/),
  type: z.enum(["bottleneck", "redundancy", "compliance_risk", "handoff_failure"]),
  severity: z.enum(["low", "medium", "high"]),
  affected_step_ids: z.array(z.string()).min(1),
  description: z.string().min(20),
  evidence: z.array(CitationSchema).min(1),
});
export type Finding = z.infer<typeof FindingSchema>;

export const DiagnosisSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string().min(20),
});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

/**
 * A redesign variant. `addresses_finding_ids` is the load-bearing field —
 * an Architect cannot propose a redesign without explicitly tying it to
 * Detective findings. This prevents the war-story bug from the lesson plan
 * (Architect proposing a redesign that contradicts the Detective).
 */
export const RedesignVariantSchema = z.object({
  variant_name: z.string().min(3),
  rationale: z.string().min(30),
  addresses_finding_ids: z
    .array(z.string())
    .min(1)
    .describe("Every variant must address at least one finding from the diagnosis"),
  changes_summary: z
    .array(z.string())
    .min(1)
    .describe("Bullet-list of the concrete changes from the as-is map"),
  expected_improvements: z.object({
    cycle_time_reduction_pct: z.number().min(0).max(100).nullable(),
    cost_reduction_pct: z.number().min(0).max(100).nullable(),
    qualitative: z.array(z.string()),
  }),
});
export type RedesignVariant = z.infer<typeof RedesignVariantSchema>;

export const RedesignProposalSchema = z.object({
  variants: z.array(RedesignVariantSchema).min(1).max(3),
  recommended_variant_name: z.string(),
});
export type RedesignProposal = z.infer<typeof RedesignProposalSchema>;
