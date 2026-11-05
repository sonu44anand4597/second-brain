import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { ApiError } from './errors.js';
import { assertTextModel, providerIds, type AIConnection, type ProviderId } from './providers.js';

export interface ProviderDefinition { id: ProviderId; name: string; baseUrl: string; keyUrl: string; docsUrl: string; freeNotice: string; enabled: boolean; disabledReason?: string }
export function providerCatalog(): ProviderDefinition[] {
  return [
    { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyUrl: 'https://aistudio.google.com/apikey', docsUrl: 'https://ai.google.dev/gemini-api/docs/pricing', freeNotice: 'An API key is required. Selected models have a free tier with project/model quotas; Google may use free-tier content to improve products. Check current pricing and your project limits.', enabled: true },
    { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/settings/keys', docsUrl: 'https://openrouter.ai/collections/free-models', freeNotice: 'An API key is required. Free-only mode checks current zero token/request pricing. Free variants have limited daily/minute quotas; availability and provider data policies vary.', enabled: true },
    { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', docsUrl: 'https://console.groq.com/docs/rate-limits', freeNotice: 'An API key is required. Free-plan quotas vary by model and organization. A model being listed does not guarantee free capacity for your account.', enabled: true },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', docsUrl: 'https://developers.openai.com/api/docs/pricing', freeNotice: 'An API key and available account credits are required. No permanent free API tier is assumed. Check current API billing and credit eligibility in your account.', enabled: true },
    { id: 'custom', name: 'Custom OpenAI-compatible', baseUrl: '', keyUrl: '', docsUrl: '', freeNotice: 'Use a trusted HTTPS endpoint approved by the administrator. Pricing, data handling, model support, and key requirements depend on that service.', enabled: config.customAIHosts.length > 0, ...(config.customAIHosts.length ? {} : { disabledReason: 'The administrator must set AI_CUSTOM_ALLOWED_HOSTS to approve custom endpoint hostnames.' }) },
    { id: 'ollama', name: 'Ollama (local)', baseUrl: config.ollamaUrl, keyUrl: '', docsUrl: 'https://docs.ollama.com/api/openai-compatibility', freeNotice: 'Runs local models on the application server, which may be different from your computer. No provider key is needed. Hardware/electricity costs apply; cloud model routing is disabled.', enabled: config.enableOllama, ...(config.enableOllama ? {} : { disabledReason: 'The administrator must enable AI_ENABLE_OLLAMA and run a local Ollama server.' }) },
  ];
}

export const settingsInput = z.object({
  provider: z.enum(providerIds), model: z.string().trim().max(200).regex(/^[\w./:@+\-]*$/, 'Use a valid model identifier').default(''),
  apiKey: z.string().trim().min(1).max(8192).regex(/^[\x21-\x7e]+$/, 'The API key cannot contain whitespace or control characters').optional(),
  baseUrl: z.string().trim().max(2048).default(''), freeOnly: z.boolean().default(true),
}).strict();
export type AISettingsInput = z.output<typeof settingsInput>;
interface Record { connection: AIConnection; expiresAt: number }
const credentials = new Map<string, Record>();
const preferences = new Map<string, Omit<AIConnection, 'apiKey'>>();
const tested = new Map<string, { fingerprint: string; at: string; expiresAt: number }>();
const ttl = 8 * 60 * 60000;
export const scopeFor = (userId: string, version = 0) => `${userId}:${version}`;
export const fingerprint = (connection: AIConnection, scope: string) => createHash('sha256').update(`${scope}:${JSON.stringify(connection)}`).digest('hex');

function recordFor(scope: string) {
  const record = credentials.get(scope);
  if (record && record.expiresAt <= Date.now()) { record.connection.apiKey = ''; tested.delete(scope); }
  if (record) record.expiresAt = Date.now() + ttl;
  return record;
}
export function serverConnection(): AIConnection {
  const kind = providerIds.includes(config.aiProvider as ProviderId) ? config.aiProvider as ProviderId : config.aiUrl === 'https://api.openai.com/v1' ? 'openai' : 'custom';
  const baseUrl = config.aiProvider && kind !== 'custom' ? providerCatalog().find(p => p.id === kind)!.baseUrl : config.aiUrl;
  return { provider: kind, apiKey: kind === 'ollama' ? '' : config.aiKey, model: config.aiModel, baseUrl, embeddingModel: config.embeddingModel, freeOnly: false, trustedServer: true };
}
export function resolveConnection(scope: string): AIConnection {
  const record = recordFor(scope);
  if (record) return { ...record.connection };
  const preference = preferences.get(scope.split(':')[0]!);
  if (preference) return { ...preference, apiKey: '' };
  if (config.aiModel && (config.aiKey || config.aiProvider === 'ollama' && config.enableOllama)) return serverConnection();
  return { provider: 'gemini', apiKey: '', model: '', baseUrl: providerCatalog()[0]!.baseUrl, embeddingModel: '', freeOnly: true };
}
export function endpointFor(provider: ProviderId, baseUrl: string) {
  const definition = providerCatalog().find(p => p.id === provider)!;
  if (!definition.enabled) throw new ApiError(400, definition.disabledReason || 'This provider is disabled.', 'AI_ENDPOINT');
  if (provider !== 'custom') {
    if (baseUrl && baseUrl.replace(/\/$/, '') !== definition.baseUrl.replace(/\/$/, '')) throw new ApiError(400, 'Use the fixed endpoint for this provider. Select Custom for another approved endpoint.', 'AI_ENDPOINT');
    if (provider === 'ollama') {
      const local = new URL(definition.baseUrl);
      if (!['http:', 'https:'].includes(local.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(local.hostname) || local.username || local.password || local.search || local.hash) throw new ApiError(400, 'OLLAMA_BASE_URL must be a loopback URL without credentials or query parameters.', 'AI_ENDPOINT');
    }
    return definition.baseUrl.replace(/\/$/, '');
  }
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new ApiError(400, 'Enter a valid approved HTTPS base URL, including its API version path.', 'AI_ENDPOINT'); }
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || url.search || url.hash || !config.customAIHosts.includes(url.hostname.toLowerCase())) throw new ApiError(400, 'Custom endpoints require HTTPS on port 443, an approved hostname, and no credentials, query, or fragment.', 'AI_ENDPOINT');
  return url.toString().replace(/\/$/, '');
}
export function connectionFromInput(scope: string, input: unknown, requireModel = true): AIConnection {
  const data = settingsInput.parse(input);
  const baseUrl = endpointFor(data.provider, data.baseUrl);
  const current = resolveConnection(scope);
  // Never forward one provider's key to another provider/endpoint.
  const existingKey = current.provider === data.provider && current.baseUrl === baseUrl ? current.apiKey : '';
  const connection: AIConnection = { provider: data.provider, model: data.model.replace(/^models\//, ''), apiKey: data.provider === 'ollama' ? '' : data.apiKey || existingKey, baseUrl, freeOnly: data.provider === 'openrouter' ? data.freeOnly : false, embeddingModel: '', ...(data.provider === 'ollama' ? { trustedServer: true } : {}) };
  if (requireModel) assertTextModel(connection);
  return connection;
}
export function saveConnection(scope: string, connection: AIConnection) {
  for (const [key, record] of credentials) if (record.expiresAt <= Date.now()) { record.connection.apiKey = ''; tested.delete(key); }
  if (!credentials.has(scope) && credentials.size >= 1000) throw new ApiError(503, 'AI settings capacity reached. Please try again later.', 'AI_UNAVAILABLE');
  const userId = scope.split(':')[0]!;
  if (!preferences.has(userId) && preferences.size >= 1000) throw new ApiError(503, 'AI settings capacity reached. Please try again later.', 'AI_UNAVAILABLE');
  const { apiKey: _apiKey, ...safePreferences } = connection;
  preferences.set(userId, safePreferences);
  credentials.set(scope, { connection: { ...connection }, expiresAt: Date.now() + ttl });
}
export const hasUserConnection = (scope: string) => Boolean(recordFor(scope) || preferences.has(scope.split(':')[0]!));
export function clearUserCredentials(userId: string) {
  for (const key of credentials.keys()) if (key.startsWith(`${userId}:`)) credentials.delete(key);
  for (const key of tested.keys()) if (key.startsWith(`${userId}:`)) tested.delete(key);
}
export function removeKey(scope: string) {
  saveConnection(scope, { ...resolveConnection(scope), apiKey: '' });
  tested.delete(scope);
}
export function markTested(scope: string, connection: AIConnection) {
  const at = new Date().toISOString();
  if (tested.size > 2000) for (const [key, value] of tested) if (value.expiresAt <= Date.now()) tested.delete(key);
  tested.set(scope, { fingerprint: fingerprint(connection, scope), at, expiresAt: Date.now() + ttl });
  return at;
}
export function aiStatus(scope: string) {
  const c = resolveConnection(scope);
  const verification = tested.get(scope);
  const testedAt = verification && verification.expiresAt > Date.now() && verification.fingerprint === fingerprint(c, scope) ? verification.at : null;
  const supportsEmbeddings = Boolean(c.embeddingModel && !['gemini', 'groq'].includes(c.provider));
  return { configured: Boolean(c.model && (c.apiKey || c.provider === 'ollama')), retrieval: supportsEmbeddings ? 'semantic' : 'keyword', streaming: false, model: c.model || null, provider: c.provider, providerName: providerCatalog().find(p => p.id === c.provider)!.name, baseUrl: c.baseUrl, freeOnly: c.freeOnly, hasApiKey: Boolean(c.apiKey), storage: 'memory', credentialSource: hasUserConnection(scope) ? 'user' : c.apiKey ? 'server' : 'none', testedAt, hourlyLimit: 20, capabilities: { text: true, structuredResponses: true, images: false, files: false, embeddings: supportsEmbeddings } };
}
