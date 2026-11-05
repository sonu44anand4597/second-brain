import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { JWT_PASSWORD } from './config.js';
import { CardModel, CollectionModel, ContentModel, ConversationModel, LinkModel, QuizModel, UserModel } from './db.js';
import { userMiddleware } from './middleware.js';
import { cookieOptions, hashPassword, rateLimit, secureHeaders, verifyPassword } from './security.js';
import { normalizeUrl, random, scheduleReview } from './utils.js';
import { extractMetadata } from './metadata.js';
import { answerQuestion, ApiError, getAIContext, grounding, parseStructured } from './ai.js';
import { aiSettingsRoutes } from './ai/routes.js';
import { clearUserCredentials, scopeFor } from './ai/settings.js';
import type { AITransport } from './ai/providers.js';

// An explicit transport dependency allows external-provider fixture tests without production fallbacks.
export function createApp(options: { aiTransport?: AITransport } = {}) {
const app = express();
app.disable('x-powered-by');
app.use(secureHeaders, express.json({ limit: '160kb', inflate: false }), rateLimit(300, 60000));
const api = express.Router();
app.use('/api/v1', api);
const id = z.string().refine(v => mongoose.isObjectIdOrHexString(v), 'Invalid identifier');
const credentials = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(256) });
const owner = (req: Request) => ({ userId: req.userId! });
const owned = (req: Request, value: unknown) => ({ ...owner(req), _id: id.parse(value) });
const authLimit = rateLimit(20, 15 * 60000);
const aiLimit = rateLimit(20, 60 * 60000);
const publicContent = (item: Record<string, unknown>) => {
  const { _id, title, link, type, description, text, tags, createdAt } = item;
  return { _id, title, link, type, description, text, tags, createdAt };
};

api.get('/health', (_req, res) => res.json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'database-unavailable' }));
api.post('/signup', authLimit, async (req, res) => {
  const data = credentials.extend({ username: z.string().trim().min(3).max(80), password: z.string().min(8).max(256) }).parse(req.body);
  if (await UserModel.exists({ username: data.username })) { res.status(411).json({ message: 'User already exists' }); return; }
  await UserModel.create({ username: data.username, password: await hashPassword(data.password) });
  res.status(201).json({ message: 'You have successfully signed up' });
});
api.post('/signin', authLimit, async (req, res) => {
  const data = credentials.parse(req.body);
  const user = await UserModel.findOne({ username: data.username }).select('+password');
  if (!user || !await verifyPassword(data.password, user.password)) {
    res.status(401).json({ message: 'Invalid credentials' }); return;
  }
  if (!user.password.startsWith('scrypt:')) { user.password = await hashPassword(data.password); await user.save(); }
  const token = jwt.sign({ id: String(user._id), version: user.sessionVersion || 0 }, JWT_PASSWORD, { expiresIn: '7d' });
  res.cookie('brainly_session', token, cookieOptions).json({ token });
});
api.get('/brain/:shareLink', rateLimit(60, 60000), async (req, res) => {
  const link = await LinkModel.findOne({ hash: String(req.params.shareLink) }).lean();
  if (!link) throw new ApiError(411, 'This shared brain is unavailable or has been revoked.');
  const [items, user] = await Promise.all([
    ContentModel.find({ userId: link.userId, ...(link.mode === 'selected' ? { _id: { $in: link.contentIds } } : {}) }).lean(),
    UserModel.findById(link.userId).select('username').lean(),
  ]);
  res.json({ username: user?.username || '', content: items.map(item => publicContent(item as unknown as Record<string, unknown>)) });
});
api.use(userMiddleware);
api.get('/me', async (req, res) => {
  const user = await UserModel.findById(req.userId).select('username').lean();
  res.json({ user: { id: req.userId, username: user!.username } });
});
api.post('/logout', async (req, res) => {
  await UserModel.updateOne({ _id: req.userId }, { $inc: { sessionVersion: 1 } });
  clearUserCredentials(req.userId!);
  res.clearCookie('brainly_session', { ...cookieOptions, maxAge: undefined }).json({ message: 'Signed out on all devices' });
});

const contentSchema = z.object({
  title: z.string().trim().max(240).default(''), link: z.string().trim().max(2048).default(''),
  type: z.string().trim().min(1).max(40), description: z.string().max(1500).default(''),
  text: z.string().max(30000).default(''), tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  collectionIds: z.array(id).max(20).default([]), favorite: z.boolean().default(false),
  textOrigin: z.enum(['manual', 'extracted', 'none']).default('manual'), summary: z.string().max(16000).default(''),
});
async function validatedContent(req: Request, partial?: false): Promise<z.output<typeof contentSchema> & { normalizedLink?: string }>;
async function validatedContent(req: Request, partial: true): Promise<Partial<z.output<typeof contentSchema>> & { normalizedLink?: string }>;
async function validatedContent(req: Request, partial = false): Promise<unknown> {
  const parsed = partial ? contentSchema.partial().parse(req.body) : contentSchema.parse(req.body);
  // Zod defaults also run inside optional fields: omit absent keys on PATCH.
  const data = partial ? Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.hasOwn(req.body, key))) as Partial<z.output<typeof contentSchema>> : parsed;
  if (!partial && data.type !== 'note' && !data.link) throw new ApiError(400, 'A source URL is required');
  if (!partial && data.type === 'note' && !data.text?.trim()) throw new ApiError(400, 'Write some note text before saving');
  if (data.collectionIds?.length && await CollectionModel.countDocuments({ ...owner(req), _id: { $in: data.collectionIds } }) !== new Set(data.collectionIds).size) throw new ApiError(400, 'A selected collection is unavailable');
  const normalizedLink = data.link ? normalizeUrl(data.link) : '';
  if (data.link) {
    const candidates = await ContentModel.find({ ...owner(req), ...(partial ? { _id: { $ne: req.params.contentId } } : {}) }).select('link normalizedLink title').lean();
    const duplicate = candidates.find(item => {
      try { return (item.normalizedLink || (item.link ? normalizeUrl(item.link) : '')) === normalizedLink; } catch { return false; }
    });
    if (duplicate) throw Object.assign(new ApiError(409, 'This URL is already in your library.'), { existingId: String(duplicate._id) });
  }
  return { ...data, ...(data.tags ? { tags: [...new Set(data.tags)] } : {}), ...(data.link !== undefined ? { normalizedLink } : {}) };
}
api.get('/content', async (req, res) => {
  const items = await ContentModel.find(owner(req)).sort({ _id: -1 }).populate('userId', 'username').lean();
  res.json({ content: items.map(item => ({ ...item, createdAt: item.createdAt || item._id.getTimestamp() })) });
});
api.post('/content', async (req, res) => {
  const data = await validatedContent(req);
  const content = await ContentModel.create({ ...data, ...owner(req) });
  res.status(201).json({ message: 'Content added', content });
});
api.patch('/content/:contentId', async (req, res) => {
  const query = owned(req, req.params.contentId);
  const existing = await ContentModel.findOne(query).lean();
  if (!existing) throw new ApiError(404, 'Content not found');
  const data = await validatedContent(req, true);
  if ((data.type || existing.type) !== 'note' && !(data.link ?? existing.link)) throw new ApiError(400, 'A source URL is required');
  if ((data.type || existing.type) === 'note' && !(data.text ?? existing.text)?.trim()) throw new ApiError(400, 'Write some note text before saving');
  const content = await ContentModel.findOneAndUpdate(query, { $set: data }, { returnDocument: 'after', runValidators: true });
  res.json({ content });
});
api.delete('/content', async (req, res) => {
  const query = owned(req, req.body?.contentId);
  const result = await ContentModel.deleteOne(query);
  if (!result.deletedCount) throw new ApiError(404, 'Content not found');
  await CardModel.deleteMany({ ...owner(req), contentId: query._id });
  res.json({ message: 'Deleted' });
});
api.post('/metadata', rateLimit(15, 60000), async (req, res) => {
  const { link } = z.object({ link: z.string().url().max(2048) }).parse(req.body);
  try { res.json(await extractMetadata(link)); }
  catch (error) { throw new ApiError(422, error instanceof Error ? error.message : 'Page import failed. You can enter metadata manually.'); }
});

api.get('/collections', async (req, res) => res.json({ collections: await CollectionModel.find(owner(req)).sort({ createdAt: -1 }).lean() }));
const collectionSchema = z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(400).default('') });
api.post('/collections', async (req, res) => {
  const collection = await CollectionModel.create({ ...collectionSchema.parse(req.body), ...owner(req) });
  res.status(201).json({ collection });
});
api.patch('/collections/:collectionId', async (req, res) => {
  const collection = await CollectionModel.findOneAndUpdate(owned(req, req.params.collectionId), collectionSchema.parse(req.body), { returnDocument: 'after' });
  if (!collection) throw new ApiError(404, 'Collection not found');
  res.json({ collection });
});
api.delete('/collections/:collectionId', async (req, res) => {
  const query = owned(req, req.params.collectionId);
  if (!(await CollectionModel.deleteOne(query)).deletedCount) throw new ApiError(404, 'Collection not found');
  await ContentModel.updateMany(owner(req), { $pull: { collectionIds: query._id } });
  res.json({ message: 'Collection removed. Its resources remain in your library.' });
});
api.get('/brain/share/status', async (req, res) => {
  const link = await LinkModel.findOne(owner(req)).lean();
  res.json({ enabled: Boolean(link), shareLink: link?.hash || null, mode: link?.mode || 'all', contentIds: link?.contentIds || [] });
});
api.post('/brain/share', async (req, res) => {
  const { share, mode, contentIds } = z.object({ share: z.boolean(), mode: z.enum(['all', 'selected']).default('all'), contentIds: z.array(id).max(1000).default([]) }).parse(req.body);
  if (!share) { await LinkModel.deleteOne(owner(req)); res.json({ message: 'Brain sharing disabled' }); return; }
  if (mode === 'selected' && (!contentIds.length || await ContentModel.countDocuments({ ...owner(req), _id: { $in: contentIds } }) !== new Set(contentIds).size)) throw new ApiError(400, 'Choose resources from your own library to share');
  const link = await LinkModel.findOneAndUpdate(owner(req), { ...owner(req), hash: random(32), mode, contentIds }, { upsert: true, returnDocument: 'after' });
  res.json({ message: 'Brain shared', shareLink: link.hash });
});

api.use('/ai', aiSettingsRoutes(aiLimit, options.aiTransport));
api.get('/ai/conversations', async (req, res) => res.json({ conversations: await ConversationModel.find(owner(req)).select('title updatedAt').sort({ updatedAt: -1 }).limit(50).lean() }));
api.get('/ai/conversations/:conversationId', async (req, res) => {
  const conversation = await ConversationModel.findOne(owned(req, req.params.conversationId)).lean();
  if (!conversation) throw new ApiError(404, 'Conversation not found');
  res.json({ conversation });
});
api.delete('/ai/conversations/:conversationId', async (req, res) => {
  await ConversationModel.deleteOne(owned(req, req.params.conversationId)); res.json({ message: 'Conversation deleted' });
});
const generationLocks = new Set<string>();
api.post('/ai/ask', aiLimit, async (req, res) => {
  const { question, conversationId } = z.object({ question: z.string().trim().min(3).max(2000), conversationId: id.optional() }).parse(req.body);
  if (generationLocks.has(req.userId!)) throw new ApiError(409, 'Another answer is being generated. Please wait.');
  generationLocks.add(req.userId!);
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    const conversation = conversationId ? await ConversationModel.findOne(owned(req, conversationId)) : new ConversationModel({ ...owner(req), title: question.slice(0, 100), messages: [] });
    if (!conversation) throw new ApiError(404, 'Conversation not found');
    if (conversation.messages.length >= 100) throw new ApiError(400, 'Start a new conversation to continue');
    const items = await ContentModel.find(owner(req)).sort({ _id: -1 }).limit(1000).lean();
    const history = conversation.messages.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
    const result = await answerQuestion(items, question, req.userId!, history, abort.signal, getAIContext(scopeFor(req.userId!, req.sessionVersion), options.aiTransport));
    if (abort.signal.aborted) return;
    conversation.messages.push({ role: 'user', text: question, sources: [] }, { role: 'assistant', text: result.answer, sources: result.sources });
    await conversation.save();
    res.json({ ...result, conversationId: String(conversation._id) });
  } finally { generationLocks.delete(req.userId!); }
});
api.post('/ai/content/:contentId', aiLimit, async (req, res) => {
  const { action } = z.object({ action: z.enum(['short', 'detailed', 'takeaways', 'simplify', 'actions', 'tags']) }).parse(req.body);
  const item = await ContentModel.findOne(owned(req, req.params.contentId)).lean();
  if (!item) throw new ApiError(404, 'Content not found');
  if (!item.text && !item.description) throw new ApiError(422, 'This item has no source text. Edit it to add text before asking AI.');
  const result = await getAIContext(scopeFor(req.userId!, req.sessionVersion), options.aiTransport).provider.generate(`${grounding} ${action === 'tags' ? 'Return JSON {"tags":["tag"]} with up to six concise topic tags.' : `Produce a ${action} summary. Be explicit if only a short description is available.`}`, JSON.stringify({ title: item.title, sourceText: (item.text || item.description).slice(0, 18000), textAvailable: Boolean(item.text) }), undefined, { json: action === 'tags' });
  if (action === 'tags') res.json(parseStructured(result, z.object({ tags: z.array(z.string().min(1).max(40)).max(6) })));
  else res.json({ result, contentId: String(item._id), basedOn: item.text ? 'saved text' : 'description only' });
});

api.get('/recall', async (req, res) => {
  const [cards, sessions] = await Promise.all([CardModel.find(owner(req)).sort({ dueAt: 1 }).lean(), QuizModel.find(owner(req)).sort({ createdAt: -1 }).limit(20).lean()]);
  res.json({ cards, sessions });
});
api.post('/recall/generate', aiLimit, async (req, res) => {
  const { contentIds } = z.object({ contentIds: z.array(id).min(1).max(5) }).parse(req.body);
  const items = await ContentModel.find({ ...owner(req), _id: { $in: contentIds } }).lean();
  if (items.length !== new Set(contentIds).size) throw new ApiError(404, 'A selected resource is unavailable');
  const usable = items.filter(item => (item.text || '').trim().length >= 80);
  if (!usable.length) throw new ApiError(422, 'Select resources with at least 80 characters of saved source text. URLs alone cannot support study cards.');
  const raw = await getAIContext(scopeFor(req.userId!, req.sessionVersion), options.aiTransport).provider.generate(`${grounding} Return JSON {"cards":[{"contentId":"...","question":"...","answer":"...","sourceQuote":"...","options":["correct answer","wrong answer","wrong answer","wrong answer"]}]}. Create up to 8 factual questions. sourceQuote must be an EXACT substring of the supplied text and must contain the answer verbatim. Answer must be short, and one option must exactly equal the answer.`, JSON.stringify(usable.map(item => ({ contentId: String(item._id), text: item.text.slice(0, 7000) }))), undefined, { json: true });
  const parsed = parseStructured(raw, z.object({ cards: z.array(z.object({ contentId: id, question: z.string().min(5).max(600), answer: z.string().min(1).max(600), sourceQuote: z.string().min(15).max(1500), options: z.array(z.string().min(1).max(600)).length(4) })).min(1).max(8) }));
  const valid = parsed.cards.filter(card => {
    const source = usable.find(item => String(item._id) === card.contentId);
    return source?.text.includes(card.sourceQuote) && card.sourceQuote.toLowerCase().includes(card.answer.toLowerCase()) && card.options.includes(card.answer) && new Set(card.options).size === 4;
  });
  if (!valid.length) throw new ApiError(502, 'Generated cards could not be verified against the source text. Please retry.');
  const cards = await CardModel.insertMany(valid.map(card => ({ ...card, ...owner(req) })));
  res.status(201).json({ cards });
});
api.post('/recall/:cardId/review', async (req, res) => {
  const { rating } = z.object({ rating: z.enum(['again', 'hard', 'good', 'easy']) }).parse(req.body);
  const card = await CardModel.findOne(owned(req, req.params.cardId));
  if (!card) throw new ApiError(404, 'Card not found');
  Object.assign(card, scheduleReview(rating, card.interval), { lastRating: rating, lastReviewedAt: new Date() });
  card.reviews += 1; await card.save(); res.json({ card });
});
api.delete('/recall/:cardId', async (req, res) => {
  await CardModel.deleteOne(owned(req, req.params.cardId)); res.json({ message: 'Card deleted' });
});
api.post('/recall/quiz', async (req, res) => {
  const { responses } = z.object({ responses: z.array(z.object({ cardId: id, answer: z.string().max(600) })).min(1).max(50) }).parse(req.body);
  if (new Set(responses.map(r => r.cardId)).size !== responses.length) throw new ApiError(400, 'Each card can be answered once per quiz');
  const cards = await CardModel.find({ ...owner(req), _id: { $in: responses.map(r => r.cardId) } }).lean();
  if (cards.length !== responses.length) throw new ApiError(404, 'A quiz card is unavailable');
  const results = responses.map(r => ({ cardId: r.cardId, correct: cards.find(c => String(c._id) === r.cardId)!.answer === r.answer }));
  const session = await QuizModel.create({ ...owner(req), total: results.length, correct: results.filter(r => r.correct).length, responses: results });
  res.status(201).json({ session });
});
api.use((_req, res) => res.status(404).json({ message: 'API route not found' }));
const errorHandler: ErrorRequestHandler = (error: unknown, _req: Request, res: Response, _next) => {
  if (error && typeof error === 'object' && 'status' in error && [413, 415].includes(Number(error.status))) { res.status(Number(error.status)).json({ message: Number(error.status) === 413 ? 'Request is too large. Reduce source text to the supported limit.' : 'Unsupported request encoding. Send uncompressed JSON.' }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }); return; }
  if (error instanceof ApiError) { res.status(error.status).json({ message: error.message, ...(error.code ? { code: error.code } : {}), ...('existingId' in error ? { existingId: error.existingId } : {}) }); return; }
  if (error instanceof SyntaxError || error instanceof TypeError && error.message.includes('URL')) { res.status(400).json({ message: 'Invalid request. Check the submitted fields and URL.' }); return; }
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) { res.status(409).json({ message: 'This resource already exists' }); return; }
  console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
  res.status(500).json({ message: 'The request could not be completed. Please retry.' });
};
app.use(errorHandler);
return app;
}
export const app = createApp();
