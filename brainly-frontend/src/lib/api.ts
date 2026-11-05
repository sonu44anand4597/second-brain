const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
export class APIError extends Error {
  status: number;
  existingId?: string;
  constructor(message: string, status: number, existingId?: string) { super(message); this.status = status; this.existingId = existingId; }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new APIError('Cannot reach the server. Check your connection and that the API is running.', 0);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { message?: string; existingId?: string } | null;
    if (response.status === 401 && !['/signin', '/me'].includes(path)) window.dispatchEvent(new Event('session-expired'));
    throw new APIError(body?.message || `Request failed (${response.status})`, response.status, body?.existingId);
  }
  if (!data) throw new APIError('The server returned an unexpected response.', 502);
  return data as T;
}
export const post = <T,>(path: string, body: unknown, signal?: AbortSignal) => api<T>(path, { method: 'POST', body: JSON.stringify(body), ...(signal ? { signal } : {}) });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const remove = (path: string, body: unknown = {}) => api<{ message: string }>(path, { method: 'DELETE', body: JSON.stringify(body) });
