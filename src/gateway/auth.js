// Gateway token authentication and model-scope enforcement.
import { sha256Hex } from '../util/crypto.js';
import { parseBearer } from '../util/headers.js';
import { openAiError } from '../util/body.js';

// Resolves the Bearer token to an enabled gateway token, or returns an error response.
export function authenticate(request, registry) {
  const raw = parseBearer(request);
  if (!raw) {
    return { error: openAiError('Missing API key', 'invalid_api_key', 401, 'authentication_error') };
  }
  const token = registry.tokenByHash(sha256Hex(raw));
  if (!token || !token.enabled) {
    return { error: openAiError('Invalid API key', 'invalid_api_key', 401, 'authentication_error') };
  }
  return { token };
}

// Returns true when the token is scoped to the model.
export function canAccessModel(registry, token, modelId) {
  return registry.tokenModelIdSet(token.id).has(modelId);
}
