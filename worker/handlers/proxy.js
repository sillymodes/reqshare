// CORS proxy handler with rate limiting, private IP blocklist, size limits, timeout

const MAX_REQUEST_BODY = 1 * 1024 * 1024; // 1MB
const MAX_RESPONSE_BODY = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT_MS = 15000; // 15 seconds
const RATE_LIMIT_MAX = 30; // requests per minute
const RATE_LIMIT_WINDOW = 60; // seconds

// Private IP and blocked domain patterns
const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd[0-9a-f]{2}:/i,
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  '0.0.0.0',
  '[::1]',
];

function isBlockedUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return true; // Invalid URL is blocked
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block .local domains
  if (hostname.endsWith('.local')) {
    return true;
  }

  // Block known hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return true;
  }

  // Block private IP patterns
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // Block non-http(s) protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return true;
  }

  return false;
}

async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < 8; i++) { // truncate to 16 hex chars
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function checkRateLimit(ip, env) {
  const ipHash = await hashIP(ip);
  const key = `ratelimit:${ipHash}`;
  const countStr = await env.STATS.get(key);
  const count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  await env.STATS.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
  return { allowed: true, remaining: RATE_LIMIT_MAX - count - 1 };
}

async function handleProxy(request, env) {
  const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || '0.0.0.0';

  // Rate limit check
  const rateResult = await checkRateLimit(clientIP, env);
  if (!rateResult.allowed) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded. Max 30 requests per minute.',
    }), {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { method, url, headers, body: reqBody } = body;

  if (!url || typeof url !== 'string') {
    return new Response(JSON.stringify({ error: 'URL is required' }), { status: 400 });
  }

  if (!method || typeof method !== 'string') {
    return new Response(JSON.stringify({ error: 'Method is required' }), { status: 400 });
  }

  // Blocklist check
  if (isBlockedUrl(url)) {
    return new Response(JSON.stringify({ error: 'Target URL is blocked (private/internal address)' }), { status: 403 });
  }

  // Check request body size
  if (reqBody) {
    const bodySize = new TextEncoder().encode(typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)).length;
    if (bodySize > MAX_REQUEST_BODY) {
      return new Response(JSON.stringify({ error: 'Request body exceeds 1MB limit' }), { status: 413 });
    }
  }

  // Build fetch options
  const fetchOptions = {
    method: method.toUpperCase(),
    headers: {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };

  // Copy allowed headers
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      // Skip hop-by-hop and host headers
      const lk = key.toLowerCase();
      if (['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade'].includes(lk)) {
        continue;
      }
      fetchOptions.headers[key] = value;
    }
  }

  // Add body for non-GET/HEAD methods
  if (reqBody && !['GET', 'HEAD'].includes(fetchOptions.method)) {
    fetchOptions.body = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
  }

  const startTime = Date.now();
  let response;

  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Request timed out (15s limit)', timing: { ms: elapsed } }), { status: 504 });
    }
    return new Response(JSON.stringify({ error: `Fetch failed: ${err.message}`, timing: { ms: elapsed } }), { status: 502 });
  }

  const elapsed = Date.now() - startTime;

  // Read response body with size check
  let responseBody;
  try {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BODY) {
      return new Response(JSON.stringify({ error: 'Response body exceeds 5MB limit', timing: { ms: elapsed } }), { status: 502 });
    }
    responseBody = new TextDecoder().decode(buffer);
  } catch (err) {
    return new Response(JSON.stringify({ error: `Failed to read response: ${err.message}`, timing: { ms: elapsed } }), { status: 502 });
  }

  // Collect response headers
  const responseHeaders = {};
  for (const [key, value] of response.headers.entries()) {
    responseHeaders[key] = value;
  }

  return new Response(JSON.stringify({
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,
    timing: { ms: elapsed },
  }), {
    status: 200,
    headers: {
      'X-RateLimit-Remaining': String(rateResult.remaining),
    },
  });
}

export { handleProxy };
