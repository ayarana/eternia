(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body, stage = $('stage'), music = $('music'), gate = $('gate');
  var soundBtn = $('sound'), npstate = $('npstate');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var started = false, ctxA = null, analyser = null, freq = null, level = 0;

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var d = new Date();
    $('clock').textContent = two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
    $('date').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }).toLowerCase();
  }
  tick(); setInterval(tick, 1000);

  var phrases = [
    'viajante detectado na entrada',
    'carregando chuva... ok',
    'a noite ainda é jovem em etérnia',
    'sinal da live: aguardando',
    'de acordo com o meu xiaomi',
    'cala a boca, seu peruka',
    'cuidado com as beia',
    'bem-vinda, bem-vindo, bem-vinde'
  ];
  var typedEl = $('typed'), pi = 0, ci = 0, del = false;
  function type() {
    var p = phrases[pi], wait = del ? 28 : 70;
    if (reduce) { typedEl.textContent = phrases[0]; return; }
    if (!del) { ci++; if (ci >= p.length) { del = true; wait = 1900; } }
    else { ci--; if (ci <= 0) { del = false; pi = (pi + 1) % phrases.length; wait = 350; } }
    typedEl.textContent = p.slice(0, ci);
    setTimeout(type, wait);
  }
  type();


  var longPool = ['cala a boca, seu peruka', 'cuidado com as beia', 'de acordo com o meu xiaomi', 'luzes acesas, chuva constante', 'novos viajantes chegando'];
  var shortPool = ['luzes acesas', 'chuva constante', 'novos viajantes', 'noite eterna', 'sinal estável', 'bem-vinde'];
  var slots = [
    { el: document.querySelector('.w1'), pool: longPool, every: 7000 },
    { el: document.querySelector('.w2'), pool: longPool, every: 8500 },
    { el: document.querySelector('.w3'), pool: shortPool, every: 6000 },
    { el: document.querySelector('.w4'), pool: shortPool, every: 7500 }
  ];
  function shown() { return slots.map(function (s) { return s.el && s.el.textContent; }); }
  function swap(s) {
    var used = shown(), opts = s.pool.filter(function (p) { return used.indexOf(p) < 0; });
    if (!opts.length) return;
    var next = opts[(Math.random() * opts.length) | 0];
    s.el.style.opacity = '0';
    setTimeout(function () { s.el.textContent = next; s.el.style.opacity = ''; }, 450);
  }
  if (!reduce) slots.forEach(function (s, i) {
    if (!s.el) return;
    s.el.textContent = s.el.textContent.trim();
    setTimeout(function () { setInterval(function () { if (started) swap(s); }, s.every); }, 4000 + i * 1700);
  });

  var logEl = $('log'), chip = $('livechip'), dot = document.querySelector('.cta--twitch .dot');
  var CHANNEL = 'nathanmad77', BOTS = ['nightbot', 'streamelements', 'moobot', 'streamlabs', 'fossabot', 'wizebot'];
  var live = null, speakers = [], ws = null, wsTimer = null;

  function renderLog(lines) {
    logEl.textContent = '';
    lines.slice(-6).forEach(function (t) {
      var el = document.createElement('div'); el.textContent = '> ' + t;
      logEl.appendChild(el);
    });
  }
  function paintStatus(info) {
    var on = info && info.live === true;
    chip.textContent = !info ? 'SEM SINAL DA TWITCH' : on ? '● AO VIVO' + (info.viewers != null ? ' · ' + info.viewers : '') : '○ STREAM OFFLINE';
    chip.classList.toggle('is-live', on);
    if (dot) dot.style.visibility = on ? 'visible' : 'hidden';
    if (on !== live) { live = on; speakers = []; on ? openChat() : closeChat(); }
    if (!on) renderLog([info ? 'stream offline' : 'twitch indisponível', 'volte na live']);
    else if (!speakers.length) renderLog(['stream ao vivo', 'aguardando o chat...']);
  }
  function poll() {
    fetch('/.netlify/functions/twitch', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { paintStatus(j && typeof j.live === 'boolean' ? j : null); })
      .catch(function () { paintStatus(null); });
  }
  function openChat() {
    closeChat();
    try {
      ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      ws.onopen = function () {
        ws.send('CAP REQ :twitch.tv/tags');
        ws.send('NICK justinfan' + (10000 + ((Math.random() * 80000) | 0)));
        ws.send('JOIN #' + CHANNEL);
      };
      ws.onmessage = function (ev) {
        String(ev.data).split('\r\n').forEach(function (line) {
          if (line.indexOf('PING') === 0) { ws.send('PONG :tmi.twitch.tv'); return; }
          var m = /^@(\S+) :([^!]+)![^ ]+ PRIVMSG #\S+ :/.exec(line);
          if (!m) return;
          var dn = /(?:^|;)display-name=([^;]*)/.exec(m[1]), name = (dn && dn[1]) || m[2];
          if (BOTS.indexOf(name.toLowerCase()) >= 0) return;
          speakers = speakers.filter(function (n) { return n !== name; });
          speakers.push(name);
          renderLog(speakers.slice(-6));
          logEl.lastChild.style.color = 'var(--yellow)';
        });
      };
      ws.onclose = function () { ws = null; if (live) wsTimer = setTimeout(openChat, 8000); };
    } catch (e) { ws = null; }
  }
  function closeChat() {
    clearTimeout(wsTimer);
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} ws = null; }
  }
  renderLog(['verificando sinal...']);
  poll(); setInterval(poll, 60000);

  var bars = $('bars'), bctx = bars.getContext('2d'), N = 20, vals = [], cols = ['#a99cf6', '#ff8be8', '#f6f08c'];
  for (var b = 0; b < N; b++) vals.push(0);
  function drawBars(t) {
    var w = bars.width, h = bars.height, bw = w / N;
    bctx.clearRect(0, 0, w, h);
    var playing = started && !isPaused();
    for (var k = 0; k < N; k++) {
      var target;
      if (analyser && playing) target = freq[Math.min(freq.length - 1, 2 + k * 3)] / 255;
      else if (playing) target = 0.25 + 0.55 * Math.abs(Math.sin(t / 380 + k * 0.7) * Math.sin(t / 910 + k));
      else target = 0.08 + 0.05 * Math.sin(t / 700 + k);
      vals[k] += (target - vals[k]) * 0.35;
      var bh = Math.max(2, Math.round(vals[k] * h / 2) * 2);
      for (var y = 0; y < bh; y += 4) {
        bctx.fillStyle = cols[Math.min(2, (y / h * 3) | 0)];
        bctx.fillRect(Math.floor(k * bw) + 1, h - y - 3, Math.max(2, bw - 3), 3);
      }
    }
  }

  function readLevel(t) {
    var playing = started && !isPaused(), target = 0;
    if (analyser && playing) {
      analyser.getByteFrequencyData(freq);
      var s = 0; for (var i = 1; i < 8; i++) s += freq[i];
      target = Math.max(0, (s / 7 / 255 - 0.25) * 1.9);
    } else if (playing) {
      target = 0.35 * Math.max(0, Math.sin(t / 520));
    }
    level += (target - level) * 0.3;
    var l = Math.max(0, Math.min(1, level));
    stage.style.setProperty('--lvl', l.toFixed(3));
    if (window.EterniaCity) window.EterniaCity.setLevel(l);
  }

  (function raf(t) { readLevel(t); drawBars(t); requestAnimationFrame(raf); })(0);

  var spot = document.querySelector('.spot');
  function point(cx, cy) {
    var x = cx / window.innerWidth * 2 - 1, y = cy / window.innerHeight * 2 - 1;
    stage.style.setProperty('--px', x.toFixed(3)); stage.style.setProperty('--py', y.toFixed(3));
    if (spot) { spot.style.setProperty('--mx', cx + 'px'); spot.style.setProperty('--my', cy + 'px'); }
    if (window.EterniaCity) window.EterniaCity.setPointer(x, y);
  }
  if (!reduce) {
    window.addEventListener('pointermove', function (e) { point(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null) return;
      point((e.gamma / 45 + 1) / 2 * window.innerWidth, ((e.beta || 0) / 90 + 0.5) * window.innerHeight);
    });
  }


  var driveUrl = function (id) { return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id); };
  var driveCfg = fetch('/assets/drive.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  driveCfg.then(function (c) {
    var m = document.querySelector('.mascot');
    if (m) m.src = c.mascote ? driveUrl(c.mascote) : '/assets/nathan.gif';
    if ($('skel')) $('skel').src = c.esqueleto ? driveUrl(c.esqueleto) : '/assets/skeleton.gif';
  });

  var skel = $('skel'), skelTimer = null;
  function scheduleSkeleton() {
    if (reduce || !skel || !skel.animate) return;
    skelTimer = setTimeout(showSkeleton, 6000 + Math.random() * 4000);
  }
  function showSkeleton() {
    if (document.hidden) { skelTimer = setTimeout(showSkeleton, 5000); return; }
    skel.hidden = false;
    var peak = 0.5 + Math.random() * 0.15;
    var a = skel.animate(
      [{ opacity: 0 }, { opacity: peak, offset: 0.55 }, { opacity: peak * 0.9, offset: 0.65 }, { opacity: 0 }],
      { duration: 7000, easing: 'ease-in-out' }
    );
    a.onfinish = function () { skel.hidden = true; skelTimer = setTimeout(showSkeleton, 12000 + Math.random() * 10000); };
  }


  var ghostFiles = [], ghostLast = '', ghostTimer = null;
  function rr(a, b) { return a + Math.random() * (b - a); }
  function scheduleGhost() {
    if (reduce || !Element.prototype.animate) return;
    driveCfg.then(function (c) {
      var fromDrive = (c.aleatorios || []).map(function (e) { return typeof e === 'string' ? { id: e } : e; }).filter(function (e) { return e && e.id; });
      if (fromDrive.length) { ghostFiles = fromDrive.map(function (e) { return { src: driveUrl(e.id), key: e.id, cutout: !!e.recorte }; }); start(); return; }
      return fetch('/assets/aleatorios/manifest.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (list) {
          ghostFiles = (Array.isArray(list) ? list : []).map(function (n) { return { src: '/assets/aleatorios/' + encodeURIComponent(n), key: n }; });
          start();
        });
    }).catch(function () {});
    function start() { if (ghostFiles.length) ghostTimer = setTimeout(showGhost, rr(2000, 4000)); }
  }
  function hasAlpha(img) {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 16;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
      var d = x.getImageData(0, 0, 16, 16).data;
      for (var i = 3; i < d.length; i += 4) if (d[i] < 200) return true;
    } catch (e) {}
    return false;
  }
  function nextGhost(delay) { ghostTimer = setTimeout(showGhost, delay || rr(1200, 3500)); }
  function showGhost() {
    if (document.hidden) { nextGhost(5000); return; }
    var pick; do { pick = ghostFiles[(Math.random() * ghostFiles.length) | 0]; } while (pick.key === ghostLast && ghostFiles.length > 1);
    ghostLast = pick.key;
    var src = pick.src;
    var external = /^https?:/.test(src), cors = external;
    var probe = new Image();
    if (cors) probe.crossOrigin = 'anonymous';
    probe.onerror = function () {
      if (cors) { cors = false; probe = new Image(); probe.onerror = function () { nextGhost(1500); }; probe.onload = loaded; probe.src = src; return; }
      nextGhost(1500);
    };
    probe.onload = loaded;
    function loaded() {
      var ar = probe.naturalWidth / probe.naturalHeight || 1;
      var wpx = Math.min(rr(14, 26) * innerWidth / 100, 0.48 * innerHeight * ar);
      var hpx = wpx / ar;
      var wrap = document.createElement('div');
      wrap.className = 'ghost' + (pick.cutout || hasAlpha(probe) ? '' : ' ghost--soft');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.width = wpx + 'px';
      wrap.style.left = rr(-0.02 * innerWidth, innerWidth - wpx + 0.02 * innerWidth) + 'px';
      wrap.style.top = rr(0.06 * innerHeight, Math.max(0.07 * innerHeight, innerHeight - hpx - 0.06 * innerHeight)) + 'px';
      ['', 'ghost__r', 'ghost__c'].forEach(function (cls) {
        var im = document.createElement('img'); if (cors) im.crossOrigin = 'anonymous'; im.src = src; im.alt = ''; im.draggable = false;
        if (cls) im.className = cls; wrap.appendChild(im);
      });
      document.body.appendChild(wrap);
      var peak = rr(0.45, 0.7), dur = rr(3600, 5200);
      var an = wrap.animate(
        [{ opacity: 0 }, { opacity: peak, offset: 0.5 }, { opacity: peak * 0.85, offset: 0.62 }, { opacity: 0 }],
        { duration: dur, easing: 'ease-in-out' }
      );
      an.onfinish = function () { wrap.remove(); nextGhost(); };
    }
    probe.src = src;
  }

  function setUI() {
    var on = !isPaused();
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.textContent = on ? 'SOM: LIGADO' : 'SOM: DESLIGADO';
    npstate.textContent = on ? '▶ tocando' : 'em espera';
  }
  function hookAnalyser() {
    if (ctxA) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctxA = new AC();
      var src = ctxA.createMediaElementSource(music);
      analyser = ctxA.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.78;
      freq = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser); analyser.connect(ctxA.destination);
      if (ctxA.resume) ctxA.resume();
    } catch (e) { ctxA = null; analyser = null; }
  }
  function arrive() {
    if (started) return; started = true;
    scheduleSkeleton();
    scheduleGhost();
    body.classList.add('is-in');
    if (gate) gate.hidden = true;
    setUI();
  }
  function showGate() {
    if (started || !gate) { arrive(); return; }
    gate.hidden = false; $('enter').focus();
  }

  var ytId = '', yt = null, ytState = -1, ytPanel = document.querySelector('.pn--signal');
  var ytList = '', ytPhase = 'intro', ytErrors = 0, ytIds = null;
  function isPaused() { return ytId ? !(yt && (ytState === 1 || ytState === 3)) : music.paused; }

  music.volume = 0.85;
  music.addEventListener('play', setUI); music.addEventListener('pause', setUI);

  $('enter').addEventListener('click', function () {
    if (ytId) { if (yt && yt.playVideo) yt.playVideo(); arrive(); return; }
    hookAnalyser();
    var p = music.play();
    arrive();
    if (p && p.catch) p.catch(function () { setUI(); });
  });

  soundBtn.addEventListener('click', function () {
    if (ytId) {
      if (yt && yt.playVideo) { if (isPaused()) yt.playVideo(); else yt.pauseVideo(); }
      return;
    }
    if (music.paused) { hookAnalyser(); if (ctxA && ctxA.resume) ctxA.resume(); var p = music.play(); if (p && p.catch) p.catch(setUI); }
    else music.pause();
    setUI();
  });

  function startAudio() {
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; showGate(); } }, 2500);
    var tryPlay = music.play();
    if (tryPlay && tryPlay.then) {
      tryPlay.then(function () { if (settled) return; settled = true; clearTimeout(timer); arrive(); })
             .catch(function () { if (settled) return; settled = true; clearTimeout(timer); showGate(); });
    } else { settled = true; clearTimeout(timer); showGate(); }
  }

  function ytTitle() {
    var t = '';
    try { t = (yt && yt.getVideoData && yt.getVideoData().title) || ''; } catch (e) {}
    $('ytname').textContent = t;
    $('ytname').title = t;
  }
  function loadIds() {
    if (ytIds) return ytIds;
    ytIds = fetch('/.netlify/functions/playlist?list=' + encodeURIComponent(ytList))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.ids && d.ids.length ? d.ids : []; })
      .catch(function () { return []; });
    return ytIds;
  }
  function ytPlaylist() {
    ytPhase = 'list';
    ytErrors = 0;
    $('ytname').textContent = 'carregando playlist…';
    loadIds().then(function (ids) {
      if (ytPhase !== 'list') return;
      if (ids.length) yt.loadPlaylist({ playlist: ids, index: 0 });
      else yt.loadPlaylist({ listType: 'playlist', list: ytList, index: 0 });
      yt.setLoop(true);
      setTimeout(function () {
        if (ytPhase !== 'list') return;
        var n = 0;
        try { n = yt.getPlaylist().length; } catch (err) {}
        if (n) return;
        ytPhase = 'intro';
        $('ytname').textContent = 'playlist indisponível';
        if (window.console) console.warn('YouTube: a playlist não carregou (privada ou com incorporação bloqueada?)');
      }, 5000);
    });
  }
  function ytNext() {
    if (!yt) return;
    if (ytPhase === 'intro') ytPlaylist(); else yt.nextVideo();
  }
  function ytPrev() {
    if (!yt) return;
    if (ytPhase === 'intro') { yt.seekTo(0, true); return; }
    var i = 0;
    try { i = yt.getPlaylistIndex(); } catch (e) {}
    if (yt.getCurrentTime() > 3) yt.seekTo(0, true);
    else if (i <= 0) { ytPhase = 'intro'; yt.loadVideoById(ytId); }
    else yt.previousVideo();
  }
  $('ytnext').addEventListener('click', ytNext);
  $('ytprev').addEventListener('click', ytPrev);

  function startYouTube(id) {
    ytId = id;
    if (ytList) { $('ytctl').hidden = false; loadIds(); }
    ytPanel.classList.add('is-yt');
    $('ytwrap').hidden = false;
    var done = false, fail = setTimeout(function () { if (!done) { done = true; arrive(); } }, 7000);
    window.onYouTubeIframeAPIReady = function () {
      yt = new YT.Player('ytp', {
        width: 200, height: 200, videoId: id,
        playerVars: ytList
          ? { controls: 1, playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin }
          : { controls: 1, playsinline: 1, rel: 0, loop: 1, playlist: id, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: function () {
            yt.setVolume(85); yt.playVideo();
            setTimeout(function () { if (done) return; done = true; clearTimeout(fail); if (ytState === 1) arrive(); else showGate(); }, 2500);
          },
          onStateChange: function (e) {
            ytState = e.data;
            if (e.data === 0 && ytList && ytPhase === 'intro') ytPlaylist();
            if (e.data === 1) { ytErrors = 0; ytTitle(); }
            setUI();
          },
          onError: function (e) {
            if (window.console) console.warn('YouTube: erro ' + (e && e.data) + ' na fase ' + ytPhase);
            if (!done) { done = true; clearTimeout(fail); arrive(); }
            if (!ytList) return;
            if (ytPhase === 'intro') { ytPlaylist(); return; }
            var n = 0;
            try { n = yt.getPlaylist().length; } catch (err) {}
            if (++ytErrors < (n || 60)) {
              $('ytname').textContent = 'faixa indisponível, pulando…';
              yt.nextVideo();
            } else {
              $('ytname').textContent = 'nenhuma faixa pôde tocar';
            }
          }
        }
      });
    };
    var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = function () { if (!done) { done = true; clearTimeout(fail); arrive(); } };
    document.head.appendChild(s);
  }

  driveCfg.then(function (c) {
    var id = String((c && c.youtube) || '').trim();
    var pl = String((c && c.playlist) || '').trim();
    ytList = /^[\w-]{10,}$/.test(pl) ? pl : '';
    if (/^[\w-]{11}$/.test(id)) startYouTube(id); else startAudio();
  });
})();
