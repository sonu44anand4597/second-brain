import type { Content } from '../types';
export const titleOf = (item: Content) => item.title || (item.link ? sourceOf(item) : 'Untitled note');
export const sourceOf = (item: Content) => { try { return item.link ? new URL(item.link).hostname.replace(/^www\./, '') : 'Personal note'; } catch { return 'Saved link'; } };
export const dateOf = (value: string) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value)) : 'Earlier';
export function relationship(a: Content, b: Content) {
  const tags = a.tags.filter(tag => b.tags.some(t => t.toLowerCase() === tag.toLowerCase()));
  const collections = a.collectionIds.filter(id => b.collectionIds.includes(id));
  return { tags, collections, connected: tags.length > 0 || collections.length > 0 };
}
export function filterContent(items: Content[], search: string, type = '', tag = '', collection = '') {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => (!type || item.type === type) && (!tag || item.tags.includes(tag)) && (!collection || item.collectionIds.includes(collection)) && terms.every(term => `${item.title} ${item.link} ${item.description} ${item.text} ${item.tags.join(' ')}`.toLowerCase().includes(term)));
}
