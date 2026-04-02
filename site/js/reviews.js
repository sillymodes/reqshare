/* ============================================================
   ReqShare — Reviews Helper (reviews.js)
   Shared utilities for review display and star rendering.
   Loaded by the viewer page alongside viewer.js.
   (Primary review logic is in viewer.js; this file provides
   any supplementary helpers if needed by other pages.)
   ============================================================ */

(function () {
  'use strict';

  // This module is intentionally lightweight.
  // The viewer.js file handles all review logic for the collection viewer.
  // The app.js file handles site-wide review display on the landing page.
  //
  // This file exists to support future extraction of shared review
  // utilities (star rendering, form validation) if the codebase grows.

  // ── Shared: Render star rating (accessible) ─────────────────
  window.ReqShareReviews = {
    starsHTML: function (rating, max) {
      max = max || 5;
      var html = '<span class="stars" aria-label="' + rating.toFixed(1) + ' out of ' + max + ' stars">';
      for (var i = 1; i <= max; i++) {
        html += '<span class="star' + (i <= Math.round(rating) ? ' filled' : '') + '" aria-hidden="true">&#9733;</span>';
      }
      html += '</span>';
      return html;
    },

    validateRating: function (val) {
      var n = parseInt(val, 10);
      return n >= 1 && n <= 5 ? n : null;
    },

    truncateComment: function (str, max) {
      max = max || 500;
      if (!str) return '';
      return str.length > max ? str.substring(0, max) : str;
    }
  };
})();
