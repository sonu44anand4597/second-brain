# HTTP API

Base `/api/v1`. Bodies are JSON. Private routes accept the original `Authorization: Bearer <JWT>` or the new HttpOnly session cookie. All private operations scope records to the authenticated user. Errors return `{ message, existingId? }`; the latter appears on duplicate detection.

## Preserved routes

| Method/path | Request | Response |
| --- | --- | --- |
| POST `/signup` | `{ username, password }` | 201 `{ message }`; 411 for duplicate username |
| POST `/signin` | `{ username, password }` | `{ token }` and HttpOnly `brainly_session` cookie |
| GET `/content` | — | `{ content: Content[] }`; original populated `userId.username` retained |
| POST `/content` | `{ link, type, ...optional fields }` | 201 `{ message: "Content added", content }` |
| DELETE `/content` | `{ contentId }` | `{ message: "Deleted" }` |
| POST `/brain/share` | `{ share: boolean, mode?: "all"\|"selected", contentIds?: string[] }` | When enabled `{ message, shareLink: hash }`; otherwise `{ message }` |
| GET `/brain/:shareLink` | Public capability hash | `{ username, content: PublicContent[] }`; 411 for missing/revoked link |

Validation is stricter than the starter: signup passwords need eight characters; links require safe HTTP(S); IDs must be valid; missing/foreign resources return 404. Legacy signin passwords remain accepted. Notes are a new type allowing an empty link when nonempty text is provided. Sharing without a `mode` retains whole-brain behavior.

## Added routes

| Method/path | Request | Response |
| --- | --- | --- |
| GET `/health` | Public | `{ status: "ok"\|"database-unavailable" }` |
| GET `/me` | — | `{ user: { id, username } }` |
| POST `/logout` | `{}` | `{ message }`; revokes all account sessions |
| PATCH `/content/:id` | Partial content fields | `{ content }`; absent fields are preserved |
| POST `/metadata` | `{ link }` | `{ title, description, text, type, textOrigin, notice }`; does not save anything |
| GET `/collections` | — | `{ collections }` |
| POST `/collections` | `{ name, description? }` | 201 `{ collection }` |
| PATCH `/collections/:id` | `{ name, description? }` | `{ collection }` |
| DELETE `/collections/:id` | `{}` | `{ message }`; resources preserved |
| GET `/brain/share/status` | — | `{ enabled, shareLink, mode, contentIds }` |
| GET `/ai/status` | — | Original fields plus provider/name/baseUrl/freeOnly/hasApiKey/storage/credentialSource/testedAt/capabilities; no key value |
| GET `/ai/providers` | — | `{ providers, storage }`; fixed endpoints and official key/pricing links |
| GET `/ai/settings` | — | Current safe status, never the API key |
| POST `/ai/settings` | `{ provider, model, apiKey?, baseUrl?, freeOnly? }` | Safe status plus message; credentials stay in memory |
| DELETE `/ai/settings/key` | `{}` | Safe status; removes key and retains disabled preference |
| POST `/ai/models` | Same settings fields; model optional | `{ models, provider, fetchedAt }`; current compatible text catalogue |
| POST `/ai/test` | Same settings fields; model required | `{ success, provider, model, testedAt, message }`; actual small JSON request; does not save the selection |
| POST `/ai/ask` | `{ question, conversationId? }` | `{ answer, sources, mode, conversationId }` |
| GET `/ai/conversations` | — | `{ conversations }`; newest 50 summaries |
| GET `/ai/conversations/:id` | — | `{ conversation }`; owned messages and sources |
| DELETE `/ai/conversations/:id` | `{}` | `{ message }` |
| POST `/ai/content/:id` | `{ action }` | Summary `{ result, contentId, basedOn }` or `{ tags }` |
| GET `/recall` | — | `{ cards, sessions }`; newest 20 quiz sessions |
| POST `/recall/generate` | `{ contentIds: string[] }` | 201 `{ cards }`; 1–5 owned text sources |
| POST `/recall/:id/review` | `{ rating: "again"\|"hard"\|"good"\|"easy" }` | `{ card }` with persisted interval/due date |
| DELETE `/recall/:id` | `{}` | `{ message }` |
| POST `/recall/quiz` | `{ responses: [{ cardId, answer }] }` | 201 `{ session }`, scored on the server |

`action`: `short`, `detailed`, `takeaways`, `simplify`, `actions`, or `tags`. Summaries are generated on demand; save with `PATCH /content/:id { summary }`. Accepted suggested tags are persisted with a merged `tags` array; suggestions never silently overwrite user tags.

## Records

`Content`: `_id, title, link, normalizedLink, type, description, text, textOrigin, tags[], collectionIds[], favorite, summary, userId, createdAt, updatedAt`.

Create defaults: empty metadata/text/title, empty tag/collection arrays, unpinned. Types retain compatibility with existing arbitrary short string types; new UI offers article/video/tweet/link/note. Text origin describes what the user saved; manually editing imported text changes it to `manual`.

Limits: title 240, URL 2,048, description 1,500, source text 30,000, summary 16,000 characters; 20 tags/collections per item. Exact duplicate URLs within an account return 409 and `existingId`; unrelated users can save the same URL. Legacy unnormalized records participate in duplicate checks.

`Source`: `{ contentId, title, link, passage }`. Inline `[n]` references the one-based position in the returned `sources` array. All sources originate from an owner-scoped query. No source identifiers are accepted from provider output.

`RecallCard`: source ID, question, answer, exact source quote, four options, due date, interval in days, review count, last rating, last review time, timestamps. `QuizSession`: total, correct, per-card result, timestamps.

`PublicContent` allowlist: `_id, title, link, type, description, text, tags, createdAt`. Public sharing never returns the full private database document.

## Errors and cancellation

Provider errors additionally include a stable `code` (for example `AI_AUTH_INVALID`, `AI_RATE_LIMIT`, `AI_PAID_MODEL_BLOCKED`, `AI_ENDPOINT`, `AI_TIMEOUT`). Upstream messages/keys are never echoed. A rejected provider key returns 422, preserving the application session. Settings reject unknown fields; callers cannot set owner, trust flags or arbitrary provider endpoints. Blank-key reuse is limited to the same provider and exact endpoint.

400 validation; 401 session missing/expired/revoked; 403 denied origin; 404 unavailable owned record; 409 duplicate/concurrent generation; 411 retained legacy duplicate/invalid-share statuses; 415 non-JSON write; 422 unavailable source text/import; 429 rate limit/provider limit; 502 invalid provider response; 503 missing AI configuration; 504 provider timeout/interruption. Oversized bodies are rejected by Express.

Aborting `/ai/ask` closes the client request and propagates an AbortSignal to the provider. The server does not persist a partial answer. Provider charging/cancellation semantics depend on the provider.
