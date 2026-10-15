/*
 * Live network-formation demo: the symmetric connections model
 * (Jackson & Wolinsky, 1996) with myopic pairwise dynamics
 * (Jackson & Watts, 2002).
 *
 * Payoff of player i in network g:
 *   u_i(g) = sum_{j != i} delta^{d(i,j)}  -  c * deg_i(g)
 * where d(i,j) is the shortest-path distance (no path => no benefit).
 *
 * Each tick a random pair (i, j) whose link status can profitably change is
 * picked and changed:
 *   - an existing link is cut if either player strictly gains by cutting it;
 *   - a missing link is added if both players weakly gain and one strictly gains.
 * The process stops when no such pair exists, i.e. the network is pairwise stable.
 *
 * No external libraries: plain SVG and a small force layout.
 */
(function () {
  "use strict";

  var root = document.getElementById("nf-demo");
  if (!root) return;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var EPS = 1e-9;
  // ---------- DOM ----------
  var svg = root.querySelector(".nf-svg");
  // Narrower drawing area on phones so nodes stay readable.
  var narrow = (svg.getBoundingClientRect().width || 640) < 520;
  var W = narrow ? 420 : 640, H = narrow ? 420 : 400;
  var REST = narrow ? 80 : 105, REPEL = narrow ? 3500 : 6500;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  var linkLayer = document.createElementNS(SVG_NS, "g");
  var nodeLayer = document.createElementNS(SVG_NS, "g");
  svg.appendChild(linkLayer);
  svg.appendChild(nodeLayer);

  var el = function (sel) { return root.querySelector(sel); };
  var ui = {
    delta: el("#nf-delta"), deltaOut: el("#nf-delta-out"),
    cost: el("#nf-cost"), costOut: el("#nf-cost-out"),
    n: el("#nf-n"), nOut: el("#nf-n-out"),
    play: el("#nf-play"), step: el("#nf-step"),
    empty: el("#nf-empty"), random: el("#nf-random"), complete: el("#nf-complete"),
    status: el("#nf-status"), last: el("#nf-last"),
    links: el("#nf-links"), welfare: el("#nf-welfare"), efficient: el("#nf-efficient"),
    regime: el("#nf-regime")
  };

  // ---------- Model state ----------
  var n = +ui.n.value;
  var delta = +ui.delta.value;
  var cost = +ui.cost.value;
  var adj = [];          // adjacency matrix (booleans)
  var nodes = [];        // {x, y, vx, vy}
  var playing = false;
  var timer = null;
  var highlight = null;  // {i, j, added, t}
  var steps = 0;
  var lastText = "";

  function makeEmpty(k) {
    var a = [];
    for (var i = 0; i < k; i++) {
      a.push([]);
      for (var j = 0; j < k; j++) a[i].push(false);
    }
    return a;
  }

  function placeNodes(k) {
    nodes = [];
    for (var i = 0; i < k; i++) {
      var ang = (2 * Math.PI * i) / k;
      nodes.push({
        x: W / 2 + 0.3 * W * Math.cos(ang) + (Math.random() - 0.5) * 10,
        y: H / 2 + 0.3 * H * Math.sin(ang) + (Math.random() - 0.5) * 10,
        vx: 0, vy: 0
      });
    }
  }

  // ---------- Payoffs ----------
  function distancesFrom(a, s) {
    var d = new Array(a.length).fill(Infinity);
    d[s] = 0;
    var q = [s], h = 0;
    while (h < q.length) {
      var v = q[h++];
      for (var w = 0; w < a.length; w++) {
        if (a[v][w] && d[w] === Infinity) { d[w] = d[v] + 1; q.push(w); }
      }
    }
    return d;
  }

  function payoff(a, i) {
    var d = distancesFrom(a, i), u = 0, deg = 0;
    for (var j = 0; j < a.length; j++) {
      if (j === i) continue;
      if (d[j] < Infinity) u += Math.pow(delta, d[j]);
      if (a[i][j]) deg++;
    }
    return u - cost * deg;
  }

  function welfare(a) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += payoff(a, i);
    return s;
  }

  function linkCount(a) {
    var m = 0;
    for (var i = 0; i < a.length; i++)
      for (var j = i + 1; j < a.length; j++) if (a[i][j]) m++;
    return m;
  }

  // Would toggling link ij be an improving move? Returns null or a description.
  function evaluatePair(i, j) {
    var ui0 = payoff(adj, i), uj0 = payoff(adj, j);
    adj[i][j] = adj[j][i] = !adj[i][j];
    var ui1 = payoff(adj, i), uj1 = payoff(adj, j);
    adj[i][j] = adj[j][i] = !adj[i][j]; // restore
    var gi = ui1 - ui0, gj = uj1 - uj0;

    if (adj[i][j]) {
      // Cutting: one player gaining is enough.
      if (gi > EPS || gj > EPS) return { i: i, j: j, add: false, gi: gi, gj: gj };
    } else {
      // Adding: both weakly gain, at least one strictly.
      if (gi >= -EPS && gj >= -EPS && (gi > EPS || gj > EPS))
        return { i: i, j: j, add: true, gi: gi, gj: gj };
    }
    return null;
  }

  function improvingMoves() {
    var moves = [];
    for (var i = 0; i < n; i++)
      for (var j = i + 1; j < n; j++) {
        var m = evaluatePair(i, j);
        if (m) moves.push(m);
      }
    return moves;
  }

  // Jackson-Wolinsky: the efficient network is complete, a star, or empty.
  function efficientInfo() {
    var star = delta - delta * delta;
    var empty = delta + ((n - 2) * delta * delta) / 2;
    var wComplete = n * (n - 1) * (delta - cost);
    var wStar = 2 * (n - 1) * (delta - cost) + (n - 1) * (n - 2) * delta * delta;
    var best = { name: "the empty network", w: 0 };
    if (wStar > best.w + EPS) best = { name: "a star", w: wStar };
    if (wComplete > best.w + EPS) best = { name: "the complete network", w: wComplete };
    return { best: best, starThreshold: star, emptyThreshold: empty };
  }

  // ---------- Dynamics ----------
  function stepOnce() {
    var moves = improvingMoves();
    if (moves.length === 0) { setPlaying(false); refresh(); return false; }
    var m = moves[Math.floor(Math.random() * moves.length)];
    adj[m.i][m.j] = adj[m.j][m.i] = m.add;
    highlight = { i: m.i, j: m.j, added: m.add, t: performance.now() };
    steps++;
    describeMove(m);
    kick();
    refresh();
    return true;
  }

  function fmt(x) { return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2); }

  function describeMove(m) {
    var a = m.i + 1, b = m.j + 1;
    if (m.add) {
      lastText = "Step " + steps + ": players " + a + " and " + b +
        " form a link (payoff change " + fmt(m.gi) + " and " + fmt(m.gj) + ").";
    } else {
      var who = m.gi > EPS ? a : b, g = m.gi > EPS ? m.gi : m.gj;
      lastText = "Step " + steps + ": player " + who + " cuts the link " +
        a + "–" + b + " (gains " + fmt(g) + ").";
    }
  }

  function setPlaying(p) {
    playing = p;
    ui.play.textContent = p ? "Pause" : "Play";
    if (timer) { clearInterval(timer); timer = null; }
    if (p) timer = setInterval(stepOnce, 650);
  }

  // ---------- Starting networks ----------
  function resetWith(kind) {
    n = +ui.n.value;
    adj = makeEmpty(n);
    if (kind === "random") {
      for (var i = 0; i < n; i++)
        for (var j = i + 1; j < n; j++)
          if (Math.random() < 0.25) adj[i][j] = adj[j][i] = true;
    } else if (kind === "complete") {
      for (var p = 0; p < n; p++)
        for (var q = p + 1; q < n; q++) adj[p][q] = adj[q][p] = true;
    }
    if (nodes.length !== n) placeNodes(n);
    steps = 0;
    highlight = null;
    lastText = "Press Play to let players form and cut links.";
    buildNodes();
    kick();
    refresh();
  }

  // ---------- Rendering ----------
  var nodeEls = [], linkEls = {};

  function buildNodes() {
    while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
    while (linkLayer.firstChild) linkLayer.removeChild(linkLayer.firstChild);
    nodeEls = []; linkEls = {};
    for (var i = 0; i < n; i++) {
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "nf-node");
      var c = document.createElementNS(SVG_NS, "circle");
      var t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dy", "0.35em");
      t.textContent = i + 1;
      var title = document.createElementNS(SVG_NS, "title");
      g.appendChild(c); g.appendChild(t); g.appendChild(title);
      nodeLayer.appendChild(g);
      attachDrag(g, i);
      nodeEls.push({ g: g, c: c, title: title });
    }
  }

  function syncLinks() {
    var keep = {};
    for (var i = 0; i < n; i++)
      for (var j = i + 1; j < n; j++) {
        if (!adj[i][j]) continue;
        var key = i + "-" + j;
        keep[key] = true;
        if (!linkEls[key]) {
          var line = document.createElementNS(SVG_NS, "line");
          line.setAttribute("class", "nf-link");
          linkLayer.appendChild(line);
          linkEls[key] = line;
        }
      }
    for (var k in linkEls) {
      if (!keep[k]) { linkLayer.removeChild(linkEls[k]); delete linkEls[k]; }
    }
  }

  function refresh() {
    syncLinks();
    for (var i = 0; i < n; i++) {
      var deg = 0;
      for (var j = 0; j < n; j++) if (adj[i][j]) deg++;
      nodeEls[i].c.setAttribute("r", 9 + Math.min(deg, 10) * 0.9);
      nodeEls[i].title.textContent = "Player " + (i + 1) + ": " + deg +
        " link" + (deg === 1 ? "" : "s") + ", payoff " + payoff(adj, i).toFixed(2);
    }
    var moves = improvingMoves();
    var stable = moves.length === 0;
    ui.status.textContent = stable ? "Pairwise stable" : "Still changing";
    ui.status.className = "nf-badge " + (stable ? "nf-stable" : "nf-moving");
    ui.links.textContent = linkCount(adj);
    var w = welfare(adj), eff = efficientInfo();
    ui.welfare.textContent = w.toFixed(2);
    ui.efficient.textContent = eff.best.w.toFixed(2) + " (" + eff.best.name + ")";
    ui.regime.innerHTML = regimeText(eff);
    var suffix = "";
    if (stable) {
      suffix = Math.abs(w - eff.best.w) < 1e-6
        ? " The network is stable and efficient."
        : " The network is stable, but not efficient.";
    }
    ui.last.textContent = lastText + suffix;
  }

  function regimeText(eff) {
    var a = eff.starThreshold.toFixed(2), b = eff.emptyThreshold.toFixed(2);
    if (cost < eff.starThreshold)
      return "Links are cheap (c &lt; δ − δ² = " + a +
        "): the complete network is efficient and the unique pairwise stable network.";
    if (cost < delta)
      return "Intermediate cost (" + a + " &lt; c &lt; δ): a star is efficient. " +
        "A star is pairwise stable, but other stable networks can arise too.";
    if (cost < eff.emptyThreshold)
      return "c &gt; δ: nobody wants to start a link from scratch, so the empty network is stable, " +
        "yet a star would be efficient (c &lt; " + b + "). Stability and efficiency diverge.";
    return "Links are expensive (c &gt; " + b + "): the empty network is efficient.";
  }

  // ---------- Force layout ----------
  var alpha = 1;
  function kick() { alpha = Math.max(alpha, 0.6); }

  function tick() {
    if (alpha > 0.01) {
      var i, j, dx, dy, d2, d, f;
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          dx = nodes[j].x - nodes[i].x; dy = nodes[j].y - nodes[i].y;
          d2 = dx * dx + dy * dy + 0.01; d = Math.sqrt(d2);
          f = REPEL / d2;                                     // repulsion
          if (adj[i][j]) f -= (d - REST) * 0.06;               // spring
          dx /= d; dy /= d;
          nodes[i].vx -= f * dx * alpha; nodes[i].vy -= f * dy * alpha;
          nodes[j].vx += f * dx * alpha; nodes[j].vy += f * dy * alpha;
        }
      }
      for (i = 0; i < n; i++) {
        var nd = nodes[i];
        if (nd.fixed) { nd.vx = nd.vy = 0; continue; }
        nd.vx += (W / 2 - nd.x) * 0.008 * alpha;               // gravity
        nd.vy += (H / 2 - nd.y) * 0.008 * alpha;
        nd.vx *= 0.6; nd.vy *= 0.6;
        nd.x = Math.max(18, Math.min(W - 18, nd.x + nd.vx));
        nd.y = Math.max(18, Math.min(H - 18, nd.y + nd.vy));
      }
      alpha *= 0.985;
    }
    draw();
    requestAnimationFrame(tick);
  }

  function draw() {
    for (var k in linkEls) {
      var p = k.split("-"), a = nodes[+p[0]], b = nodes[+p[1]];
      var line = linkEls[k];
      line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
      var fresh = highlight && highlight.added &&
        +p[0] === highlight.i && +p[1] === highlight.j &&
        performance.now() - highlight.t < 900;
      line.classList.toggle("nf-new", !!fresh);
    }
    for (var i = 0; i < n; i++) {
      var g = nodeEls[i].g;
      g.setAttribute("transform", "translate(" + nodes[i].x + "," + nodes[i].y + ")");
      var active = highlight && (highlight.i === i || highlight.j === i) &&
        performance.now() - highlight.t < 900;
      g.classList.toggle("nf-active", !!active);
      g.classList.toggle("nf-cut", !!(active && !highlight.added));
    }
  }

  // ---------- Dragging ----------
  function svgPoint(evt) {
    var r = svg.getBoundingClientRect();
    return { x: (evt.clientX - r.left) * (W / r.width), y: (evt.clientY - r.top) * (H / r.height) };
  }

  function attachDrag(g, i) {
    g.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      nodes[i].fixed = true;
      var move = function (ev) { var p = svgPoint(ev); nodes[i].x = p.x; nodes[i].y = p.y; kick(); };
      var up = function () {
        nodes[i].fixed = false;
        g.removeEventListener("pointermove", move);
        g.removeEventListener("pointerup", up);
      };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up);
    });
  }

  // ---------- Controls ----------
  function syncOutputs() {
    ui.deltaOut.textContent = (+ui.delta.value).toFixed(2);
    ui.costOut.textContent = (+ui.cost.value).toFixed(2);
    ui.nOut.textContent = ui.n.value;
  }

  ui.delta.addEventListener("input", function () { delta = +ui.delta.value; syncOutputs(); refresh(); });
  ui.cost.addEventListener("input", function () { cost = +ui.cost.value; syncOutputs(); refresh(); });
  ui.n.addEventListener("input", function () { syncOutputs(); setPlaying(false); placeNodes(+ui.n.value); resetWith("empty"); });
  ui.play.addEventListener("click", function () { setPlaying(!playing); if (playing) stepOnce(); });
  ui.step.addEventListener("click", function () { setPlaying(false); stepOnce(); });
  ui.empty.addEventListener("click", function () { setPlaying(false); resetWith("empty"); });
  ui.random.addEventListener("click", function () { setPlaying(false); resetWith("random"); });
  ui.complete.addEventListener("click", function () { setPlaying(false); resetWith("complete"); });

  // ---------- Start ----------
  syncOutputs();
  placeNodes(n);
  resetWith("random");
  requestAnimationFrame(tick);
})();
