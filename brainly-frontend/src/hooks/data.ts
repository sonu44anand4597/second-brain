import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AIStatus, Collection, Content } from '../types';
export const useContent = () => useQuery({ queryKey: ['content'], queryFn: ({ signal }) => api<{ content: Content[] }>('/content', { signal }), select: data => data.content.map(item => ({ ...item, tags: item.tags || [], collectionIds: item.collectionIds || [], text: item.text || '', description: item.description || '', title: item.title || '', favorite: Boolean(item.favorite) })) });
export const useCollections = () => useQuery({ queryKey: ['collections'], queryFn: ({ signal }) => api<{ collections: Collection[] }>('/collections', { signal }), select: data => data.collections });
export const useAIStatus = () => useQuery({ queryKey: ['ai-status'], queryFn: ({ signal }) => api<AIStatus>('/ai/status', { signal }), retry: false });
