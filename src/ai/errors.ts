export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

// Provider errors must never be returned as application 401s (which sign the user out).
// Never echo upstream messages: some gateways include credentials or request content.
export function providerError(status: number, upstream?: unknown): ApiError {
  // Read only known machine codes. Never interpolate provider messages or payloads.
  if (upstream && typeof upstream === 'object' && 'error' in upstream && upstream.error && typeof upstream.error === 'object') {
    const error = upstream.error as { code?: unknown; status?: unknown; type?: unknown; details?: unknown; metadata?: unknown };
    const codes = [error.code, error.status, error.type].filter((v): v is string => typeof v === 'string');
    if (Array.isArray(error.details)) for (const detail of error.details.slice(0, 16)) if (detail && typeof detail === 'object' && 'reason' in detail && typeof detail.reason === 'string') codes.push(detail.reason);
    if (codes.some(code => ['API_KEY_INVALID', 'API_KEY_EXPIRED', 'UNAUTHENTICATED', 'invalid_api_key', 'authentication_error'].includes(code))) status = 401;
    if (codes.some(code => ['insufficient_quota', 'billing_hard_limit_reached'].includes(code))) status = 402;
    if (error.metadata && typeof error.metadata === 'object' && 'limit_source' in error.metadata && typeof error.metadata.limit_source === 'string' && ['openrouter_guardrail_budget', 'openrouter_workspace_budget', 'openrouter_key_limit'].includes(error.metadata.limit_source)) status = 402;
  }
  if (status === 401 || status === 403) return new ApiError(422, 'The provider rejected this API key or its permissions. Check the key, account restrictions, and model access in AI Settings.', 'AI_AUTH_INVALID');
  if (status === 402) return new ApiError(429, 'Your provider has no remaining credits or quota. Check its billing/free-tier dashboard. No other model was used.', 'AI_QUOTA');
  if (status === 429) return new ApiError(429, 'Provider rate limit or free-tier quota reached. Check your provider dashboard and retry later. No automatic retry was made.', 'AI_RATE_LIMIT');
  if (status === 400 || status === 404 || status === 405 || status === 422) return new ApiError(422, 'This model or operation is unavailable. Load current text models, check the model ID and endpoint, then test the connection.', 'AI_MODEL_UNSUPPORTED');
  if (status === 408 || status === 504) return new ApiError(504, 'The AI provider timed out. Try again when the service is available.', 'AI_TIMEOUT');
  return new ApiError(502, 'The AI service is unavailable or returned an error. Please try again later; no automatic retry was made.', 'AI_UNAVAILABLE');
}
