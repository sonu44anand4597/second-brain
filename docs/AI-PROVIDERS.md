# Bring your own AI key

Commonplace's existing design and knowledge workflows remain intact. Configure a provider through **Settings → AI Settings → Configure provider and API key**. No cloud key is bundled, and production never uses test responses.

## Set up your key

1. Choose **Google Gemini** (the initial preference), OpenRouter, Groq, OpenAI, an administrator-approved custom endpoint, or enabled local Ollama.
2. Follow **Get a key** to the provider's official account page. Paste the key into the masked field. Show/hide is available; the application never reads a key back from the server.
3. Click **Load models**. This requests the provider's current model catalogue rather than displaying invented or outdated available models. Only compatible text-model candidates are listed. Alternatively choose **Custom model ID** and enter the exact ID from your provider.
4. Click **Test Connection**. It sends a small, genuine generation request and validates a JSON response. This may count toward provider quota or billing. Merely saving a key does not claim the connection was tested.
5. Click **Save Preferences**. Existing questions, summaries, tags and recall generation now use this selected provider/model. Selecting an option without saving does not change the active configuration.
6. Use **Remove API Key** to clear it. The provider/model preference remains and AI stays disabled; removal does not reactivate another server key or paid model. Signing out also clears the account's in-memory keys.

The active provider/model and tested-versus-configured status are visible in the existing Settings panel. Model discovery confirms what the provider lists, not your account's billing eligibility or guaranteed capacity. Connection testing verifies one small text/JSON request, not every possible prompt or model capability.

## Supported providers and relevant capabilities

| Provider | Protocol | Existing features | Model selection / cost behavior |
| --- | --- | --- | --- |
| Google Gemini | Native REST `generateContent`, `x-goog-api-key` header | Grounded questions/citations, all summary formats, tags, source-verified recall cards/quizzes | Live ListModels filtered by `generateContent`; JSON MIME mode and server validation |
| OpenRouter | OpenAI-compatible chat completions | Same text/structured knowledge features | Live catalogue with prices/capabilities. Free-only is on initially and blocks models not currently listed at zero token/request pricing, except the documented `openrouter/free` router. Zero input/output/request price ceilings are also sent to OpenRouter. No alternate paid model or automatic provider fallback |
| Groq | OpenAI-compatible chat completions | Same text/structured knowledge features | Current active text models; JSON output mode. API free-plan capacity depends on organization/model |
| OpenAI | Chat Completions | Same text/structured knowledge features | Current model listing filtered to chat candidates. No free API allowance is assumed. Responses-only/Codex, image/audio/embedding-only models are not offered as chat candidates |
| Custom | Approved HTTPS OpenAI-compatible endpoint | Same features if the model follows text and JSON instructions | Exact model ID supported when catalogue discovery is absent. Test before using; no silent retry with different API parameters or models |
| Ollama (optional) | Local OpenAI-compatible `/v1/chat/completions` | Same features where an installed local model follows instructions | Current local model listing; no API key required. Cloud model IDs are blocked |

This update adds no uploads or image-analysis UI. Existing inputs are bounded saved text/descriptions. Audio, image-only, transcription, realtime, moderation and embedding models cannot replace a text chat model. Unsupported operations fail with a human-readable message. Generated recall still requires an exact supporting quote and answer substring; changing provider never weakens those checks.

Answers retain the existing complete-message behavior and cancellation. Token streaming is not added. BYOK uses the existing explicitly labelled keyword retrieval; it does not silently spend money on embeddings. Existing operator-managed `EMBEDDING_MODEL` support remains available for compatible server defaults. Gemini/Groq selection does not falsely claim embedding support through this adapter.

## Current free-tier options

Verified against official sources on **6 November 2026**. Availability, pricing, regions and quotas can change; the UI links to current provider pages rather than promising an unlimited allowance.

- **Gemini:** Google's pricing lists free input/output tiers for selected text models, including `gemini-3.5-flash-lite` and `gemini-2.5-flash-lite` at verification time. An API key/project is required. Eligibility and rate limits depend on model/project/tier, and free-tier content may be used to improve Google's products. Choose a model returned for your key and confirm your project's plan. [Official pricing](https://ai.google.dev/gemini-api/docs/pricing), [billing tiers](https://ai.google.dev/gemini-api/docs/billing/).
- **OpenRouter:** Free variants and zero-model-price options are available. At verification the public model catalogue returned 454 entries, including 16 with zero input/output/request prices, before application capability filtering. `:free` variants have 20 requests/minute and normally 50 requests/day; higher caps depend on purchased credits. Other zero-priced models can require a funded account. Failed requests may count. These quotas are provider policies, independent of Commonplace's own 20 AI actions/hour/account limit. [Free model rules](https://openrouter.ai/collections/free-models), [limits](https://openrouter.ai/docs/api/reference/limits), [live models](https://openrouter.ai/api/v1/models).
- **Groq:** The Free Plan offers limited requests/tokens for supported models, with organization-level RPM/RPD/TPM/TPD limits. The official limits table includes GPT-OSS models among free-plan examples. A Groq key is required. The model list itself does not certify free capacity. [Official limits](https://console.groq.com/docs/rate-limits), [supported models](https://console.groq.com/docs/models).
- **OpenAI:** A key and available API credits are needed; billing and any promotional credits depend on the account. No permanent free tier is assumed. [Official pricing](https://developers.openai.com/api/docs/pricing).
- **Local Ollama:** Locally run models do not incur a cloud provider API fee. Hardware, electricity and model licensing still matter. Download/run a suitable model yourself; Commonplace does not install models or route local selections to Ollama Cloud. [Official local compatibility](https://docs.ollama.com/api/openai-compatibility).

Never select a paid model merely to bypass exhausted free-tier limits. Change your provider/model explicitly if you want to use another option. The app never rotates keys, creates extra accounts, or bypasses provider quotas.

## Storage and privacy

- API keys are sent to the authenticated API over the same-origin connection, then held only in a bounded server-memory vault scoped to the account and JWT session version. Use HTTPS in production. Memory storage is not a hardware-backed vault; a compromised server process can access its memory.
- Keys are never saved to MongoDB, localStorage, sessionStorage, URLs, logs or analytics. The masked field is cleared after saving. The API returns only whether a key exists, never its value or suffix.
- Keys expire after eight hours without settings/AI activity, are removed on logout, and disappear when the API process restarts. Non-secret preferences remain in account-scoped browser storage. There is no plaintext-key persistence opt-in or database key migration.
- Personal selections shadow the server default. Expiration/removal/logout preserves the provider preference in server memory with no key, so a rejected/removed key cannot activate a paid fallback. Restart clears this volatile server state; an explicitly configured administrator default may be present after restart and is shown as the current provider/model. With ordinary BYOK-only setup, the user must re-enter a key after restart.
- Switching provider/endpoint never forwards the previous provider's key. Recent source passages are sent only when the user invokes an AI action. Model loading and connection testing send no library content.
- Retrieval remains owner scoped. Original citations, summaries, accepted tags, conversations and review records remain in the real database as before. No database schema changes were needed for BYOK.
- Use separate keys/budgets appropriate to your provider. The app limits request count, not actual token spending. A Test Connection request counts toward the app's AI usage limit.

## Optional administrator configuration

BYOK requires **no new environment variables** for Gemini, OpenRouter, Groq or OpenAI. Existing MongoDB/auth/origin setup is unchanged. Existing `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` and `EMBEDDING_MODEL` defaults remain compatible.

New optional settings:

```dotenv
# Optional named administrator default (gemini/openrouter/groq/openai/custom/ollama).
# With a named cloud provider its fixed official base URL is used.
# Leave blank for the original AI_BASE_URL compatible-server behavior.
AI_PROVIDER=

# Exact DNS hostnames approved for custom BYOK gateways. No schemes, wildcards or paths.
AI_CUSTOM_ALLOWED_HOSTS=your-approved-gateway.example

# Disabled by default. The endpoint is on the API host, not necessarily the browser's computer.
AI_ENABLE_OLLAMA=false
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
```

Custom requests use only approved HTTPS hosts on port 443, validate every DNS answer as public, pin the chosen address to the socket, reject redirects and URL credentials/query/fragments, and cap response sizes/timeouts. A local Ollama connection is a separate explicit administrator-approved loopback exception. Server-managed legacy `AI_BASE_URL` is an operator-trusted endpoint, not a user-controlled SSRF exception.

In a multi-instance deployment, memory credentials are instance-local. Use one API instance/sticky routing, or implement a separately reviewed encrypted shared vault before scaling. Do not replace this with plaintext localStorage or database persistence.

## Implementation and verification

`src/ai/settings.ts` owns configuration/credential lifetime. `providers.ts` owns capabilities, discovery and protocol normalization. `transport.ts` owns bounded DNS-pinned requests without redirects/retries. `errors.ts` maps known upstream codes to sanitized errors; provider invalid-key errors become app 422 responses, not auth 401s that would incorrectly sign users out. `routes.ts` supplies authenticated settings/discovery/test endpoints. `src/ai.ts` retains grounding/retrieval and binds an immutable selection per request. The existing feature prompts/ownership validation remain intact.

Tests explicitly replace only the external HTTP transport using `createApp({ aiTransport })` in test executables. Production starts `createApp()` with real transport and has no test-enable endpoint. Tests cover provider formats, Gemini invalid-key machine codes, free-only pricing, key lifetime/isolation, no secret in responses/storage, unsupported modalities, timeout/size/redirect/private-target errors, and full authenticated browser flows.

No live cloud credentials were available. Successful cloud text generation, your provider's actual key permissions/quota, optional custom services and locally installed Ollama models remain to be verified through Test Connection. The public OpenRouter catalogue and official pricing/documentation were checked live without sending private knowledge.
