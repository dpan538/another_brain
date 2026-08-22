export const LOCAL_SIGNAL_V2_VERSION = "local-signal.v2" as const;

export const ANCHOR_ROLES_V2 = [
  "context",
  "emphasis",
  "question_core",
  "contrast",
  "constraint",
  "tone_cue",
] as const;

export const STYLE_LABELS_V2 = [
  "quiet_warm",
  "concise_direct",
  "reflective",
  "playful_light",
  "balanced",
  "matter_of_fact",
] as const;

export type AnchorRoleV2 = typeof ANCHOR_ROLES_V2[number];
export type StyleLabelV2 = typeof STYLE_LABELS_V2[number];

export interface GroundedAnchorV2 {
  text: string;
  start_codepoint: number;
  end_codepoint: number;
  salience: number;
  role: AnchorRoleV2;
}

export interface LocalSignalPacketV2 {
  version: typeof LOCAL_SIGNAL_V2_VERSION;
  anchors: GroundedAnchorV2[];
  style: {
    label: StyleLabelV2;
  };
}
