#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ARTIFACT_ROOT = join(homedir(), 'Desktop', 'another_brain_train_r29a0', 'artifacts', 'r29b2m_r4h');
const argAt = process.argv.indexOf('--artifact-root');
const artifactRoot = argAt >= 0 && process.argv[argAt + 1] ? resolve(process.argv[argAt + 1]) : DEFAULT_ARTIFACT_ROOT;
const outputRoot = join(artifactRoot, 'browser_lab');

const html = `<!doctype html>
<html lang='zh-CN'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width,initial-scale=1'>
  <title>R29B2M-R4H Isolated Hybrid Lab</title>
  <style>
    :root{color-scheme:dark;--bg:#101416;--card:#192024;--ink:#edf3ef;--muted:#9eaaa4;--accent:#82d7b0;--warn:#f2bb70}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#20302c,var(--bg) 52%);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
    main{width:min(760px,calc(100% - 32px));margin:40px auto}.card{background:rgba(25,32,36,.94);border:1px solid #33413d;border-radius:20px;padding:22px;box-shadow:0 16px 55px #0007}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px}.badge{font:12px ui-monospace,monospace;letter-spacing:.08em;padding:6px 10px;border-radius:999px;background:#26332f;color:var(--accent)}
    #transcript{min-height:180px;margin:20px 0;padding:14px;border-radius:14px;background:#111719}.message{max-width:84%;padding:10px 13px;margin:8px 0;border-radius:14px;white-space:pre-wrap}.user{margin-left:auto;background:#2b4139}.assistant{background:#253036}.error{color:#ffd6a3;border:1px solid #6c4d2c}
    .status{min-height:28px;color:var(--muted)}.signal{display:none;color:var(--accent)}.signal.active{display:inline}.signal i{display:inline-block;width:5px;height:5px;margin:0 2px;border-radius:50%;background:currentColor;animation:pulse .8s infinite alternate}.signal i:nth-child(2){animation-delay:.2s}.signal i:nth-child(3){animation-delay:.4s}@keyframes pulse{to{opacity:.2;transform:translateY(-4px)}}
    form{display:grid;grid-template-columns:1fr auto;gap:10px}textarea{resize:vertical;min-height:76px;background:#111719;color:var(--ink);border:1px solid #40504a;border-radius:12px;padding:12px;font:inherit}button,select{border:1px solid #40504a;border-radius:10px;background:#26332f;color:var(--ink);padding:9px 13px}button:disabled{opacity:.45}.controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.debug{display:none;margin-top:14px;background:#0d1214;border-radius:12px;padding:12px;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;overflow:auto}.debug.open{display:block}
    small{color:var(--muted)}
  </style>
</head>
<body><main><section class='card'>
  <header><div><h1>Hybrid Lab</h1><small>isolated simulation · no production route</small></div><span class='badge' data-testid='source'>HYBRID</span></header>
  <div class='status' data-testid='status'><span data-testid='ready-state'>Preparing Hybrid…</span> <span class='signal' data-testid='signal-animation'><i></i><i></i><i></i> local signal</span></div>
  <div id='transcript' data-testid='transcript' aria-live='polite'></div>
  <form id='composer'><textarea data-testid='chat-input' aria-label='消息' placeholder='输入一条公开安全的测试消息'></textarea><button data-testid='send' type='submit' disabled>Preparing</button></form>
  <div class='controls'>
    <select data-testid='scenario' aria-label='模拟场景'><option value='normal'>normal</option><option value='slow'>slow stream</option><option value='timeout'>timeout</option><option value='retry'>retry before first token</option><option value='after-first'>failure after first token</option></select>
    <button data-testid='cancel' type='button' disabled>Cancel</button><button data-testid='retry' type='button' disabled>Retry</button><button data-testid='debug-toggle' type='button' aria-expanded='false'>Debug</button>
  </div>
  <pre class='debug' data-testid='debug-panel'></pre>
</section></main><script type='module' src='./app.js'></script></body></html>`;

const app = `const byTestId = (id) => document.querySelector('[data-testid="' + id + '"]');
const input = byTestId('chat-input');
const send = byTestId('send');
const cancel = byTestId('cancel');
const retry = byTestId('retry');
const status = byTestId('status');
const readyState = byTestId('ready-state');
const signalAnimation = byTestId('signal-animation');
const transcript = byTestId('transcript');
const scenario = byTestId('scenario');
const debugPanel = byTestId('debug-panel');
const debugToggle = byTestId('debug-toggle');
let active = null;
let lastMessage = '';
let turnCounter = 0;
let debug = {};
window.__R4H_LAB__ = { events: [], consoleErrors: 0, unhandledRejections: 0, completedTurns: 0 };

window.addEventListener('error', () => { window.__R4H_LAB__.consoleErrors += 1; });
window.addEventListener('unhandledrejection', (event) => { window.__R4H_LAB__.unhandledRejections += 1; event.preventDefault(); });
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('cancelled', 'AbortError')); }, { once: true });
});
const mark = (name, turnId) => window.__R4H_LAB__.events.push({ name, turnId, at: performance.now() });
function message(role, text, turnId) {
  const node = document.createElement('div'); node.className = 'message ' + role; node.textContent = text; node.dataset.turnId = turnId; transcript.append(node); return node;
}
function exactPacket(text, turnId) {
  const points = Array.from(text); const anchorText = points.slice(0, Math.min(8, points.length)).join('');
  return { version:'local-signal.v1', source:'heuristic_simulator', turn_id:turnId, anchors:[{text:anchorText,start_codepoint:0,end_codepoint:Array.from(anchorText).length,salience:.82}], affect:{label:'neutral',intensity:.15,confidence:.58}, dialogue_act:{label:'casual_conversation',confidence:.72}, style:{primary:'concise',secondary:['non_customer_service'],confidence:.7}, emotional_rule_ids:['ordinary_do_not_problem_solve'], avoid_flags:['customer_service_tone','over_explanation'], response_shape:{maximum_characters:100,preferred_sentences:2,question_policy:'allowed'}, confidence:.68 };
}
function refreshDebug() { debugPanel.textContent = JSON.stringify(debug, null, 2); }
async function run(text) {
  if (!text.trim()) return;
  if (active) active.controller.abort('stale_turn');
  const turnId = 'browser-turn-' + (++turnCounter); const controller = new AbortController(); const selected = scenario.value;
  active = { turnId, controller }; lastMessage = text; retry.disabled = true; cancel.disabled = false;
  message('user', text, turnId); const answer = message('assistant', '', turnId);
  readyState.textContent = 'Responding'; signalAnimation.classList.add('active'); status.dataset.phase = 'responding'; mark('immediate_submitted', turnId);
  const submittedAt = performance.now(); let requestCount = 0; let retryCount = 0; let firstTokenAt = null;
  try {
    await sleep(120, controller.signal); const packet = exactPacket(text, turnId); const signalAt = performance.now(); mark('packet_ready', turnId);
    signalAnimation.classList.remove('active'); readyState.textContent = 'Streaming'; status.dataset.phase = 'streaming';
    const compiled = 'LOCAL SIGNAL — advisory, not factual: focus exact user span; concise; no customer-service tone.';
    const chunks = selected === 'slow' ? ['这是一段', '缓慢但稳定的', 'Hybrid 模拟回答。'] : ['这是一段', '用于浏览器验证的', 'Hybrid 模拟回答。'];
    const streamAttempt = async () => {
      requestCount += 1; mark('request_start', turnId);
      if ((selected === 'retry' && requestCount === 1) || selected === 'timeout') { await sleep(70, controller.signal); throw new Error('before_first_token_timeout'); }
      for (let index = 0; index < chunks.length; index += 1) {
        await sleep(selected === 'slow' ? 95 : 35, controller.signal);
        if (active?.turnId !== turnId) throw new DOMException('stale', 'AbortError');
        answer.textContent += chunks[index];
        if (firstTokenAt === null && /\\S/u.test(chunks[index])) { firstTokenAt = performance.now(); mark('first_token', turnId); }
        if (selected === 'after-first' && index === 0) throw new Error('after_first_token_disconnect');
      }
    };
    try { await streamAttempt(); } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (firstTokenAt === null && retryCount === 0) { retryCount += 1; await sleep(23, controller.signal); await streamAttempt(); }
      else throw error;
    }
    readyState.textContent = 'Complete'; status.dataset.phase = 'complete'; cancel.disabled = true; retry.disabled = false; window.__R4H_LAB__.completedTurns += 1; mark('complete', turnId);
    debug = { packet, compiled_style_policy:compiled, source_trace:'hybrid_heuristic_simulation', signal_elapsed_ms:signalAt-submittedAt, first_token_ms:firstTokenAt-submittedAt, total_elapsed_ms:performance.now()-submittedAt, request_count:requestCount, retry_count:retryCount, simulation_only:true, actual_browser_signal_inference:false }; refreshDebug();
  } catch (error) {
    signalAnimation.classList.remove('active'); cancel.disabled = true; retry.disabled = false;
    if (controller.signal.aborted || error.name === 'AbortError') { readyState.textContent = controller.signal.reason === 'user_cancel' ? 'Cancelled' : 'Stale turn cancelled'; status.dataset.phase = 'cancelled'; mark('cancelled', turnId); }
    else { readyState.textContent = firstTokenAt === null ? 'Timed out before answer' : 'Stream interrupted — not retried'; status.dataset.phase = 'failed'; answer.classList.add('error'); if (!answer.textContent) answer.textContent = 'This simulated turn did not complete.'; mark('failed', turnId); }
    debug = { source_trace:'hybrid_heuristic_simulation', error_category:String(error.message || error), request_count:requestCount, retry_count:retryCount, first_token_seen:firstTokenAt!==null, simulation_only:true, actual_browser_signal_inference:false }; refreshDebug();
  } finally { if (active?.turnId === turnId) active = null; }
}

document.querySelector('#composer').addEventListener('submit', (event) => { event.preventDefault(); void run(input.value); });
cancel.addEventListener('click', () => active?.controller.abort('user_cancel'));
retry.addEventListener('click', () => { if (lastMessage) void run(lastMessage); });
debugToggle.addEventListener('click', () => { const open = debugPanel.classList.toggle('open'); debugToggle.setAttribute('aria-expanded', String(open)); });
setTimeout(() => { readyState.textContent = 'Hybrid Ready'; status.dataset.phase = 'ready'; send.disabled = false; send.textContent = 'Send'; mark('hybrid_ready', 'gate'); }, 90);
`;

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.tmp-' + process.pid;
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, path);
}

await mkdir(outputRoot, { recursive: true });
await atomicWrite(join(outputRoot, 'index.html'), html);
await atomicWrite(join(outputRoot, 'app.js'), app);
const prompt = await readFile(join(ROOT, 'prompts', 'hybrid_dialogue_system_v1.txt'), 'utf8');
await atomicWrite(join(outputRoot, 'manifest.json'), JSON.stringify({
  campaign_id: 'r29b2m_r4h_hybrid_signal_simulation_v1',
  generated_at: new Date().toISOString(),
  isolated: true,
  ignored_artifact: true,
  production_navigation_link: false,
  production_UI_modified: false,
  deployed: false,
  simulation_only: true,
  actual_efish_signal_model_trained: false,
  actual_browser_signal_inference: false,
  oracle_packet_used: false,
  training_started: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
  system_prompt_sha256: createHash('sha256').update(prompt).digest('hex'),
  files: ['index.html', 'app.js'],
}, null, 2) + '\n');
console.log(JSON.stringify({ state: 'BROWSER_LAB_BUILT', output: 'artifact-root/browser_lab' }));
