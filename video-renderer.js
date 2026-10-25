const SIZES = {
  landscape: [1280, 720],
  portrait: [720, 1280],
  square: [960, 960],
};

const THEMES = {
  lagoon: { top: '#072c39', bottom: '#061b2b', glow: '#1c7180', accent: '#7ce8cc', ink: '#f5fff9', muted: '#a3bfca' },
  sunset: { top: '#713c49', bottom: '#251e37', glow: '#bf6d59', accent: '#ffd49c', ink: '#fff7ee', muted: '#dbc0c6' },
  midnight: { top: '#24234d', bottom: '#0c142b', glow: '#554485', accent: '#c4b2ff', ink: '#faf6ff', muted: '#b1b4d1' },
};

// A media element can only belong to one MediaElementAudioSourceNode.
// Keep its speaker route alive so preview playback still works after export.
const AUDIO_GRAPHS = new WeakMap();

const finite = (number, fallback = 0) => Number.isFinite(Number(number)) ? Number(number) : fallback;
const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const clock = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
const abortError = (signal) => signal?.reason instanceof Error
  ? signal.reason : new DOMException('Video export cancelled.', 'AbortError');

function audioGraph(audio) {
  if (globalThis.DimauMusicVisuals) return globalThis.DimauMusicVisuals.audioGraph(audio);
  let graph = AUDIO_GRAPHS.get(audio);
  if (!graph) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser cannot mix audio into video. Try current Chrome or Edge.');
    const context = new AudioContextClass();
    try {
      const source = context.createMediaElementSource(audio);
      source.connect(context.destination);
      graph = { context, source };
      AUDIO_GRAPHS.set(audio, graph);
    } catch (error) {
      context.close().catch(() => {});
      throw error;
    }
  }
  if (graph.context.state === 'closed') throw new Error('The audio session has closed. Reload the page and select the track again.');
  return graph;
}

function waitForAudio(audio, eventName, ready, signal, timeout = 20000) {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const clean = () => {
      clearTimeout(timer);
      audio.removeEventListener(eventName, changed);
      audio.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
    };
    const finish = (error) => { clean(); error ? reject(error) : resolve(); };
    const changed = () => { if (ready()) finish(); };
    const failed = () => finish(new Error('The selected audio could not be decoded. Try an MP3, M4A, OGG or WAV file supported by your browser.'));
    const cancelled = () => finish(abortError(signal));
    audio.addEventListener(eventName, changed);
    audio.addEventListener('error', failed);
    signal.addEventListener('abort', cancelled, { once: true });
    timer = setTimeout(() => finish(new Error('The audio took too long to load or seek. Try selecting it again.')), timeout);
    changed();
  });
}

// MediaRecorder's streaming WebM commonly omits Info.Duration. Add the nominal
// track duration using Matroska's Segment Ticks, leaving every encoded packet
// unchanged. This deliberately accepts recorder output, not arbitrary indexed
// WebM edits: offsets/checksums must never silently become stale.
// Format references: matroska.org/technical/elements.html and RFC 8794.
export async function finalizeWebmDuration(blob, durationSeconds, { signal } = {}) {
  if (!/webm/i.test(blob.type)) return blob;
  if (signal?.aborted) throw abortError(signal);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('The video has no usable duration.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (signal?.aborted) throw abortError(signal);
  const invalid = () => new Error('This browser produced WebM metadata that could not be finalized safely. Try current Chrome or Edge.');
  const element = (offset, limit) => {
    if (offset >= limit || !bytes[offset]) throw invalid();
    let idLength = 1, marker = 0x80;
    while (!(bytes[offset] & marker)) { marker >>= 1; idLength++; }
    if (idLength > 4 || offset + idLength >= limit) throw invalid();
    let id = 0;
    for (let i = 0; i < idLength; i++) id = id * 256 + bytes[offset + i];
    const sizeOffset = offset + idLength;
    let sizeLength = 1;
    marker = 0x80;
    if (!bytes[sizeOffset]) throw invalid();
    while (!(bytes[sizeOffset] & marker)) { marker >>= 1; sizeLength++; }
    if (sizeLength > 8 || sizeOffset + sizeLength > limit) throw invalid();
    let value = BigInt(bytes[sizeOffset] & (marker - 1));
    for (let i = 1; i < sizeLength; i++) value = (value << 8n) | BigInt(bytes[sizeOffset + i]);
    const unknown = value === (1n << BigInt(sizeLength * 7)) - 1n;
    if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
    const dataStart = sizeOffset + sizeLength;
    const size = unknown ? null : Number(value);
    const end = unknown ? limit : dataStart + size;
    if (end > limit || end < dataStart) throw invalid();
    return { id, offset, sizeOffset, sizeLength, dataStart, size, end };
  };
  const integer = (part) => {
    if (part.size === null || part.size > 8) throw invalid();
    let value = 0;
    for (let at = part.dataStart; at < part.end; at++) value = value * 256 + bytes[at];
    return value;
  };
  const sizeBytes = (value, minimumLength) => {
    let length = minimumLength;
    while (BigInt(value) >= (1n << BigInt(length * 7)) - 1n) length++;
    if (length > 8) throw invalid();
    const encoded = new Uint8Array(length);
    let remaining = BigInt(value);
    for (let i = length - 1; i >= 0; i--) { encoded[i] = Number(remaining & 255n); remaining >>= 8n; }
    encoded[0] |= 1 << (8 - length);
    return encoded;
  };
  let segment;
  for (let at = 0; at < bytes.length;) {
    const part = element(at, bytes.length);
    if (part.id === 0x18538067) { segment = part; break; }
    if (part.size === null) throw invalid();
    at = part.end;
  }
  if (!segment) throw invalid();
  let info;
  for (let at = segment.dataStart; at < segment.end;) {
    const part = element(at, segment.end);
    if (part.id === 0x1549A966) { info = part; break; }
    if (part.size === null) throw invalid();
    at = part.end;
  }
  if (!info || info.size === null) throw invalid();
  let scale = 1000000, durationElement, checksum = false;
  for (let at = info.dataStart; at < info.end;) {
    const part = element(at, info.end);
    if (part.size === null) throw invalid();
    if (part.id === 0x2AD7B1) scale = integer(part);
    if (part.id === 0x4489) durationElement = part;
    if (part.id === 0xBF) checksum = true;
    at = part.end;
  }
  if (!(scale > 0) || !Number.isFinite(scale)) throw invalid();
  if (durationElement) {
    const { dataStart, size } = durationElement;
    const view = new DataView(bytes.buffer);
    if (size !== 4 && size !== 8) throw invalid();
    const existing = size === 4 ? view.getFloat32(dataStart) : view.getFloat64(dataStart);
    if (Number.isFinite(existing) && existing > 0) return blob;
    if (checksum) throw invalid();
    const value = durationSeconds * 1000000000 / scale;
    if (size === 4) view.setFloat32(dataStart, value); else view.setFloat64(dataStart, value);
    return new Blob([bytes], { type: blob.type });
  }
  if (checksum) throw invalid();
  const levelOne = new Set([0x114D9B74, 0x1549A966, 0x1654AE6B, 0x1F43B675, 0x1C53BB6B, 0x1941A469, 0x1043A770, 0x1254C367]);
  for (let at = segment.dataStart; at < segment.end;) {
    const part = element(at, segment.end);
    if (part.id === 0x114D9B74 || part.id === 0x1C53BB6B || part.id === 0xBF) throw invalid();
    if (part.id === 0x1F43B675) {
      let childAt = part.dataStart;
      while (childAt < part.end) {
        const child = element(childAt, part.end);
        if (part.size === null && levelOne.has(child.id)) break;
        if (child.id === 0xA7 || child.size === null) throw invalid();
        childAt = child.end;
      }
      at = childAt;
    } else {
      if (part.size === null) throw invalid();
      at = part.end;
    }
  }
  const durationData = new Uint8Array(11);
  durationData.set([0x44, 0x89, 0x88]);
  new DataView(durationData.buffer).setFloat64(3, durationSeconds * 1000000000 / scale);
  const newInfoSize = sizeBytes(info.size + durationData.length, info.sizeLength);
  const delta = durationData.length + newInfoSize.length - info.sizeLength;
  const newSegmentSize = segment.size === null
    ? bytes.subarray(segment.sizeOffset, segment.dataStart)
    : sizeBytes(segment.size + delta, segment.sizeLength);
  return new Blob([
    bytes.subarray(0, segment.sizeOffset), newSegmentSize,
    bytes.subarray(segment.dataStart, info.sizeOffset), newInfoSize,
    bytes.subarray(info.dataStart, info.end), durationData, bytes.subarray(info.end),
  ], { type: blob.type });
}

/** Dependency-free canvas preview and real audio/video export. Times are seconds. */
export class LyricRenderer {
  constructor(canvas, audio, { onProgress, onState } = {}) {
    this.canvas = canvas;
    this.audio = audio;
    this.context = canvas?.getContext('2d');
    if (!this.context || !audio) throw new Error('A canvas and audio element are required.');
    this.onProgress = onProgress;
    this.onState = onState;
    this.settings = { cues: [], title: 'Your song', artist: '', theme: 'lagoon', aspect: 'landscape' };
    this._activeExport = null;
    this._frame = null;
    this._destroyed = false;
    this._update = () => { this._draw(); if (!audio.paused) this._animate(); };
    this._events = ['timeupdate', 'seeked', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended'];
    this._events.forEach((name) => audio.addEventListener(name, this._update));
    this.configure({});
  }

  configure(options = {}) {
    if (this._destroyed) return;
    const next = { ...this.settings, ...options };
    if (!THEMES[next.theme]) next.theme = 'lagoon';
    if (!SIZES[next.aspect]) next.aspect = 'landscape';
    next.title = String(next.title || 'Your song');
    next.artist = String(next.artist || '');
    next.cues = (Array.isArray(next.cues) ? next.cues : []).map((cue) => ({
      start: Math.max(0, finite(cue.start)),
      end: Number.isFinite(Number(cue.end)) ? Number(cue.end) : Infinity,
      text: String(cue.text || '').trim(),
    })).filter((cue) => cue.text && cue.end > cue.start).sort((a, b) => a.start - b.start);
    const [width, height] = SIZES[next.aspect];
    if (this._activeExport && (width !== this.canvas.width || height !== this.canvas.height)) {
      throw new Error('Wait for the export to finish before changing the video shape.');
    }
    this.settings = next;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this._draw();
  }

  render(options) {
    if (options) this.configure(options);
    else this._draw();
  }

  _animate() {
    if (this._frame !== null || this._destroyed) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._draw();
      if (!this.audio.paused || this._activeExport) this._animate();
    });
  }

  _wrap(text, maxWidth, maxLines = Infinity) {
    const context = this.context;
    const lines = [];
    for (const paragraph of String(text).split(/\r?\n/)) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = '';
        }
        // Long unbroken words must also stay inside the video safe area.
        for (const letter of word) {
          const candidateWord = line + letter;
          if (line && context.measureText(candidateWord).width > maxWidth) {
            lines.push(line);
            line = letter;
          } else line = candidateWord;
        }
        line += ' ';
      }
      lines.push(line.trim());
    }
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1].trim();
      while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      kept[maxLines - 1] = `${last}…`;
      return kept;
    }
    return lines;
  }

  _draw() {
    if (this._destroyed) return;
    const { canvas, context: ctx, audio } = this;
    const settings = this._exportSettings || this.settings;
    const theme = THEMES[settings.theme];
    const w = canvas.width, h = canvas.height, unit = Math.min(w, h);
    const time = Math.max(0, finite(audio.currentTime));
    const duration = finite(audio.duration, Math.max(1, ...settings.cues.map((cue) => finite(cue.end, cue.start + 4))));
    const margin = unit * 0.075;
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, theme.top);
    gradient.addColorStop(1, theme.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.84, h * 0.2, 0, w * 0.84, h * 0.2, unit * 0.8);
    glow.addColorStop(0, `${theme.glow}99`);
    glow.addColorStop(1, `${theme.glow}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = `${theme.accent}17`;
    ctx.lineWidth = 1.5;
    for (let line = 0; line < 5; line++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = h * 0.76 + line * unit * 0.022 + Math.sin(x / unit * 5 + time * 0.35 + line * 0.35) * unit * 0.08;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    if (settings.visuals?.enabled && globalThis.DimauMusicVisuals) {
      ctx.save(); ctx.globalAlpha = .35;
      globalThis.DimauMusicVisuals.draw(ctx, w, h, settings.visuals, this._visualState ||= {}, globalThis.DimauMusicVisuals.sample(audio), false);
      ctx.restore();
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.accent;
    ctx.font = `700 ${unit * 0.022}px system-ui, sans-serif`;
    ctx.fillText('S E R E  /  LYRIC STUDIO', margin, margin);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.font = `500 ${unit * 0.018}px system-ui, sans-serif`;
    ctx.fillText('MADE WITH SERE', w - margin, h - margin);

    ctx.textAlign = 'center';
    ctx.fillStyle = theme.ink;
    ctx.font = `600 ${unit * 0.038}px system-ui, sans-serif`;
    const titleLines = this._wrap(settings.title, w - margin * 2, 2);
    titleLines.forEach((line, index) => ctx.fillText(line, w / 2, h * 0.2 + index * unit * 0.046));
    if (settings.artist) {
      ctx.fillStyle = theme.muted;
      ctx.font = `400 ${unit * 0.024}px system-ui, sans-serif`;
      ctx.fillText(this._wrap(settings.artist, w - margin * 2, 1)[0], w / 2, h * 0.2 + titleLines.length * unit * 0.046 + unit * 0.012);
    }

    let index = -1;
    settings.cues.forEach((cue, i) => { if (cue.start <= time && time < cue.end) index = i; });
    const cue = settings.cues[index];
    const upcoming = cue ? settings.cues[index + 1] : settings.cues.find((item) => item.start > time);
    const text = cue?.text || (settings.cues.length ? '♪' : 'Your lyrics, your moment.');
    let fontSize = unit * 0.068;
    let lines;
    do {
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      lines = this._wrap(text, w - margin * 2.4);
      if (lines.length * fontSize * 1.34 <= h * 0.36 || fontSize <= unit * 0.027) break;
      fontSize *= 0.9;
    } while (true);
    const lineHeight = fontSize * 1.34;
    const top = h * 0.5 - (lines.length - 1) * lineHeight / 2;
    const cueEnd = Math.min(cue?.end ?? duration, upcoming?.start ?? duration, duration);
    const sweep = cue ? clamp((time - cue.start) / Math.max(0.01, cueEnd - cue.start), 0, 1) : 0;
    const widths = lines.map((line) => ctx.measureText(line).width);
    let highlightWidth = widths.reduce((sum, width) => sum + width, 0) * sweep;
    lines.forEach((line, i) => {
      const y = top + i * lineHeight;
      ctx.fillStyle = theme.ink;
      ctx.fillText(line, w / 2, y);
      if (cue && highlightWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(w / 2 - widths[i] / 2, y - lineHeight / 2, Math.min(widths[i], highlightWidth), lineHeight);
        ctx.clip();
        ctx.fillStyle = theme.accent;
        ctx.fillText(line, w / 2, y);
        ctx.restore();
        highlightWidth -= widths[i];
      }
    });
    if (upcoming) {
      ctx.font = `500 ${unit * 0.027}px system-ui, sans-serif`;
      ctx.fillStyle = theme.muted;
      const nextLines = this._wrap(upcoming.text, w - margin * 2.5, 2);
      const nextTop = Math.min(h * 0.79, top + lines.length * lineHeight + unit * 0.055);
      nextLines.forEach((line, i) => ctx.fillText(line, w / 2, nextTop + i * unit * 0.036));
    }
    const progressY = h - margin - unit * 0.065;
    ctx.fillStyle = `${theme.ink}25`;
    ctx.fillRect(margin, progressY, w - margin * 2, unit * 0.005);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(margin, progressY, (w - margin * 2) * clamp(time / Math.max(0.01, duration), 0, 1), unit * 0.005);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.muted;
    ctx.font = `500 ${unit * 0.02}px system-ui, sans-serif`;
    ctx.fillText(`${clock(time)} / ${clock(duration)}`, margin, h - margin);
  }

  _state(state, message) { this.onState?.({ state, ...(message ? { message } : {}) }); }

  async export({ signal, onProgress } = {}) {
    if (this._destroyed) throw new Error('The video preview has been closed.');
    if (this._activeExport) throw new Error('A video is already being exported.');
    if (!globalThis.MediaRecorder || !this.canvas.captureStream || !globalThis.MediaStream) {
      throw new Error('Video recording is not supported in this browser. Try current Chrome or Edge.');
    }
    if (signal?.aborted) throw abortError(signal);
    if (!this.audio.currentSrc && !this.audio.src && !this.audio.srcObject) throw new Error('Choose an audio track before exporting.');
    if (!this.settings.cues.length) throw new Error('Add and time at least one lyric line before exporting.');
    const controller = new AbortController();
    this._activeExport = controller;
    const cancel = () => controller.abort(abortError(signal));
    signal?.addEventListener('abort', cancel, { once: true });
    const audio = this.audio;
    const previous = { currentTime: finite(audio.currentTime), paused: audio.paused, muted: audio.muted, volume: audio.volume, playbackRate: audio.playbackRate, loop: audio.loop, controls: audio.controls };
    this._exportSettings = { ...this.settings, cues: this.settings.cues.map((cue) => ({ ...cue })) };
    let graph, destination, canvasStream, stream, recorder;
    let result, failure, resumeMessage;
    const progress = (value) => { this.onProgress?.(value); onProgress?.(value); };
    try {
      this._state('preparing');
      // Resume within the user's export click, before waiting for media events.
      graph = audioGraph(audio);
      await graph.context.resume();
      await waitForAudio(audio, 'loadedmetadata', () => audio.readyState >= 1, controller.signal);
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) throw new Error('This track does not have a usable duration. Choose another audio file.');
      audio.pause();
      audio.loop = false;
      audio.playbackRate = 1;
      audio.muted = false;
      audio.volume = 1;
      audio.controls = false;
      audio.currentTime = 0;
      await waitForAudio(audio, 'seeked', () => !audio.seeking && Math.abs(audio.currentTime) < 0.03, controller.signal);
      this._draw();
      destination = graph.context.createMediaStreamDestination();
      graph.source.connect(destination);
      canvasStream = this.canvas.captureStream(30);
      stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) throw new Error('This browser could not capture both video and audio.');
      const candidates = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
      for (const mimeType of candidates) {
        if (!MediaRecorder.isTypeSupported(mimeType)) continue;
        try {
          recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4500000, audioBitsPerSecond: 192000 });
          break;
        } catch { /* The next supported container may work on this device. */ }
      }
      if (!recorder) throw new Error('No supported audio/video recording format was found. Try current Chrome or Edge.');
      progress(0);
      this._state('exporting');
      this._animate();
      const recorded = await this._record(recorder, controller.signal, progress);
      const mimeType = recorder.mimeType || recorded.type;
      const blob = await finalizeWebmDuration(recorded, audio.duration, { signal: controller.signal });
      result = { blob, mimeType, extension: /mp4/i.test(mimeType) ? 'mp4' : 'webm' };
      progress(1);
    } catch (error) {
      failure = error;
    } finally {
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* Already stopped by the browser. */ }
      }
      audio.pause();
      if (graph && destination) {
        try { graph.source.disconnect(destination); } catch { /* The route may already be disconnected. */ }
      }
      new Set([...(stream?.getTracks() || []), ...(canvasStream?.getTracks() || []), ...(destination?.stream.getTracks() || [])]).forEach((track) => track.stop());
      signal?.removeEventListener('abort', cancel);
      this._activeExport = null;
      this._exportSettings = null;
      audio.playbackRate = previous.playbackRate;
      audio.loop = previous.loop;
      audio.volume = previous.volume;
      audio.muted = previous.muted;
      audio.controls = previous.controls;
      try { audio.currentTime = previous.currentTime; } catch { /* A changed source may not be seekable. */ }
      if (!previous.paused && !this._destroyed) {
        try { await audio.play(); } catch { resumeMessage = 'Press play to resume your preview.'; }
      }
      this._draw();
    }
    if (failure) {
      this._state(failure.name === 'AbortError' ? 'cancelled' : 'error', failure.message);
      throw failure;
    }
    this._state('complete', resumeMessage);
    return result;
  }

  _record(recorder, signal, progress) {
    const audio = this.audio;
    return new Promise((resolve, reject) => {
      const chunks = [];
      let settled = false, ended = false, timer, deadline;
      const cleanup = () => {
        clearInterval(timer);
        clearTimeout(deadline);
        audio.removeEventListener('ended', finished);
        audio.removeEventListener('error', failedAudio);
        signal.removeEventListener('abort', cancelled);
        recorder.removeEventListener('dataavailable', data);
        recorder.removeEventListener('error', failedRecorder);
        recorder.removeEventListener('stop', stopped);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* No recording remains. */ } }
        reject(error);
      };
      const data = (event) => { if (event.data?.size) chunks.push(event.data); };
      const failedRecorder = (event) => fail(event.error || new Error('The browser stopped recording. Try a shorter track or close other busy tabs.'));
      const failedAudio = () => fail(new Error('Audio playback failed during export. Choose another audio file.'));
      const cancelled = () => fail(abortError(signal));
      const finished = () => {
        ended = true;
        this._draw();
        if (recorder.state !== 'inactive') recorder.stop();
      };
      const stopped = () => {
        if (settled) return;
        if (!ended) { fail(new Error('Recording stopped before the audio finished. Try exporting again.')); return; }
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (!blob.size) { fail(new Error('The browser produced an empty video. Try exporting in current Chrome or Edge.')); return; }
        settled = true;
        cleanup();
        resolve(blob);
      };
      recorder.addEventListener('dataavailable', data);
      recorder.addEventListener('error', failedRecorder);
      recorder.addEventListener('stop', stopped);
      audio.addEventListener('ended', finished);
      audio.addEventListener('error', failedAudio);
      signal.addEventListener('abort', cancelled, { once: true });
      if (signal.aborted) { cancelled(); return; }
      timer = setInterval(() => { this._draw(); progress(clamp(audio.currentTime / audio.duration, 0, 1)); }, 250);
      deadline = setTimeout(() => fail(new Error('The track stopped advancing. Keep this tab open and try exporting again.')), Math.min(2147483647, (audio.duration + 30) * 1000));
      try {
        recorder.start(250);
        audio.play().catch((error) => fail(new Error(`Audio could not start: ${error.message}`)));
      } catch (error) { fail(error); }
    });
  }

  destroy() {
    this._activeExport?.abort(new DOMException('Video preview closed.', 'AbortError'));
    this._destroyed = true;
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
    this._events.forEach((name) => this.audio.removeEventListener(name, this._update));
  }
}
