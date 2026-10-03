// Builds the OpenAI-compatible model list for a scoped gateway token.

// Returns the model list entry for a model alias.
export function modelEntry(model) {
  return {
    id: model.name,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'smolorchestrator',
  };
}

// Lists only the models the token is allowed to use.
export function listModelsForToken(registry, token) {
  const allowed = registry.tokenModelIdSet(token.id);
  const data = [];
  for (const model of registry.modelsById.values()) {
    if (allowed.has(model.id)) data.push(modelEntry(model));
  }
  return { object: 'list', data };
}
