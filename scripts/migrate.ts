import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { connectDatabase, ContentModel } from '../src/db.js';
import { normalizeUrl } from '../src/utils.js';

// Optional additive migration. Back up the database before invoking.
await connectDatabase(config.mongoUrl);
const seen = new Set<string>(); let updated = 0; let duplicate = 0; let invalid = 0;
try {
  for await (const item of ContentModel.find().sort({ _id: 1 }).lean().cursor()) {
    let normalized = '';
    try { normalized = item.link ? normalizeUrl(item.link) : ''; } catch { invalid++; }
    const key = `${String(item.userId)}:${normalized}`;
    const alreadySeen = normalized && seen.has(key);
    if (alreadySeen) duplicate++;
    if (normalized) seen.add(key);
    await ContentModel.collection.updateOne({ _id: item._id }, { $set: {
      title: item.title || '', description: item.description || '', text: item.text || '',
      textOrigin: item.textOrigin || (item.text ? 'manual' : 'none'), tags: item.tags || [],
      collectionIds: item.collectionIds || [], favorite: item.favorite || false, summary: item.summary || '',
      createdAt: item.createdAt || item._id.getTimestamp(), updatedAt: item.updatedAt || item._id.getTimestamp(),
      // Preserve duplicate documents and leave their normalization blank.
      normalizedLink: alreadySeen ? '' : normalized,
    } });
    updated++;
  }
  console.log(JSON.stringify({ updated, preservedDuplicates: duplicate, invalidLegacyUrls: invalid }));
} finally { await mongoose.disconnect(); }
