/* Sere discovery preview. Dependency-free; external reference links are opt-in. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalise = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const safeSource = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const original = {id:'lagoon-01',title:'Lagoon 01',artist:'Sere Studio',credit:'Original computer-sequenced composition and synthesis for Sere. No samples or vocals.',source:null};
  const records = [original, ...(window.SONGS || [])];
  const titles = ['lagoon\n01','Meda\nDau Doka','Isa\nLei','Bula\nMaleya','Loma\nni Buca'];
  const categories = ['ORIGINAL SESSION','NATIONAL ANTHEM','FAREWELL & CONNECTION','SONG & MEMORY','LAND & BELONGING'];
  let filter = 'all', saved = new Set(), scene = 'lagoon', toastTimer, dialogTrigger;
  const storageKey = 'sere.discovery.saved.v1';
  try { const stored = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(stored)) saved = new Set(stored.filter(id => records.some(s => s.id === id))); } catch { /* Browsing works with storage blocked. */ }
  const audio = $('audio');
  audio.volume = .7;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let motionPaused = reduced.matches;
  let context, analyser, bins, frame = 0;
  const canvas = $('visualiser'), ctx = canvas.getContext('2d');
  const isAvailable = song => song.id === original.id;
  const rights = song => window.SERE_RIGHTS?.[song.id] || {status:'pending',note:'Rights evidence has not been recorded for this material.'};
  const notify = text => { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); };
  function updateSavedCount() {
    $('saved-count').textContent = saved.size;
    $('hero-discover').innerHTML = `${saved.size ? 'Open your collection' : 'Explore available music'} <span aria-hidden="true">↗</span>`;
  }
  function saveSong(id) {
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    let persistent = true;
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); } catch { persistent = false; }
    updateSavedCount();
    document.querySelectorAll('[data-save]').forEach(button => {
      if (button.dataset.save === id) {
        const song = records.find(s => s.id === id);
        button.setAttribute('aria-pressed', String(saved.has(id)));
        button.setAttribute('aria-label', `${saved.has(id) ? 'Remove' : 'Save'} ${song.title}${saved.has(id) ? ' from collection' : ' to collection'}`);
        button.textContent = button.classList.contains('save-button') ? (saved.has(id) ? '♥' : '♡') : (saved.has(id) ? 'Saved ♥' : 'Save to collection ♡');
      }
    });
    if (filter === 'saved') { render(); if (!$('song-dialog').open) document.querySelector('[data-filter="saved"]').focus(); }
    notify(`${saved.has(id) ? 'Saved to' : 'Removed from'} your collection${persistent ? '' : ' · for this visit only'}`);
  }
  function card(song) {
    const i = records.indexOf(song), available = isAvailable(song), name = esc(song.title);
    return `<article class="song-card" aria-labelledby="title-${esc(song.id)}"><div class="cover-wrap"><button class="cover cover-${i % 5}" data-open="${esc(song.id)}" aria-label="Explore ${name}"><span class="cover-type">${esc(categories[i] || 'FIJIAN SONG')}</span><span class="cover-letter" aria-hidden="true">${esc(titles[i] || song.title)}</span><span class="cover-title" aria-hidden="true">${available ? '▶' : '↗'}</span></button><button class="save-button" data-save="${esc(song.id)}" aria-label="${saved.has(song.id) ? 'Remove' : 'Save'} ${name}${saved.has(song.id) ? ' from collection' : ' to collection'}" aria-pressed="${saved.has(song.id)}">${saved.has(song.id) ? '♥' : '♡'}</button></div><div class="card-topline"><h3><button class="song-title" id="title-${esc(song.id)}" data-open="${esc(song.id)}">${name}</button></h3></div><p class="artist">${esc(song.artist)}</p><span class="badge ${available ? 'available' : ''}">${available ? 'Original · available to play' : 'Rights pending · song story'}</span></article>`;
  }
  function render() {
    const terms = normalise($('q').value.trim()).split(/\s+/).filter(Boolean);
    const result = records.filter(song => {
      const haystack = normalise([song.title,song.artist,song.credit,categories[records.indexOf(song)]].join(' '));
      return terms.every(t => haystack.includes(t)) && (filter === 'all' || filter === 'saved' && saved.has(song.id) || filter === 'available' && isAvailable(song) || filter === 'pending' && !isAvailable(song));
    });
    if ($('sort').value === 'az') result.sort((a,b) => a.title.localeCompare(b.title));
    $('songs').innerHTML = result.map(card).join('');
    $('count').textContent = `${result.length} ${result.length === 1 ? 'song' : 'songs'}${filter === 'saved' ? ' saved' : ' to explore'}`;
    $('empty').hidden = result.length !== 0;
    $('empty-copy').textContent = filter === 'saved' && !saved.size ? 'Tap a heart on a song to start your collection. Saved songs stay in this browser.' : 'Try another title or artist, or explore the whole collection.';
    $('clear-search').hidden = !$('q').value;
  }
  function setFilter(value) {
    filter = value;
    document.querySelectorAll('[data-filter]').forEach(button => { const active = button.dataset.filter === filter; button.setAttribute('aria-pressed', String(active)); button.classList.toggle('active', active); });
    render();
  }
  function openSong(id, trigger) {
    const song = records.find(s => s.id === id);
    if (!song) return;
    const available = isAvailable(song), reference = safeSource(song.source), policy = rights(song);
    dialogTrigger = trigger || document.activeElement;
    $('dialog-content').innerHTML = `<p class="eyebrow">${available ? 'SERE ORIGINAL / 001' : 'FIJIAN SONG / CATALOGUE'}</p><h2 id="dialog-title">${esc(song.title)}</h2><span class="badge ${available ? 'available' : ''}">${available ? 'Original · available to play' : 'Lyrics & recording rights pending'}</span><dl><dt>Artist / tradition</dt><dd>${esc(song.artist)}</dd><dt>Credit</dt><dd>${esc(song.credit || 'Credit not yet verified')}</dd></dl>${available ? '<p class="notice">An original 24-second instrumental: soft keys, warm bass and a gentle electronic pulse. Created for Sere, with no vocals or samples of existing recordings.</p><p>Choose Lagoon, Sunset or Night in the listening session to change the view. This is a new composition, not a recording of a traditional Fijian song.</p>' : `<div class="notice"><strong>A song story, for now.</strong><p>${esc(policy.note)}</p><p>Explore the reference and credits while we verify permission for lyrics, translations and recordings. No recording is hosted or played for this song.</p></div>`}${reference ? `<p><a href="${esc(reference)}" target="_blank" rel="noopener noreferrer">Open credited reference <span aria-hidden="true">↗</span><span class="sr-only"> (opens in new tab)</span></a></p>` : ''}<div class="dialog-actions">${available ? '<button class="button primary" id="dialog-play" type="button">Listen to Lagoon 01 <span aria-hidden="true">▶</span></button><a class="chip" href="assets/lagoon-01.mp3" download="Sere-Lagoon-01.mp3">Download original audio ↓</a>' : ''}<button class="chip" data-save="${esc(song.id)}" aria-label="${saved.has(id) ? 'Remove' : 'Save'} ${esc(song.title)}${saved.has(id) ? ' from collection' : ' to collection'}" aria-pressed="${saved.has(id)}">${saved.has(id) ? 'Saved ♥' : 'Save to collection ♡'}</button></div>`;
    if (!$('song-dialog').open) $('song-dialog').showModal();
    $('close-dialog').focus();
    history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  }
  function closeSong() { $('song-dialog').close(); }
  $('song-dialog').addEventListener('close', () => {
    if (records.some(s => `#${encodeURIComponent(s.id)}` === location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (dialogTrigger?.isConnected) dialogTrigger.focus(); else $('q').focus();
  });
  $('close-dialog').addEventListener('click', closeSong);
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.save) saveSong(button.dataset.save);
    if (button.dataset.open) openSong(button.dataset.open, button);
    if (button.dataset.filter) setFilter(button.dataset.filter);
    if (button.dataset.scene) {
      scene = button.dataset.scene;
      $('session-visual').dataset.scene = scene;
      document.querySelectorAll('[data-scene]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      draw();
    }
    if (button.id === 'dialog-play') { closeSong(); toggleAudio(true); }
  });
  function showDiscovery(value) {
    $('q').value = '';
    setFilter(value);
    $('discover').scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth'});
    document.querySelector(`[data-filter="${value}"]`).focus({preventScroll:true});
  }
  $('saved-nav').addEventListener('click', () => showDiscovery('saved'));
  $('hero-discover').addEventListener('click', event => { event.preventDefault(); showDiscovery(saved.size ? 'saved' : 'available'); });
  $('q').addEventListener('input', render);
  $('clear-search').addEventListener('click', () => { $('q').value = ''; render(); $('q').focus(); });
  $('sort').addEventListener('change', render);
  $('reset').addEventListener('click', () => { $('q').value = ''; setFilter('all'); $('q').focus(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('song-dialog').open) { event.preventDefault(); $('q').focus(); }
    if (event.key === 'Escape' && document.activeElement === $('q')) { $('q').value = ''; render(); }
  });
  const formatTime = value => `${Math.floor((Number.isFinite(value) ? value : 0)/60)}:${String(Math.floor((Number.isFinite(value) ? value : 0)%60)).padStart(2,'0')}`;
  async function toggleAudio(forcePlay = false) {
    if (!audio.paused && !forcePlay) { audio.pause(); return; }
    try {
      if (!context && (window.AudioContext || window.webkitAudioContext)) {
        try {
          context = new (window.AudioContext || window.webkitAudioContext)();
          analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .8;
          const source = context.createMediaElementSource(audio); source.connect(analyser); analyser.connect(context.destination);
          bins = new Uint8Array(analyser.frequencyBinCount);
        } catch { analyser = null; }
      }
      if (context?.state === 'suspended') await context.resume();
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
    } catch { notify('Audio could not start. Check your connection and tap play to retry.'); }
  }
  ['hero-play','art-play','session-play','player-play'].forEach(id => $(id).addEventListener('click', () => toggleAudio()));
  function syncPlayback() {
    const playing = !audio.paused && !audio.ended;
    document.body.classList.toggle('is-playing', playing);
    $('player-play').textContent = playing ? 'Ⅱ' : '▶';
    $('player-play').setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} Lagoon 01`);
    $('art-play').textContent = playing ? 'Ⅱ' : '▶'; $('art-play').setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} Lagoon 01`);
    $('hero-play').innerHTML = `<span class="play-round" aria-hidden="true">${playing ? 'Ⅱ' : '▶'}</span> ${playing ? 'Pause island escape' : 'A little island escape'}`;
    $('session-play').innerHTML = `${playing ? 'Pause' : 'Play'} Lagoon 01 <span aria-hidden="true">${playing ? 'Ⅱ' : '▶'}</span>`;
    $('visual-prompt').textContent = playing ? (motionPaused ? 'Lagoon 01 is playing · visuals paused' : 'The view moves with the music') : 'Press play to bring the view to life';
    cancelAnimationFrame(frame); frame = 0; draw();
  }
  ['play','pause','ended'].forEach(event => audio.addEventListener(event, syncPlayback));
  audio.addEventListener('error', () => { notify('The original audio could not load. Check your connection and try again.'); });
  audio.addEventListener('loadedmetadata', () => { $('seek').max = audio.duration; $('duration').textContent = formatTime(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    $('elapsed').textContent = formatTime(audio.currentTime); $('seek').value = audio.currentTime;
    $('seek').setAttribute('aria-valuetext', `${Math.floor(audio.currentTime/60)} minutes ${Math.floor(audio.currentTime%60)} seconds`);
  });
  $('seek').addEventListener('input', () => { if (Number.isFinite(audio.duration)) audio.currentTime = Number($('seek').value); });
  $('volume').addEventListener('input', () => { audio.volume = Number($('volume').value); if (audio.volume > 0) audio.muted = false; syncVolume(); });
  function syncVolume() { const muted = audio.muted || audio.volume === 0; $('mute').textContent = muted ? '×' : '♪'; $('mute').setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio'); $('mute').setAttribute('aria-pressed', String(muted)); }
  $('mute').addEventListener('click', () => { if (audio.volume === 0) { audio.volume = .7; $('volume').value = .7; audio.muted = false; } else audio.muted = !audio.muted; syncVolume(); });
  function applyMotion() {
    document.body.classList.toggle('motion-paused', motionPaused);
    $('motion').setAttribute('aria-pressed', String(motionPaused)); $('motion').textContent = motionPaused ? 'Resume visuals' : 'Pause visuals';
    syncPlayback();
  }
  $('motion').addEventListener('click', () => { motionPaused = !motionPaused; applyMotion(); });
  reduced.addEventListener('change', event => { motionPaused = event.matches; applyMotion(); });
  function draw() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    const animated = !audio.paused && !audio.ended && !motionPaused && !document.hidden && analyser;
    if (animated) analyser.getByteFrequencyData(bins);
    ctx.strokeStyle = scene === 'sunset' ? '#ffe0a6' : scene === 'night' ? '#a6dcd2' : '#d4e7aa';
    ctx.lineWidth = 2;
    for (let i=0;i<48;i++) {
      const strength = animated ? bins[i] / 255 : .08 + .035 * Math.sin(i*.45);
      const height = 7 + strength * (h-25);
      ctx.beginPath(); ctx.moveTo(i*(w/48)+4,h/2-height/2); ctx.lineTo(i*(w/48)+4,h/2+height/2); ctx.stroke();
    }
    if (animated && !frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(frame); frame=0; draw(); });
  window.addEventListener('storage', event => { if (event.key === storageKey) { try { const data = JSON.parse(event.newValue || '[]'); saved = new Set(Array.isArray(data) ? data.filter(id => records.some(s => s.id === id)) : []); updateSavedCount(); render(); } catch { /* Invalid data cannot break discovery. */ } } });
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (records.some(s => s.id === id)) openSong(id); });
  updateSavedCount(); render(); applyMotion();
  if (records.some(s => s.id === location.hash.slice(1))) openSong(location.hash.slice(1));
})();

