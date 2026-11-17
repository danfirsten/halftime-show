// A stand-in for Hulu's web player: a timeline of content and ad breaks, driven by query params.
// It never touches the network beyond its own two clips. Contract: fixture/README.md.
(function () {
  var params = new URLSearchParams(location.search);
  var unknownLength = params.get('unknownLength') === '1';
  var flicker = params.get('flicker') === '1';
  var wantFullscreen = params.get('fullscreen') === '1';

  // "10:30,60:90" -> [{start: 10, length: 30}, {start: 60, length: 90}], seconds since the page loaded.
  function parseBreaks(text) {
    if (!text) return [];
    return text.split(',').map(function (part) {
      var bits = part.split(':');
      return { start: Number(bits[0]), length: Number(bits[1]) };
    }).filter(function (b) { return isFinite(b.start) && isFinite(b.length) && b.length > 0 && b.start >= 0; });
  }

  var breaks = parseBreaks(params.get('breaks'));
  var video = document.getElementById('video');
  var adUi = document.getElementById('ad-ui');
  var countdown = document.getElementById('ad-countdown');
  var bar = document.querySelector('#ad-progress > div');
  var progress = document.getElementById('ad-progress');
  var status = document.querySelector('[data-fixture-status]');
  var player = document.getElementById('player');

  var t0 = performance.now();
  var manual = null; // {start, length} set by the control strip, in seconds since load
  var current = null;
  var shownSrc = 'content.webm';

  function now() { return (performance.now() - t0) / 1000; }

  function activeBreak(t) {
    if (manual && t >= manual.start && t < manual.start + manual.length) return manual;
    for (var i = 0; i < breaks.length; i++) {
      if (t >= breaks[i].start && t < breaks[i].start + breaks[i].length) return breaks[i];
    }
    return null;
  }

  function clock(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function setSrc(src) {
    if (shownSrc === src) return;
    shownSrc = src;
    video.src = src;
    video.play().catch(function () {});
  }

  function render() {
    var t = now();
    var b = activeBreak(t);
    var inBreak = !!b;
    var markersOn = inBreak;
    if (inBreak && flicker) markersOn = (t % 3) > 0.4; // dark for 400 ms in every 3 s
    if (!inBreak && flicker && t >= 5 && t < 5.6) markersOn = true; // one false flash, under a second

    setSrc(inBreak ? 'ad.webm' : 'content.webm');
    adUi.hidden = !markersOn;
    if (markersOn) {
      var left = b ? b.start + b.length - t : 0.5;
      var fraction = b ? (t - b.start) / b.length : 0;
      countdown.hidden = unknownLength;
      countdown.textContent = clock(left);
      bar.style.width = (fraction * 100).toFixed(1) + '%';
      progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    }
    player.dataset.state = inBreak ? 'ad' : 'content';
    status.textContent = inBreak ? 'Ad break' : 'Content';
    if (current !== b) current = b;
    window.fixtureState = { inBreak: inBreak, markersVisible: markersOn, elapsed: t, src: shownSrc };
  }

  document.getElementById('btn-start').addEventListener('click', function () {
    manual = { start: now(), length: 30 };
  });
  document.getElementById('btn-end').addEventListener('click', function () {
    manual = null;
    breaks = breaks.filter(function (b) { return !(now() >= b.start && now() < b.start + b.length); });
  });
  function goFull() {
    if (document.fullscreenElement) return;
    player.requestFullscreen().catch(function () {});
  }
  document.getElementById('btn-full').addEventListener('click', goFull);
  // Browsers only allow full screen after a gesture, so ?fullscreen=1 waits for the first one.
  if (wantFullscreen) {
    document.addEventListener('pointerdown', goFull, { once: true });
    document.addEventListener('keydown', goFull, { once: true });
  }

  render();
  setInterval(render, 100);
})();
