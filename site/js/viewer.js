/* ============================================================
   ReqShare — Collection Viewer Logic (viewer.js)
   Handles: fetch collection, render requests, run via proxy,
   copy as cURL/fetch, reviews display & submission
   ============================================================ */

(function () {
  'use strict';

  const API = 'https://reqshare-api.sillymodes.workers.dev';

  // ── State ───────────────────────────────────────────────────
  let collection = null;
  let collectionId = '';
  let selectedRating = 0;

  // ── Utilities ───────────────────────────────────────────────
  function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function highlightJSON(str) {
    if (!str) return '';
    const escaped = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped
      .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:')
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="json-string">$1</span>')
      .replace(/:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
      .replace(/(?<![:\w])("(?:\\.|[^"\\])*")(?!\s*:)/g, '<span class="json-string">$1</span>');
  }

  function starsHTML(rating, max) {
    max = max || 5;
    let html = '<span class="stars">';
    for (let i = 1; i <= max; i++) {
      html += '<span class="star' + (i <= Math.round(rating) ? ' filled' : '') + '">&#9733;</span>';
    }
    html += '</span>';
    return html;
  }

  // ── Substitute Environment Variables ────────────────────────
  function substituteEnv(str) {
    if (!str || !collection || !collection.environment) return str;
    return str.replace(/\{\{(\w+)\}\}/g, function (match, varName) {
      return collection.environment[varName] !== undefined ? collection.environment[varName] : match;
    });
  }

  // ── Time Remaining ──────────────────────────────────────────
  function timeRemaining(expiresAt) {
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    const diff = exp - now;
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    if (days > 1) return days + 'd remaining';
    const hours = Math.floor(diff / 3600000);
    return hours + 'h remaining';
  }

  // ── Load Collection ─────────────────────────────────────────
  async function loadCollection() {
    collectionId = window.location.hash.replace('#', '').trim();
    if (!collectionId) {
      showError('No collection ID in URL. Share links look like /c/#abc123');
      return;
    }

    try {
      const res = await fetch(API + '/api/collections/' + encodeURIComponent(collectionId));
      if (!res.ok) {
        showError('Collection not found or expired.');
        return;
      }
      collection = await res.json();
      renderCollection();
      loadReviews();

      // Update page title
      document.title = 'ReqShare — ' + (collection.name || 'Collection');

      // Fire pageview (fire-and-forget)
      fetch(API + '/api/stats/pageview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 'viewer', collectionId: collectionId }),
      }).catch(function () {});

    } catch (err) {
      showError('Failed to load collection.');
    }
  }

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    const el = document.getElementById('error-state');
    el.style.display = 'block';
    el.querySelector('p').textContent = msg;
  }

  // ── Render Collection ───────────────────────────────────────
  function renderCollection() {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('collection-content').style.display = 'block';

    document.getElementById('collection-name').textContent = collection.name || 'Untitled Collection';
    document.getElementById('collection-desc').textContent = collection.description || '';

    // Meta info
    const meta = document.getElementById('collection-meta');
    const reqCount = (collection.requests || []).length;
    const expiry = collection.expiresAt ? timeRemaining(collection.expiresAt) : '';
    const isExpired = expiry === 'Expired';

    let metaHTML = '<span>' + reqCount + ' request' + (reqCount !== 1 ? 's' : '') + '</span>';
    if (expiry) {
      metaHTML += '<span class="expiry-badge' + (isExpired ? ' expired' : '') + '">' + expiry + '</span>';
    }
    meta.innerHTML = metaHTML;

    // Render request cards
    const listEl = document.getElementById('request-list');
    listEl.innerHTML = (collection.requests || []).map(function (req, i) {
      const resolvedUrl = substituteEnv(req.url);
      const hasHeaders = req.headers && Object.keys(req.headers).length > 0;
      const hasBody = req.body && !['GET', 'HEAD'].includes(req.method);

      // Headers table
      let headersHTML = '';
      if (hasHeaders) {
        headersHTML = '<div class="request-details"><h4>Headers</h4><table>';
        Object.keys(req.headers).forEach(function (k) {
          headersHTML += '<tr><td>' + escapeHTML(k) + '</td><td>' + escapeHTML(substituteEnv(req.headers[k])) + '</td></tr>';
        });
        headersHTML += '</table></div>';
      }

      // Auth display
      let authHTML = '';
      if (req.auth && req.auth.type && req.auth.type !== 'none') {
        authHTML = '<div class="request-details"><h4>Auth</h4><p style="font-size:0.85rem;font-family:var(--mono)">' +
          escapeHTML(req.auth.type === 'bearer' ? 'Bearer ****' : 'Basic ****') + '</p></div>';
      }

      // Body preview
      let bodyHTML = '';
      if (hasBody) {
        let bodyText = substituteEnv(req.body);
        try {
          bodyText = JSON.stringify(JSON.parse(bodyText), null, 2);
        } catch (e) { /* not JSON */ }
        bodyHTML = '<div class="request-details"><h4>Body</h4><div class="request-body-preview">' + highlightJSON(bodyText) + '</div></div>';
      }

      return '<div class="card request-card fade-in" id="req-card-' + i + '">' +
        '<div class="request-card-header">' +
          '<span class="method-badge method-' + req.method + '">' + req.method + '</span>' +
          '<span class="req-name">' + escapeHTML(req.name || 'Request ' + (i + 1)) + '</span>' +
        '</div>' +
        '<div class="request-url">' + escapeHTML(resolvedUrl) + '</div>' +
        headersHTML +
        authHTML +
        bodyHTML +
        '<div class="request-actions">' +
          '<button class="btn btn-primary btn-sm" data-run="' + i + '">Run</button>' +
          '<button class="btn btn-secondary btn-sm" data-copy-curl="' + i + '">Copy as cURL</button>' +
          '<button class="btn btn-secondary btn-sm" data-copy-fetch="' + i + '">Copy as fetch</button>' +
        '</div>' +
        '<div class="response-panel" id="response-' + i + '">' +
          '<div class="response-meta" id="resp-meta-' + i + '"></div>' +
          '<div class="response-tabs" id="resp-tabs-' + i + '">' +
            '<button class="response-tab active" data-tab="body" data-resp="' + i + '">Body</button>' +
            '<button class="response-tab" data-tab="headers" data-resp="' + i + '">Headers</button>' +
          '</div>' +
          '<div class="response-body">' +
            '<div class="tab-content active" id="resp-body-' + i + '"><pre></pre></div>' +
            '<div class="tab-content" id="resp-headers-' + i + '"><table class="response-headers-table"></table></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    bindRequestActions();
  }

  // ── Bind Request Card Actions ───────────────────────────────
  function bindRequestActions() {
    // Run buttons
    document.querySelectorAll('[data-run]').forEach(function (btn) {
      btn.addEventListener('click', function () { runRequest(+this.dataset.run); });
    });
    // Copy as cURL
    document.querySelectorAll('[data-copy-curl]').forEach(function (btn) {
      btn.addEventListener('click', function () { copyCurl(+this.dataset.copyCurl); });
    });
    // Copy as fetch
    document.querySelectorAll('[data-copy-fetch]').forEach(function (btn) {
      btn.addEventListener('click', function () { copyFetch(+this.dataset.copyFetch); });
    });
    // Response tabs
    document.querySelectorAll('.response-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const respIdx = this.dataset.resp;
        const tabName = this.dataset.tab;
        // Deactivate siblings
        document.querySelectorAll('#resp-tabs-' + respIdx + ' .response-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        // Show correct panel
        document.getElementById('resp-body-' + respIdx).classList.toggle('active', tabName === 'body');
        document.getElementById('resp-headers-' + respIdx).classList.toggle('active', tabName === 'headers');
      });
    });
  }

  // ── Run Request ─────────────────────────────────────────────
  async function runRequest(index) {
    const req = collection.requests[index];
    const btn = document.querySelector('[data-run="' + index + '"]');
    const panel = document.getElementById('response-' + index);
    const metaEl = document.getElementById('resp-meta-' + index);
    const bodyPre = document.querySelector('#resp-body-' + index + ' pre');
    const headersTable = document.querySelector('#resp-headers-' + index + ' table');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running...';
    panel.classList.add('show');
    metaEl.innerHTML = '<span class="spinner"></span> Sending request...';
    bodyPre.textContent = '';
    headersTable.innerHTML = '';

    // Build resolved request
    const resolvedUrl = substituteEnv(req.url);
    const resolvedHeaders = {};
    if (req.headers) {
      Object.keys(req.headers).forEach(function (k) {
        resolvedHeaders[k] = substituteEnv(req.headers[k]);
      });
    }

    // Add auth header
    if (req.auth) {
      if (req.auth.type === 'bearer' && req.auth.token) {
        resolvedHeaders['Authorization'] = 'Bearer ' + substituteEnv(req.auth.token);
      } else if (req.auth.type === 'basic' && req.auth.token) {
        resolvedHeaders['Authorization'] = 'Basic ' + btoa(substituteEnv(req.auth.token));
      }
    }

    const resolvedBody = req.body ? substituteEnv(req.body) : null;

    try {
      const proxyPayload = {
        method: req.method,
        url: resolvedUrl,
        headers: resolvedHeaders,
        body: ['GET', 'HEAD'].includes(req.method) ? null : resolvedBody,
      };

      const res = await fetch(API + '/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload),
      });

      const data = await res.json();

      // Status badge
      const sc = data.status || 0;
      const statusClass = sc < 300 ? 'status-2xx' : sc < 400 ? 'status-3xx' : sc < 500 ? 'status-4xx' : 'status-5xx';
      const bodySize = data.body ? new Blob([data.body]).size : 0;

      metaEl.innerHTML =
        '<span class="status-badge ' + statusClass + '">' + sc + ' ' + escapeHTML(data.statusText || '') + '</span>' +
        '<span class="timing">' + (data.timing ? data.timing.ms + 'ms' : '--') + '</span>' +
        '<span class="size">' + formatBytes(bodySize) + '</span>';

      // Response body
      let bodyText = data.body || '';
      try {
        const parsed = JSON.parse(bodyText);
        bodyText = JSON.stringify(parsed, null, 2);
      } catch (e) { /* not JSON */ }
      bodyPre.innerHTML = highlightJSON(bodyText);

      // Response headers
      if (data.headers && typeof data.headers === 'object') {
        headersTable.innerHTML = Object.keys(data.headers).map(function (k) {
          return '<tr><td>' + escapeHTML(k) + '</td><td>' + escapeHTML(data.headers[k]) + '</td></tr>';
        }).join('');
      }

    } catch (err) {
      metaEl.innerHTML = '<span class="status-badge status-5xx">Error</span>';
      bodyPre.textContent = err.message || 'Request failed';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run';
    }
  }

  // ── Copy as cURL ────────────────────────────────────────────
  function copyCurl(index) {
    const req = collection.requests[index];
    const url = substituteEnv(req.url);
    let parts = ['curl'];

    if (req.method !== 'GET') {
      parts.push('-X ' + req.method);
    }

    parts.push("'" + url + "'");

    if (req.headers) {
      Object.keys(req.headers).forEach(function (k) {
        parts.push("-H '" + k + ': ' + substituteEnv(req.headers[k]) + "'");
      });
    }

    if (req.auth) {
      if (req.auth.type === 'bearer' && req.auth.token) {
        parts.push("-H 'Authorization: Bearer " + substituteEnv(req.auth.token) + "'");
      } else if (req.auth.type === 'basic' && req.auth.token) {
        parts.push("-u '" + substituteEnv(req.auth.token) + "'");
      }
    }

    if (req.body && !['GET', 'HEAD'].includes(req.method)) {
      parts.push("-d '" + substituteEnv(req.body).replace(/'/g, "'\\''") + "'");
    }

    navigator.clipboard.writeText(parts.join(' \\\n  ')).then(function () {
      showToast('cURL copied!', 'success');
    });
  }

  // ── Copy as fetch ───────────────────────────────────────────
  function copyFetch(index) {
    const req = collection.requests[index];
    const url = substituteEnv(req.url);

    const opts = { method: req.method };
    const headers = {};

    if (req.headers) {
      Object.keys(req.headers).forEach(function (k) {
        headers[k] = substituteEnv(req.headers[k]);
      });
    }

    if (req.auth) {
      if (req.auth.type === 'bearer' && req.auth.token) {
        headers['Authorization'] = 'Bearer ' + substituteEnv(req.auth.token);
      } else if (req.auth.type === 'basic' && req.auth.token) {
        headers['Authorization'] = 'Basic ' + btoa(substituteEnv(req.auth.token));
      }
    }

    if (Object.keys(headers).length > 0) opts.headers = headers;

    if (req.body && !['GET', 'HEAD'].includes(req.method)) {
      opts.body = substituteEnv(req.body);
    }

    let code = 'fetch(' + JSON.stringify(url) + ', ' + JSON.stringify(opts, null, 2) + ')\n  .then(res => res.json())\n  .then(data => console.log(data));';

    navigator.clipboard.writeText(code).then(function () {
      showToast('fetch snippet copied!', 'success');
    });
  }

  // ── Reviews ─────────────────────────────────────────────────
  async function loadReviews() {
    if (!collectionId) return;
    try {
      const res = await fetch(API + '/api/reviews/' + encodeURIComponent(collectionId));
      if (!res.ok) return;
      const data = await res.json();
      renderReviews(data);
    } catch (e) { /* silent */ }
  }

  function renderReviews(data) {
    const summaryEl = document.getElementById('review-summary-viewer');
    const listEl = document.getElementById('review-list-viewer');

    const avg = data.average || 0;
    const count = data.count || 0;

    if (count === 0) {
      summaryEl.innerHTML = '<p style="color:var(--text-muted)">No reviews yet. Be the first!</p>';
      listEl.innerHTML = '';
      return;
    }

    summaryEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
        starsHTML(avg) +
        '<span style="font-size:1.1rem;font-weight:600">' + avg.toFixed(1) + ' / 5</span>' +
        '<span style="color:var(--text-muted)">(' + count + ' review' + (count !== 1 ? 's' : '') + ')</span>' +
      '</div>';

    const reviews = data.reviews || [];
    listEl.innerHTML = reviews.slice(0, 10).map(function (r) {
      const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
      return '<div class="card review-item">' +
        '<div class="review-header">' +
          '<span class="review-name">' + escapeHTML(r.displayName || 'Anonymous') + '</span>' +
          '<span class="review-date">' + date + '</span>' +
        '</div>' +
        starsHTML(r.rating) +
        (r.comment ? '<p class="review-comment">' + escapeHTML(r.comment) + '</p>' : '') +
      '</div>';
    }).join('');
  }

  // ── Star Rating Interaction ─────────────────────────────────
  function initStarRating() {
    const container = document.getElementById('star-rating');
    if (!container) return;

    const stars = container.querySelectorAll('.star');

    container.addEventListener('mouseover', function (e) {
      const star = e.target.closest('.star');
      if (!star) return;
      const val = +star.dataset.value;
      stars.forEach(function (s) {
        s.classList.toggle('preview', +s.dataset.value <= val);
      });
    });

    container.addEventListener('mouseout', function () {
      stars.forEach(function (s) {
        s.classList.remove('preview');
        s.classList.toggle('filled', +s.dataset.value <= selectedRating);
      });
    });

    container.addEventListener('click', function (e) {
      const star = e.target.closest('.star');
      if (!star) return;
      selectedRating = +star.dataset.value;
      stars.forEach(function (s) {
        s.classList.toggle('filled', +s.dataset.value <= selectedRating);
      });
    });
  }

  // ── Submit Review ───────────────────────────────────────────
  async function submitReview() {
    if (!collectionId) return;
    if (selectedRating === 0) {
      showToast('Please select a star rating.', 'error');
      return;
    }

    const btn = document.getElementById('btn-submit-review');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Submitting...';

    const payload = {
      rating: selectedRating,
      comment: document.getElementById('review-comment').value.trim().substring(0, 500),
      displayName: document.getElementById('review-name').value.trim().substring(0, 50),
    };

    try {
      const res = await fetch(API + '/api/reviews/' + encodeURIComponent(collectionId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(function () { return {}; });
        throw new Error(errData.error || 'Failed to submit review');
      }

      showToast('Review submitted!', 'success');
      document.getElementById('review-comment').value = '';
      document.getElementById('review-name').value = '';
      selectedRating = 0;
      document.querySelectorAll('#star-rating .star').forEach(function (s) { s.classList.remove('filled'); });
      loadReviews();
    } catch (err) {
      showToast(err.message || 'Could not submit review.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  }

  // ── Toast ───────────────────────────────────────────────────
  function showToast(msg, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  // ── Init ────────────────────────────────────────────────────
  loadCollection();
  initStarRating();

  const submitBtn = document.getElementById('btn-submit-review');
  if (submitBtn) {
    submitBtn.addEventListener('click', submitReview);
  }

  // Listen for hash changes
  window.addEventListener('hashchange', function () {
    location.reload();
  });
})();
