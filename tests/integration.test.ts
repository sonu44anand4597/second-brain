import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, createApp } from '../src/app.js';
import { providerError } from '../src/ai/errors.js';
import type { AITransport } from '../src/ai/providers.js';
import { config, JWT_PASSWORD } from '../src/config.js';
import { CardModel, ContentModel, UserModel } from '../src/db.js';
let mongo: MongoMemoryServer;
let token = ''; let otherToken = ''; let userId = ''; let contentId = ''; let collectionId = ''; let sharedHash = '';
const secretText = 'JWT authentication uses a signed token. The server verifies the signature before accepting a request. A token expiry limits the lifetime of each session.';
const auth = () => ({ Authorization: `Bearer ${token}` });
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24' } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([UserModel.init(), ContentModel.init()]);
}, { timeout: 180000 });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('signup validates input, hashes passwords, preserves signin contract, and rejects duplicates', async () => {
  await request(app).post('/api/v1/signup').send({ username: 'alice', password: 'short' }).expect(400);
  await request(app).post('/api/v1/signup').send({ username: 'alice', password: 'password123' }).expect(201);
  await request(app).post('/api/v1/signup').send({ username: 'alice', password: 'password123' }).expect(411);
  const user = await UserModel.findOne({ username: 'alice' }).select('+password');
  assert.match(user!.password, /^scrypt:/); userId = String(user!._id);
  const signed = await request(app).post('/api/v1/signin').send({ username: 'alice', password: 'password123' }).expect(200);
  token = signed.body.token as string;
  assert.ok(token); assert.match(String(signed.headers['set-cookie']), /HttpOnly/);
  const me = await request(app).get('/api/v1/me').set('Cookie', signed.headers['set-cookie']).expect(200);
  assert.equal(me.body.user.username, 'alice');
  await request(app).post('/api/v1/signin').send({ username: 'alice', password: 'wrong' }).expect(401);
});
test('legacy plaintext accounts and bearer tokens migrate without data loss', async () => {
  const legacy = await UserModel.create({ username: 'legacy', password: 'old-password' });
  const oldToken = jwt.sign({ id: String(legacy._id) }, JWT_PASSWORD);
  await request(app).get('/api/v1/content').set('Authorization', `Bearer ${oldToken}`).expect(200);
  await request(app).post('/api/v1/signin').send({ username: 'legacy', password: 'old-password' }).expect(200);
  assert.match((await UserModel.findById(legacy._id).select('+password'))!.password, /^scrypt:/);
});
test('protected routes reject missing, expired, and malformed tokens', async () => {
  await request(app).get('/api/v1/content').expect(401);
  await request(app).get('/api/v1/content').set('Authorization', 'Bearer invalid').expect(401);
  const expired = jwt.sign({ id: userId }, JWT_PASSWORD, { expiresIn: -1 });
  await request(app).get('/api/v1/content').set('Authorization', `Bearer ${expired}`).expect(401);
});
test('content persists with metadata, notes, tags, favorite and ownership', async () => {
  const created = await request(app).post('/api/v1/content').set(auth()).send({ link: 'https://example.com/jwt?utm_source=test#fragment', type: 'article', title: 'JWT explained', text: secretText, tags: ['security'] }).expect(201);
  contentId = created.body.content._id as string;
  const list = await request(app).get('/api/v1/content').set(auth()).expect(200);
  assert.equal(list.body.content[0].text, secretText); assert.equal(list.body.content[0].title, 'JWT explained');
  assert.equal(list.body.content[0].userId.username, 'alice'); assert.equal(list.body.content[0].userId.password, undefined);
  await request(app).patch(`/api/v1/content/${contentId}`).set(auth()).send({ favorite: true, title: 'JWT authentication' }).expect(200);
  assert.equal((await ContentModel.findById(contentId))!.favorite, true);
  await request(app).post('/api/v1/content').set(auth()).send({ type: 'note', title: 'A note', text: 'A real persisted personal note.' }).expect(201);
});
test('duplicate detection normalizes URLs and returns the existing item', async () => {
  const result = await request(app).post('/api/v1/content').set(auth()).send({ link: 'https://example.com/jwt?utm_medium=email', type: 'article' }).expect(409);
  assert.equal(result.body.existingId, contentId);
  await request(app).post('/api/v1/content').set(auth()).send({ link: 'javascript:alert(1)', type: 'link' }).expect(400);
  await request(app).post('/api/v1/content').set(auth()).send({ type: 'note', text: '' }).expect(400);
});
test('collections persist and only owned collections may be attached', async () => {
  const created = await request(app).post('/api/v1/collections').set(auth()).send({ name: 'Web security' }).expect(201);
  collectionId = created.body.collection._id as string;
  await request(app).patch(`/api/v1/content/${contentId}`).set(auth()).send({ collectionIds: [collectionId] }).expect(200);
  await request(app).patch(`/api/v1/collections/${collectionId}`).set(auth()).send({ name: 'Security essentials' }).expect(200);
  const list = await request(app).get('/api/v1/collections').set(auth()).expect(200);
  assert.equal(list.body.collections[0].name, 'Security essentials');
  await request(app).patch(`/api/v1/content/${contentId}`).set(auth()).send({ collectionIds: [new mongoose.Types.ObjectId().toString()] }).expect(400);
});
test('another user cannot view, edit, delete, retrieve, or share private content', async () => {
  await request(app).post('/api/v1/signup').send({ username: 'bob', password: 'password123' }).expect(201);
  otherToken = (await request(app).post('/api/v1/signin').send({ username: 'bob', password: 'password123' })).body.token as string;
  const bob = { Authorization: `Bearer ${otherToken}` };
  const list = await request(app).get('/api/v1/content').set(bob).expect(200); assert.equal(list.body.content.length, 0);
  await request(app).patch(`/api/v1/content/${contentId}`).set(bob).send({ text: 'stolen' }).expect(404);
  await request(app).delete('/api/v1/content').set(bob).send({ contentId }).expect(404);
  await request(app).post('/api/v1/brain/share').set(bob).send({ share: true, mode: 'selected', contentIds: [contentId] }).expect(400);
  await request(app).post(`/api/v1/ai/content/${contentId}`).set(bob).send({ action: 'short' }).expect(404);
});
test('sharing exposes only selected resources and an explicit public field allowlist', async () => {
  const shared = await request(app).post('/api/v1/brain/share').set(auth()).send({ share: true, mode: 'selected', contentIds: [contentId] }).expect(200);
  sharedHash = shared.body.shareLink as string;
  const result = await request(app).get(`/api/v1/brain/${sharedHash}`).expect(200);
  assert.equal(result.body.content.length, 1); assert.equal(result.body.content[0]._id, contentId);
  for (const privateField of ['userId', 'collectionIds', 'favorite', 'summary', 'password', 'normalizedLink']) assert.equal(result.body.content[0][privateField], undefined);
  const status = await request(app).get('/api/v1/brain/share/status').set(auth()).expect(200); assert.equal(status.body.mode, 'selected');
  await request(app).post('/api/v1/brain/share').set(auth()).send({ share: false }).expect(200);
  await request(app).get(`/api/v1/brain/${sharedHash}`).expect(411);
});
test('metadata blocks private destinations and unsafe protocols without fetching them', async () => {
  await request(app).post('/api/v1/metadata').set(auth()).send({ link: 'http://127.0.0.1/secret' }).expect(422);
  await request(app).post('/api/v1/metadata').set(auth()).send({ link: 'file:///etc/passwd' }).expect(422);
});
test('missing AI configuration is explicit; no fake answer is generated', async () => {
  const status = await request(app).get('/api/v1/ai/status').set(auth()).expect(200); assert.equal(status.body.configured, false);
  await request(app).post('/api/v1/ai/ask').set(auth()).send({ question: 'How does JWT work?' }).expect(503);
});
test('provider-boundary integration: grounded citations, user isolation, history, errors, and recall verification', async () => {
  let mode = 'answer'; let received = '';
  const providerServer = http.createServer((req, res) => {
    let raw = ''; req.on('data', data => { raw += String(data); });
    req.on('end', () => {
      received = raw;
      if (mode === 'failure') { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
      let output: unknown = { answer: 'The server verifies the token signature [1].', citations: [1] };
      if (mode === 'bad-citation') output = { answer: 'Unsupported [99].', citations: [99] };
      if (mode === 'recall') output = { cards: [{ contentId, question: 'What does JWT authentication use?', answer: 'a signed token', sourceQuote: 'JWT authentication uses a signed token.', options: ['a signed token', 'an unsigned cookie', 'a public password', 'a database index'] }] };
      if (mode === 'bad-recall') output = { cards: [{ contentId, question: 'An invented question?', answer: 'wrong', sourceQuote: 'An invented quote from no source.', options: ['wrong', 'b', 'c', 'd'] }] };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
    });
  });
  await new Promise<void>(resolve => providerServer.listen(0, '127.0.0.1', resolve));
  const address = providerServer.address(); assert.ok(address && typeof address !== 'string');
  const previous = { key: config.aiKey, model: config.aiModel, url: config.aiUrl };
  config.aiKey = 'test-provider-boundary-only'; config.aiModel = 'test-model'; config.aiUrl = `http://127.0.0.1:${address.port}`;
  try {
    const result = await request(app).post('/api/v1/ai/ask').set(auth()).send({ question: 'How does JWT authentication verify requests?' }).expect(200);
    assert.equal(result.body.sources[0].contentId, contentId); assert.ok(secretText.includes(result.body.sources[0].passage)); assert.ok(received.includes(secretText));
    const history = await request(app).get(`/api/v1/ai/conversations/${result.body.conversationId}`).set(auth()).expect(200); assert.equal(history.body.conversation.messages.length, 2);
    await request(app).get(`/api/v1/ai/conversations/${result.body.conversationId}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    const bob = await request(app).post('/api/v1/ai/ask').set('Authorization', `Bearer ${otherToken}`).send({ question: 'Explain JWT authentication' }).expect(200); assert.equal(bob.body.sources.length, 0);
    mode = 'bad-citation'; await request(app).post('/api/v1/ai/ask').set(auth()).send({ question: 'JWT authentication' }).expect(502);
    mode = 'failure'; await request(app).post('/api/v1/ai/ask').set(auth()).send({ question: 'JWT authentication' }).expect(429);
    mode = 'bad-recall'; await request(app).post('/api/v1/recall/generate').set(auth()).send({ contentIds: [contentId] }).expect(502);
    mode = 'recall'; const generated = await request(app).post('/api/v1/recall/generate').set(auth()).send({ contentIds: [contentId] }).expect(201);
    const cardId = generated.body.cards[0]._id as string;
    await request(app).post(`/api/v1/recall/${cardId}/review`).set(auth()).send({ rating: 'easy' }).expect(200);
    assert.equal((await CardModel.findById(cardId))!.interval, 4);
    const quiz = await request(app).post('/api/v1/recall/quiz').set(auth()).send({ responses: [{ cardId, answer: 'a signed token' }] }).expect(201); assert.equal(quiz.body.session.correct, 1);
    const recall = await request(app).get('/api/v1/recall').set(auth()).expect(200); assert.equal(recall.body.cards[0].reviews, 1); assert.equal(recall.body.sessions.length, 1);
  } finally { config.aiKey = previous.key; config.aiModel = previous.model; config.aiUrl = previous.url; await new Promise<void>(resolve => providerServer.close(() => resolve())); }
});
test('collection deletion keeps content, content deletion removes dependent study cards', async () => {
  await request(app).delete(`/api/v1/collections/${collectionId}`).set(auth()).send({}).expect(200);
  assert.equal((await ContentModel.findById(contentId))!.collectionIds.length, 0);
  await request(app).delete('/api/v1/content').set(auth()).send({ contentId }).expect(200);
  assert.equal(await CardModel.countDocuments({ contentId }), 0);
});
test('CORS and JSON-only writes reject cross-site requests; logout revokes bearer sessions', async () => {
  await request(app).post('/api/v1/content').set('Origin', 'https://evil.example').send({}).expect(403);
  await request(app).post('/api/v1/content').set('Content-Type', 'text/plain').send('content').expect(415);
  await request(app).post('/api/v1/logout').set(auth()).send({}).expect(200);
  await request(app).get('/api/v1/me').set(auth()).expect(401);
});

test('BYOK API: authenticated settings, actual connection execution, all feature routing, key isolation/removal and logout', async () => {
  const calls: { host: string; key: string; model: string; body: string }[] = [];
  let savedId = '';
  const transport: AITransport = async (url, options) => {
    const key = options?.headers?.['x-goog-api-key'] || options?.headers?.Authorization || '';
    const body = options?.body as { model?: string; systemInstruction?: { parts: { text: string }[] }; contents?: { parts: { text: string }[] }[]; messages?: { content: string }[] } | undefined;
    const model = body?.model || /models\/([^/:]+):generateContent/.exec(url.pathname)?.[1] || '';
    const system = body?.systemInstruction?.parts[0]?.text || body?.messages?.[0]?.content || '';
    calls.push({ host: url.hostname, key, model, body: JSON.stringify(body || {}) });
    if (key.includes('bad-key')) throw providerError(401);
    if (model === 'quota-model') throw providerError(429);
    if (url.pathname.endsWith('/models')) return url.hostname.includes('googleapis') ? { models: [{ name: 'models/gemini-fixture-text', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-fixture', supportedGenerationMethods: ['embedContent'] }] } : { data: [{ id: 'fixture:free', pricing: { prompt: '0', completion: '0' } }, { id: 'fixture-paid', pricing: { prompt: '0.01', completion: '0.02' } }] };
    let output: unknown = { ok: true };
    if (system.includes('citations')) output = { answer: 'JWT authentication uses a signed token [1].', citations: [1] };
    else if (system.includes('"cards"')) output = { cards: [{ contentId: savedId, question: 'What does JWT authentication use?', answer: 'a signed token', sourceQuote: 'JWT authentication uses a signed token.', options: ['a signed token', 'a database index', 'an unsigned cookie', 'a public password'] }] };
    else if (system.includes('"tags"')) output = { tags: ['security', 'authentication'] };
    else if (system.includes('summary')) output = 'JWT uses a signed token to authenticate requests.';
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    return url.hostname.includes('googleapis') ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] } : { choices: [{ finish_reason: 'stop', message: { content: text } }] };
  };
  const fixtureApp = createApp({ aiTransport: transport });
  await request(fixtureApp).get('/api/v1/ai/settings').expect(401);
  await request(fixtureApp).post('/api/v1/ai/test').send({}).expect(401);
  await request(fixtureApp).post('/api/v1/signup').send({ username: 'byok-owner', password: 'password123' }).expect(201);
  const signed = await request(fixtureApp).post('/api/v1/signin').send({ username: 'byok-owner', password: 'password123' }).expect(200);
  const headers = { Authorization: `Bearer ${String(signed.body.token)}` };
  const settings = { provider: 'gemini', model: 'gemini-fixture-text', apiKey: 'byok-canary-private-key' };
  const saved = await request(fixtureApp).post('/api/v1/ai/settings').set(headers).send(settings).expect(200);
  assert.equal(saved.body.configured, true); assert.equal(saved.body.testedAt, null); assert.equal(calls.length, 0);
  assert.ok(!JSON.stringify(saved.body).includes(settings.apiKey));
  const models = await request(fixtureApp).post('/api/v1/ai/models').set(headers).send({ provider: 'gemini' }).expect(200);
  assert.equal(models.body.models.length, 1); assert.equal(models.body.models[0].id, 'gemini-fixture-text');
  const tested = await request(fixtureApp).post('/api/v1/ai/test').set(headers).send({ provider: 'gemini', model: 'gemini-fixture-text' }).expect(200);
  assert.equal(tested.body.success, true); assert.ok(!JSON.stringify(tested.body).includes(settings.apiKey));
  const current = await request(fixtureApp).get('/api/v1/ai/settings').set(headers).expect(200); assert.ok(current.body.testedAt);
  const badKey = await request(fixtureApp).post('/api/v1/ai/test').set(headers).send({ ...settings, apiKey: 'bad-key-canary' }).expect(422);
  assert.equal(badKey.body.code, 'AI_AUTH_INVALID'); assert.ok(!JSON.stringify(badKey.body).includes('bad-key-canary'));
  await request(fixtureApp).get('/api/v1/me').set(headers).expect(200);
  await request(fixtureApp).post('/api/v1/ai/test').set(headers).send({ ...settings, model: 'quota-model' }).expect(429);
  await request(fixtureApp).post('/api/v1/ai/settings').set(headers).send({ ...settings, trustedServer: true }).expect(400);
  await request(fixtureApp).post('/api/v1/ai/settings').set(headers).send({ ...settings, model: 'whisper-large-v3' }).expect(422);
  const bobStatus = await request(fixtureApp).get('/api/v1/ai/settings').set('Authorization', `Bearer ${otherToken}`).expect(200);
  assert.equal(bobStatus.body.hasApiKey, false); assert.ok(!JSON.stringify(bobStatus.body).includes(settings.apiKey));
  const note = await request(fixtureApp).post('/api/v1/content').set(headers).send({ type: 'note', title: 'JWT', text: secretText }).expect(201); savedId = note.body.content._id as string;
  const answer = await request(fixtureApp).post('/api/v1/ai/ask').set(headers).send({ question: 'How does JWT authentication work?' }).expect(200);
  assert.equal(answer.body.sources[0].contentId, savedId);
  const summary = await request(fixtureApp).post(`/api/v1/ai/content/${savedId}`).set(headers).send({ action: 'short' }).expect(200); assert.match(summary.body.result as string, /signed token/);
  const tags = await request(fixtureApp).post(`/api/v1/ai/content/${savedId}`).set(headers).send({ action: 'tags' }).expect(200); assert.deepEqual(tags.body.tags, ['security', 'authentication']);
  await request(fixtureApp).post('/api/v1/recall/generate').set(headers).send({ contentIds: [savedId] }).expect(201);
  assert.ok(calls.filter(call => call.model).every(call => call.host === 'generativelanguage.googleapis.com'));
  assert.ok(calls.every(call => !call.body.includes(settings.apiKey)));
  await request(fixtureApp).delete('/api/v1/ai/settings/key').set(headers).send({}).expect(200);
  const removed = await request(fixtureApp).get('/api/v1/ai/status').set(headers).expect(200); assert.equal(removed.body.configured, false); assert.equal(removed.body.provider, 'gemini'); assert.equal(removed.body.testedAt, null);
  const before = calls.length;
  await request(fixtureApp).post('/api/v1/ai/ask').set(headers).send({ question: 'JWT authentication' }).expect(503); assert.equal(calls.length, before);
  await request(fixtureApp).post('/api/v1/ai/settings').set(headers).send(settings).expect(200);
  await request(fixtureApp).post('/api/v1/logout').set(headers).send({}).expect(200);
  const login = await request(fixtureApp).post('/api/v1/signin').send({ username: 'byok-owner', password: 'password123' }).expect(200);
  const afterLogout = await request(fixtureApp).get('/api/v1/ai/status').set('Authorization', `Bearer ${String(login.body.token)}`).expect(200);
  assert.equal(afterLogout.body.configured, false); assert.equal(afterLogout.body.provider, 'gemini');
});
