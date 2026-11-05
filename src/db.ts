import mongoose, { Schema, model } from 'mongoose';

const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true };
export const UserModel = model('User', new Schema({
  username: { type: String, unique: true, required: true, trim: true },
  password: { type: String, required: true, select: false },
  sessionVersion: { type: Number, default: 0 },
}, { timestamps: true }));

const ContentSchema = new Schema({
  title: { type: String, default: '' },
  link: { type: String, default: '' },
  normalizedLink: { type: String, default: '' },
  type: { type: String, required: true },
  description: { type: String, default: '' },
  text: { type: String, default: '' },
  textOrigin: { type: String, enum: ['manual', 'extracted', 'none'], default: 'none' },
  tags: [{ type: String }],
  collectionIds: [{ type: Schema.Types.ObjectId, ref: 'Collection' }],
  favorite: { type: Boolean, default: false },
  summary: { type: String, default: '' },
  userId: owner,
}, { timestamps: true });
ContentSchema.index({ userId: 1, createdAt: -1 });
ContentSchema.index({ userId: 1, normalizedLink: 1 }, {
  unique: true, partialFilterExpression: { normalizedLink: { $gt: '' } },
});
export const ContentModel = model('Content', ContentSchema);
export const CollectionModel = model('Collection', new Schema({
  userId: owner, name: { type: String, required: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 400 },
}, { timestamps: true }));
export const LinkModel = model('Links', new Schema({
  hash: { type: String, index: true }, userId: { ...owner, unique: true },
  // Missing mode on old links retains legacy entire-brain sharing.
  mode: { type: String, enum: ['all', 'selected'] },
  contentIds: [{ type: Schema.Types.ObjectId, ref: 'Content' }],
}, { timestamps: true }));
const SourceSchema = new Schema({
  contentId: { type: String, required: true }, title: String, passage: String, link: String,
}, { _id: false });
export const ConversationModel = model('Conversation', new Schema({
  userId: owner, title: String,
  messages: [{ role: { type: String, enum: ['user', 'assistant'] }, text: String, sources: [SourceSchema] }],
}, { timestamps: true }));
const CardSchema = new Schema({
  userId: owner, contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true },
  question: { type: String, required: true }, answer: { type: String, required: true },
  sourceQuote: { type: String, required: true }, options: [String],
  dueAt: { type: Date, default: Date.now }, interval: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 }, lastRating: String, lastReviewedAt: Date,
}, { timestamps: true });
CardSchema.index({ userId: 1, dueAt: 1 });
export const CardModel = model('RecallCard', CardSchema);
export const QuizModel = model('QuizSession', new Schema({
  userId: owner, total: Number, correct: Number,
  responses: [{ cardId: String, correct: Boolean }],
}, { timestamps: true }));
export async function connectDatabase(uri: string) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}
