# Teacher demonstration: 2–3 minutes

Before class: start MongoDB, the API and Vite; configure a real provider key/model if demonstrating AI. Sign up once and prepare two factual notes of at least 80 characters, with a shared tag such as `security`, plus a collection. Leave other real saved resources visible if useful. Do not present a configured status badge as proof of a successful provider call.

1. **0:00–0:20 — Sign in and orient.** Show the dashboard's actual saved count, pinned content and collections. “Every number comes from my own database records.”
2. **0:20–0:45 — Capture a real source.** Paste `https://www.iana.org/domains/reserved`, Fetch, review the title and source text, add a tag/collection and save. Refresh the library to demonstrate persistence. If extraction fails on another site, explain the limitation and paste an actual passage manually.
3. **0:45–1:20 — Ask and trace.** Ask “What domains are reserved for examples?” Show the saved-text retrieval mode, answer, numbered citation and exact retrieved passage. Click the citation to open the resource. “The provider never chooses source IDs; the server supplies and validates the citations.”
4. **1:20–1:40 — Follow a connection.** Open Knowledge Graph, select a resource and show a connection caused by a shared tag or collection. Filter relationships and focus a node. “These lines reflect stored relationships rather than decorative or random edges.”
5. **1:40–2:15 — Recall what you saved.** Generate study cards from the IANA source or a prepared factual note. Reveal a card and its exact quote, choose Good, show the persisted next review, then take a short quiz. “Generated answers must occur inside an actual source quote; review intervals follow a deterministic algorithm.”
6. **2:15–2:40 — Share deliberately.** Select one resource, acknowledge the visible-content notice, create a link and open it in a private window. Revoke it and refresh the public view. “Only selected content is serialized; conversations and study history stay private.”
7. **2:40–3:00 — Product finish.** Toggle dark mode, demonstrate the command palette and mobile navigation, then sign out.

If no AI credentials are available, demonstrate the honest unavailable state plus the working core, graph and sharing. Explain the provider adapter and show automated provider-boundary tests; do not pretend a fixture or hardcoded answer is a real cloud response.

## Viva talking points

- **Why React/Vite?** It preserves the existing architecture. Routes are lazy loaded, server data lives in Query, forms are validated, and the API client centralizes credentials/errors/cancellation.
- **Why cookie plus bearer?** Existing clients retain their contract; the browser uses HttpOnly cookies instead of browser-readable stored tokens. Session versions make logout revoke tokens server-side.
- **What makes retrieval private?** MongoDB candidate queries contain the authenticated owner, and embedding cache keys include the owner. Clients cannot supply another user's source passages.
- **Is it semantic search?** Default is explicitly labelled keyword matching. Optional embeddings cosine-rank a bounded candidate set; no vector database is falsely claimed.
- **How are citations trustworthy?** Numbers are validated against server-retrieved passages and IDs; clicking them opens the corresponding saved resource. The wording still needs human review because LLM reasoning can be wrong.
- **What is the graph algorithm?** Pairwise shared-tag and collection intersection over a capped dataset. Each edge has a saved-data explanation.
- **How does recall scheduling work?** Again adds 10 minutes. Hard/Good/Easy multiply the previous day interval by 1.2/2.5/3.5 with minimums 1/1/4. Stored due dates drive subsequent queues.
- **How do you avoid SSRF?** Public-range DNS validation, per-redirect checks, pinned socket addresses, standard protocols/ports, byte limits and deadlines. React renders imported text safely.
- **What would scale next?** Database pagination/search, durable vectors, ingestion jobs, shared limits/locks, account recovery and production monitoring.
