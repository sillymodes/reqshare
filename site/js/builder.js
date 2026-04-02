/* ============================================================
   ReqShare — Collection Builder Logic (builder.js)
   Handles: request editor, env vars, cURL import, API submit
   ============================================================ */

(function () {
  'use strict';

  const API = 'https://reqshare-api.sillymodes.workers.dev';
  const SITE = 'https://sillymodes.github.io/reqshare';
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const NO_BODY_METHODS = ['GET', 'HEAD'];

  // ── State ───────────────────────────────────────────────────
  let envVars = [{ key: '', value: '' }];
  let requests = [createEmptyRequest()];

  function createEmptyRequest() {
    return {
      name: '',
      method: 'GET',
      url: '',
      headers: [],
      body: '',
      authType: 'none',
      authValue: '',
    };
  }

  // ── Render Environment Variables ────────────────────────────
  function renderEnvVars() {
    const container = document.getElementById('env-vars-list');
    container.innerHTML = envVars.map(function (ev, i) {
      return '<div class="env-row">' +
        '<input type="text" value="' + escapeAttr(ev.key) + '" placeholder="VAR_NAME" data-env-key="' + i + '">' +
        '<input type="text" value="' + escapeAttr(ev.value) + '" placeholder="value" data-env-val="' + i + '">' +
        '<button class="btn btn-sm" style="color:var(--text-muted);border:1px solid var(--border);background:none;flex-shrink:0" data-remove-env="' + i + '" title="Remove variable">&times;</button>' +
      '</div>';
    }).join('');

    // Event listeners
    container.querySelectorAll('[data-env-key]').forEach(function (input) {
      input.addEventListener('input', function () {
        envVars[+this.dataset.envKey].key = this.value;
      });
    });
    container.querySelectorAll('[data-env-val]').forEach(function (input) {
      input.addEventListener('input', function () {
        envVars[+this.dataset.envVal].value = this.value;
      });
    });
    container.querySelectorAll('[data-remove-env]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        envVars.splice(+this.dataset.removeEnv, 1);
        if (envVars.length === 0) envVars.push({ key: '', value: '' });
        renderEnvVars();
      });
    });
  }

  // ── Render Requests ─────────────────────────────────────────
  function renderRequests() {
    const container = document.getElementById('requests-list');
    container.innerHTML = requests.map(function (req, i) {
      const isNoBody = NO_BODY_METHODS.includes(req.method);
      const methodOptions = METHODS.map(function (m) {
        return '<option value="' + m + '"' + (m === req.method ? ' selected' : '') + '>' + m + '</option>';
      }).join('');

      const headersHTML = req.headers.map(function (h, hi) {
        return '<div class="header-pair">' +
          '<input type="text" value="' + escapeAttr(h.key) + '" placeholder="Header name" data-req="' + i + '" data-hkey="' + hi + '">' +
          '<input type="text" value="' + escapeAttr(h.value) + '" placeholder="Header value" data-req="' + i + '" data-hval="' + hi + '">' +
          '<button class="btn-remove-header" data-req="' + i + '" data-remove-header="' + hi + '" title="Remove header">&times;</button>' +
        '</div>';
      }).join('');

      const authOptions = [
        '<option value="none"' + (req.authType === 'none' ? ' selected' : '') + '>None</option>',
        '<option value="bearer"' + (req.authType === 'bearer' ? ' selected' : '') + '>Bearer Token</option>',
        '<option value="basic"' + (req.authType === 'basic' ? ' selected' : '') + '>Basic Auth</option>',
      ].join('');

      return '<div class="card request-editor" id="req-editor-' + i + '">' +
        '<div class="request-editor-header">' +
          '<span class="req-index">Request ' + (i + 1) + '</span>' +
          '<div class="request-editor-controls">' +
            (i > 0 ? '<button data-move-up="' + i + '" title="Move up">&uarr;</button>' : '') +
            (i < requests.length - 1 ? '<button data-move-down="' + i + '" title="Move down">&darr;</button>' : '') +
            (requests.length > 1 ? '<button class="btn-remove" data-remove-req="' + i + '" title="Remove request">&times; Remove</button>' : '') +
          '</div>' +
        '</div>' +

        '<div class="form-group">' +
          '<label>Request Name</label>' +
          '<input type="text" value="' + escapeAttr(req.name) + '" placeholder="e.g. Get All Users" data-req-name="' + i + '">' +
        '</div>' +

        '<div class="method-url-row">' +
          '<select data-req-method="' + i + '">' + methodOptions + '</select>' +
          '<input type="text" value="' + escapeAttr(req.url) + '" placeholder="https://api.example.com/endpoint or {{BASE_URL}}/path" data-req-url="' + i + '">' +
        '</div>' +

        '<div class="form-group">' +
          '<label>Headers</label>' +
          '<div id="headers-' + i + '">' + headersHTML + '</div>' +
          '<button class="btn btn-secondary btn-sm" data-add-header="' + i + '" style="margin-top:4px">+ Add Header</button>' +
        '</div>' +

        '<div class="auth-row">' +
          '<div class="form-group">' +
            '<label>Auth</label>' +
            '<select data-req-auth="' + i + '">' + authOptions + '</select>' +
          '</div>' +
          (req.authType !== 'none' ?
            '<div class="form-group" style="flex:1">' +
              '<label>' + (req.authType === 'bearer' ? 'Token' : 'username:password') + '</label>' +
              '<input type="text" value="' + escapeAttr(req.authValue) + '" placeholder="' + (req.authType === 'bearer' ? 'your-token-here' : 'user:pass') + '" data-req-auth-val="' + i + '">' +
            '</div>'
          : '') +
        '</div>' +

        '<div class="form-group">' +
          '<label>Body' + (isNoBody ? ' <small>(disabled for ' + req.method + ')</small>' : '') + '</label>' +
          '<textarea data-req-body="' + i + '" rows="3" placeholder=\'{"key": "value"}\'' + (isNoBody ? ' disabled' : '') + '>' + escapeHTML(req.body) + '</textarea>' +
        '</div>' +
      '</div>';
    }).join('');

    bindRequestEvents();
  }

  function bindRequestEvents() {
    // Name
    document.querySelectorAll('[data-req-name]').forEach(function (el) {
      el.addEventListener('input', function () { requests[+this.dataset.reqName].name = this.value; });
    });
    // Method
    document.querySelectorAll('[data-req-method]').forEach(function (el) {
      el.addEventListener('change', function () {
        requests[+this.dataset.reqMethod].method = this.value;
        renderRequests();
      });
    });
    // URL
    document.querySelectorAll('[data-req-url]').forEach(function (el) {
      el.addEventListener('input', function () { requests[+this.dataset.reqUrl].url = this.value; });
    });
    // Body
    document.querySelectorAll('[data-req-body]').forEach(function (el) {
      el.addEventListener('input', function () { requests[+this.dataset.reqBody].body = this.value; });
    });
    // Auth type
    document.querySelectorAll('[data-req-auth]').forEach(function (el) {
      el.addEventListener('change', function () {
        requests[+this.dataset.reqAuth].authType = this.value;
        if (this.value === 'none') requests[+this.dataset.reqAuth].authValue = '';
        renderRequests();
      });
    });
    // Auth value
    document.querySelectorAll('[data-req-auth-val]').forEach(function (el) {
      el.addEventListener('input', function () { requests[+this.dataset.reqAuthVal].authValue = this.value; });
    });
    // Header key
    document.querySelectorAll('[data-hkey]').forEach(function (el) {
      el.addEventListener('input', function () {
        requests[+this.dataset.req].headers[+this.dataset.hkey].key = this.value;
      });
    });
    // Header value
    document.querySelectorAll('[data-hval]').forEach(function (el) {
      el.addEventListener('input', function () {
        requests[+this.dataset.req].headers[+this.dataset.hval].value = this.value;
      });
    });
    // Remove header
    document.querySelectorAll('[data-remove-header]').forEach(function (el) {
      el.addEventListener('click', function () {
        requests[+this.dataset.req].headers.splice(+this.dataset.removeHeader, 1);
        renderRequests();
      });
    });
    // Add header
    document.querySelectorAll('[data-add-header]').forEach(function (el) {
      el.addEventListener('click', function () {
        requests[+this.dataset.addHeader].headers.push({ key: '', value: '' });
        renderRequests();
      });
    });
    // Move up
    document.querySelectorAll('[data-move-up]').forEach(function (el) {
      el.addEventListener('click', function () {
        const idx = +this.dataset.moveUp;
        var temp = requests[idx];
        requests[idx] = requests[idx - 1];
        requests[idx - 1] = temp;
        renderRequests();
      });
    });
    // Move down
    document.querySelectorAll('[data-move-down]').forEach(function (el) {
      el.addEventListener('click', function () {
        const idx = +this.dataset.moveDown;
        var temp = requests[idx];
        requests[idx] = requests[idx + 1];
        requests[idx + 1] = temp;
        renderRequests();
      });
    });
    // Remove request
    document.querySelectorAll('[data-remove-req]').forEach(function (el) {
      el.addEventListener('click', function () {
        requests.splice(+this.dataset.removeReq, 1);
        renderRequests();
      });
    });
  }

  // ── cURL Parser ─────────────────────────────────────────────
  function parseCurl(curlStr) {
    const req = createEmptyRequest();
    let str = curlStr.trim();

    // Remove "curl" prefix
    if (str.toLowerCase().startsWith('curl')) {
      str = str.substring(4).trim();
    }

    // Remove line continuations
    str = str.replace(/\\\n/g, ' ').replace(/\\\r\n/g, ' ');

    // Tokenize (respects quotes)
    const tokens = [];
    let current = '';
    let inQuote = null;
    let escaped = false;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inQuote) {
        inQuote = null;
        continue;
      }
      if (!inQuote && (ch === '"' || ch === "'")) {
        inQuote = ch;
        continue;
      }
      if (!inQuote && (ch === ' ' || ch === '\t')) {
        if (current) { tokens.push(current); current = ''; }
        continue;
      }
      current += ch;
    }
    if (current) tokens.push(current);

    // Parse tokens
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '-X' || t === '--request') {
        req.method = (tokens[++i] || 'GET').toUpperCase();
      } else if (t === '-H' || t === '--header') {
        const hdr = tokens[++i] || '';
        const colonIdx = hdr.indexOf(':');
        if (colonIdx > 0) {
          req.headers.push({
            key: hdr.substring(0, colonIdx).trim(),
            value: hdr.substring(colonIdx + 1).trim(),
          });
        }
      } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
        req.body = tokens[++i] || '';
        if (req.method === 'GET') req.method = 'POST';
      } else if (t === '-u' || t === '--user') {
        req.authType = 'basic';
        req.authValue = tokens[++i] || '';
      } else if (t.startsWith('http://') || t.startsWith('https://')) {
        req.url = t;
      } else if (!t.startsWith('-') && !req.url) {
        // Might be the URL without a flag
        if (t.match(/^https?:\/\//)) req.url = t;
      }
    }

    // Detect bearer auth from headers
    for (let h = 0; h < req.headers.length; h++) {
      if (req.headers[h].key.toLowerCase() === 'authorization' && req.headers[h].value.toLowerCase().startsWith('bearer ')) {
        req.authType = 'bearer';
        req.authValue = req.headers[h].value.replace(/^bearer\s+/i, '');
        req.headers.splice(h, 1);
        break;
      }
    }

    req.name = req.method + ' ' + (req.url ? new URL(req.url).pathname : '');
    return req;
  }

  // ── Build Payload ───────────────────────────────────────────
  function buildPayload() {
    const name = document.getElementById('collection-name').value.trim();
    const description = document.getElementById('collection-desc').value.trim();

    if (!name) {
      showToast('Please enter a collection name.', 'error');
      return null;
    }

    // Build environment object
    const environment = {};
    envVars.forEach(function (ev) {
      if (ev.key.trim()) environment[ev.key.trim()] = ev.value;
    });

    // Build requests array
    const apiRequests = [];
    for (let i = 0; i < requests.length; i++) {
      const r = requests[i];
      if (!r.url.trim()) {
        showToast('Request ' + (i + 1) + ' needs a URL.', 'error');
        return null;
      }

      // Build headers object
      const headers = {};
      r.headers.forEach(function (h) {
        if (h.key.trim()) headers[h.key.trim()] = h.value;
      });

      // Add auth header
      const auth = { type: r.authType };
      if (r.authType === 'bearer') {
        auth.token = r.authValue;
      } else if (r.authType === 'basic') {
        auth.token = r.authValue;
      }

      apiRequests.push({
        name: r.name || 'Request ' + (i + 1),
        method: r.method,
        url: r.url,
        headers: headers,
        body: NO_BODY_METHODS.includes(r.method) ? '' : r.body,
        auth: auth,
      });
    }

    if (apiRequests.length === 0) {
      showToast('Add at least one request.', 'error');
      return null;
    }

    return { name: name, description: description, requests: apiRequests, environment: environment };
  }

  // ── Create Collection via API ───────────────────────────────
  async function createCollection() {
    const payload = buildPayload();
    if (!payload) return;

    const btn = document.getElementById('btn-create');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating...';

    try {
      const res = await fetch(API + '/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(function () { return {}; });
        throw new Error(errData.error || 'Failed to create collection');
      }

      const data = await res.json();
      showSuccessModal(data);
    } catch (err) {
      showToast(err.message || 'Something went wrong.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create and Get Share Link';
    }
  }

  // ── Success Modal ───────────────────────────────────────────
  function showSuccessModal(data) {
    const shareURL = SITE + '/c/#' + data.id;
    const embedCode = '<iframe src="' + shareURL + '" width="100%" height="600" frameborder="0"></iframe>';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal">' +
        '<h2>Collection Created!</h2>' +

        '<div class="modal-field">' +
          '<label>Share Link</label>' +
          '<div class="copy-row">' +
            '<input type="text" value="' + escapeAttr(shareURL) + '" readonly id="modal-share-url">' +
            '<button class="btn btn-primary btn-sm" onclick="window.__copyText(\'modal-share-url\')">Copy</button>' +
          '</div>' +
        '</div>' +

        '<div class="modal-field">' +
          '<label>Creator Token</label>' +
          '<div class="copy-row">' +
            '<input type="text" value="' + escapeAttr(data.creatorToken) + '" readonly id="modal-token">' +
            '<button class="btn btn-secondary btn-sm" onclick="window.__copyText(\'modal-token\')">Copy</button>' +
          '</div>' +
          '<div class="warning-text">Save this token. You need it to delete this collection.</div>' +
        '</div>' +

        '<div class="modal-field">' +
          '<label>Embed Code</label>' +
          '<div class="copy-row">' +
            '<textarea readonly rows="2" id="modal-embed" style="font-size:0.8rem">' + escapeHTML(embedCode) + '</textarea>' +
            '<button class="btn btn-secondary btn-sm" onclick="window.__copyText(\'modal-embed\')">Copy</button>' +
          '</div>' +
        '</div>' +

        '<p style="font-size:0.85rem;margin-top:8px">Expires: ' + new Date(data.expiresAt).toLocaleDateString() + '</p>' +

        '<button class="btn btn-secondary modal-close" onclick="this.closest(\'.modal-overlay\').remove()">Close</button>' +
      '</div>';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('modal-container').appendChild(overlay);
  }

  window.__copyText = function (id) {
    const el = document.getElementById(id);
    const text = el.value || el.textContent;
    navigator.clipboard.writeText(text).then(function () {
      showToast('Copied to clipboard!', 'success');
    }).catch(function () {
      el.select && el.select();
    });
  };

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

  // ── Utilities ───────────────────────────────────────────────
  function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Event Bindings ──────────────────────────────────────────
  document.getElementById('btn-add-env').addEventListener('click', function () {
    envVars.push({ key: '', value: '' });
    renderEnvVars();
  });

  document.getElementById('btn-add-request').addEventListener('click', function () {
    if (requests.length >= 20) {
      showToast('Maximum 20 requests per collection.', 'error');
      return;
    }
    requests.push(createEmptyRequest());
    renderRequests();
  });

  document.getElementById('btn-create').addEventListener('click', createCollection);

  document.getElementById('btn-parse-curl').addEventListener('click', function () {
    const input = document.getElementById('curl-input').value.trim();
    if (!input) {
      showToast('Paste a cURL command first.', 'error');
      return;
    }
    try {
      const parsed = parseCurl(input);
      if (requests.length >= 20) {
        showToast('Maximum 20 requests per collection.', 'error');
        return;
      }
      requests.push(parsed);
      renderRequests();
      document.getElementById('curl-input').value = '';
      showToast('Request imported from cURL!', 'success');
    } catch (err) {
      showToast('Could not parse cURL command.', 'error');
    }
  });

  // ── Fire Pageview ───────────────────────────────────────────
  fetch(API + '/api/stats/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 'create' }),
  }).catch(function () {});

  // ── Initial Render ──────────────────────────────────────────
  renderEnvVars();
  renderRequests();
})();
