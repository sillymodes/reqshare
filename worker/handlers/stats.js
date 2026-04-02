// Stats handler — pageview recording and summary endpoint

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

function getTodayDateStr() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

async function handleRecordPageview(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { page, collectionId } = body;

  if (!page || typeof page !== 'string') {
    return new Response(JSON.stringify({ error: 'Page field is required' }), { status: 400 });
  }

  const today = getTodayDateStr();
  const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || '0.0.0.0';
  const ipHash = await hashIP(clientIP);

  // Increment daily view counter
  const dailyKey = `views:${today}`;
  const dailyRaw = await env.STATS.get(dailyKey);
  let dailyData = dailyRaw ? JSON.parse(dailyRaw) : {};
  dailyData[page] = (dailyData[page] || 0) + 1;
  dailyData._total = (dailyData._total || 0) + 1;
  await env.STATS.put(dailyKey, JSON.stringify(dailyData));

  // Increment all-time total
  const totalStr = await env.STATS.get('views:total');
  const total = totalStr ? parseInt(totalStr, 10) : 0;
  await env.STATS.put('views:total', String(total + 1));

  // Track unique visitors
  const visitorKey = `visitor:${today}:${ipHash}`;
  const existing = await env.STATS.get(visitorKey);
  let isNewVisitor = false;

  if (!existing) {
    await env.STATS.put(visitorKey, '1', { expirationTtl: 86400 }); // 24hr TTL
    isNewVisitor = true;

    // Increment daily unique count
    const uniqueDailyKey = `uniques:${today}`;
    const uniqueStr = await env.STATS.get(uniqueDailyKey);
    const uniqueCount = uniqueStr ? parseInt(uniqueStr, 10) : 0;
    await env.STATS.put(uniqueDailyKey, String(uniqueCount + 1));

    // Increment all-time unique count
    const totalUniqueStr = await env.STATS.get('uniques:total');
    const totalUnique = totalUniqueStr ? parseInt(totalUniqueStr, 10) : 0;
    await env.STATS.put('uniques:total', String(totalUnique + 1));
  }

  // If collectionId provided, increment collection-specific view count
  if (collectionId) {
    const collViewKey = `collviews:${collectionId}`;
    const collViewStr = await env.STATS.get(collViewKey);
    const collViews = collViewStr ? parseInt(collViewStr, 10) : 0;
    await env.STATS.put(collViewKey, String(collViews + 1));
  }

  return new Response(JSON.stringify({ success: true, newVisitor: isNewVisitor }), { status: 200 });
}

async function handleGetSummary(env) {
  // Get totals
  const totalViewsStr = await env.STATS.get('views:total');
  const totalPageViews = totalViewsStr ? parseInt(totalViewsStr, 10) : 0;

  const totalUniquesStr = await env.STATS.get('uniques:total');
  const totalUniqueVisitors = totalUniquesStr ? parseInt(totalUniquesStr, 10) : 0;

  const totalCollStr = await env.STATS.get('collections:total');
  const totalCollectionsCreated = totalCollStr ? parseInt(totalCollStr, 10) : 0;

  // Get last 30 days of data
  const last30Days = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const dailyRaw = await env.STATS.get(`views:${dateStr}`);
    const dailyData = dailyRaw ? JSON.parse(dailyRaw) : {};
    const views = dailyData._total || 0;

    const uniqueStr = await env.STATS.get(`uniques:${dateStr}`);
    const uniques = uniqueStr ? parseInt(uniqueStr, 10) : 0;

    last30Days.push({ date: dateStr, views, uniques });
  }

  return new Response(JSON.stringify({
    totalPageViews,
    totalUniqueVisitors,
    totalCollectionsCreated,
    last30Days,
  }), { status: 200 });
}

export { handleRecordPageview, handleGetSummary };
