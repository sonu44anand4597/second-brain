import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/security.js';
import { chunks, normalizeUrl, scheduleReview } from '../src/utils.js';
import { isPublicAddress } from '../src/metadata.js';
import { provider, retrieve } from '../src/ai.js';
import { config } from '../src/config.js';

test('scrypt hashes are salted and verify only the right password; legacy credentials remain valid', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt:/); assert.notEqual(hash, await hashPassword('correct horse battery'));
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('legacy', 'legacy'), true);
  assert.equal(await verifyPassword('wrong', 'legacy'), false);
});
test('duplicate normalization preserves meaningful query params and removes tracking and fragments', () => {
  assert.equal(normalizeUrl('https://EXAMPLE.com/path/?utm_source=x&b=2&a=1#part'), 'https://example.com/path/?a=1&b=2');
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com');
  assert.throws(() => normalizeUrl('javascript:alert(1)'));
  assert.throws(() => normalizeUrl('https://user:pass@example.com'));
  assert.notEqual(normalizeUrl('https://example.com/?id=1'), normalizeUrl('https://example.com/?id=2'));
  assert.notEqual(normalizeUrl('https://example.com/path'), normalizeUrl('https://example.com/path/'));
});
test('metadata rejects loopback, private, link-local, multicast, reserved and mapped IP addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '2001:db8::1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true); assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});
test('spaced repetition has deterministic intervals and exact due times', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(scheduleReview('again', 4, now).dueAt.toISOString(), '2026-01-01T00:10:00.000Z');
  assert.equal(scheduleReview('hard', 0, now).interval, 1);
  assert.equal(scheduleReview('good', 4, now).interval, 10);
  assert.equal(scheduleReview('easy', 0, now).interval, 4);
  assert.equal(scheduleReview('easy', 4, now).dueAt.toISOString(), '2026-01-15T00:00:00.000Z');
});
test('chunking overlaps passages, is bounded, and never invents text', () => {
  const text = 'x'.repeat(3000); const parts = chunks(text);
  assert.ok(parts.length > 1); assert.ok(parts.every(part => text.includes(part)));
  assert.equal(chunks('').length, 0); assert.ok(chunks('x'.repeat(100000)).length <= 40);
});
test('keyword retrieval returns real passages and no results for unrelated or empty material', async () => {
  const items = [{ _id: 'one', title: 'JWT', text: 'JWT authentication uses a signed token to verify requests.', tags: ['security'] }, { _id: 'two', title: 'Cooking', text: 'A good soup starts with fresh vegetables.' }];
  const result = await retrieve(items, 'JWT authentication', 'user-a');
  assert.equal(result.mode, 'keyword'); assert.equal(result.sources[0]?.contentId, 'one');
  assert.ok(items[0]!.text.includes(result.sources[0]!.passage));
  assert.equal((await retrieve(items, 'astronomy galaxies', 'user-a')).sources.length, 0);
  assert.equal((await retrieve([{ _id: 'url', title: 'JWT', link: 'https://example.com' }], 'JWT', 'user-a')).sources.length, 0);
});
test('optional semantic retrieval ranks passages and caches vectors within each owner only', async () => {
  const original = { embed: provider.embed, model: config.embeddingModel, key: config.aiKey };
  let calls = 0;
  provider.embed = async input => { calls++; return input.map(text => text.includes('JWT') ? [1, 0] : [0, 1]); };
  config.embeddingModel = 'test-embedding'; config.aiKey = 'test-fixture';
  try {
    const items = [{ _id: 'jwt', text: 'JWT uses signed tokens.' }, { _id: 'soup', text: 'Soup uses vegetables.' }];
    const first = await retrieve(items, 'JWT', 'owner-one');
    assert.equal(first.mode, 'semantic'); assert.equal(first.sources.length, 1); assert.equal(first.sources[0]!.contentId, 'jwt');
    assert.equal(calls, 2);
    await retrieve(items, 'JWT', 'owner-one'); assert.equal(calls, 3);
    await retrieve(items, 'JWT', 'owner-two'); assert.equal(calls, 5);
  } finally { provider.embed = original.embed; config.embeddingModel = original.model; config.aiKey = original.key; }
});
