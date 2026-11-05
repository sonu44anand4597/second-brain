import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, Eye, EyeOff, LoaderCircle, Sparkles } from 'lucide-react';
import { z } from 'zod';
import { api, post, remove } from '../../lib/api';
import { Button, ErrorState } from '../../components/ui';
import type { AIModel, AIProviderDefinition, AIProviderId, AIStatus } from '../../types';

const preferenceSchema = z.object({ provider: z.enum(['gemini', 'openrouter', 'groq', 'openai', 'custom', 'ollama']), model: z.string().max(200), baseUrl: z.string().max(2048), freeOnly: z.boolean() });
type Preferences = z.infer<typeof preferenceSchema>;
function readPreferences(userId: string, status: AIStatus): Preferences {
  if (!status.configured && status.credentialSource === 'none') {
    try { const parsed = preferenceSchema.safeParse(JSON.parse(localStorage.getItem(`commonplace-ai:${userId}`) || 'null')); if (parsed.success) return parsed.data; } catch { /* Storage can be unavailable. */ }
  }
  return { provider: status.provider, model: status.model || '', baseUrl: status.provider === 'custom' ? status.baseUrl : '', freeOnly: status.provider === 'openrouter' ? status.freeOnly : true };
}
export default function AISettings({ status, userId }: { status: AIStatus; userId: string }) {
  const [preferences, setPreferences] = useState(() => readPreferences(userId, status));
  const [key, setKey] = useState(''); const [visible, setVisible] = useState(false); const [models, setModels] = useState<AIModel[]>([]); const [customModel, setCustomModel] = useState(Boolean(preferences.model));
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null); const cache = useQueryClient();
  const providers = useQuery({ queryKey: ['ai-providers'], queryFn: ({ signal }) => api<{ providers: AIProviderDefinition[] }>('/ai/providers', { signal }), retry: false });
  const definition = providers.data?.providers.find(p => p.id === preferences.provider);
  const keyReusable = status.hasApiKey && status.provider === preferences.provider && (preferences.provider !== 'custom' || status.baseUrl === preferences.baseUrl.replace(/\/$/, ''));
  const available = preferences.provider === 'ollama' || Boolean(key.trim()) || keyReusable;
  const payload = () => ({ ...preferences, baseUrl: preferences.provider === 'custom' ? preferences.baseUrl : '', ...(key.trim() ? { apiKey: key.trim() } : {}) });
  const loadModels = useMutation({ mutationFn: () => post<{ models: AIModel[] }>('/ai/models', payload()), onSuccess: data => { setModels(data.models); setCustomModel(Boolean(preferences.model) && !data.models.some(m => m.id === preferences.model)); setFeedback({ message: `${data.models.length} current text models loaded from the provider. Choose one explicitly.`, success: true }); }, onError: error => setFeedback({ message: error.message, success: false }) });
  const test = useMutation({ mutationFn: () => post<{ message: string; testedAt: string }>('/ai/test', payload()), onSuccess: async data => { setFeedback({ message: data.message, success: true }); await cache.invalidateQueries({ queryKey: ['ai-status'] }); }, onError: error => setFeedback({ message: error.message, success: false }) });
  const save = useMutation({ mutationFn: () => post<AIStatus & { message: string }>('/ai/settings', payload()), onSuccess: async data => {
    // Explicit allowlist: no key, authentication token or provider response is persisted.
    let storageAvailable = true;
    try { localStorage.setItem(`commonplace-ai:${userId}`, JSON.stringify({ provider: data.provider, model: data.model || '', baseUrl: data.provider === 'custom' ? data.baseUrl : '', freeOnly: data.freeOnly })); } catch { storageAvailable = false; }
    setKey(''); setVisible(false); cache.setQueryData(['ai-status'], data); await cache.invalidateQueries({ queryKey: ['ai-status'] });
    setFeedback({ message: `${data.message}${storageAvailable ? '' : ' Browser storage is unavailable, so local preferences could not be saved.'}`, success: true });
  }, onError: error => setFeedback({ message: error.message, success: false }) });
  const deletion = useMutation({ mutationFn: () => remove('/ai/settings/key'), onSuccess: async () => { setKey(''); setVisible(false); setFeedback({ message: 'API key removed. AI is disabled until you add a key; no fallback provider was selected.', success: true }); await cache.invalidateQueries({ queryKey: ['ai-status'] }); }, onError: error => setFeedback({ message: error.message, success: false }) });
  const busy = loadModels.isPending || test.isPending || save.isPending || deletion.isPending;
  const shownModels = models.filter(m => preferences.provider !== 'openrouter' || !preferences.freeOnly || m.free);
  function update(values: Partial<Preferences>) { setPreferences(current => ({ ...current, ...values })); setFeedback(null); }
  function selectProvider(provider: AIProviderId) {
    setPreferences({ provider, model: '', baseUrl: '', freeOnly: true }); setKey(''); setVisible(false); setModels([]); setCustomModel(false); setFeedback(null);
  }
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  return <section className="panel ai-settings"><h2><Sparkles size={20}/>AI Settings</h2>
    <div className={`connection-status ${status.testedAt ? 'connected' : ''}`}>{status.testedAt ? <Check size={19}/> : <CircleAlert size={19}/>}<strong>{status.testedAt ? 'Connection tested' : status.configured ? 'Configured · connection not tested' : 'Provider not configured'}</strong></div>
    <dl><div><dt>Current provider</dt><dd>{status.providerName}</dd></div><div><dt>Current model</dt><dd>{status.model || 'Not selected'}</dd></div><div><dt>Retrieval</dt><dd>{status.retrieval === 'semantic' ? 'Embedding similarity' : 'Keyword matching'}</dd></div><div><dt>Usage limit</dt><dd>{status.hourlyLimit} requests / hour / account</dd></div></dl>
    {providers.error ? <ErrorState error={providers.error} retry={() => void providers.refetch()}/> : <details className="ai-settings-editor"><summary>Configure provider and API key</summary><form onSubmit={submit}>
      <label>AI provider<select aria-label="AI provider" value={preferences.provider} disabled={busy || providers.isPending} onChange={e => selectProvider(e.target.value as AIProviderId)}>{providers.data?.providers.map(p => <option value={p.id} key={p.id}>{p.name}{!p.enabled ? ' (administrator setup needed)' : ''}</option>)}</select></label>
      {definition && !definition.enabled && <div className="info-banner">{definition.disabledReason}</div>}
      {preferences.provider === 'custom' && <label>API base URL<input aria-label="API base URL" type="url" required placeholder="https://approved.example.com/v1" maxLength={2048} value={preferences.baseUrl} disabled={busy} onChange={e => { update({ baseUrl: e.target.value }); setModels([]); setKey(''); }}/></label>}
      {preferences.provider !== 'ollama' && <label>API key<div className="password-field"><input aria-label="AI API key" type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={8192} value={key} disabled={busy} placeholder={keyReusable ? 'Key held in memory · leave blank to keep it' : 'Paste your own provider API key'} onChange={e => { setKey(e.target.value); setModels([]); setFeedback(null); }}/><button type="button" disabled={busy} aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><span className="field-hint">Kept in server memory for this signed-in account. Removed on sign-out, server restart, or 8 hours of inactivity. Never saved to browser storage or the database.</span></label>}
      <div className="ai-model-controls"><label>Model<select aria-label="AI model" value={customModel ? '__custom__' : preferences.model} disabled={busy} onChange={e => { if (e.target.value === '__custom__') { setCustomModel(true); update({ model: '' }); } else update({ model: e.target.value }); }}><option value="">Choose a model</option>{shownModels.map(m => <option key={m.id} value={m.id}>{m.name}{m.free === true ? ' · zero model price' : ''}</option>)}<option value="__custom__">Custom model ID…</option></select></label><Button variant="secondary" disabled={busy || !available || !definition?.enabled} busy={loadModels.isPending} onClick={() => loadModels.mutate()}>Load models</Button></div>
      {customModel && <label>Custom model ID<input aria-label="Custom model ID" value={preferences.model} disabled={busy} maxLength={200} required placeholder="Exact text model ID from your provider" onChange={e => update({ model: e.target.value })}/></label>}
      {preferences.provider === 'openrouter' && <label className="checkbox-label"><input type="checkbox" checked={preferences.freeOnly} disabled={busy} onChange={e => update({ freeOnly: e.target.checked })}/>Free models only · block paid model requests</label>}
      {preferences.provider === 'openrouter' && !preferences.freeOnly && <p className="field-hint">Paid models are enabled by your choice. The selected model may charge your account.</p>}
      {definition && <p className="muted">{definition.freeNotice} {definition.keyUrl && <a className="text-link" href={definition.keyUrl} target="_blank" rel="noopener noreferrer">Get a key ↗</a>} {definition.docsUrl && <a className="text-link" href={definition.docsUrl} target="_blank" rel="noopener noreferrer">Pricing & limits ↗</a>}</p>}
      <p className="field-hint">Only text you choose for an AI action is sent to the selected provider. Test Connection sends a small JSON request and can count toward usage or billing. No automatic model switching or paid fallback.</p>
      {feedback && <div className={feedback.success ? 'info-banner ai-feedback' : 'inline-error'} role={feedback.success ? 'status' : 'alert'}>{feedback.success ? <Check size={16}/> : <CircleAlert size={16}/>}<span>{feedback.message}</span></div>}
      <div className="button-row ai-settings-actions"><Button variant="secondary" busy={test.isPending} disabled={busy || !available || !preferences.model.trim() || !definition?.enabled} onClick={() => test.mutate()}>Test Connection</Button><Button type="submit" busy={save.isPending} disabled={busy || !preferences.model.trim() || !definition?.enabled}>Save Preferences</Button><Button variant="ghost" busy={deletion.isPending} disabled={busy || !status.hasApiKey} onClick={() => deletion.mutate()}>Remove API Key</Button></div>
    </form></details>}
    {providers.isPending && <p className="muted"><LoaderCircle size={14} className="spin"/> Loading provider settings…</p>}
  </section>;
}
