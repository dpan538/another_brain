import { createHash } from "node:crypto";

export type BlindSide = "LEFT" | "RIGHT";

function orientation(caseId: string, seed: string, comparison: string): "forward" | "swapped" {
  const digest = createHash("sha256").update(`${seed}:${comparison}:${caseId}`, "utf8").digest();
  return (digest[0] & 1) === 0 ? "forward" : "swapped";
}

export interface PanelABlindRecord {
  case_id: string;
  family: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  candidate_x: string;
  candidate_y: string;
  reviewer_class: "codex_agent_provisional_panel_a_not_human" | "human_owner_panel_a";
}

export function buildPanelABlindRecord(
  fixture: { case_id: string; family: string; messages: Array<{ role: "user" | "assistant"; content: string }> },
  candidateA: string,
  candidateB: string,
  seed: string,
  reviewerClass: PanelABlindRecord["reviewer_class"],
): { packet: PanelABlindRecord; private_map: { X: "A" | "B"; Y: "A" | "B" } } {
  const swapped = orientation(fixture.case_id, seed, "panel_a") === "swapped";
  return {
    packet: {
      case_id: fixture.case_id,
      family: fixture.family,
      messages: fixture.messages,
      candidate_x: swapped ? candidateB : candidateA,
      candidate_y: swapped ? candidateA : candidateB,
      reviewer_class: reviewerClass,
    },
    private_map: swapped ? { X: "B", Y: "A" } : { X: "A", Y: "B" },
  };
}

export interface PanelBBlindRecord {
  comparison_id: string;
  case_id: string;
  family: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  response_left: string;
  response_right: string;
  reviewer_class: "codex_agent_provisional_panel_b_not_human" | "human_owner_panel_b";
}

export function buildPanelBBlindRecord(
  fixture: { case_id: string; family: string; messages: Array<{ role: "user" | "assistant"; content: string }> },
  oracle: string,
  comparator: string,
  comparatorKind: "canonical" | "deterministic",
  seed: string,
  reviewerClass: PanelBBlindRecord["reviewer_class"],
): { packet: PanelBBlindRecord; private_map: { LEFT: "ORACLE" | "COMPARATOR"; RIGHT: "ORACLE" | "COMPARATOR" } } {
  const comparisonId = createHash("sha256")
    .update(`${seed}:panel_b_id:${comparatorKind}:${fixture.case_id}`, "utf8")
    .digest("hex")
    .slice(0, 20);
  const swapped = orientation(fixture.case_id, seed, `panel_b:${comparatorKind}`) === "swapped";
  return {
    packet: {
      comparison_id: comparisonId,
      case_id: fixture.case_id,
      family: fixture.family,
      messages: fixture.messages,
      response_left: swapped ? comparator : oracle,
      response_right: swapped ? oracle : comparator,
      reviewer_class: reviewerClass,
    },
    private_map: swapped
      ? { LEFT: "COMPARATOR", RIGHT: "ORACLE" }
      : { LEFT: "ORACLE", RIGHT: "COMPARATOR" },
  };
}
