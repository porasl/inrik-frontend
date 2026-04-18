import { API_BASE } from '../../app.config.js';

const profileCache = new Map();
const pendingResolvers = new Map();
let flushTimer = null;

function flushBatch() {
  flushTimer = null;
  const emails = [...pendingResolvers.keys()];
  if (!emails.length) return;

  const variables = {};
  const variableDefs = [];
  const selections = [];
  const aliasToEmail = {};

  emails.forEach((email, index) => {
    const alias = `u${index}`;
    const variable = `e${index}`;
    aliasToEmail[alias] = email;
    variables[variable] = email;
    variableDefs.push(`$${variable}: String!`);
    selections.push(`${alias}: getUserProfile(email: $${variable}) { firstname lastname profileImageUrl }`);
  });

  const query = `query BatchUserProfiles(${variableDefs.join(', ')}) {\n${selections.join('\n')}\n}`;

  fetch(`${API_BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
    .then((res) => res.json())
    .then((json) => {
      const data = json?.data || {};

      emails.forEach((email, index) => {
        const alias = `u${index}`;
        const profile = data[alias] || null;
        profileCache.set(email, profile);

        const resolvers = pendingResolvers.get(email) || [];
        pendingResolvers.delete(email);
        resolvers.forEach((resolve) => resolve(profile));
      });
    })
    .catch(() => {
      emails.forEach((email) => {
        const resolvers = pendingResolvers.get(email) || [];
        pendingResolvers.delete(email);
        resolvers.forEach((resolve) => resolve(null));
      });
    });
}

export function getUserProfileCached(email) {
  if (!email) return Promise.resolve(null);

  if (profileCache.has(email)) {
    return Promise.resolve(profileCache.get(email));
  }

  return new Promise((resolve) => {
    const existing = pendingResolvers.get(email) || [];
    pendingResolvers.set(email, [...existing, resolve]);

    if (!flushTimer) {
      flushTimer = setTimeout(flushBatch, 20);
    }
  });
}

export function prefetchUserProfiles(emails = []) {
  const unique = [...new Set(emails.filter(Boolean))];
  return Promise.all(unique.map((email) => getUserProfileCached(email)));
}

export function clearUserProfileCache() {
  profileCache.clear();
}
