// Request requirement extraction and preflight validation for routing.
import { routeMatchesRequirements } from './balance.js';

// Input validation failure raised before any upstream spend; maps to HTTP 400.
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
    this.code = 'INVALID_INPUT';
  }
}

// Extracts capability/context requirements from a parsed request and validates the payload shape.
export function buildRequirements(payload, bodyBytes) {
  const capabilities = new Set();
  if (payload.tools !== undefined) {
    if (!Array.isArray(payload.tools)) throw new InputError('tools must be an array');
    if (payload.tools.length > 0) capabilities.add('tools');
    for (const tool of payload.tools) {
      if (!tool || typeof tool !== 'object' || typeof tool.function?.name !== 'string') {
        throw new InputError('each tool requires function.name');
      }
    }
  }
  if (payload.response_format !== undefined) {
    if (payload.response_format === null || typeof payload.response_format !== 'object') {
      throw new InputError('response_format must be an object');
    }
    if (payload.response_format.type) capabilities.add('json');
  }
  if (payload.reasoning_effort !== undefined) capabilities.add('reasoning');
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  for (const message of messages) {
    if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part?.type === 'image_url') capabilities.add('vision');
        else if (part?.type === 'input_audio') capabilities.add('audio');
      }
    }
  }
  let maxOutputTokens = 0;
  const maxTokens = payload.max_tokens ?? payload.max_completion_tokens;
  if (maxTokens !== undefined) {
    if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
      throw new InputError('max_tokens must be a positive integer');
    }
    maxOutputTokens = maxTokens;
  }
  return { capabilities, estimatedInputTokens: Math.ceil(bodyBytes / 4), maxOutputTokens };
}

// Returns true when at least one configured route can satisfy the requirements.
export function hasCompatibleRoute(registry, model, requirements) {
  return registry.routesForModel(model.id).some((route) => routeMatchesRequirements(route, requirements));
}
