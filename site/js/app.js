/* ============================================================
   ReqShare — Landing Page Logic (app.js)
   Handles: Live demo section, site-wide reviews display
   ============================================================ */

(function () {
  'use strict';

  const API = 'https://reqshare-api.sillymodes.workers.dev';

  // ── Live Demo Requests ──────────────────────────────────────
  const DEMO_REQUESTS = [
    {
      name: 'List Posts',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/posts?_limit=3',
    },
    {
      name: 'Get a Single Post',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
    },
    {
      name: 'Create a Post',
      method: 'POST',
      url: 'https://jsonplaceholder.typicode.com/posts',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hello ReqShare', body: 'This is a live demo!', userId: 1 }, null, 2),
    },
  ];

  // ── Utility: Syntax-highlight JSON ──────────────────────────
  function highlightJSON(str) {
    if (!str) return '';
    const escaped = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span class="json-key">$1</span>:'
    ).replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      ': <span class="json-string">$1</span>'
    ).replace(
      /:\s*(\d+(?:\.\d+)?)/g,
      ': <span class="json-number">$1</span>'
    ).replace(
      /:\s*(true|false)/g,
      ': <span class="json-boolean">$1</span>'
    ).replace(
      /:\s*(null)/g,
      ': <span class="json-null">$1</span>'
    ).replace(
      /(?<![:\w])("(?:\\.|[^"\\])*")(?!\s*:)/g,
      '<span class="json-string">$1</span>'
    );
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ── Render Demo Section ─────────────────────────────────────
  function renderDemo() {
    const container = document.getElementById('demo-requests');
    if (!container) return;

    container.innerHTML = DEMO_REQUESTS.map(function (req, i) {
      return '<div class="demo-request" id="demo-req-' + i + '">' +
        '<div class="demo-request-header">' +
          '<span class="method-badge method-' + req.method + '">' + req.method + '</span>' +
          '<span class="url">' + escapeHTML(req.url) + '</span>' +
        '</div>' +
        (req.body ? '<div class="request-body-preview" style="margin:0 0 8px;max-height:80px">' + highlightJSON(req.body) + '</div>' : '') +
        '<div class="demo-actions">' +
          '<button class="btn btn-primary btn-sm" onclick="window.__runDemo(' + i + ')">Run</button>' +
        '</div>' +
        '<div class="demo-response" id="demo-resp-' + i + '">' +
          '<div class="demo-response-meta" id="demo-meta-' + i + '"></div>' +
          '<pre id="demo-body-' + i + '"></pre>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Run Demo Request via CORS Proxy ─────────────────────────
  window.__runDemo = async function (index) {
    const req = DEMO_REQUESTS[index];
    const respEl = document.getElementById('demo-resp-' + index);
    const metaEl = document.getElementById('demo-meta-' + index);
    const bodyEl = document.getElementById('demo-body-' + index);
    const btn = document.querySelector('#demo-req-' + index + ' .btn-primary');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running...';
    respEl.classList.add('show');
    metaEl.innerHTML = '<span class="spinner"></span> Sending request...';
    bodyEl.textContent = '';

    try {
      const proxyPayload = {
        method: req.method,
        url: req.url,
        headers: req.headers || {},
        body: req.body || null,
      };

      const res = await fetch(API + '/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload),
      });

      const data = await res.json();

      // Status badge
      const statusClass = data.status < 300 ? 'status-2xx' : data.status < 400 ? 'status-3xx' : data.status < 500 ? 'status-4xx' : 'status-5xx';
      const bodySize = data.body ? new Blob([data.body]).size : 0;

      metaEl.innerHTML =
        '<span class="status-badge ' + statusClass + '">' + data.status + ' ' + escapeHTML(data.statusText || '') + '</span>' +
        '<span class="timing">' + (data.timing ? data.timing.ms + 'ms' : '--') + '</span>' +
        '<span class="size">' + formatBytes(bodySize) + '</span>';

      // Try to pretty-print JSON
      let bodyText = data.body || '';
      try {
        const parsed = JSON.parse(bodyText);
        bodyText = JSON.stringify(parsed, null, 2);
      } catch (e) { /* not JSON */ }

      bodyEl.innerHTML = highlightJSON(bodyText);
    } catch (err) {
      metaEl.innerHTML = '<span class="status-badge status-5xx">Error</span>';
      bodyEl.textContent = err.message || 'Request failed';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run';
    }
  };

  // ── Stars HTML Helper ───────────────────────────────────────
  function starsHTML(rating, max) {
    max = max || 5;
    let html = '<span class="stars">';
    for (let i = 1; i <= max; i++) {
      html += '<span class="star' + (i <= Math.round(rating) ? ' filled' : '') + '">&#9733;</span>';
    }
    html += '</span>';
    return html;
  }

  // ── Load Site-Wide Reviews ──────────────────────────────────
  async function loadReviews() {
    const summaryEl = document.getElementById('reviews-summary');
    const listEl = document.getElementById('review-list');
    if (!summaryEl || !listEl) return;

    try {
      const res = await fetch(API + '/api/reviews/site/summary');
      const data = await res.json();

      const avg = data.average || 0;
      const count = data.count || 0;

      if (count === 0) {
        summaryEl.innerHTML = '<p style="color:var(--text-muted)">No reviews yet. Be the first to rate a collection!</p>';
        listEl.innerHTML = '';
        return;
      }

      summaryEl.innerHTML =
        starsHTML(avg) +
        '<div class="avg-score">' + avg.toFixed(1) + ' <span>/ 5</span></div>' +
        '<p style="color:var(--text-muted);margin-top:4px">' + count + ' review' + (count !== 1 ? 's' : '') + ' from the community</p>';

      // Try to load some recent reviews — use a known collection or just show summary
      // The site summary endpoint only returns aggregate, so we show summary only
      listEl.innerHTML = '';
    } catch (err) {
      summaryEl.innerHTML = '<p style="color:var(--text-muted)">Unable to load reviews.</p>';
    }
  }

  // ── Fire Pageview ───────────────────────────────────────────
  function firePageview() {
    fetch(API + '/api/stats/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'home' }),
    }).catch(function () { /* fire-and-forget */ });
  }

  // ── Init ────────────────────────────────────────────────────
  renderDemo();
  loadReviews();
  firePageview();
})();
