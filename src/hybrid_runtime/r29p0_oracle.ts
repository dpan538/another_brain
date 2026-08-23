export type PanelAEquivalence = "EQUIVALENT" | "INEQUIVALENT" | "UNCERTAIN";
export type PanelAPreference = "A" | "B" | "TIE" | null;

export interface R29P0PanelAJudgment {
  equivalence: PanelAEquivalence;
  preference: PanelAPreference;
}

export interface R29P0OracleDecision {
  selected: "A" | "B";
  reason: "protected_diff" | "inequivalent" | "uncertain" | "equivalent_preference" | "canonical_or_tie";
  output: string;
}

export function constructR29P0Oracle(
  candidateA: string,
  candidateB: string,
  guardPassed: boolean,
  panelA: R29P0PanelAJudgment,
): R29P0OracleDecision {
  if (!guardPassed) return { selected: "A", reason: "protected_diff", output: candidateA };
  if (panelA.equivalence === "INEQUIVALENT") return { selected: "A", reason: "inequivalent", output: candidateA };
  if (panelA.equivalence === "UNCERTAIN") return { selected: "A", reason: "uncertain", output: candidateA };
  if (panelA.preference === "B") return { selected: "B", reason: "equivalent_preference", output: candidateB };
  return { selected: "A", reason: "canonical_or_tie", output: candidateA };
}
