// Reviews handler — review submission, retrieval, and aggregation

async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function handleSubmitReview(collectionId, request, env) {
  if (!collectionId || collectionId === 'site') {
    return new Response(JSON.stringify({ error: 'Invalid collection ID' }), { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { rating, comment, displayName } = body;

  // Validate rating
  if (rating === undefined || rating === null) {
    return new Response(JSON.stringify({ error: 'Rating is required' }), { status: 400 });
  }

  const ratingInt = parseInt(rating, 10);
  if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5 || ratingInt !== Number(rating)) {
    return new Response(JSON.stringify({ error: 'Rating must be an integer between 1 and 5' }), { status: 400 });
  }

  // Validate comment
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== 'string' || comment.length > 500) {
      return new Response(JSON.stringify({ error: 'Comment must be a string of max 500 characters' }), { status: 400 });
    }
  }

  // Validate displayName
  if (displayName !== undefined && displayName !== null) {
    if (typeof displayName !== 'string' || displayName.length > 50) {
      return new Response(JSON.stringify({ error: 'Display name must be a string of max 50 characters' }), { status: 400 });
    }
  }

  // Rate limit: 1 review per IP per collection
  const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || '0.0.0.0';
  const ipHash = await hashIP(clientIP);
  const reviewedKey = `reviewed:${collectionId}:${ipHash}`;
  const alreadyReviewed = await env.REVIEWS.get(reviewedKey);

  if (alreadyReviewed) {
    return new Response(JSON.stringify({ error: 'You have already reviewed this collection' }), { status: 429 });
  }

  // Store the review
  const timestamp = Date.now();
  const reviewKey = `review:${collectionId}:${timestamp}`;
  const reviewData = {
    rating: ratingInt,
    comment: comment ? comment.trim() : null,
    displayName: displayName ? displayName.trim() : 'Anonymous',
    createdAt: new Date(timestamp).toISOString(),
    collectionId,
  };

  await env.REVIEWS.put(reviewKey, JSON.stringify(reviewData));

  // Mark as reviewed (no TTL — permanent)
  await env.REVIEWS.put(reviewedKey, '1');

  // Update collection aggregate
  const aggKey = `reviewagg:${collectionId}`;
  const aggRaw = await env.REVIEWS.get(aggKey);
  let agg = aggRaw ? JSON.parse(aggRaw) : { count: 0, totalStars: 0 };
  agg.count += 1;
  agg.totalStars += ratingInt;
  await env.REVIEWS.put(aggKey, JSON.stringify(agg));

  // Update site-wide aggregate
  const siteAggRaw = await env.REVIEWS.get('reviewagg:site');
  let siteAgg = siteAggRaw ? JSON.parse(siteAggRaw) : { count: 0, totalStars: 0 };
  siteAgg.count += 1;
  siteAgg.totalStars += ratingInt;
  await env.REVIEWS.put('reviewagg:site', JSON.stringify(siteAgg));

  return new Response(JSON.stringify({
    success: true,
    review: reviewData,
    aggregate: {
      average: Math.round((agg.totalStars / agg.count) * 10) / 10,
      count: agg.count,
    },
  }), { status: 201 });
}

async function handleGetReviews(collectionId, env) {
  if (!collectionId) {
    return new Response(JSON.stringify({ error: 'Collection ID is required' }), { status: 400 });
  }

  // Get aggregate
  const aggKey = `reviewagg:${collectionId}`;
  const aggRaw = await env.REVIEWS.get(aggKey);
  const agg = aggRaw ? JSON.parse(aggRaw) : { count: 0, totalStars: 0 };
  const average = agg.count > 0 ? Math.round((agg.totalStars / agg.count) * 10) / 10 : 0;

  // List reviews
  const prefix = `review:${collectionId}:`;
  const keys = await env.REVIEWS.list({ prefix, limit: 100 });
  const reviews = [];

  for (const key of keys.keys) {
    const raw = await env.REVIEWS.get(key.name);
    if (raw) {
      reviews.push(JSON.parse(raw));
    }
  }

  // Sort by createdAt descending (newest first)
  reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return new Response(JSON.stringify({
    average,
    count: agg.count,
    reviews,
  }), { status: 200 });
}

async function handleGetSiteSummary(env) {
  const siteAggRaw = await env.REVIEWS.get('reviewagg:site');
  const siteAgg = siteAggRaw ? JSON.parse(siteAggRaw) : { count: 0, totalStars: 0 };
  const average = siteAgg.count > 0 ? Math.round((siteAgg.totalStars / siteAgg.count) * 10) / 10 : 0;

  return new Response(JSON.stringify({
    average,
    count: siteAgg.count,
  }), { status: 200 });
}

export { handleSubmitReview, handleGetReviews, handleGetSiteSummary };
