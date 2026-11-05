import { z } from 'zod';
import { ApiError } from './errors.js';
import { providerRequest, type TransportOptions } from './transport.js';
export type AITransport = (url: URL, options?: TransportOptions) => Promise<unknown>;

export const providerIds = ['gemini', 'openrouter', 'groq', 'openai', 'custom', 'ollama'] as const;
export type ProviderId = typeof providerIds[number];
export interface AIConnection { provider: ProviderId; apiKey: string; model: string; baseUrl: string; freeOnly: boolean; embeddingModel: string; trustedServer?: boolean }
export interface GenerationOptions { json?: boolean; maxTokens?: number }
export interface ModelInfo { id: string; name: string; free: boolean | null; jsonMode: boolean | null; contextWindow: number | null; inputTokens: number | null; outputTokens: number | null }
export interface AIProvider {
  generate(system: string, input: string, signal?: AbortSignal, options?: GenerationOptions): Promise<string>;
  embed(input: string[], signal?: AbortSignal): Promise<number[][]>;
}
const invalidResponse = () => new ApiError(502, 'The selected model returned an empty, blocked, truncated, or invalid text response. Choose a compatible text model and test it in AI Settings.', 'AI_INVALID_RESPONSE');
const chatResponse = z.object({ choices: z.array(z.object({ finish_reason: z.string().nullish(), message: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }) })).min(1) });
const embeddingResponse = z.object({ data: z.array(z.object({ index: z.number().int().min(0), embedding: z.array(z.number().finite()).min(1).max(16384) })) });
const geminiResponse = z.object({ candidates: z.array(z.object({ finishReason: z.string().optional(), content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional() })).optional() });

export const nonChatModel = (model: string) => /(?:embedding|moderation|whisper|transcrib|(?:^|[-/])tts(?:$|[-/])|(?:^|[-/])audio(?:$|[-/])|realtime|dall-e|gpt-image|imagen|image-generation|(?:^|[-/])live(?:$|[-/])|orpheus|prompt-guard|safeguard|sora)/i.test(model);
export function assertTextModel(connection: AIConnection) {
  if (!connection.model || nonChatModel(connection.model)) throw new ApiError(422, 'Choose a text-generation model. Audio, image-only, embedding, moderation, and live models do not support these knowledge features.', 'AI_MODEL_UNSUPPORTED');
  if (connection.provider === 'ollama' && /(?:^|[:/\-])cloud(?:$|[:/\-])/i.test(connection.model)) throw new ApiError(422, 'Choose a local Ollama model. Cloud model routing is disabled for the local option.', 'AI_MODEL_UNSUPPORTED');
}
const info = (id: string, name = id): ModelInfo => ({ id, name, free: null, jsonMode: null, contextWindow: null, inputTokens: null, outputTokens: null });
const modelCache = new Map<string, { expires: number; models: ModelInfo[] }>();
// Keys are owner/config fingerprints supplied by the settings vault, never API keys.
export async function discoverModels(connection: AIConnection, cacheKey?: string, signal?: AbortSignal, transport: AITransport = providerRequest): Promise<ModelInfo[]> {
  if (cacheKey) { const cached = modelCache.get(cacheKey); if (cached && cached.expires > Date.now()) return cached.models; }
  const gemini = connection.provider === 'gemini';
  const url = new URL(`${connection.baseUrl}/models`);
  if (gemini) url.searchParams.set('pageSize', '1000');
  const raw = await transport(url, { method: 'GET', headers: authHeaders(connection), ...(signal ? { signal } : {}), trustedServer: Boolean(connection.trustedServer), maxBytes: 8 * 1024 * 1024 });
  let models: ModelInfo[];
  if (gemini) {
    const result = z.object({ models: z.array(z.object({ name: z.string(), displayName: z.string().optional(), supportedGenerationMethods: z.array(z.string()).optional(), inputTokenLimit: z.number().optional(), outputTokenLimit: z.number().optional() })) }).safeParse(raw);
    if (!result.success) throw invalidResponse();
    models = result.data.models.filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => ({ ...info(m.name.replace(/^models\//, ''), m.displayName), jsonMode: true, inputTokens: m.inputTokenLimit || null, outputTokens: m.outputTokenLimit || null, contextWindow: m.inputTokenLimit || null }));
  } else {
    const result = z.object({ data: z.array(z.object({ id: z.string(), name: z.string().optional(), active: z.boolean().optional(), context_window: z.number().optional(), context_length: z.number().optional(), pricing: z.object({ prompt: z.string(), completion: z.string(), request: z.string().optional() }).optional(), architecture: z.object({ input_modalities: z.array(z.string()).optional(), output_modalities: z.array(z.string()).optional() }).optional(), supported_parameters: z.array(z.string()).optional() })) }).safeParse(raw);
    if (!result.success) throw invalidResponse();
    models = result.data.data.filter(m => m.active !== false && (!m.architecture?.input_modalities || m.architecture.input_modalities.includes('text')) && (!m.architecture?.output_modalities || m.architecture.output_modalities.includes('text'))).map(m => ({ ...info(m.id, m.name), free: connection.provider === 'openrouter' && m.pricing ? Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0 && Number(m.pricing.request || '0') === 0 : connection.provider === 'ollama' ? true : null, jsonMode: m.supported_parameters ? m.supported_parameters.includes('response_format') : null, contextWindow: m.context_window || m.context_length || null }));
  }
  models = models.filter(m => !nonChatModel(m.id) && !(connection.provider === 'openai' && (!/^(gpt-|chatgpt-|o\d)/.test(m.id) || /instruct|codex/i.test(m.id))) && !(connection.provider === 'ollama' && /(?:^|[:/\-])cloud(?:$|[:/\-])/i.test(m.id))).sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name)).slice(0, 1000);
  if (cacheKey) { if (modelCache.size > 200) modelCache.clear(); modelCache.set(cacheKey, { expires: Date.now() + 5 * 60000, models }); }
  return models;
}
function authHeaders(connection: AIConnection) {
  return connection.provider === 'gemini' ? { 'x-goog-api-key': connection.apiKey } : connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {};
}

export class ConfiguredProvider implements AIProvider {
  constructor(private readonly connection: AIConnection, private readonly cacheKey?: string, private readonly transport: AITransport = providerRequest) {}
  async generate(system: string, input: string, signal?: AbortSignal, options: GenerationOptions = {}) {
    const c = this.connection;
    if (!c.apiKey && c.provider !== 'ollama') throw new ApiError(503, 'Add your API key in Settings → AI Settings. Keys are kept in memory only.', 'AI_NOT_CONFIGURED');
    assertTextModel(c);
    let modelInfo: ModelInfo | undefined;
    if (c.provider === 'openrouter') {
      modelInfo = (await discoverModels(c, this.cacheKey, signal, this.transport)).find(m => m.id === c.model);
      if (c.freeOnly && c.model !== 'openrouter/free' && !modelInfo?.free) throw new ApiError(422, 'Free models only is enabled. Choose a model currently listed with zero token/request pricing, or explicitly disable the filter to use a paid model.', 'AI_PAID_MODEL_BLOCKED');
    }
    const maxTokens = Math.min(options.maxTokens || 8192, modelInfo?.outputTokens || 8192);
    const json = options.json ?? false;
    const gemini = c.provider === 'gemini';
    const body = gemini ? {
      systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }],
      generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
    } : {
      model: c.model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
      ...(c.provider === 'openai' || c.provider === 'groq' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(json && (c.provider !== 'openrouter' || modelInfo?.jsonMode) ? { response_format: { type: 'json_object' } } : {}),
      ...(c.provider === 'openrouter' ? { provider: { allow_fallbacks: false, ...(c.freeOnly ? { max_price: { prompt: 0, completion: 0, request: 0 } } : {}) } } : {}),
    };
    const raw = await this.transport(new URL(`${c.baseUrl}/${gemini ? `models/${encodeURIComponent(c.model.replace(/^models\//, ''))}:generateContent` : 'chat/completions'}`), { headers: authHeaders(c), body, trustedServer: Boolean(c.trustedServer), ...(signal ? { signal } : {}) });
    if (gemini) {
      const parsed = geminiResponse.safeParse(raw);
      const candidate = parsed.success ? parsed.data.candidates?.[0] : undefined;
      const text = candidate?.content?.parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
      if (!text || candidate?.finishReason && candidate.finishReason !== 'STOP') throw invalidResponse();
      return text;
    }
    const parsed = chatResponse.safeParse(raw);
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    if (!choice?.message.content?.trim() || choice.message.refusal || choice.finish_reason && choice.finish_reason !== 'stop') throw invalidResponse();
    return choice.message.content;
  }
  async embed(input: string[], signal?: AbortSignal) {
    const c = this.connection;
    if (!c.embeddingModel || c.provider === 'gemini' || c.provider === 'groq') throw new ApiError(422, 'Embeddings are not enabled for this selection. Keyword retrieval remains available.', 'AI_CAPABILITY');
    const raw = await this.transport(new URL(`${c.baseUrl}/embeddings`), { headers: authHeaders(c), body: { model: c.embeddingModel, input }, trustedServer: Boolean(c.trustedServer), ...(signal ? { signal } : {}) });
    const parsed = embeddingResponse.safeParse(raw);
    if (!parsed.success || parsed.data.data.length !== input.length) throw invalidResponse();
    const ordered = parsed.data.data.sort((a, b) => a.index - b.index);
    if (ordered.some((row, index) => row.index !== index || row.embedding.length !== ordered[0]!.embedding.length)) throw invalidResponse();
    return ordered.map(d => d.embedding);
  }
}
