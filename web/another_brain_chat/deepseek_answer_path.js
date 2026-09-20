// DeepSeek product answer path.
//
// One turn = at most one billed DeepSeek completion. A retry is permitted only
// before the first content token, so the user never sees an answer restart
// mid-stream and a retry can never double-charge a completed response.
//
// The local q4 model is deliberately not in this path. Two independent findings
// put it there: with a correct MLX forward the 96M weights scored 0/5 on all
// twelve dialogue behaviour families (R29B2M-R3), and the deployed browser
// worker executes attention over a single token, so its generation is not
// contextual at all. Local retrieval and the deterministic router remain the
// offline fallback when no key is present or the call fails.

import {
  DeepSeekError,
  DEFAULT_DEEPSEEK_MODEL,
  buildDeepSeekRequest,
  streamDeepSeek
} from "./deepseek_browser_adapter.js";
import { buildSystemPrompt, PRODUCT_SYSTEM_PROMPT_ID } from "./deepseek_system_prompt.js";
import { deterministicLengthPolicy, maxTokensForClass } from "./deterministic_length_policy.js";
import { hasKey, readKey, redactKeyMaterial } from "./deepseek_key_store.js";
import { HeuristicSignalProvider, ProjectModelSignalProvider } from "./local_signal_provider.js";
import { compileStylePolicy } from "./style_policy_compiler.js";
import { buildEvidencePacket } from "./evidence_packet.js";

export const ANSWER_SOURCE_DEEPSEEK = "deepseek_remote";
export const ANSWER_SOURCE_LOCAL_FALLBACK = "local_static_fallback";

export const DEFAULT_SESSION_LIMITS = Object.freeze({
  requests: 200,
  inputTokens: 400_000,
  outputTokens: 80_000,
  concurrency: 1
});

export class SpendingGuard {
  constructor(limits = DEFAULT_SESSION_LIMITS) {
    this.limits = { ...DEFAULT_SESSION_LIMITS, ...limits };
    this.requestCount = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.active = 0;
  }

  checkBeforeRequest() {
    if (this.active >= this.limits.concurrency) return { ok: false, reason: "concurrency_limit_reached" };
    if (this.requestCount >= this.limits.requests) return { ok: false, reason: "session_request_limit_reached" };
    if (this.inputTokens >= this.limits.inputTokens) return { ok: false, reason: "session_input_token_limit_reached" };
    if (this.outputTokens >= this.limits.outputTokens) return { ok: false, reason: "session_output_token_limit_reached" };
    return { ok: true };
  }

  open() {
    this.active += 1;
    this.requestCount += 1;
  }

  close() {
    this.active = Math.max(0, this.active - 1);
  }

  recordUsage({ input_tokens = 0, output_tokens = 0 } = {}) {
    this.inputTokens += Number(input_tokens) || 0;
    this.outputTokens += Number(output_tokens) || 0;
  }

  snapshot() {
    return {
      requests: this.requestCount,
      input_tokens: this.inputTokens,
      output_tokens: this.outputTokens,
      request_limit: this.limits.requests
    };
  }
}

function makeTurnId() {
  const random = Math.floor(Math.random() * 1e9).toString(36);
  return `turn_${Date.now().toString(36)}_${random}`;
}

function nowMs() {
  return typeof performance === "object" && performance && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function createDeepSeekAnswerPath(options = {}) {
  const {
    getKey = readKey,
    keyPresent = hasKey,
    fetchImpl,
    model = DEFAULT_DEEPSEEK_MODEL,
    limits = DEFAULT_SESSION_LIMITS,
    // Off by default. See local_signal_provider.js for the blocking evidence.
    localSignalEnabled = false,
    signalProvider = null,
    firstTokenTimeoutMs,
    totalTimeoutMs
  } = options;

  const guard = new SpendingGuard(limits);
  const telemetry = [];
  const provider = signalProvider
    ?? (localSignalEnabled ? new HeuristicSignalProvider() : new ProjectModelSignalProvider());
  const controllers = new Map();
  let primed = false;

  async function buildLocalSignal(turnId, userText) {
    if (!localSignalEnabled) return { instruction: null, packet: null, provider_type: provider.providerType, used: false };
    try {
      if (!(await provider.ready())) {
        return { instruction: null, packet: null, provider_type: provider.providerType, used: false };
      }
      const packet = await provider.analyze({ turnId, currentUserMessage: userText });
      const compiled = compileStylePolicy(packet, userText);
      return { instruction: compiled.instruction, packet, provider_type: provider.providerType, used: true };
    } catch (error) {
      // A signal failure must never block the answer.
      return {
        instruction: null,
        packet: null,
        provider_type: provider.providerType,
        used: false,
        error: redactKeyMaterial(error?.message || "local_signal_failed")
      };
    }
  }

  async function runOnce({ request, apiKey, signal, onToken, turnId }) {
    let text = "";
    let finishReason = null;
    let firstTokenAt = null;
    let usage = null;
    let reasoningSeen = false;
    const startedAt = nowMs();

    for await (const event of streamDeepSeek(request, {
      apiKey,
      signal,
      fetchImpl,
      firstTokenTimeoutMs,
      totalTimeoutMs
    })) {
      if (event.type === "content") {
        if (firstTokenAt === null) firstTokenAt = nowMs();
        text += event.content;
        if (typeof onToken === "function") onToken(event.content, text);
      } else if (event.type === "usage") {
        usage = event;
      } else if (event.type === "finish") {
        finishReason = event.finish_reason;
      } else if (event.type === "reasoning_present") {
        reasoningSeen = true;
      }
    }

    return {
      text,
      finishReason,
      reasoningSeen,
      usage,
      turnId,
      firstTokenMs: firstTokenAt === null ? null : Math.round(firstTokenAt - startedAt),
      totalMs: Math.round(nowMs() - startedAt)
    };
  }

  return {
    get spending() {
      return guard.snapshot();
    },

    get telemetry() {
      return telemetry.slice();
    },

    get localSignalEnabled() {
      return localSignalEnabled;
    },

    available() {
      return Boolean(keyPresent());
    },

    cancel(turnId) {
      if (turnId) controllers.get(turnId)?.abort("user_cancel");
      else for (const controller of controllers.values()) controller.abort("user_cancel");
    },

    /**
     * Warms DeepSeek's prompt cache for this session's stable prefix.
     *
     * Cache-hit input is priced at $0.007 per million tokens against $0.22 for
     * a miss, a 31x difference, and a cached prefix also skips its prefill. The
     * first turn of a session pays both unless the prefix is sent ahead of it.
     *
     * This asks for one token so the request is as cheap as possible. It is
     * called on input focus rather than on page load, so a visitor who never
     * types is never billed for it.
     *
     * Effectiveness is unverified: the provider documents cache hit and miss
     * counters, and telemetry records them, but whether this specific priming
     * call populates the cache for the following turn has not been measured
     * against a live key. Treat the recorded hit counts as the evidence.
     */
    async primeCache({ contextCapsule = "", signal } = {}) {
      if (primed) return { ok: true, skipped: "already_primed" };
      const apiKey = getKey();
      if (!apiKey) return { ok: false, reason: "deepseek_api_key_absent" };
      const allowed = guard.checkBeforeRequest();
      if (!allowed.ok) return { ok: false, reason: allowed.reason };

      primed = true;
      const lengthPolicy = deterministicLengthPolicy("");
      const request = buildDeepSeekRequest({
        systemPrompt: buildSystemPrompt({ lengthInstruction: lengthPolicy.instruction }),
        conversation: [{ role: "user", content: "." }],
        contextCapsule,
        model,
        maxTokens: 1
      });
      guard.open();
      try {
        const result = await runOnce({ request, apiKey, signal, turnId: "prime" });
        if (result.usage) guard.recordUsage(result.usage);
        telemetry.push({ turn_id: "prime", kind: "cache_prime", model,
                         input_tokens: result.usage?.input_tokens ?? null,
                         cache_hit_tokens: result.usage?.cache_hit_tokens ?? null,
                         total_ms: result.totalMs });
        return { ok: true, total_ms: result.totalMs, usage: result.usage };
      } catch (error) {
        // Priming is best effort. A failure must never affect the next answer.
        return { ok: false, reason: redactKeyMaterial(error?.message || "prime_failed") };
      } finally {
        guard.close();
      }
    },

    /**
     * Answers one turn. Resolves to
     *   { ok:true, source, text, turn_id, finish_reason, first_token_ms, total_ms, usage, length_class, local_signal }
     * or
     *   { ok:false, category, reason, turn_id, retriable }
     * A false result is the caller's cue to use the local static path.
     */
    async answer({ userText, conversation = [], contextCapsule = "", cards = [], onToken, signal } = {}) {
      const turnId = makeTurnId();
      const trimmed = String(userText || "").trim();
      if (!trimmed) return { ok: false, category: "empty_input", reason: "empty_user_text", turn_id: turnId, retriable: false };

      const apiKey = getKey();
      if (!apiKey) {
        return { ok: false, category: "auth_rejected", reason: "deepseek_api_key_absent", turn_id: turnId, retriable: false };
      }

      const allowed = guard.checkBeforeRequest();
      if (!allowed.ok) {
        return { ok: false, category: "spending_guard", reason: allowed.reason, turn_id: turnId, retriable: false };
      }

      const lengthPolicy = deterministicLengthPolicy(trimmed);
      const localSignal = await buildLocalSignal(turnId, trimmed);

      // Retrieved cards, in whatever language they were written, become one
      // evidence message. The packet itself carries the output-language rule
      // and the bar on translating English material into speech.
      const evidence = cards.length ? buildEvidencePacket(cards, { question: trimmed }) : null;
      const capsule = evidence
        ? [evidence.instruction, contextCapsule].filter(Boolean).join("\n\n")
        : contextCapsule;

      const request = buildDeepSeekRequest({
        systemPrompt: buildSystemPrompt({ lengthInstruction: lengthPolicy.instruction }),
        conversation: [...conversation, { role: "user", content: trimmed }],
        localSignalInstruction: localSignal.instruction,
        contextCapsule: capsule,
        model,
        maxTokens: maxTokensForClass(lengthPolicy.dialogue_class)
      });

      const controller = new AbortController();
      controllers.set(turnId, controller);
      if (signal) {
        if (signal.aborted) controller.abort("user_cancel");
        else signal.addEventListener("abort", () => controller.abort("user_cancel"), { once: true });
      }

      guard.open();
      let attempt = 0;
      try {
        while (true) {
          attempt += 1;
          try {
            const result = await runOnce({ request, apiKey, signal: controller.signal, onToken, turnId });
            if (!result.text.trim()) {
              throw new DeepSeekError("empty_content", true, "deepseek_empty_content", { retriable: true });
            }
            if (result.usage) guard.recordUsage(result.usage);
            const record = {
              turn_id: turnId,
              source: ANSWER_SOURCE_DEEPSEEK,
              system_prompt_id: PRODUCT_SYSTEM_PROMPT_ID,
              model,
              length_class: lengthPolicy.dialogue_class,
              local_signal_used: localSignal.used,
              evidence_cards: evidence?.knowledge_count ?? 0,
              evidence_languages: evidence?.languages_used ?? [],
              answer_language: evidence?.answer_language ?? null,
              local_signal_provider: localSignal.provider_type,
              finish_reason: result.finishReason,
              reasoning_present: result.reasoningSeen,
              first_token_ms: result.firstTokenMs,
              total_ms: result.totalMs,
              input_tokens: result.usage?.input_tokens ?? null,
              output_tokens: result.usage?.output_tokens ?? null,
              attempts: attempt
            };
            telemetry.push(record);
            return {
              ok: true,
              source: ANSWER_SOURCE_DEEPSEEK,
              text: result.text.trim(),
              turn_id: turnId,
              finish_reason: result.finishReason,
              first_token_ms: result.firstTokenMs,
              total_ms: result.totalMs,
              usage: result.usage,
              length_class: lengthPolicy.dialogue_class,
              local_signal: { used: localSignal.used, provider: localSignal.provider_type },
              evidence: evidence
                ? { cards: evidence.knowledge_count, voice: evidence.voice_count,
                    languages: evidence.languages_used, card_ids: evidence.card_ids,
                    answer_language: evidence.answer_language }
                : null,
              attempts: attempt
            };
          } catch (error) {
            const category = error instanceof DeepSeekError ? error.category : "network_timeout";
            const retriable = error instanceof DeepSeekError ? error.retriable : false;
            const beforeFirstToken = error instanceof DeepSeekError ? error.beforeFirstToken : true;
            // Retry only when nothing was shown to the user yet.
            if (retriable && beforeFirstToken && attempt < 2 && category !== "user_cancel") continue;
            const reason = redactKeyMaterial(error?.message || category);
            telemetry.push({
              turn_id: turnId,
              source: ANSWER_SOURCE_DEEPSEEK,
              model,
              length_class: lengthPolicy.dialogue_class,
              error_category: category,
              error_reason: reason,
              attempts: attempt
            });
            return { ok: false, category, reason, turn_id: turnId, retriable, attempts: attempt };
          }
        }
      } finally {
        guard.close();
        controllers.delete(turnId);
      }
    }
  };
}

// Short, honest, user-facing explanation for each failure category.
export function describeFailure(category, reason = "") {
  switch (category) {
    case "auth_rejected":
      return reason === "deepseek_api_key_absent"
        ? "还没有设置 DeepSeek API key，先用本地静态回答。"
        : "API key 被拒绝，请检查 key 是否有效。";
    case "insufficient_balance":
      return "DeepSeek 账户余额不足。";
    case "rate_limited":
      return "请求过于频繁，稍后再试。";
    case "spending_guard":
      return "本次会话的请求上限已到，刷新页面可重置。";
    case "user_cancel":
      return "已取消。";
    case "request_rejected":
      return "请求被拒绝，可能是模型名或参数不被接受。";
    case "empty_content":
      return "远端返回了空回答，已回到本地静态路径。";
    case "tool_calls":
      return "远端返回了未预期的工具调用，已拒绝。";
    case "malformed_stream":
      return "响应流不完整，已回到本地静态路径。";
    default:
      return "网络或远端不可用，已回到本地静态路径。";
  }
}
