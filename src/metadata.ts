import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { normalizeUrl } from './utils.js';

export function isPublicAddress(address: string) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === 'unicast';
  } catch { return false; }
}

async function safeHtml(value: string, redirects = 0): Promise<string> {
  const started = Date.now();
  if (redirects > 3) throw new Error('Too many redirects');
  const url = new URL(normalizeUrl(value));
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard web ports are supported');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_resolve, reject) => { dnsTimer = setTimeout(() => reject(new Error('Page DNS lookup timed out')), 8000); }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Only public internet pages can be imported');
  const pinned = addresses[0]!;
  // DNS is resolved once and pinned to this socket, preventing DNS rebinding.
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      agent: false, family: pinned.family,
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
      headers: { 'User-Agent': 'Commonplace/1.0 (personal knowledge capture)', Accept: 'text/html', 'Accept-Encoding': 'identity' },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
        response.resume();
        if (!response.headers.location) { reject(new Error('Invalid redirect')); return; }
        safeHtml(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200 || !response.headers['content-type']?.includes('text/html')) {
        response.resume(); reject(new Error('This page does not provide readable HTML. Paste source text manually.')); return;
      }
      const parts: Buffer[] = []; let size = 0;
      response.on('data', (part: Buffer) => {
        size += part.length;
        if (size > 1024 * 1024) request.destroy(new Error('Page exceeds the 1 MB import limit'));
        else parts.push(part);
      });
      response.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
      response.on('error', reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error('Page import timed out')), Math.max(1, 8000 - (Date.now() - started)));
    request.on('close', () => clearTimeout(deadline)); request.on('error', reject);
  });
}

export async function extractMetadata(link: string) {
  const html = await safeHtml(link);
  const $ = load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').text()).trim().slice(0, 240);
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim().slice(0, 1500);
  $('script,style,nav,header,footer,aside,noscript,iframe,form,svg').remove();
  const article = $('article').first().text() || $('main').first().text();
  // Avoid treating navigation-heavy arbitrary body text as an article.
  const text = article.replace(/\s+/g, ' ').trim().slice(0, 30000);
  const host = new URL(link).hostname;
  const type = /(^|\.)youtu(be\.com|\.be)$/.test(host) ? 'video' : /(^|\.)(twitter|x)\.com$/.test(host) ? 'tweet' : 'article';
  return { title, description, text, type, textOrigin: text ? 'extracted' : 'none',
    notice: text ? 'Readable page text extracted. Review it before saving.' : 'Metadata only. No article or transcript text was retrieved.' };
}
