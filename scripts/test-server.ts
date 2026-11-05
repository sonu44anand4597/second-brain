// Test-only fixture: a real isolated MongoDB and an explicitly local provider boundary.
// Neither this provider nor its enable endpoint is included in the production API.
import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { providerRequest } from '../src/ai/transport.js';
const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24' } });
await mongoose.connect(mongo.getUri());
const fixture = http.createServer((req, res) => {
  if (req.url === '/enable' && req.method === 'POST') {
    config.aiKey = 'local-test-fixture'; config.aiModel = 'local-test-fixture'; config.aiUrl = 'http://127.0.0.1:3097';
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return;
  }
  const nativeGemini = req.headers['x-fixture-host'] === 'generativelanguage.googleapis.com';
  if (String(req.headers.authorization || req.headers['x-goog-api-key']).includes('invalid-fixture-key')) { res.writeHead(401); res.end('{"error":{"message":"Rejected fixture key"}}'); return; }
  if (req.method === 'GET' && req.url?.includes('/models')) {
    const models = nativeGemini ? { models: [{ name: 'models/gemini-fixture-text', displayName: 'Gemini fixture text', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-fixture', supportedGenerationMethods: ['embedContent'] }] } : { data: [{ id: 'fixture-text:free', name: 'Fixture text (free)', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['response_format'] }, { id: 'fixture-paid-text', name: 'Fixture paid text', pricing: { prompt: '0.001', completion: '0.002' } }] };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(models)); return;
  }
  let body = ''; req.on('data', data => { body += String(data); });
  req.on('end', () => {
    try {
      const request = JSON.parse(body) as { messages?: { content: string }[]; systemInstruction?: { parts: { text: string }[] }; contents?: { parts: { text: string }[] }[] };
      const system = request.systemInstruction?.parts[0]?.text || request.messages?.[0]?.content || '';
      const user = request.contents?.[0]?.parts[0]?.text || request.messages?.[1]?.content || '';
      if (system.includes('Connection validation.')) {
        const text = '{"ok":true}';
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(nativeGemini ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] } : { choices: [{ message: { content: text } }] })); return;
      }
      const input = JSON.parse(user) as { passages?: { passage: string }[] } | { contentId: string; text: string }[];
      let output: unknown;
      if (Array.isArray(input)) {
        output = { cards: [{ contentId: input[0]!.contentId, question: 'What does JWT authentication use?', answer: 'a signed token', sourceQuote: 'JWT authentication uses a signed token.', options: ['a signed token', 'an unsigned cookie', 'a shared password', 'a database index'] }] };
      } else output = { answer: `${input.passages?.[0]?.passage || 'No evidence'} [1]`, citations: [1] };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(nativeGemini ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] } : { choices: [{ message: { content: JSON.stringify(output) } }] }));
    } catch { res.writeHead(400); res.end('{}'); }
  });
});
fixture.listen(3097, '127.0.0.1');
// Dependency injection replaces only external HTTP transport in this test-only executable.
const app = createApp({ aiTransport: (url, options) => providerRequest(new URL(`http://127.0.0.1:3097${url.pathname}${url.search}`), { ...options, trustedServer: true, headers: { ...options?.headers, 'x-fixture-host': url.hostname } }) });
const server = app.listen(3087, '127.0.0.1', () => console.log('Isolated test API ready on 3087'));
const stop = () => { fixture.close(); server.close(() => { void mongoose.disconnect().then(() => mongo.stop()).then(() => process.exit(0)); }); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
