# Existing database compatibility

Back up MongoDB before any upgrade. No existing users/content/links are dropped or renamed. The original `User`, `Content`, and `Links` model names and MongoDB collections remain.

Additive fields:

- User: `sessionVersion`, timestamps. Password hashes keep the existing `password` field. Passwords are upgraded from plaintext after a successful login, without changing the account's password.
- Content: `description`, `text`, `textOrigin`, `normalizedLink`, `collectionIds`, `favorite`, `summary`, timestamps. `link` can now be empty for direct notes. Existing tags remain string arrays. The list endpoint derives missing creation dates from MongoDB ObjectIds.
- Links: optional `mode`, `contentIds`, timestamps. Existing links without a mode continue to share the whole brain; review/revoke old links if that is not intended.
- New collections: Collection, Conversation, RecallCard, QuizSession, each with `userId` ownership.
- Indexes: owner/date, owner/normalized URL (unique only for nonempty normalized strings), owner/due date, shared hash lookup. No unique index is applied to unnormalized legacy URLs.

The application reads old documents without requiring a backfill. The optional additive backfill is:

```powershell
# After backing up and selecting the correct .env
node --env-file-if-exists=.env --import tsx scripts/migrate.ts
```

It populates defaults and timestamps, normalizes valid URLs, and leaves duplicate documents intact. For repeated URLs within an owner, only the oldest receives a normalized URL; later duplicates keep blank normalization. Invalid old URLs are retained and counted. Nothing is deleted. Run with the application stopped to avoid concurrent capture; investigate any existing custom normalized-field conflicts before retrying.

The frontend renders all imported content as escaped text. Existing unsafe URL values are not executed; the external-source action only allows HTTP(S). New and edited links must pass current validation.

The original hardcoded JWT secret is used only as a local-development compatibility default. Set a long random `JWT_SECRET` for production; doing so invalidates older tokens and requires signing in again. Older tokens lacking a session version remain valid only at version zero. Logout increments this version and revokes all old tokens.

New signup validation is intentionally stronger. Existing usernames/passwords remain usable through signin even if they do not meet new-signup limits, except an existing username longer than 80 or password longer than 256 would need an administrator-assisted reset. Password recovery is not implemented.
