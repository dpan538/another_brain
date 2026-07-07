import { buildAnswerRouteOutput, ROUTER_NON_CLAIMS } from "./answer_route.ts";
import { answerSurfaceForRoute } from "./answer_surfaces.ts";
import { classifyAnswerRoute } from "./route_classifier.ts";

export const R28ROUT0_POLICY_VERSION = "r28rout0-answer-surface-policy-v1";

function makeChineseFirstAnswer(text) {
  const cleaned = String(text || "").replace(/^static browser draft:\s*/i, "").trim();
  if (/[\u4e00-\u9fff]/.test(cleaned.slice(0, 80))) return cleaned;
  return cleaned ? `根据当前本地证据：${cleaned}` : "";
}

export function applyAnswerSurfacePolicy(routeInput = {}, options = {}) {
  const classified = options.route
    ? {
        route: options.route,
        use_model_draft: false,
        fallback_reason: options.fallbackReason || "",
        quality_flags: options.qualityFlags || []
      }
    : classifyAnswerRoute(routeInput);
  if (classified.use_model_draft) {
    return {
      ...buildAnswerRouteOutput({
        route: classified.route,
        useModelDraft: true,
        finalAnswer: makeChineseFirstAnswer(routeInput.model_output ?? routeInput.draft ?? ""),
        qualityFlags: classified.quality_flags,
        nonClaims: ROUTER_NON_CLAIMS
      }),
      answer_status: "final",
      fallback_used: false,
      answer_surface_policy_version: R28ROUT0_POLICY_VERSION
    };
  }

  const finalAnswer = answerSurfaceForRoute(classified.route);
  const isBoundaryFinal = classified.route === "identity_boundary";
  return {
    ...buildAnswerRouteOutput({
      route: classified.route,
      useModelDraft: false,
      finalAnswer,
      fallbackReason: classified.fallback_reason || options.fallbackReason || classified.route,
      qualityFlags: classified.quality_flags,
      nonClaims: ROUTER_NON_CLAIMS
    }),
    answer_status: isBoundaryFinal ? "final" : "fallback",
    fallback_used: !isBoundaryFinal,
    answer_surface_policy_version: R28ROUT0_POLICY_VERSION
  };
}
