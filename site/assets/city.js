(function () {
  'use strict';
  var canvas = document.getElementById('city');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var H = 200, W = 356;
  var level = 0, lvlSmooth = 0, px = 0, py = 0, pxs = 0, pys = 0;
  var rnd = mulberry(20240611);
  var stars = [], layers = [], drops = [], ships = [], drones = [], signs = [];
  var PAL = ['#a99cf6', '#ff8be8', '#f6f08c', '#5fe0ff'];

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function R(a, b) { return a + rnd() * (b - a); }

  function build() {
    var ar = window.innerWidth / Math.max(1, window.innerHeight);
    W = Math.max(240, Math.round(H * ar));
    canvas.width = W; canvas.height = H;
    rnd = mulberry(20240611);

    stars = [];
    for (var i = 0; i < 90; i++) stars.push({ x: R(0, W), y: R(0, H * 0.55), p: R(0, 6.28), s: R(0.6, 2.2) });

    layers = [];
    var cfg = [
      { base: H * 0.80, minH: 36, maxH: 90, minW: 16, maxW: 30, col: '#120a2a', par: 3, speed: 1.2, wins: 0.10 },
      { base: H * 0.90, minH: 46, maxH: 110, minW: 18, maxW: 36, col: '#0b0620', par: 7, speed: 2.6, wins: 0.16 },
      { base: H * 1.02, minH: 50, maxH: 100, minW: 24, maxW: 46, col: '#050210', par: 14, speed: 5, wins: 0.22 }
    ];
    signs = [];
    cfg.forEach(function (c, li) {
      var total = W + 120, x = 0, list = [];
      while (x < total) {
        var w = Math.round(R(c.minW, c.maxW)), h = Math.round(R(c.minH, c.maxH));
        var b = { x: x, w: w, h: h, wins: [], ant: rnd() < 0.35 };
        for (var wy = 6; wy < h - 4; wy += 5) for (var wx = 3; wx < w - 4; wx += 5) {
          if (rnd() < c.wins * 2.2) b.wins.push({ x: wx, y: wy, on: rnd() < 0.55, c: PAL[(rnd() * 4) | 0], t: R(0, 100), r: R(0.2, 1.4) });
        }
        list.push(b);
        if (li > 0 && rnd() < 0.3 && w > 18) signs.push({ layer: li, b: b, y: R(8, h * 0.6), c: PAL[(rnd() * 3) | 0], p: R(0, 10), h: 4 + ((rnd() * 4) | 0) });
        x += w + Math.round(R(0, 4));
      }
      layers.push({ c: c, list: list, total: x, off: 0 });
    });

    drops = [];
    for (var d = 0; d < 110; d++) drops.push({ x: R(0, W), y: R(0, H), v: R(70, 130), l: 2 + ((rnd() * 3) | 0) });
    ships = []; drones = [];
    for (var s = 0; s < 3; s++) ships.push({ x: R(0, W), y: R(14, H * 0.45), v: R(5, 14) * (rnd() < 0.5 ? -1 : 1), c: PAL[s % 4] });
    for (var k = 0; k < 4; k++) drones.push({ x: R(0, W), y: R(H * 0.35, H * 0.7), ph: R(0, 6), v: R(3, 9) * (rnd() < 0.5 ? -1 : 1) });
  }

  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

  function sky(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05010f'); g.addColorStop(0.5, '#1a0b3d'); g.addColorStop(0.85, '#4a1a66'); g.addColorStop(1, '#8a2f8e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], a = 0.4 + 0.6 * Math.abs(Math.sin(t * s.s * 0.6 + s.p));
      ctx.globalAlpha = a; rect(s.x + pxs * 1.5, s.y, 1, 1, '#fff');
    }
    ctx.globalAlpha = 1;
  }

  function moon(t) {
    var mx = W * 0.72 + pxs * 3, my = H * 0.26 + Math.sin(t * 0.15) * 2, r = 17 + lvlSmooth * 1.5;
    var g = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 3.2);
    g.addColorStop(0, 'rgba(255,139,232,' + (0.35 + lvlSmooth * 0.3) + ')'); g.addColorStop(1, 'rgba(255,139,232,0)');
    ctx.fillStyle = g; ctx.fillRect(mx - r * 3.5, my - r * 3.5, r * 7, r * 7);
    ring(mx, my, r, t, true);
    ctx.fillStyle = '#f6f08c';
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(169,156,246,0.55)';
    ctx.beginPath(); ctx.arc(mx - 5, my - 4, 5, 0, 6.283); ctx.arc(mx + 6, my + 6, 3.5, 0, 6.283); ctx.fill();
    ring(mx, my, r, t, false);
  }
  function ring(mx, my, r, t, back) {
    ctx.save(); ctx.translate(mx, my); ctx.rotate(-0.38);
    ctx.strokeStyle = 'rgba(169,156,246,0.85)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 2.1, r * 0.55, 0, back ? Math.PI : 0, back ? 6.283 : Math.PI);
    ctx.stroke(); ctx.restore();
  }

  function building(l, b, off) {
    var x = b.x - off, c = l.c;
    if (x > W) x -= l.total; if (x + b.w < -2) x += l.total;
    var y = c.base - b.h + py * c.par * 0.4 * 0;
    rect(x, y, b.w, b.h + 6, c.col);
    rect(x, y, b.w, 1, 'rgba(169,156,246,0.35)');
    if (b.ant) { rect(x + b.w / 2, y - 9, 1, 9, c.col); }
    return { x: x, y: y };
  }

  function drawLayers(t) {
    for (var li = 0; li < layers.length; li++) {
      var l = layers[li], c = l.c;
      l.off = (l.off + (reduce ? 0 : c.speed * 0.016)) % l.total;
      var shift = -pxs * c.par, off = l.off - shift;
      var rain = li === 2;
      for (var i = 0; i < l.list.length; i++) {
        var b = l.list[i], p = building(l, b, off);
        for (var w = 0; w < b.wins.length; w++) {
          var wn = b.wins[w];
          var flick = Math.sin(t * wn.r + wn.t);
          var on = wn.on ? flick > -0.92 : flick > 0.97 - lvlSmooth * 0.6;
          if (!on) continue;
          ctx.globalAlpha = li === 0 ? 0.55 : 0.9;
          rect(p.x + wn.x, p.y + wn.y, 2, 2, wn.c);
        }
        ctx.globalAlpha = 1;
      }
      for (var s = 0; s < signs.length; s++) {
        var sg = signs[s]; if (sg.layer !== li) continue;
        var q = building(l, sg.b, off);
        var fl = Math.sin(t * 3 + sg.p) > -0.8 && !(Math.sin(t * 11 + sg.p * 3) > 0.96);
        var a = fl ? 0.85 + lvlSmooth * 0.15 : 0.15;
        var sx = q.x + 2, sy = q.y + sg.y, sw = Math.max(3, sg.b.w - 4);
        ctx.globalAlpha = a * 0.25; rect(sx - 2, sy - 2, sw + 4, sg.h + 4, sg.c);
        ctx.globalAlpha = a; rect(sx, sy, sw, sg.h, sg.c);
        ctx.globalAlpha = 1; rect(sx + 1, sy + 1, sw - 2, Math.max(1, sg.h - 2), '#05010f');
        ctx.globalAlpha = a; rect(sx + 1, sy + (sg.h >> 1), sw - 2, 1, sg.c);
        ctx.globalAlpha = 1;
      }
      var fg = ctx.createLinearGradient(0, c.base - 60, 0, c.base + 4);
      fg.addColorStop(0, 'rgba(255,139,232,0)'); fg.addColorStop(1, 'rgba(255,139,232,' + (0.10 + lvlSmooth * 0.08) + ')');
      ctx.fillStyle = fg; ctx.fillRect(0, c.base - 60, W, 64);
    }
  }

  function traffic(t, dt) {
    var i;
    for (i = 0; i < ships.length; i++) {
      var s = ships[i]; s.x += s.v * dt;
      if (s.x > W + 10) s.x = -10; if (s.x < -10) s.x = W + 10;
      rect(s.x, s.y, 4, 1, '#05010f'); rect(s.x + (s.v > 0 ? 4 : -1), s.y, 1, 1, s.c);
      ctx.globalAlpha = 0.3; rect(s.x - (s.v > 0 ? 8 : -4), s.y, 8, 1, s.c); ctx.globalAlpha = 1;
    }
    for (i = 0; i < drones.length; i++) {
      var d = drones[i]; d.x += d.v * dt;
      if (d.x > W + 6) d.x = -6; if (d.x < -6) d.x = W + 6;
      var y = d.y + Math.sin(t * 1.3 + d.ph) * 3;
      rect(d.x, y, 3, 1, '#0b0620'); rect(d.x + 1, y - 1, 1, 1, '#0b0620');
      if (Math.sin(t * 5 + d.ph) > 0) rect(d.x + 1, y + 1, 1, 1, '#ff4f6d');
    }
  }

  function rainfall(dt) {
    ctx.fillStyle = 'rgba(190,180,255,0.35)';
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      d.y += d.v * dt; d.x -= d.v * dt * 0.15;
      if (d.y > H) { d.y = -d.l; d.x = rnd() * (W + 30); }
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, d.l);
    }
  }

  var last = 0, running = true;
  function frame(ms) {
    if (!running) return;
    var t = ms / 1000, dt = Math.min(0.05, last ? t - last : 0.016); last = t;
    lvlSmooth += (level - lvlSmooth) * 0.2;
    pxs += (px - pxs) * 0.05; pys += (py - pys) * 0.05;
    sky(t); moon(t); drawLayers(t); traffic(t, dt); rainfall(dt);
    if (lvlSmooth > 0.02) { ctx.fillStyle = 'rgba(255,139,232,' + (lvlSmooth * 0.08) + ')'; ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = 0; requestAnimationFrame(frame); }
  });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });

  window.EterniaCity = {
    setLevel: function (v) { level = Math.max(0, Math.min(1, v)); },
    setPointer: function (x, y) { px = x; py = y; }
  };

  build();
  if (reduce) { frame(4000); running = false; } else requestAnimationFrame(frame);
})();
