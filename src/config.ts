const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('Set JWT_SECRET to at least 32 random characters in production');
}
// Retain the tutorial signing secret locally so existing bearer tokens keep working.
export const JWT_PASSWORD = process.env.JWT_SECRET || 'second-brain-secret';
export const config = {
  production,
  port: Number(process.env.PORT || 3000),
  mongoUrl: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/brainly',
  origins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(','),
  aiKey: process.env.AI_API_KEY || '',
  aiUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  aiModel: process.env.AI_MODEL || '',
  embeddingModel: process.env.EMBEDDING_MODEL || '',
  aiProvider: process.env.AI_PROVIDER || '',
  customAIHosts: (process.env.AI_CUSTOM_ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean),
  enableOllama: process.env.AI_ENABLE_OLLAMA === 'true',
  ollamaUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/, ''),
};
