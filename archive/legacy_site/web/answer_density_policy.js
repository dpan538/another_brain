export const ANSWER_DENSITY_PROFILES = Object.freeze({
  mobile_default: {
    max_sentences: 2,
    target_sentences: 1,
    max_chars_zh: 110,
    target_chars_zh: 70,
    max_list_items: 3,
    max_compare_axes: 2
  },
  mobile_simplify: {
    max_sentences: 1,
    max_chars_zh: 60
  },
  mobile_followup: {
    max_sentences: 2,
    max_chars_zh: 100
  },
  mobile_list: {
    max_items: 4,
    max_list_items: 4,
    max_chars_zh: 140
  },
  mobile_compare: {
    max_axes: 2,
    max_compare_axes: 2,
    max_chars_zh: 140
  },
  desktop_default: {
    max_sentences: 4,
    max_chars_zh: 220
  }
});

export function selectAnswerDensity({ responseMode = "", answerStyle = "", uiProfile = "mobile", query = "" } = {}) {
  const mode = typeof responseMode === "string" ? responseMode : responseMode?.mode || "";
  let profile = uiProfile === "desktop" ? ANSWER_DENSITY_PROFILES.desktop_default : ANSWER_DENSITY_PROFILES.mobile_default;
  if (uiProfile !== "desktop" && /simplify|shorten/.test(`${mode} ${query}`)) profile = ANSWER_DENSITY_PROFILES.mobile_simplify;
  else if (uiProfile !== "desktop" && /followup|contextual/.test(mode)) profile = ANSWER_DENSITY_PROFILES.mobile_followup;
  else if (uiProfile !== "desktop" && /list/.test(answerStyle)) profile = ANSWER_DENSITY_PROFILES.mobile_list;
  else if (uiProfile !== "desktop" && /compare|comparison/.test(answerStyle)) profile = ANSWER_DENSITY_PROFILES.mobile_compare;
  return {
    ui_profile: uiProfile,
    max_sentences: profile.max_sentences || 2,
    target_sentences: profile.target_sentences || 1,
    max_chars_zh: profile.max_chars_zh || 110,
    max_chars: profile.max_chars_zh || 110,
    target_chars_zh: profile.target_chars_zh || profile.max_chars_zh || 70,
    max_list_items: profile.max_list_items || profile.max_items || 3,
    max_compare_axes: profile.max_compare_axes || profile.max_axes || 2,
    allow_followup_offer: true
  };
}
