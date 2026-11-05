import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { ApiError, providerError } from './errors.js';

function publicAddress(address: string) {
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  return parsed.range() === 'unicast';
}
export interface TransportOptions { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal; trustedServer?: boolean; maxBytes?: number; timeoutMs?: number }

/** Pinned DNS, bounded response, no redirects, no cookies, and no automatic retries. */
export async function providerRequest(url: URL, options: TransportOptions = {}): Promise<unknown> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs || 40000)]) : AbortSignal.timeout(options.timeoutMs || 40000);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new ApiError(400, 'Invalid AI endpoint.', 'AI_ENDPOINT');
  try {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
      const aborted = () => reject(new ApiError(504, 'AI request timed out or was cancelled.', 'AI_TIMEOUT'));
      if (signal.aborted) { aborted(); return; }
      signal.addEventListener('abort', aborted, { once: true });
      lookup(hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted)).catch(() => {});
    });
    if (!addresses.length || !options.trustedServer && addresses.some(a => !publicAddress(a.address))) throw new ApiError(400, 'Custom AI endpoints must resolve only to public internet addresses.', 'AI_ENDPOINT');
    const pinned = addresses[0]!;
    return await new Promise((resolve, reject) => {
      const body = options.body === undefined ? undefined : JSON.stringify(options.body);
      const request = (url.protocol === 'https:' ? https : http).request(url, {
        method: options.method || 'POST', signal, agent: false, family: pinned.family,
        lookup: (_hostname, _lookupOptions, callback) => callback(null, pinned.address, pinned.family),
        headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', 'Content-Type': 'application/json', ...options.headers, ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) },
      }, response => {
        const status = response.statusCode || 500;
        if (status >= 300 && status < 400) { response.resume(); reject(providerError(status)); return; }
        const parts: Buffer[] = []; let size = 0;
        response.on('data', (part: Buffer) => {
          size += part.length;
          if (size > (status >= 400 ? 65536 : options.maxBytes || 1024 * 1024)) request.destroy(new ApiError(502, 'AI response exceeded the supported size limit.', 'AI_INVALID_RESPONSE'));
          else parts.push(part);
        });
        response.on('end', () => {
          let data: unknown;
          try { data = JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown; }
          catch { reject(status >= 400 ? providerError(status) : new ApiError(502, 'The AI service returned an invalid response. Check the provider and endpoint.', 'AI_INVALID_RESPONSE')); return; }
          if (status >= 400 || data && typeof data === 'object' && 'error' in data) { reject(providerError(status >= 400 ? status : 502, data)); return; }
          resolve(data);
        });
        response.on('error', reject);
      });
      request.on('error', reject); request.end(body);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal.aborted) throw new ApiError(504, 'AI request timed out or was cancelled. Your selection was not changed.', 'AI_TIMEOUT');
    throw new ApiError(502, 'Cannot reach the AI provider. Check the endpoint, internet connection, and provider service status.', 'AI_NETWORK');
  }
}
