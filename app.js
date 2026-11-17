// Tablet compatibility test. Isolated measuring page: shares no code with the game.
// Written for old Safari: no optional chaining, no modules, no build step.
'use strict';

var PACK_CACHE = 'li-test-pack-v1';
var R = { page: 1, saved: 0, report: {}, judged: {}, drag: null, fill: null, pack: null, sessions: [], survive: {} };

function $(id) { return document.getElementById(id); }
function show(id, text, cls) { var e = $(id); e.textContent = text; e.className = 'res ' + (cls || 'wait'); }
function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
function now() { return new Date().toISOString(); }
function days(ms) { return (ms / 86400000).toFixed(1) + ' days'; }
function standalone() {
  return navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

// ---------- small IndexedDB key-value store ----------
function db() {
  return new Promise(function (res, rej) {
    if (!window.indexedDB) return rej(new Error('IndexedDB missing'));
    var q = indexedDB.open('li-test', 1);
    q.onupgradeneeded = function () { q.result.createObjectStore('kv'); };
    q.onsuccess = function () { res(q.result); };
    q.onerror = function () { rej(q.error || new Error('IndexedDB open failed')); };
  });
}
function dbGet(k) {
  return db().then(function (d) {
    return new Promise(function (res, rej) {
      var q = d.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  });
}
function dbSet(k, v) {
  return db().then(function (d) {
    return new Promise(function (res, rej) {
      var tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

function save() {
  R.saved = Date.now();
  var text = JSON.stringify(R);
  lsSet('li-results', text);
  dbSet('results', text).catch(function () {});
  $('out').value = JSON.stringify(R, null, 1);
}
async function load() {
  var a = lsGet('li-results'), b = null;
  try { b = await dbGet('results'); } catch (e) {}
  var best = null;
  [a, b].forEach(function (t) {
    if (!t) return;
    try { var o = JSON.parse(t); if (!best || o.saved > best.saved) best = o; } catch (e) {}
  });
  if (best) { for (var k in best) R[k] = best[k]; }
}

// ---------- 1. report ----------
function webp() {
  return new Promise(function (res) {
    var i = new Image();
    i.onload = function () { res(i.width === 1); };
    i.onerror = function () { res(false); };
    i.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  });
}
async function report() {
  var ua = navigator.userAgent;
  var os = ua.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))?/);
  var ver = ua.match(/Version\/([\d.]+)/);
  var rep = {
    time: now(),
    userAgent: ua,
    systemFromUA: os ? os.slice(1).filter(Boolean).join('.') : 'not stated',
    safariVersion: ver ? ver[1] : 'not stated',
    screen: screen.width + ' x ' + screen.height + ' points, pixel ratio ' + window.devicePixelRatio,
    window: window.innerWidth + ' x ' + window.innerHeight,
    cores: navigator.hardwareConcurrency || 'not stated',
    memoryGB: navigator.deviceMemory || 'not stated',
    touchPoints: navigator.maxTouchPoints,
    secureContext: window.isSecureContext === true,
    serviceWorker: 'serviceWorker' in navigator,
    cacheStorage: 'caches' in window,
    indexedDB: !!window.indexedDB,
    webAudio: !!(window.AudioContext || window.webkitAudioContext),
    webp: await webp(),
    storageEstimate: 'not available',
    persisted: 'not available'
  };
  if (navigator.storage && navigator.storage.estimate) {
    try {
      var est = await navigator.storage.estimate();
      rep.storageEstimate = Math.round(est.usage / 1048576) + ' MB used of ' + Math.round(est.quota / 1048576) + ' MB allowed';
    } catch (e) { rep.storageEstimate = 'error: ' + e.message; }
  }
  if (navigator.storage && navigator.storage.persist) {
    try { rep.persisted = await navigator.storage.persist(); } catch (e) { rep.persisted = 'error: ' + e.message; }
  }
  if (rep.serviceWorker) {
    try {
      await navigator.serviceWorker.register('sw.js');
      rep.serviceWorkerState = navigator.serviceWorker.controller ? 'controlling this page' : 'registered; controls the page from the next open';
    } catch (e) { rep.serviceWorkerState = 'failed: ' + e.message; }
  }
  R.report = rep;
  var lines = Object.keys(rep).map(function (k) { return k + ': ' + rep[k]; });
  var good = rep.secureContext && rep.serviceWorker && rep.cacheStorage && rep.indexedDB && rep.webAudio;
  show('r-report', lines.join('\n') + (rep.secureContext ? '' :
    '\n\nThis page was not opened over a secure (https) address, so the offline tests cannot run.'), good ? 'ok' : 'bad');
  var s = standalone();
  R.report.standalone = s;
  show('r-install', s ? 'Opened from the home screen, full screen. Good.' :
    'Opened in the browser. Add it to the home screen and open it from there.', s ? 'ok' : 'wait');
}

// ---------- 3. survival ----------
async function survive() {
  var t = Date.now();
  var ls = lsGet('li-first');
  var idb = null, idbErr = '';
  try { idb = await dbGet('first'); } catch (e) { idbErr = e.message; }
  var first = Math.min(ls ? +ls : t, idb ? +idb : t);
  if (!ls) lsSet('li-first', String(first));
  if (!idb) { try { await dbSet('first', first); } catch (e) { idbErr = e.message; } }
  var visits = (+lsGet('li-visits') || 0) + 1;
  lsSet('li-visits', String(visits));
  var packCount = 0;
  if (window.caches) {
    try { packCount = (await (await caches.open(PACK_CACHE)).keys()).length; } catch (e) {}
  }
  var lost = [];
  if (R.survive.everHadLocal && !ls) lost.push('simple storage');
  if (R.survive.everHadIdb && !idb) lost.push('database');
  if (R.survive.packCount && packCount < R.survive.packCount) lost.push('pack files (' + packCount + ' of ' + R.survive.packCount + ')');
  R.survive = {
    lastCheck: now(), firstWritten: new Date(first).toISOString(), age: days(t - first), visits: visits,
    everHadLocal: true, everHadIdb: !idbErr, packCount: packCount, lost: lost,
    history: (R.survive.history || []).concat([{ time: now(), local: !!ls, database: !!idb, pack: packCount, standalone: standalone() }]).slice(-30)
  };
  show('r-survive',
    'First saved: ' + R.survive.firstWritten + ' (' + R.survive.age + ' ago)\n' +
    'Times opened: ' + visits + '\n' +
    'Simple storage found: ' + (ls ? 'yes' : 'no, written now') + '\n' +
    'Database found: ' + (idb ? 'yes' : (idbErr ? 'error: ' + idbErr : 'no, written now')) + '\n' +
    'Pack files stored: ' + packCount + '\n' +
    (lost.length ? 'LOST since last time: ' + lost.join(', ') : 'Nothing lost since last time.'),
    lost.length || idbErr ? 'bad' : 'ok');
}

// ---------- audio ----------
var AC = null, music = null, clip = null;
function audio() {
  if (!AC) {
    var K = window.AudioContext || window.webkitAudioContext;
    if (!K) return null;
    AC = new K();
  }
  if (AC.state === 'suspended' && AC.resume) AC.resume();
  return AC;
}
function tone(freq, dur, gain) {
  var ac = audio(); if (!ac) return;
  var o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = freq; g.gain.value = gain;
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur);
}
function decode(buf) {
  return new Promise(function (res, rej) { audio().decodeAudioData(buf, res, rej); });
}
function playBuffer(b, gain, seconds) {
  var ac = audio();
  var s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b; g.gain.value = gain;
  s.connect(g); g.connect(ac.destination);
  s.start(); if (seconds) s.stop(ac.currentTime + seconds);
}
function tapTest(e) {
  e.preventDefault();
  var f = $('flash');
  f.className = 'on';
  tone(1200, 0.04, 0.5);
  setTimeout(function () { f.className = ''; }, 90);
  if (AC && !R.judged.latencyInfo) {
    R.judged.latencyInfo = 'base ' + (AC.baseLatency !== undefined ? AC.baseLatency.toFixed(3) + ' s' : 'not stated') +
      ', output ' + (AC.outputLatency !== undefined ? AC.outputLatency.toFixed(3) + ' s' : 'not stated') +
      ', rate ' + AC.sampleRate;
  }
}
function toggleMusic() {
  var ac = audio(); if (!ac) return;
  if (music) { music.forEach(function (o) { o.stop(); }); music = null; $('b-music').textContent = 'Start music'; return; }
  music = [196, 247, 294].map(function (f) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f; g.gain.value = 0.05;
    o.connect(g); g.connect(ac.destination); o.start();
    return o;
  });
  $('b-music').textContent = 'Stop music';
}
async function blip() {
  var ac = audio(); if (!ac) return;
  if (!clip && window.caches) {
    try {
      var r = await (await caches.open(PACK_CACHE)).match('pack/snd-012.wav');
      if (r) clip = await decode(await r.arrayBuffer());
    } catch (e) {}
  }
  if (clip) playBuffer(clip, 0.6, 0.5); else tone(660, 0.3, 0.4);
}
function judge(e) {
  var b = e.currentTarget, k = b.getAttribute('data-judge'), v = b.getAttribute('data-v');
  R.judged[k] = v; R.judged[k + 'Time'] = now();
  if (k === 'latency') show('r-latency', 'You chose: ' + v + '\n' + (R.judged.latencyInfo || ''), v === 'together' ? 'ok' : 'bad');
  if (k === 'overlap') show('r-overlap', 'You chose: ' + v, v === 'clean' ? 'ok' : 'bad');
  if (k === 'dragfeel') showDrag();
  save();
}

// ---------- 6. drag ----------
var tiles = [];
function buildTiles() {
  var field = $('field');
  for (var i = 0; i < 10; i++) {
    var t = document.createElement('div');
    t.className = 'tile'; t.textContent = String.fromCharCode(97 + i);
    field.appendChild(t);
    tiles.push({ el: t, x: 20 + i * 86, y: 30 + (i % 3) * 90 });
  }
  tiles.forEach(place);
  var held = null, ox = 0, oy = 0;
  function point(e) { var p = e.touches ? e.touches[0] : e; return { x: p.clientX, y: p.clientY }; }
  function down(e) {
    var hit = null;
    tiles.forEach(function (t) { if (t.el === e.target) hit = t; });
    if (!hit) return;
    e.preventDefault(); held = hit;
    var p = point(e); ox = p.x - hit.x; oy = p.y - hit.y;
  }
  function move(e) {
    if (!held) return;
    e.preventDefault();
    var p = point(e); held.x = p.x - ox; held.y = p.y - oy; place(held);
  }
  function up() { held = null; }
  field.addEventListener('touchstart', down, { passive: false });
  field.addEventListener('touchmove', move, { passive: false });
  field.addEventListener('touchend', up);
  field.addEventListener('touchcancel', up);
  field.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
function place(t) { t.el.style.transform = 'translate3d(' + t.x + 'px,' + t.y + 'px,0)'; }
function measureDrag() {
  var field = $('field'), w = field.clientWidth, h = field.clientHeight;
  var start = performance.now(), last = start, gaps = [];
  $('b-drag').disabled = true;
  function frame(t) {
    gaps.push(t - last); last = t;
    var a = (t - start) / 400;
    tiles.forEach(function (tile, i) {
      tile.x = w / 2 - 38 + Math.cos(a + i * 0.63) * (w * 0.38);
      tile.y = h / 2 - 38 + Math.sin(a * 1.3 + i * 0.63) * (h * 0.34);
      place(tile);
    });
    if (t - start < 5000) return requestAnimationFrame(frame);
    gaps.shift();
    var sum = gaps.reduce(function (s, g) { return s + g; }, 0);
    var slow = gaps.filter(function (g) { return g > 25; }).length;
    R.drag = {
      time: now(), framesPerSecond: Math.round(gaps.length / (sum / 1000)),
      worstGapMs: Math.round(Math.max.apply(null, gaps)),
      slowFramesPercent: Math.round(slow / gaps.length * 100), standalone: standalone()
    };
    $('b-drag').disabled = false;
    showDrag(); save();
  }
  requestAnimationFrame(frame);
}
function showDrag() {
  var d = R.drag, text = [];
  if (d) text.push(d.framesPerSecond + ' frames per second, worst gap ' + d.worstGapMs + ' ms, ' + d.slowFramesPercent + '% slow frames');
  if (R.judged.dragfeel) text.push('By hand it felt: ' + R.judged.dragfeel);
  if (text.length) show('r-drag', text.join('\n'), d && d.framesPerSecond >= 50 ? 'ok' : (d ? 'bad' : 'wait'));
}

// ---------- 7. pack ----------
async function sha(buf) {
  var d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), s = '';
  for (var i = 0; i < d.length; i++) s += (d[i] < 16 ? '0' : '') + d[i].toString(16);
  return s;
}
async function reachable() {
  try {
    var r = await fetch('probe.txt?' + Date.now(), { cache: 'no-store' });
    return r.ok;
  } catch (e) { return false; }
}
function needCaches(id) {
  if (window.caches && window.crypto && crypto.subtle) return true;
  show(id, 'Not possible here: the page must be opened over a secure (https) address.', 'bad');
  return false;
}
async function packStatus() {
  if (!window.caches) return show('r-pack', 'Offline storage is not available on this address.', 'bad');
  var n = (await (await caches.open(PACK_CACHE)).keys()).length;
  var p = R.pack;
  show('r-pack', n ? n + ' pack files stored on this tablet.' + (p ? '\nLast download: ' + p.time + ', ' + p.megabytes + ' MB in ' + p.seconds + ' s, ' + p.failed.length + ' failed.' : '') :
    'The pack is not stored yet.', n && (!p || !p.failed.length) ? 'ok' : 'wait');
}
async function packDownload() {
  if (!needCaches('r-pack')) return;
  $('b-pack').disabled = true;
  var failed = [], done = 0, bytes = 0, t0 = Date.now();
  try {
    var man = await (await fetch('pack/manifest.json?' + Date.now(), { cache: 'no-store' })).json();
    var c = await caches.open(PACK_CACHE);
    var next = 0;
    var worker = async function () {
      while (next < man.files.length) {
        var f = man.files[next++];
        try {
          var resp = await fetch('pack/' + f.path, { cache: 'no-store' });
          if (!resp.ok) throw new Error('server said ' + resp.status);
          var buf = await resp.arrayBuffer();
          if (buf.byteLength !== f.size) throw new Error('wrong size');
          if (await sha(buf) !== f.sha256) throw new Error('contents differ');
          await c.put('pack/' + f.path, new Response(buf, { headers: { 'Content-Type': f.type } }));
          bytes += f.size;
        } catch (e) { failed.push(f.path + ': ' + e.message); }
        done++;
        if (done % 5 === 0) show('r-pack', 'Downloading and checking: ' + done + ' of ' + man.files.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    await c.put('pack/manifest.json', new Response(JSON.stringify(man), { headers: { 'Content-Type': 'application/json' } }));
    R.pack = { time: now(), files: man.files.length, megabytes: Math.round(bytes / 1048576), seconds: Math.round((Date.now() - t0) / 1000), failed: failed };
  } catch (e) {
    R.pack = { time: now(), files: 0, megabytes: 0, seconds: 0, failed: ['download could not start: ' + e.message] };
  }
  $('b-pack').disabled = false;
  save();
  await packStatus();
  if (R.pack.failed.length) show('r-pack', 'Problems:\n' + R.pack.failed.slice(0, 20).join('\n'), 'bad');
}
function loadImage(blob) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(blob), i = new Image();
    i.onload = function () { URL.revokeObjectURL(url); res(i); };
    i.onerror = function () { URL.revokeObjectURL(url); rej(new Error('would not draw')); };
    i.src = url;
  });
}
async function packPlay() {
  if (!needCaches('r-play')) return;
  audio();
  $('b-play').disabled = true;
  var run = { time: now(), standalone: standalone(), networkReachable: await reachable(), files: 0, images: 0, sounds: 0, failed: [], slow: [], seconds: 0 };
  var t0 = performance.now();
  try {
    var c = await caches.open(PACK_CACHE);
    var mr = await c.match('pack/manifest.json');
    if (!mr) throw new Error('the pack is not stored on this tablet');
    var man = await mr.json();
    var g = $('stage').getContext('2d');
    for (var n = 0; n < man.files.length; n++) {
      var f = man.files[n], t = performance.now();
      try {
        var r = await c.match('pack/' + f.path);
        if (!r) throw new Error('missing');
        var buf = await r.arrayBuffer();
        if (buf.byteLength !== f.size) throw new Error('incomplete');
        if (await sha(buf) !== f.sha256) throw new Error('contents changed');
        if (f.type.indexOf('image') === 0) {
          g.drawImage(await loadImage(new Blob([buf], { type: f.type })), 0, 0, 240, 160);
          run.images++;
        } else {
          playBuffer(await decode(buf), 0.15, 0.08);
          run.sounds++;
          await sleep(40);
        }
      } catch (e) { run.failed.push(f.path + ': ' + (e && e.message ? e.message : 'would not play')); }
      var took = performance.now() - t;
      if (took > 500) run.slow.push(f.path + ' ' + Math.round(took) + ' ms');
      run.files++;
      if (n % 10 === 0) show('r-play', 'Playing: ' + (n + 1) + ' of ' + man.files.length);
    }
    run.expected = man.files.length;
  } catch (e) { run.failed.push(e.message); }
  run.seconds = Math.round((performance.now() - t0) / 1000);
  run.passed = !run.failed.length && !run.networkReachable && run.files === run.expected;
  R.sessions.push(run); R.sessions = R.sessions.slice(-12);
  $('b-play').disabled = false;
  save(); showSessions();
}
function showSessions() {
  if (!R.sessions.length) return;
  var bad = false;
  var text = R.sessions.map(function (s, i) {
    var verdict = s.failed.length ? 'FAILED' : (s.networkReachable ? 'all files played, but the tablet was ONLINE, so this run does not count' : 'PASSED offline');
    if (s.failed.length) bad = true;
    return 'Run ' + (i + 1) + ', ' + s.time + ': ' + verdict + '\n  ' + s.images + ' images, ' + s.sounds + ' sounds, ' + s.seconds + ' s, ' +
      (s.standalone ? 'home screen' : 'browser') +
      (s.slow.length ? '\n  slow: ' + s.slow.slice(0, 5).join(', ') : '') +
      (s.failed.length ? '\n  ' + s.failed.slice(0, 8).join('\n  ') : '');
  }).join('\n');
  var last = R.sessions[R.sessions.length - 1];
  show('r-play', text, bad ? 'bad' : (last.passed ? 'ok' : 'wait'));
}
async function packClear() {
  if (!window.caches) return;
  await caches.delete(PACK_CACHE); clip = null; R.pack = null; R.survive.packCount = 0;
  save(); packStatus();
}

// ---------- 8. room ----------
async function fillTest() {
  if (!needCaches('r-fill')) return;
  $('b-fill').disabled = true;
  var mb = 0, err = '', readBack = false, t0 = Date.now();
  try {
    var one = new Uint8Array(1048576);
    for (var i = 0; i < 16; i++) crypto.getRandomValues(one.subarray(i * 65536, (i + 1) * 65536));
    var parts = []; for (var j = 0; j < 10; j++) parts.push(one);
    var c = await caches.open('li-test-fill');
    for (var n = 0; n < 15; n++) {
      await c.put('fill/' + n, new Response(new Blob(parts)));
      mb += 10;
      show('r-fill', 'Written ' + mb + ' MB of 150');
    }
    var back = await (await c.match('fill/14')).blob();
    readBack = back.size === 10485760;
  } catch (e) { err = e && e.message ? e.message : String(e); }
  try { await caches.delete('li-test-fill'); } catch (e) {}
  R.fill = { time: now(), megabytesWritten: mb, readBack: readBack, error: err, seconds: Math.round((Date.now() - t0) / 1000), standalone: standalone() };
  $('b-fill').disabled = false;
  save(); showFill();
}
function showFill() {
  var f = R.fill; if (!f) return;
  show('r-fill', 'Wrote ' + f.megabytesWritten + ' MB in ' + f.seconds + ' s. Read back: ' + (f.readBack ? 'yes' : 'no') +
    (f.error ? '\nStopped with: ' + f.error : ''), f.megabytesWritten === 150 && f.readBack ? 'ok' : 'bad');
}

// ---------- start ----------
function copyResults() {
  var o = $('out'); o.focus(); o.select(); o.setSelectionRange(0, o.value.length);
  var done = false;
  try { done = document.execCommand('copy'); } catch (e) {}
  if (!done && navigator.clipboard) navigator.clipboard.writeText(o.value);
  $('b-copy').textContent = 'Copied';
}
async function start() {
  buildTiles();
  $('b-tap').addEventListener('touchstart', tapTest, { passive: false });
  $('b-tap').addEventListener('mousedown', tapTest);
  $('b-music').addEventListener('click', toggleMusic);
  $('b-blip').addEventListener('click', blip);
  $('b-drag').addEventListener('click', measureDrag);
  $('b-pack').addEventListener('click', packDownload);
  $('b-play').addEventListener('click', packPlay);
  $('b-clear').addEventListener('click', packClear);
  $('b-fill').addEventListener('click', fillTest);
  $('b-copy').addEventListener('click', copyResults);
  var js = document.querySelectorAll('[data-judge]');
  for (var i = 0; i < js.length; i++) js[i].addEventListener('click', judge);
  await load();
  try { await report(); } catch (e) { show('r-report', 'Report failed: ' + e.message, 'bad'); }
  try { await survive(); } catch (e) { show('r-survive', 'Check failed: ' + e.message, 'bad'); }
  try { await packStatus(); } catch (e) { show('r-pack', 'Check failed: ' + e.message, 'bad'); }
  showSessions(); showDrag(); showFill();
  if (R.judged.latency) show('r-latency', 'You chose: ' + R.judged.latency + '\n' + (R.judged.latencyInfo || ''), R.judged.latency === 'together' ? 'ok' : 'bad');
  if (R.judged.overlap) show('r-overlap', 'You chose: ' + R.judged.overlap, R.judged.overlap === 'clean' ? 'ok' : 'bad');
  save();
}
window.addEventListener('error', function (e) {
  var o = $('out'); if (o) o.value = 'Page error: ' + e.message + ' (line ' + e.lineno + ')\n' + o.value;
});
start();
