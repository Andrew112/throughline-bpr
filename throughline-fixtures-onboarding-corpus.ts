import type { Chunk } from "../src/tools/retrieval.js";

/**
 * A synthetic but realistic corpus for a B2B SaaS customer onboarding process.
 * Mixes a Notion runbook, a Drive SOP, Jira tickets, and Slack threads —
 * roughly the shape of artifacts a real Throughline customer would have.
 *
 * Process being described (intentionally a bit messy):
 *   1. Sales handoff — AE creates onboarding ticket
 *   2. CSM intro email
 *   3. Customer fills intake form
 *   4. CSM reviews intake; routes to standard or enterprise track
 *   5. Provisioning (engineering ticket if enterprise)
 *   6. Kickoff call
 *   7. Training session (1-3 sessions depending on plan)
 *   8. 30-day check-in
 *   9. Handoff to Account Manager
 */
export const ONBOARDING_CORPUS: Chunk[] = [
  // ---------- Notion runbook ----------
  {
    document_id: "notion_onboarding_runbook",
    chunk_id: "notion_onboarding_runbook#1",
    source: "notion",
    text: "Customer Success Onboarding Runbook. When a deal closes, the Account Executive (AE) is responsible for creating an onboarding ticket in Jira within 24 hours. The ticket must include the signed contract, plan tier (Standard or Enterprise), primary contact, and any custom commitments made during sales.",
  },
  {
    document_id: "notion_onboarding_runbook",
    chunk_id: "notion_onboarding_runbook#2",
    source: "notion",
    text: "Once the onboarding ticket is created, the assigned Customer Success Manager (CSM) sends an intro email within 2 business days. The intro email includes a link to the intake form. The intake form collects technical contacts, integration requirements, and target go-live date.",
  },
  {
    document_id: "notion_onboarding_runbook",
    chunk_id: "notion_onboarding_runbook#3",
    source: "notion",
    text: "The CSM reviews the completed intake form within 1 business day. If the customer is on the Enterprise plan, the CSM creates a provisioning ticket for the Platform Engineering team. Standard customers are auto-provisioned. The CSM then schedules a kickoff call with the customer.",
  },
  {
    document_id: "notion_onboarding_runbook",
    chunk_id: "notion_onboarding_runbook#4",
    source: "notion",
    text: "Training sessions: Standard customers receive one 60-minute training session. Enterprise customers receive up to three 90-minute training sessions. Training is conducted by a Solutions Engineer (SE) on staff. The CSM attends the first session.",
  },
  {
    document_id: "notion_onboarding_runbook",
    chunk_id: "notion_onboarding_runbook#5",
    source: "notion",
    text: "30-day check-in. The CSM holds a 30-minute check-in with the customer 30 days post-go-live to review usage, address blockers, and confirm satisfaction. After the check-in, the customer is handed off to an Account Manager for ongoing relationship management.",
  },

  // ---------- Drive SOP ----------
  {
    document_id: "drive_sop_provisioning",
    chunk_id: "drive_sop_provisioning#1",
    source: "drive",
    text: "Enterprise Provisioning SOP. Platform Engineering provisions enterprise tenants within 5 business days of receiving a provisioning ticket. The ticket must specify SSO requirements, data residency, and any custom domain configuration. Provisioning includes tenant creation, SSO setup, and a smoke test.",
  },
  {
    document_id: "drive_sop_provisioning",
    chunk_id: "drive_sop_provisioning#2",
    source: "drive",
    text: "If the intake form is incomplete or missing SSO details, Platform Engineering will reject the provisioning ticket and send it back to the CSM. Round-trips between CSM and Platform Engineering on incomplete intake data are the most common cause of onboarding delays.",
  },

  // ---------- Jira tickets ----------
  {
    document_id: "jira_onboarding_tickets",
    chunk_id: "jira_onboarding_tickets#1",
    source: "jira",
    text: "ONB-1247: Customer Acme Industries (Enterprise). Onboarding ticket created 2024-03-04 by AE Sarah Chen. Intake form sent 2024-03-08 (4 days later, SLA missed). Provisioning ticket created 2024-03-15 — rejected for missing SSO config. Re-submitted 2024-03-22. Provisioning complete 2024-04-01. Kickoff call held 2024-04-03. Total cycle time: 30 days. Target was 14 days.",
  },
  {
    document_id: "jira_onboarding_tickets",
    chunk_id: "jira_onboarding_tickets#2",
    source: "jira",
    text: "ONB-1251: Customer Vertex Corp (Enterprise). The CSM was on PTO when the onboarding ticket was assigned, no backup was named. Intake email sent 6 business days late. Customer escalated to VP Customer Success on day 8.",
  },
  {
    document_id: "jira_onboarding_tickets",
    chunk_id: "jira_onboarding_tickets#3",
    source: "jira",
    text: "ONB-1259: Customer Beacon Health (Enterprise, healthcare). Provisioning ticket flagged for compliance review — BAA not on file. Provisioning blocked for 9 days while Legal reviewed. Process for compliance pre-checks during sales handoff is unclear.",
  },

  // ---------- Slack threads ----------
  {
    document_id: "slack_cs_internal",
    chunk_id: "slack_cs_internal#1",
    source: "slack",
    text: "@channel — three Enterprise onboardings stuck in provisioning this month because intake forms didn't capture SSO details properly. We need to either update the intake form or add a CSM checklist before submitting to Platform Eng. Thoughts? — Maria, Sr CSM",
  },
  {
    document_id: "slack_cs_internal",
    chunk_id: "slack_cs_internal#2",
    source: "slack",
    text: "Replying to Maria — agreed. Also the handoff from CSM to AM after the 30-day check-in is super inconsistent. Some AMs find out about their new accounts via Slack mention, others not until the customer reaches out for a renewal conversation. We don't have a defined handoff artifact. — David, AM Lead",
  },
  {
    document_id: "slack_cs_internal",
    chunk_id: "slack_cs_internal#3",
    source: "slack",
    text: "FYI — we ran the numbers for Q1: average Enterprise onboarding cycle time is 24 days against a 14-day target. Standard onboardings average 9 days against a 7-day target. The Enterprise overage is almost entirely in the provisioning round-trip. — Priya, CS Ops",
  },
];
