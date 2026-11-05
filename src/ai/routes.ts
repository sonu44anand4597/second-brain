import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { rateLimit } from '../security.js';
import { ApiError } from './errors.js';
import { ConfiguredProvider, discoverModels, type AITransport } from './providers.js';
import { aiStatus, connectionFromInput, fingerprint, markTested, providerCatalog, removeKey, saveConnection, scopeFor } from './settings.js';

const scope = (req: Request) => scopeFor(req.userId!, req.sessionVersion);
const cancellation = (req: Request) => {
  const abort = new AbortController();
  req.res?.on('close', () => { if (!req.res?.writableEnded) abort.abort(); });
  return abort.signal;
};
export function aiSettingsRoutes(generationLimit: RequestHandler, transport?: AITransport) {
  const router = Router();
  router.get('/status', (req, res) => res.json(aiStatus(scope(req))));
  router.get('/providers', (_req, res) => res.json({ providers: providerCatalog(), storage: 'memory' }));
  router.get('/settings', (req, res) => res.json(aiStatus(scope(req))));
  router.post('/settings', rateLimit(30, 60000), (req, res) => {
    const connection = connectionFromInput(scope(req), req.body);
    saveConnection(scope(req), connection);
    res.json({ ...aiStatus(scope(req)), message: 'Preferences saved. API keys are held in server memory only.' });
  });
  router.delete('/settings/key', (req, res) => {
    removeKey(scope(req)); res.json({ ...aiStatus(scope(req)), message: 'API key removed. Your provider preference is retained; no fallback provider was selected.' });
  });
  router.post('/models', rateLimit(15, 60000), async (req, res) => {
    const connection = connectionFromInput(scope(req), req.body, false);
    if (!connection.apiKey && connection.provider !== 'ollama') throw new ApiError(422, 'Enter your API key to load models from this provider.', 'AI_KEY_REQUIRED');
    const models = await discoverModels(connection, fingerprint(connection, scope(req)), cancellation(req), transport);
    res.json({ models, provider: connection.provider, fetchedAt: new Date().toISOString() });
  });
  router.post('/test', generationLimit, async (req, res) => {
    const connection = connectionFromInput(scope(req), req.body);
    const answer = await new ConfiguredProvider(connection, fingerprint(connection, scope(req)), transport).generate('Connection validation. Return only valid JSON: {"ok":true}. Do not include Markdown.', 'Return the requested JSON object.', cancellation(req), { json: true, maxTokens: 1024 });
    let parsed: unknown;
    try { parsed = JSON.parse(answer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { /* validated below */ }
    if (!z.object({ ok: z.literal(true) }).safeParse(parsed).success) throw new ApiError(502, 'The model answered but did not produce the required JSON. Choose a model that follows structured-output instructions.', 'AI_CAPABILITY');
    const testedAt = markTested(scope(req), connection);
    res.json({ success: true, provider: connection.provider, model: connection.model, testedAt, message: 'Connection verified with a real text and JSON generation request. Save Preferences to apply this selection.' });
  });
  return router;
}
