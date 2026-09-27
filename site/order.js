// order.js — per-rater item order (A38.4, A38.6, A39.5).
// 23 items: scenarios 1-20 once, plus scenarios 2, 6 and 12 a second time.
// The second showing of each repeat comes at least 9 positions after the
// first (at least 8 other items between). Same rule as the database
// function public.survey_item_order_ok.
//
// Method: shuffle all 23 items uniformly (Fisher-Yates, crypto random),
// keep the first arrangement that satisfies the spacing rule. This picks
// uniformly among all valid orders.
(function (root) {
  "use strict";
  var N_SCENARIOS = 20;
  var REPEATS = [2, 6, 12];
  var MIN_GAP = 9;

  function isValidOrder(o) {
    if (!Array.isArray(o) || o.length !== N_SCENARIOS + REPEATS.length) return false;
    var pos = {};
    for (var i = 0; i < o.length; i++) {
      var s = o[i];
      if (!Number.isInteger(s) || s < 1 || s > N_SCENARIOS) return false;
      (pos[s] = pos[s] || []).push(i + 1);
    }
    for (var k = 1; k <= N_SCENARIOS; k++) {
      var want = REPEATS.indexOf(k) >= 0 ? 2 : 1;
      if (!pos[k] || pos[k].length !== want) return false;
    }
    for (var r = 0; r < REPEATS.length; r++) {
      var p = pos[REPEATS[r]];
      if (p[1] - p[0] < MIN_GAP) return false;
    }
    return true;
  }

  function randomInt(n) {
    // Uniform integer in [0, n) without modulo bias.
    var limit = Math.floor(0x100000000 / n) * n;
    var buf = new Uint32Array(1);
    do { root.crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  function makeOrder() {
    var items = [];
    for (var s = 1; s <= N_SCENARIOS; s++) items.push(s);
    items = items.concat(REPEATS);
    for (var tries = 0; tries < 100000; tries++) {
      for (var i = items.length - 1; i > 0; i--) {
        var j = randomInt(i + 1);
        var t = items[i]; items[i] = items[j]; items[j] = t;
      }
      if (isValidOrder(items)) return items.slice();
    }
    throw new Error("could not build a valid order");
  }

  // Which showing (1 or 2) an item is, from its position (1-based).
  function showingAt(order, position) {
    var s = order[position - 1], n = 0;
    for (var i = 0; i < position; i++) if (order[i] === s) n++;
    return n;
  }

  root.SurveyOrder = {
    isValidOrder: isValidOrder,
    makeOrder: makeOrder,
    showingAt: showingAt,
    REPEATS: REPEATS,
    MIN_GAP: MIN_GAP,
    N_ITEMS: N_SCENARIOS + REPEATS.length
  };
})(typeof window !== "undefined" ? window : globalThis);
