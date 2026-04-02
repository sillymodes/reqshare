// Collections handler — CRUD for API request collections

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_ID_LENGTH = 8;
const CREATOR_TOKEN_LENGTH = 32;
const MAX_REQUESTS = 20;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function generateId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}

async function handleCreate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { name, description, requests, environment } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Collection name is required' }), { status: 400 });
  }

  if (!Array.isArray(requests) || requests.length === 0) {
    return new Response(JSON.stringify({ error: 'At least one request is required' }), { status: 400 });
  }

  if (requests.length > MAX_REQUESTS) {
    return new Response(JSON.stringify({ error: `Maximum ${MAX_REQUESTS} requests per collection` }), { status: 400 });
  }

  // Validate each request
  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    if (!req.name || !req.method || !req.url) {
      return new Response(JSON.stringify({ error: `Request ${i + 1} is missing required fields (name, method, url)` }), { status: 400 });
    }
  }

  // Check total payload size
  const payloadStr = JSON.stringify(body);
  if (new TextEncoder().encode(payloadStr).length > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: `Total payload must be under ${MAX_PAYLOAD_BYTES / 1024}KB` }), { status: 400 });
  }

  // Generate unique short ID with collision check
  let shortId;
  let attempts = 0;
  do {
    shortId = generateId(SHORT_ID_LENGTH);
    const existing = await env.COLLECTIONS.get(shortId);
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    return new Response(JSON.stringify({ error: 'Failed to generate unique ID, please try again' }), { status: 500 });
  }

  const creatorToken = generateId(CREATOR_TOKEN_LENGTH);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();

  const collection = {
    id: shortId,
    name: name.trim(),
    description: (description || '').trim(),
    requests,
    environment: environment || {},
    creatorToken,
    createdAt: now.toISOString(),
    expiresAt,
  };

  await env.COLLECTIONS.put(shortId, JSON.stringify(collection), {
    expirationTtl: TTL_SECONDS,
    metadata: { createdAt: now.toISOString(), expiresAt, views: 0 },
  });

  // Increment total collections counter in STATS
  const totalStr = await env.STATS.get('collections:total');
  const total = totalStr ? parseInt(totalStr, 10) : 0;
  await env.STATS.put('collections:total', String(total + 1));

  return new Response(JSON.stringify({
    id: shortId,
    creatorToken,
    url: `/c/#${shortId}`,
    expiresAt,
  }), { status: 201 });
}

async function handleRead(id, env, ctx) {
  const raw = await env.COLLECTIONS.get(id);
  if (!raw) {
    return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
  }

  const collection = JSON.parse(raw);

  // Increment view count in STATS (fire-and-forget)
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil((async () => {
      try {
        const viewKey = `collviews:${id}`;
        const viewsStr = await env.STATS.get(viewKey);
        const views = viewsStr ? parseInt(viewsStr, 10) : 0;
        await env.STATS.put(viewKey, String(views + 1));
      } catch (e) {
        console.error('Failed to increment view count:', e);
      }
    })());
  }

  // Strip creatorToken before returning
  const { creatorToken, ...publicCollection } = collection;
  return new Response(JSON.stringify(publicCollection), { status: 200 });
}

async function handleDelete(id, request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Authorization header with Bearer token required' }), { status: 401 });
  }

  const token = authHeader.slice(7).trim();

  const raw = await env.COLLECTIONS.get(id);
  if (!raw) {
    return new Response(JSON.stringify({ error: 'Collection not found' }), { status: 404 });
  }

  const collection = JSON.parse(raw);
  if (collection.creatorToken !== token) {
    return new Response(JSON.stringify({ error: 'Invalid creator token' }), { status: 403 });
  }

  await env.COLLECTIONS.delete(id);
  return new Response(JSON.stringify({ success: true, message: 'Collection deleted' }), { status: 200 });
}

export { handleCreate, handleRead, handleDelete };
