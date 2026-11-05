export interface Content {
  _id: string; title: string; link: string; type: string; description: string; text: string;
  tags: string[]; collectionIds: string[]; favorite: boolean; summary: string;
  textOrigin: 'manual' | 'extracted' | 'none'; createdAt: string; updatedAt: string;
}
export interface Collection { _id: string; name: string; description: string }
export interface User { id: string; username: string }
export interface Source { contentId: string; title: string; passage: string; link: string }
export interface Message { role: 'user' | 'assistant'; text: string; sources: Source[] }
export interface Conversation { _id: string; title: string; messages: Message[]; updatedAt: string }
export type AIProviderId = 'gemini' | 'openrouter' | 'groq' | 'openai' | 'custom' | 'ollama';
export interface AIStatus { configured: boolean; retrieval: 'keyword' | 'semantic'; streaming: boolean; model: string | null; hourlyLimit: number; provider: AIProviderId; providerName: string; baseUrl: string; freeOnly: boolean; hasApiKey: boolean; storage: 'memory'; credentialSource: 'user' | 'server' | 'none'; testedAt: string | null }
export interface AIProviderDefinition { id: AIProviderId; name: string; baseUrl: string; keyUrl: string; docsUrl: string; freeNotice: string; enabled: boolean; disabledReason?: string }
export interface AIModel { id: string; name: string; free: boolean | null; jsonMode: boolean | null; contextWindow: number | null; inputTokens: number | null; outputTokens: number | null }
export interface RecallCard { _id: string; contentId: string; question: string; answer: string; sourceQuote: string; options: string[]; dueAt: string; interval: number; reviews: number; lastRating?: string }
export interface QuizSession { _id: string; total: number; correct: number; createdAt: string }
export interface ShareStatus { enabled: boolean; shareLink: string | null; mode: 'all' | 'selected'; contentIds: string[] }
