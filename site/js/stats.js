/* ============================================================
   ReqShare — Stats Dashboard Logic (stats.js)
   Handles: fetch summary stats, render bar chart, review score
   ============================================================ */

(function () {
  'use strict';

  const API = 'https://reqshare-api.sillymodes.workers.dev';

  // ── Utility: stars HTML ─────────────────────────────────────
  function starsHTML(rating, max) {
    max = max || 5;
    let html = '';
    for (let i = 1; i <= max; i++) {
      html += '<span class="star' + (i <= Math.round(rating) ? ' filled' : '') + '">&#9733;</span>';
    }
    return html;
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  // ── Load Stats ──────────────────────────────────────────────
  async function loadStats() {
    try {
      const [statsRes, reviewsRes] = await Promise.all([
        fetch(API + '/api/stats/summary'),
        fetch(API + '/api/reviews/site/summary'),
      ]);

      const stats = await statsRes.json();
      const reviews = await reviewsRes.json();

      renderStats(stats, reviews);
    } catch (err) {
      document.getElementById('stats-loading').innerHTML =
        '<div class="error-state"><p>Failed to load stats. Please try again later.</p></div>';
    }
  }

  // ── Render Stats ────────────────────────────────────────────
  function renderStats(stats, reviews) {
    document.getElementById('stats-loading').style.display = 'none';
    document.getElementById('stats-content').style.display = 'block';

    // Big numbers
    document.getElementById('stat-views').textContent = formatNumber(stats.totalPageViews || 0);
    document.getElementById('stat-visitors').textContent = formatNumber(stats.totalUniqueVisitors || 0);
    document.getElementById('stat-collections').textContent = formatNumber(stats.totalCollectionsCreated || 0);

    // Review score
    const avg = reviews.average || 0;
    const count = reviews.count || 0;
    document.getElementById('review-avg').textContent = count > 0 ? avg.toFixed(1) : '--';
    document.getElementById('review-stars-display').innerHTML = count > 0 ? starsHTML(avg) : starsHTML(0);
    document.getElementById('review-count-label').textContent = count > 0 ? count + ' review' + (count !== 1 ? 's' : '') : 'No reviews yet';

    // 30-day bar chart
    renderChart(stats.last30Days || []);
  }

  // ── Render Bar Chart (CSS-only) ─────────────────────────────
  function renderChart(days) {
    const chartEl = document.getElementById('bar-chart');
    if (!days || days.length === 0) {
      chartEl.innerHTML = '<div class="empty-state" style="width:100%;padding:40px 0"><p>No data yet. Check back after some traffic!</p></div>';
      return;
    }

    // Find max for scaling
    let maxViews = 1;
    let maxUniques = 1;
    days.forEach(function (d) {
      if ((d.views || 0) > maxViews) maxViews = d.views;
      if ((d.uniques || 0) > maxUniques) maxUniques = d.uniques;
    });
    const maxVal = Math.max(maxViews, maxUniques, 1);

    chartEl.innerHTML = days.map(function (d) {
      const viewHeight = Math.max(((d.views || 0) / maxVal) * 100, 2);
      const uniqueHeight = Math.max(((d.uniques || 0) / maxVal) * 100, 2);
      const dateLabel = (d.date || '').slice(5); // MM-DD

      return '<div class="bar-group">' +
        '<div class="bar-stack">' +
          '<div class="bar views" style="height:' + viewHeight + '%" title="Views: ' + (d.views || 0) + '"></div>' +
          '<div class="bar uniques" style="height:' + uniqueHeight + '%" title="Uniques: ' + (d.uniques || 0) + '"></div>' +
        '</div>' +
        '<span class="bar-label">' + dateLabel + '</span>' +
      '</div>';
    }).join('');
  }

  // ── Fire Pageview ───────────────────────────────────────────
  fetch(API + '/api/stats/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 'stats' }),
  }).catch(function () {});

  // ── Init ────────────────────────────────────────────────────
  loadStats();
})();
