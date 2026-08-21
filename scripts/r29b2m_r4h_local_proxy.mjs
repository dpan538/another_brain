#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LiveDeepSeekAdapter } from '../src/hybrid_runtime/live_deepseek_adapter.ts';
import { HybridOrchestrator } from '../src/hybrid_runtime/hybrid_orchestrator.ts';
import { HybridTelemetryCollector, SpendingGuard } from '../src/hybrid_runtime/hybrid_telemetry.ts';
import { OracleSignalProvider } from '../src/hybrid_runtime/signal_provider.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.R29B2M_R4H_PROXY_PORT || 41739);
const HOST = '127.0.0.1';
const fixtures = (await readFile(join(ROOT, 'evals', 'r29b2m_hybrid_product_v1', 'cases.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
const fixtureMap = new Map(fixtures.map((fixture) => [fixture.case_id, fixture]));
const systemPrompt = await readFile(join(ROOT, 'prompts', 'hybrid_dialogue_system_v1.txt'), 'utf8');
const pricing = JSON.parse(await readFile(join(ROOT, 'config', 'deepseek_pricing_snapshot.json'), 'utf8'));
const spendingGuard = new SpendingGuard({ requestLimit: 100, inputTokenLimit: 400000, outputTokenLimit: 40000, concurrencyLimit: 2 });
const telemetry = new HybridTelemetryCollector(pricing);
const adapter = new LiveDeepSeekAdapter();
const provider = new OracleSignalProvider(fixtures);
const orchestrator = new HybridOrchestrator({
  signalProvider: provider,
  adapter,
  telemetry,
  spendingGuard,
  systemPrompt,
  allowDeepseekOnlyAblation: process.env.R29B2M_R4H_ALLOW_ABLATION === '1',
});

function reply(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:' + PORT);
  if (request.method === 'GET' && request.url === '/health') {
    return reply(response, 200, { ready: await orchestrator.ready(), key_present: Boolean(process.env.DEEPSEEK_API_KEY), server_only: true, adapter_type: adapter.adapterType });
  }
  if (request.method !== 'POST' || request.url !== '/v1/hybrid/stream') return reply(response, 404, { error: 'not_found' });
  let body;
  try { body = await bodyJson(request); } catch { return reply(response, 400, { error: 'invalid_public_fixture_request' }); }
  const fixture = fixtureMap.get(String(body.case_id || ''));
  if (!fixture) return reply(response, 400, { error: 'public_fixture_id_required' });
  if (body.arm === 'deepseek_only' && process.env.R29B2M_R4H_ALLOW_ABLATION !== '1') return reply(response, 403, { error: 'ablation_not_authorized' });
  const turnId = 'proxy:' + String(body.turn_id || fixture.case_id).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100);
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const disconnected = () => { void orchestrator.cancel(turnId); };
  request.once('close', disconnected);
  try {
    const result = await orchestrator.runTurn({
      turnId,
      caseId: fixture.case_id,
      currentUserMessage: [...fixture.messages].reverse().find((message) => message.role === 'user').content,
      conversation: fixture.messages,
      ablationArm: body.arm === 'deepseek_only' ? 'deepseek_only' : 'hybrid',
      onChunk: (content) => response.write(JSON.stringify({ type: 'content', content }) + '\n'),
    });
    response.write(JSON.stringify({ type: 'final', status: result.status, finish_reason: result.finish_reason, source: 'HYBRID', source_trace: result.source_trace, request_count: result.request_count, retry_count: result.retry_count }) + '\n');
    response.end();
  } catch {
    response.end(JSON.stringify({ type: 'error', error: 'hybrid_proxy_failure' }) + '\n');
  } finally {
    request.removeListener('close', disconnected);
  }
});

function closeAndExit(signal) {
  server.close(() => process.exit(signal === 'SIGTERM' ? 143 : 130));
  setTimeout(() => process.exit(1), 1000).unref();
}
process.on('SIGINT', () => closeAndExit('SIGINT'));
process.on('SIGTERM', () => closeAndExit('SIGTERM'));
server.listen(PORT, HOST, () => console.log(JSON.stringify({ state: 'R29B2M_R4H_LOCAL_PROXY_READY', host: HOST, port: PORT, key_present: Boolean(process.env.DEEPSEEK_API_KEY), raw_messages_logged: false })));
