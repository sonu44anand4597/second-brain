import { randomBytes } from 'node:crypto';
export const random = (length: number) => randomBytes(length).toString('base64url').slice(0, length);
export function normalizeUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Use a public HTTP or HTTPS URL without credentials');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort(); url.hostname = url.hostname.toLowerCase();
  // Only a root slash is interchangeable; /path and /path/ can be different pages.
  return url.pathname === '/' && !url.search ? url.origin : url.toString();
}
export function scheduleReview(rating: string, interval: number, now = new Date()) {
  const days = rating === 'again' ? 0 : rating === 'hard' ? Math.max(1, Math.round(interval * 1.2))
    : rating === 'good' ? Math.max(1, Math.round(interval * 2.5)) : Math.max(4, Math.round(interval * 3.5));
  return { interval: days, dueAt: new Date(now.getTime() + (rating === 'again' ? 10 * 60000 : days * 86400000)) };
}
const stopWords = new Set('the and for with that this from have into your what how does are was were you about explain using saved'.split(' '));
export const tokenize = (value: string) => [...new Set((value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(t => !stopWords.has(t)))];
export function chunks(text: string, size = 1000) {
  const result: string[] = [];
  for (let start = 0; start < text.length && result.length < 40; start += size - 150) result.push(text.slice(start, start + size));
  return result;
}
