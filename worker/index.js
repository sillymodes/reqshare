// ReqShare API Worker — main entry point and router

import { handleCreate, handleRead, handleDelete } from './handlers/collections.js';
import { handleProxy } from './handlers/proxy.js';
import { handleRecordPageview, handleGetSummary } from './handlers/stats.js';
import { handleSubmitReview, handleGetReviews, handleGetSiteSummary } from './handlers/reviews.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  newHeaders.set('Content-Type', 'application/json');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), { status });
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    let response;

    try {
      // Route: POST /api/collections
      if (path === '/api/collections' && method === 'POST') {
        response = await handleCreate(request, env);
      }
      // Route: GET /api/collections/:id
      else if (path.match(/^\/api\/collections\/[^/]+$/) && method === 'GET') {
        const id = path.split('/').pop();
        response = await handleRead(id, env, ctx);
      }
      // Route: DELETE /api/collections/:id
      else if (path.match(/^\/api\/collections\/[^/]+$/) && method === 'DELETE') {
        const id = path.split('/').pop();
        response = await handleDelete(id, request, env);
      }
      // Route: POST /api/proxy
      else if (path === '/api/proxy' && method === 'POST') {
        response = await handleProxy(request, env);
      }
      // Route: POST /api/stats/pageview
      else if (path === '/api/stats/pageview' && method === 'POST') {
        response = await handleRecordPageview(request, env);
      }
      // Route: GET /api/stats/summary
      else if (path === '/api/stats/summary' && method === 'GET') {
        response = await handleGetSummary(env);
      }
      // Route: GET /api/reviews/site/summary
      else if (path === '/api/reviews/site/summary' && method === 'GET') {
        response = await handleGetSiteSummary(env);
      }
      // Route: POST /api/reviews/:collectionId
      else if (path.match(/^\/api\/reviews\/[^/]+$/) && method === 'POST') {
        const collectionId = path.split('/').pop();
        response = await handleSubmitReview(collectionId, request, env);
      }
      // Route: GET /api/reviews/:collectionId
      else if (path.match(/^\/api\/reviews\/[^/]+$/) && method === 'GET') {
        const collectionId = path.split('/').pop();
        response = await handleGetReviews(collectionId, env);
      }
      // 404
      else {
        response = jsonError('Not found', 404);
      }
    } catch (err) {
      console.error('Worker error:', err);
      response = jsonError('Internal server error', 500);
    }

    return addCorsHeaders(response);
  },
};
