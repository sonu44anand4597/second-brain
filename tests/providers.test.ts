import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ConfiguredProvider, discoverModels, type AIConnection, type AITransport, type ProviderId } from '../src/ai/providers.js';
import { ApiError, providerError } from '../src/ai/errors.js';
import { providerRequest, type TransportOptions } from '../src/ai/transport.js';
import { aiStatus, clearUserCredentials, connectionFromInput, endpointFor, fingerprint, markTested, removeKey, resolveConnection, saveConnection, scopeFor } from '../src/ai/settings.js';
import { config } from '../src/config.js';
import { getAIContext } from '../src/ai.js';

const makeConnection = (provider: ProviderId = 'gemini', model = 'gemini-test-text'): AIConnection => ({ provider, apiKey: 'canary-secret-DO-NOT-ECHO', model, baseUrl: provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://api.example.com/v1', freeOnly: false, embeddingModel: '' });
test('Gemini sends key in a header, native parts/system instruction and JSON mode; normalizes candidate text', async () => {
  let seenUrl = ''; let seen: TransportOptions = {};
  const transport: AITransport = async (url, options) => { seenUrl = url.toString(); seen = options!; return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'internal reasoning', thought: true }, { text: '{"ok":true}' }] } }] }; };
  const connection = makeConnection(); const output = await new ConfiguredProvider(connection, undefined, transport).generate('Return JSON', 'Question', undefined, { json: true });
  assert.equal(output, '{"ok":true}'); assert.match(seenUrl, /models\/gemini-test-text:generateContent$/); assert.ok(!seenUrl.includes(connection.apiKey));
  assert.equal(seen.headers?.['x-goog-api-key'], connection.apiKey);
  assert.deepEqual((seen.body as { systemInstruction: unknown }).systemInstruction, { parts: [{ text: 'Return JSON' }] });
  assert.equal((seen.body as { generationConfig: { responseMimeType: string } }).generationConfig.responseMimeType, 'application/json');
});
test('Gemini discovery uses live methods and excludes non-text/audio-only models', async () => {
  const models = await discoverModels(makeConnection(), undefined, undefined, async () => ({ models: [
    { name: 'models/gemini-current-text', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 100000 },
    { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-tts', supportedGenerationMethods: ['generateContent'] },
  ] }));
  assert.deepEqual(models.map(m => m.id), ['gemini-current-text']); assert.equal(models[0]!.free, null);
});
test('OpenAI and Groq use chat completions and max_completion_tokens without unsupported temperature', async () => {
  for (const kind of ['openai', 'groq'] as const) {
    let body: Record<string, unknown> = {};
    const transport: AITransport = async (_url, options) => { body = options!.body as Record<string, unknown>; return { choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }; };
    await new ConfiguredProvider(makeConnection(kind, 'text-model'), undefined, transport).generate('Return JSON', 'Input', undefined, { json: true });
    assert.equal(body.model, 'text-model'); assert.equal(body.max_completion_tokens, 8192); assert.equal(body.max_tokens, undefined); assert.equal(body.temperature, undefined);
    assert.deepEqual(body.response_format, { type: 'json_object' });
  }
});
test('OpenRouter free-only checks current prices and refuses paid models without a generation request', async () => {
  const calls: string[] = [];
  const transport: AITransport = async (url, options) => {
    calls.push(url.pathname);
    if (url.pathname.endsWith('/models')) return { data: [{ id: 'free-text:free', pricing: { prompt: '0', completion: '0', request: '0' }, supported_parameters: ['response_format'] }, { id: 'paid-text', pricing: { prompt: '0.001', completion: '0.002' } }, { id: 'request-fee:free', pricing: { prompt: '0', completion: '0', request: '1' } }] };
    assert.deepEqual((options!.body as { provider: unknown }).provider, { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } });
    return { choices: [{ message: { content: '{"ok":true}' } }] };
  };
  const connection = { ...makeConnection('openrouter', 'paid-text'), freeOnly: true };
  await assert.rejects(() => new ConfiguredProvider(connection, undefined, transport).generate('JSON', 'Input'), (error: unknown) => error instanceof ApiError && error.code === 'AI_PAID_MODEL_BLOCKED');
  assert.equal(calls.filter(p => p.endsWith('/chat/completions')).length, 0);
  const free = await new ConfiguredProvider({ ...connection, model: 'free-text:free' }, undefined, transport).generate('JSON', 'Input', undefined, { json: true }); assert.equal(free, '{"ok":true}');
  await assert.rejects(() => new ConfiguredProvider({ ...connection, model: 'request-fee:free' }, undefined, transport).generate('JSON', 'Input'));
});
test('provider output validation rejects empty, refusal, truncated and invalid Gemini responses', async () => {
  for (const response of [{}, { candidates: [] }, { candidates: [{ finishReason: 'SAFETY' }] }, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }]) {
    await assert.rejects(() => new ConfiguredProvider(makeConnection(), undefined, async () => response).generate('JSON', 'Input'), (error: unknown) => error instanceof ApiError && error.status === 502);
  }
  await assert.rejects(() => new ConfiguredProvider(makeConnection('openai', 'gpt-test'), undefined, async () => ({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] })).generate('system', 'input'));
});
test('errors are sanitized, preserve account sessions and distinguish key/model/quota/rate/outage', () => {
  assert.equal(providerError(401).status, 422); assert.equal(providerError(403).status, 422);
  assert.equal(providerError(402).code, 'AI_QUOTA'); assert.equal(providerError(429).code, 'AI_RATE_LIMIT');
  assert.equal(providerError(404).code, 'AI_MODEL_UNSUPPORTED'); assert.equal(providerError(500).code, 'AI_UNAVAILABLE');
  assert.equal(providerError(400, { error: { message: 'secret-must-not-echo', details: [{ reason: 'API_KEY_INVALID' }] } }).code, 'AI_AUTH_INVALID');
  assert.equal(providerError(429, { error: { code: 'insufficient_quota' } }).code, 'AI_QUOTA');
  for (const status of [400, 401, 403, 404, 429, 500, 504]) assert.ok(!providerError(status).message.includes('canary-secret'));
});
test('user-supplied endpoint settings cannot override cloud hosts or reach arbitrary custom/Ollama targets', () => {
  assert.throws(() => connectionFromInput('a:0', { provider: 'gemini', model: 'text', baseUrl: 'https://evil.example/v1', apiKey: 'secret' }));
  assert.throws(() => connectionFromInput('a:0', { provider: 'custom', model: 'text', baseUrl: 'http://127.0.0.1:3000', apiKey: 'secret', trustedServer: true }));
  const previous = config.customAIHosts; config.customAIHosts = ['approved.example'];
  try {
    assert.equal(endpointFor('custom', 'https://approved.example/v1'), 'https://approved.example/v1');
    for (const url of ['http://approved.example/v1', 'https://approved.example:8443/v1', 'https://approved.example@evil.example/v1', 'https://approved.example/v1?key=secret', 'https://evil.example/v1']) assert.throws(() => endpointFor('custom', url));
  } finally { config.customAIHosts = previous; }
});
test('memory vault isolates owners and clears keys without falling back to server-managed credentials', async () => {
  const a = scopeFor('vault-owner-a', 0); const b = scopeFor('vault-owner-b', 0);
  const original = { key: config.aiKey, model: config.aiModel };
  config.aiKey = 'admin-canary'; config.aiModel = 'admin-model';
  try {
    const saved = makeConnection(); saveConnection(a, saved); markTested(a, saved);
    assert.equal(aiStatus(a).hasApiKey, true); assert.equal(aiStatus(a).testedAt !== null, true);
    assert.ok(!JSON.stringify(aiStatus(a)).includes(saved.apiKey)); assert.ok(!JSON.stringify(aiStatus(a)).includes('admin-canary'));
    assert.notEqual(resolveConnection(b).apiKey, saved.apiKey);
    const otherProvider = connectionFromInput(a, { provider: 'groq', model: 'text' }); assert.equal(otherProvider.apiKey, '');
    const sameProvider = connectionFromInput(a, { provider: 'gemini', model: 'new-text' }); assert.equal(sameProvider.apiKey, saved.apiKey);
    removeKey(a); assert.equal(aiStatus(a).configured, false); assert.equal(resolveConnection(a).provider, 'gemini');
    await assert.rejects(() => getAIContext(a).provider.generate('system', 'input'), (error: unknown) => error instanceof ApiError && error.code === 'AI_NOT_CONFIGURED');
    saveConnection(a, saved); clearUserCredentials('vault-owner-a');
    assert.equal(resolveConnection(scopeFor('vault-owner-a', 1)).apiKey, ''); assert.equal(resolveConnection(scopeFor('vault-owner-a', 1)).provider, 'gemini');
    assert.notEqual(fingerprint(saved, a), fingerprint(saved, b));
  } finally { config.aiKey = original.key; config.aiModel = original.model; clearUserCredentials('vault-owner-a'); }
});
test('memory vault expires idle keys without activating server defaults', t => {
  const scope = scopeFor('expired-owner'); const saved = makeConnection(); saveConnection(scope, saved);
  t.mock.method(Date, 'now', () => new Date('2100-01-01').getTime());
  assert.equal(resolveConnection(scope).apiKey, ''); assert.equal(aiStatus(scope).configured, false);
  clearUserCredentials('expired-owner');
});
test('unsupported modalities and Ollama cloud models are rejected before sending private text', async () => {
  for (const model of ['text-embedding-3-small', 'whisper-large-v3', 'gpt-image-1', 'tts-1', 'gemini-live-audio', 'sora-2']) {
    await assert.rejects(() => new ConfiguredProvider(makeConnection('openai', model), undefined, async () => { assert.fail('Unexpected provider request'); }).generate('system', 'private text'));
  }
  await assert.rejects(() => new ConfiguredProvider(makeConnection('ollama', 'model:cloud')).generate('system', 'private text'));
});
test('real transport pins DNS, rejects private targets/redirects, bounds responses and times out without retries', async () => {
  let calls = 0;
  const server = http.createServer((req, res) => { calls++; if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://127.0.0.1/secret' }); res.end(); } else if (req.url === '/large') res.end(JSON.stringify({ text: 'x'.repeat(2000) })); else if (req.url === '/wait') setTimeout(() => res.end('{}'), 250); else if (req.url === '/invalid-key') { res.writeHead(401); res.end('{"error":"canary-secret-DO-NOT-ECHO"}'); } else { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = (path: string) => new URL(`http://127.0.0.1:${address.port}${path}`);
  try {
    await assert.rejects(() => providerRequest(url('/secret')), (error: unknown) => error instanceof ApiError && error.code === 'AI_ENDPOINT'); assert.equal(calls, 0);
    assert.deepEqual(await providerRequest(url('/ok'), { trustedServer: true }), { ok: true });
    await assert.rejects(() => providerRequest(url('/redirect'), { trustedServer: true })); assert.equal(calls, 2);
    await assert.rejects(() => providerRequest(url('/large'), { trustedServer: true, maxBytes: 100 }));
    await assert.rejects(() => providerRequest(url('/invalid-key'), { trustedServer: true }), (error: unknown) => error instanceof ApiError && error.status === 422 && !error.message.includes('canary-secret'));
    await assert.rejects(() => providerRequest(url('/wait'), { trustedServer: true, timeoutMs: 30 }), (error: unknown) => error instanceof ApiError && error.status === 504);
    assert.equal(calls, 5);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
