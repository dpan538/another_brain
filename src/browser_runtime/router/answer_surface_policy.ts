import { buildAnswerRouteOutput, ROUTER_NON_CLAIMS } from "./answer_route.ts";
import { trimAcceptedOpenAnswer } from "./answer_length_policy.ts";
import { answerSurfaceForRoute } from "./answer_surfaces.ts";
import { classifyAnswerRoute } from "./route_classifier.ts";
import { isMicroIntentRoute } from "./intent_taxonomy.ts";
import { isR28Surf2RouterSurfaceRoute } from "./r28surf2_intents.ts";
import { composeSurfaceForRoute } from "./surface_composer.ts";
import { surfaceCategoryForRoute } from "./surface_library.ts";

export const R28ROUT0_POLICY_VERSION = "r28rout0-answer-surface-policy-v1";

function makeChineseFirstAnswer(text) {
  const cleaned = String(text || "").replace(/^static browser draft:\s*/i, "").trim();
  if (/[\u4e00-\u9fff]/.test(cleaned.slice(0, 80))) return cleaned;
  return cleaned ? `根据当前本地证据：${cleaned}` : "";
}

export function applyAnswerSurfacePolicy(routeInput = {}, options = {}) {
  const classified = options.route
    ? (() => {
        const composed = composeSurfaceForRoute({
          route: options.route,
          input: routeInput.user_input ?? routeInput.input ?? "",
          fallbackReason: options.fallbackReason || "",
          runtimeStatus: {
            runtime_mode: routeInput.runtime_mode || routeInput.runtimeMode || "",
            decode_status: routeInput.decode_status || routeInput.decodeStatus || ""
          }
        });
        return {
          route: options.route,
          use_model_draft: false,
          final_answer: composed.final_answer,
          fallback_reason: options.fallbackReason || "",
          quality_flags: options.qualityFlags || composed.quality_flags || [],
          final_answer_source: composed.final_answer_source,
          surface_category: composed.surface_category,
          surface_variant: composed.surface_variant,
          length_policy: composed.length_policy,
          fragment_ids: composed.fragment_ids || [],
          indexed_surface: composed.indexed_surface === true,
          surface_composer_version: composed.composer_version,
          answer_bank: false,
          broad_answer_bank: false
        };
      })()
    : classifyAnswerRoute(routeInput);
  if (classified.use_model_draft) {
    const accepted = trimAcceptedOpenAnswer(makeChineseFirstAnswer(routeInput.model_output ?? routeInput.draft ?? ""));
    const category = classified.surface_category || surfaceCategoryForRoute(classified.route, classified.fallback_reason || "", routeInput.user_input ?? routeInput.input ?? "");
    return {
      ...buildAnswerRouteOutput({
        route: classified.route,
        useModelDraft: true,
        finalAnswer: accepted.text,
        qualityFlags: classified.quality_flags,
        nonClaims: ROUTER_NON_CLAIMS
      }),
      answer_status: "final",
      fallback_used: false,
      final_answer_source: "model_draft",
      surface_category: category,
      surface_variant: classified.surface_variant || "",
      length_policy: accepted.length_policy,
      broad_answer_bank: false,
      answer_surface_policy_version: R28ROUT0_POLICY_VERSION
    };
  }

  const composed = classified.final_answer
    ? classified
    : composeSurfaceForRoute({
        route: classified.route,
        input: routeInput.user_input ?? routeInput.input ?? "",
        fallbackReason: options.fallbackReason || classified.fallback_reason || classified.route,
        runtimeStatus: {
          runtime_mode: routeInput.runtime_mode || routeInput.runtimeMode || "",
          decode_status: routeInput.decode_status || routeInput.decodeStatus || ""
        }
      });
  const finalAnswer = composed.final_answer || answerSurfaceForRoute(classified.route);
  const isSurfaceFinal = classified.route === "identity_boundary" || isMicroIntentRoute(classified.route) || isR28Surf2RouterSurfaceRoute(classified.route);
  const finalAnswerSource = composed.final_answer_source || (isSurfaceFinal ? "router_surface" : "router_boundary");
  return {
    ...buildAnswerRouteOutput({
      route: classified.route,
      useModelDraft: false,
      finalAnswer,
      fallbackReason: classified.fallback_reason || options.fallbackReason || classified.route,
      qualityFlags: classified.quality_flags,
      nonClaims: ROUTER_NON_CLAIMS
    }),
    answer_status: isSurfaceFinal ? "final" : "fallback",
    fallback_used: !isSurfaceFinal,
    final_answer_source: finalAnswerSource,
    intent: classified.intent || "",
    intent_confidence: classified.intent_confidence || 0,
    surface_category: composed.surface_category || classified.surface_category || "",
    surface_variant: composed.surface_variant || classified.surface_variant || "",
    length_policy: composed.length_policy || classified.length_policy || null,
    fragment_ids: composed.fragment_ids || classified.fragment_ids || [],
    indexed_surface: composed.indexed_surface === true || classified.indexed_surface === true,
    answer_bank: false,
    broad_answer_bank: false,
    surface_composer_version: composed.surface_composer_version || composed.composer_version || classified.surface_composer_version || "",
    answer_surface_policy_version: R28ROUT0_POLICY_VERSION
  };
}
