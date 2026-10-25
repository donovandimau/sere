import {parseLyrics, distribute, validateCues, secondsLabel, parseTime, toLrc, toVtt, toPlainLyrics} from './lyrics-core.js';
import {LyricRenderer} from './video-renderer.js';
import {createTranscriber} from './transcriber.js';

const $ = id => document.getElementById(id);
const audio = $('track');
let cues = [], tracks = [], trackIndex = -1, draftTiming = false, dirty = false, tapIndex = 0;
let openEnded = false;
let exportController, downloadUrl, working = false, transcribing = false, sourceVersion = 0;
let transcriptionRun;
let exportMessageFixed = false;
let automaticTitle = true;
let loadingRecording = false, recordingController;
const renderer = new LyricRenderer($('video-preview'), audio);
$('music-visuals').addEventListener('visualchange', event => {
  renderer.configure({visuals: event.detail}); invalidateVideo();
});
const transcriber = createTranscriber({onProgress: p => {
  $('transcribe-status').textContent = typeof p === 'string' ? p : (p?.message || 'Preparing speech model…');
}});
const allSongs = [...window.SONGS];
for (const song of window.CATALOGUE || []) {
  allSongs.push({...song, source: song.fijianUrl || song.sourceUrl});
}
allSongs.forEach((song, i) => {
  const option = new Option(`${song.title}${song.lyricsFijian ? ' · lyrics ready' : ` · ${song.artist || 'source link'}`}`, String(i));
  $('library-song').add(option);
});
function invalidateVideo() {
  exportMessageFixed = false;
  $('download-video').hidden = true;
  if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
}
function configure() {
  renderer.configure({cues, title: $('title').value || 'Your song', artist: $('artist').value, theme: $('theme').value, aspect: $('aspect').value});
}
function update() {
  for (const el of document.querySelectorAll('.editor input,.editor select,.editor textarea,.editor button,.timeline-panel button,.timeline-panel input')) el.disabled = working || transcribing || loadingRecording;
  for (const el of document.querySelectorAll('input[name="output"]')) el.disabled = working || transcribing || loadingRecording;
  for (const id of ['copy-lyrics','download-lyrics']) $(id).disabled = working || transcribing || loadingRecording || !toPlainLyrics($('lyrics').value);
  $('cancel-transcribe').disabled = false;
  $('cancel-source-audio').disabled = false;
  $('use-source-audio').disabled = working || transcribing || loadingRecording || !$('source-audio').options.length;
  const error = validateCues(cues, audio.duration);
  $('validation').textContent = dirty ? 'Build the timeline to apply your edited lyrics.' : error;
  $('export-video').disabled = !tracks[trackIndex] || !Number.isFinite(audio.duration) || !!audio.error || audio.readyState < 1 || !!error || dirty || working || transcribing || loadingRecording;
  $('tap').disabled = !cues.length || !tracks[trackIndex] || working || dirty || transcribing || loadingRecording;
  $('transcribe').disabled = !tracks[trackIndex] || !Number.isFinite(audio.duration) || working || transcribing || loadingRecording;
  if (!working && !exportMessageFixed) $('export-status').textContent = !tracks[trackIndex] ? 'Choose music to create your video.' : !cues.length ? 'Add lyrics and build a timeline to continue.' : dirty ? 'Build the timeline to apply your edited lyrics.' : error ? 'Check the line timing before creating a video.' : 'Ready to create your lyric video with audio.';
  configure();
}
function setOutput(mode) {
  const lyricsOnly = mode === 'lyrics';
  document.querySelector('.workspace').classList.toggle('lyrics-only', lyricsOnly);
  for (const el of document.querySelectorAll('[data-video-only]')) el.hidden = lyricsOnly;
  $('mode-status').textContent = lyricsOnly ? 'Upload your music, choose Transcribe audio, then review and copy or download the words. No video timing is needed.' : 'Add music and words, then sync and create your video. You can keep the lyrics too.';
}
for (const el of document.querySelectorAll('input[name="output"]')) el.addEventListener('change', () => setOutput(el.value));
function resetLyricsStatus() {
  $('lyrics-status').textContent = 'Review and edit the words here. Text downloads contain lyrics without timestamps.';
  $('copy-fallback').hidden = true; $('copy-fallback').value = '';
}
function table() {
  const fragment = document.createDocumentFragment();
  cues.forEach((cue, index) => {
    const row = document.createElement('tr'); row.dataset.index = index;
    if (index < tapIndex) row.classList.add('tapped');
    const numberCell = document.createElement('td'), seek = document.createElement('button');
    seek.type = 'button'; seek.textContent = index + 1; seek.setAttribute('aria-label', `Play line ${index+1}`);
    seek.addEventListener('click', () => { if (Number.isFinite(audio.duration)) audio.currentTime = cue.start; });
    numberCell.append(seek); row.append(numberCell);
    for (const key of ['start','end','text']) {
      const cell = document.createElement('td'), input = document.createElement('input');
      input.value = key === 'text' ? cue.text : secondsLabel(cue[key]);
      input.setAttribute('aria-label', `Line ${index+1} ${key}`);
      if (key === 'text') input.className = 'line-words'; else input.inputMode = 'decimal';
      input.disabled = working;
      input.addEventListener('change', () => {
        cue[key] = key === 'text' ? input.value : parseTime(input.value);
        draftTiming = false; openEnded = false; dirty = false; $('lyrics').value = cues.map(c => c.text).join('\n');
        resetLyricsStatus();
        invalidateVideo(); update();
      });
      cell.append(input); row.append(cell);
    }
    fragment.append(row);
  });
  $('timeline').replaceChildren(fragment); update();
}
function applyText() {
  if ($('lyrics').value.length > 200000) { $('validation').textContent = 'Use up to 200,000 characters in one lyrics project.'; return; }
  const result = parseLyrics($('lyrics').value, audio.duration);
  if (result.cues.length > 2000) { $('validation').textContent = 'Use up to 2,000 lyric lines in one project.'; return; }
  cues = result.cues; draftTiming = !result.timed; openEnded = !!result.openEnded; dirty = false; tapIndex = 0;
  if (openEnded && cues.length && Number.isFinite(audio.duration)) cues[cues.length-1].end = audio.duration;
  $('timing-note').textContent = result.timed ? 'Imported timings are ready to review. Play the track and adjust any line below.' : 'These timings are an estimate. Play the track and tap when each line starts, or edit the times below.';
  invalidateVideo(); table();
}
function message(text) { $('music-status').textContent = text; }
function cancelTranscription() { if (transcriptionRun) transcriptionRun.cancelled = true; transcriber.cancel(); }
function saveTrack() {
  if(!tracks[trackIndex]) return;
  tracks[trackIndex].project = projectSnapshot();
}
function projectSnapshot() {
  return {
    cues:cues.map(c=>({...c})),lyrics:$('lyrics').value,draftTiming,openEnded,dirty,tapIndex,automaticTitle,
    values:Object.fromEntries(['title','artist','theme','aspect','library-song'].map(id=>[id,$(id).value])),
    source:$('library-source').cloneNode(true),note:$('timing-note').textContent,
  };
}
function selectTrack(index) {
  if (working || index < 0 || !tracks[index] || index === trackIndex) return;
  const hadTrack = trackIndex >= 0;
  saveTrack();
  cancelTranscription(); sourceVersion++; audio.pause(); trackIndex = index;
  const project = tracks[index].project;
  if(project) {
    cues=project.cues.map(c=>({...c})); draftTiming=project.draftTiming; openEnded=project.openEnded;
    dirty=project.dirty; tapIndex=project.tapIndex; automaticTitle=project.automaticTitle;
    for(const [id,value] of Object.entries(project.values)) $(id).value=value;
    $('lyrics').value=project.lyrics;
    $('library-source').replaceChildren(...Array.from(project.source.childNodes,n=>n.cloneNode(true)));
    $('timing-note').textContent=project.note;
  } else if(hadTrack) {
    cues=[]; draftTiming=false; openEnded=false; dirty=false; tapIndex=0; automaticTitle=true;
    for(const id of ['title','artist','lyrics','library-song']) $(id).value='';
    $('library-source').replaceChildren();
    $('timing-note').textContent='Add lyrics for this track. Each queued song keeps its own words and timing.';
  }
  sourceAudioOptions();
  resetLyricsStatus();
  $('transcribe-status').textContent = '';
  $('queue').value = String(index);
  audio.src = tracks[index].url; audio.load();
  if (automaticTitle) $('title').value = tracks[index].file.name.replace(/\.[^.]+$/, '');
  if(!project && !cues.length) {
    const normalized=s=>s.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const stem=normalized(tracks[index].file.name.replace(/\.[^.]+$/,''));
    const matches=allSongs.map((song,i)=>({song,i})).filter(({song})=>normalized(song.title)===stem);
    const match=matches.find(({song})=>song.lyricsFijian) || (matches.length===1?matches[0]:null);
    if(match){$('library-song').value=String(match.i);useSong(match.i);}
  }
  message(`Loading ${tracks[index].file.name}…`); invalidateVideo(); table();
}
function addTracks(files, {initialProject} = {}) {
  if (working) return;
  let first = tracks.length;
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|aiff?|webm|mp4)$/i.test(file.name)) continue;
    if (!file.size) continue;
    tracks.push({file, url: URL.createObjectURL(file), project:initialProject});
    $('queue').querySelector('option[value=""]')?.remove();
    $('queue').add(new Option(file.name, String(tracks.length - 1)));
  }
  if (tracks.length > first) selectTrack(first); else message('No playable audio files found. Try an MP3, WAV, M4A or OGG track.');
  $('music-file').value = '';
}
$('music-file').addEventListener('change', e => addTracks(e.target.files));
$('music-folder').addEventListener('change', e => {addTracks(e.target.files); e.target.value='';});
$('queue').addEventListener('change', e => selectTrack(+e.target.value));
const drop = $('drop-zone');
for (const event of ['dragenter','dragover']) drop.addEventListener(event, e => {e.preventDefault(); drop.classList.add('dragging');});
for (const event of ['dragleave','drop']) drop.addEventListener(event, e => {e.preventDefault(); drop.classList.remove('dragging');});
drop.addEventListener('drop', e => addTracks(e.dataTransfer.files));
audio.addEventListener('loadedmetadata', () => {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {message('This track has no readable duration. Try another audio format.'); return;}
  message(`${tracks[trackIndex]?.file.name || 'Track'} · ${secondsLabel(audio.duration)}`);
  if (draftTiming && cues.length) cues = distribute(cues.map(c => c.text), audio.duration);
  else if (openEnded && cues.length) cues[cues.length-1].end = audio.duration;
  table();
});
audio.addEventListener('error', () => {message('This browser could not play that file. Convert it to MP3, WAV or OGG and choose it again.'); update();});
audio.addEventListener('timeupdate', () => {
  const current = cues.findIndex(c => audio.currentTime >= c.start && audio.currentTime < c.end);
  $('timeline').querySelectorAll('tr').forEach((row, i) => row.classList.toggle('active', i === current));
});
$('lyrics').addEventListener('input', () => {dirty = true; resetLyricsStatus(); invalidateVideo(); update();});
$('apply-lyrics').addEventListener('click', applyText);
$('spread').addEventListener('click', () => {
  const lines = parseLyrics($('lyrics').value, audio.duration).cues.map(c => c.text);
  cues = distribute(lines, audio.duration); draftTiming = true; openEnded = false; dirty = false; tapIndex = 0;
  $('timing-note').textContent = 'Estimated timing applied. Tap along to the music to replace it with your own timing.';
  invalidateVideo(); table();
});
$('lyrics-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 2*1024*1024) { $('lyrics-status').textContent = 'Choose a lyrics file smaller than 2 MB.'; e.target.value = ''; return; }
  try {
    if (/\.json$/i.test(file.name)) loadProject(JSON.parse(await file.text()));
    else { $('lyrics').value = await file.text(); applyText(); }
    resetLyricsStatus();
  } catch { $('lyrics-status').textContent = 'That file could not be opened. Choose TXT, LRC, SRT, VTT or a Sere project.'; }
  e.target.value = '';
});
function useSong(index) {
  const song = allSongs[index]; if (!song) return;
  $('title').value = song.title; $('artist').value = song.artist || '';
  automaticTitle = false;
  $('lyrics').value = song.lyricsFijian || '';
  const source = $('library-source'); source.replaceChildren();
  if (song.source && /^https:\/\//.test(song.source)) {
    source.append(song.lyricsFijian ? 'Words from the Sere library. ' : 'This catalogue entry has a source link. Load or upload a recording to transcribe its words, or import lyrics. ');
    const link = document.createElement('a'); link.href = song.source; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Open song source'; source.append(link);
    for(const [i,url] of (song.recordingUrls || []).slice(0,4).entries()) {
      if(!/^https:\/\//.test(url)) continue;
      const recording = document.createElement('a'); recording.href=url; recording.target='_blank'; recording.rel='noopener'; recording.textContent=song.recordings?.find(r=>r.url===url)?.label || `Recording source${i ? ` ${i+1}` : ''}`; source.append(' · ',recording);
    }
  }
  sourceAudioOptions();
  resetLyricsStatus();
  $('transcribe-status').textContent = '';
  applyText();
}
function sourceAudioOptions() {
  const song = $('library-song').value === '' ? null : allSongs[+$('library-song').value];
  const rows = new Map();
  for(const r of [...(song?.recordings || []),...(song?.recordingUrls || []).map(url=>({url,label:'Source audio'}))]) {
    try {const url=new URL(r.url);if(url.protocol==='https:' && /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i.test(url.pathname) && !rows.has(url.href)) rows.set(url.href,r.label || r.type || 'Source audio');}catch{}
  }
  $('source-audio').replaceChildren(...Array.from(rows,([url,label])=>new Option(label,url)));
  $('source-audio-panel').hidden=!rows.size;
}
$('use-source-audio').addEventListener('click',async()=>{
  const url=$('source-audio').value;if(!url || loadingRecording || working || transcribing) return;
  const project=projectSnapshot();
  recordingController=new AbortController(); loadingRecording=true; $('cancel-source-audio').hidden=false; update();
  message('Loading the selected recording from its source…');
  const timer=setTimeout(()=>recordingController?.abort(),60000);
  try {
    const response=await fetch(url,{mode:'cors',credentials:'omit',signal:recordingController.signal});
    if(!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    if(Number(response.headers.get('content-length'))>150*1024*1024) throw new Error('This source recording is larger than150MB.');
    const blob=await response.blob();
    if(!blob.size || blob.size>150*1024*1024 || /^text\//i.test(blob.type)) throw new Error('The source did not return a usable audio file.');
    const extension=new URL(url).pathname.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp3';
    addTracks([new File([blob],`${fileName()}.${extension}`,{type:blob.type || 'audio/mpeg'})],{initialProject:project});
  } catch(error) {
    message(error.name==='AbortError'?'Source loading cancelled.':'Could not load this recording here. Open its source link, or choose an audio file from your device. '+(error instanceof TypeError?'The source may restrict browser access.':error.message));
  } finally {clearTimeout(timer); recordingController=null; loadingRecording=false; $('cancel-source-audio').hidden=true; update();}
});
$('cancel-source-audio').addEventListener('click',()=>recordingController?.abort());
$('library-song').addEventListener('change', e => { if (e.target.value !== '') useSong(+e.target.value); else {sourceAudioOptions();update();} });
function tapLine() {
  if ($('tap').disabled) return;
  if (audio.paused) { $('tap-status').textContent = 'Press play first, then tap as each line starts.'; return; }
  if (tapIndex >= cues.length) { $('tap-status').textContent = 'All lines timed. Review the last line’s end time.'; return; }
  const at = audio.currentTime;
  if (tapIndex && at <= cues[tapIndex-1].start + .02) { $('tap-status').textContent = 'Tap later than the previous line, or restart tapping.'; return; }
  cues[tapIndex].start = at;
  if (tapIndex) cues[tapIndex-1].end = at;
  cues[tapIndex].end = Math.max(at + .01, audio.duration);
  tapIndex++; draftTiming = false; openEnded = false; dirty = false; invalidateVideo(); table();
  $('tap-status').textContent = tapIndex < cues.length ? `Next: ${cues[tapIndex].text}` : 'All lines timed. Review the last line’s end time.';
}
$('tap').addEventListener('click', tapLine);
$('reset-taps').addEventListener('click', () => {tapIndex = 0; audio.pause(); audio.currentTime = 0; $('tap-status').textContent = 'Play the music, then tap when each line starts.'; table();});
for (const id of ['title','artist','theme','aspect']) $(id).addEventListener('input', () => {if(id==='title') automaticTitle=false; invalidateVideo(); update();});
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function fileName(fallback = 'sere-video') { return ($('title').value || fallback).replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,100); }
$('copy-lyrics').addEventListener('click', async () => {
  const text = toPlainLyrics($('lyrics').value); if (!text) return;
  resetLyricsStatus();
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    $('lyrics-status').textContent = 'Lyrics copied.';
  } catch {
    // Offer a selectable plain transcript when browser clipboard permission is denied.
    const fallback = $('copy-fallback'); fallback.value = text; fallback.hidden = false;
    fallback.focus(); fallback.select();
    $('lyrics-status').textContent = 'Automatic copy is unavailable. The lyrics are selected; use your device’s Copy command, or Download TXT.';
  }
});
$('download-lyrics').addEventListener('click', () => {
  const text = toPlainLyrics($('lyrics').value); if (!text) return;
  resetLyricsStatus();
  download(new Blob([text + '\n'], {type:'text/plain;charset=utf-8'}), `${fileName('sere-lyrics')}.txt`);
  $('lyrics-status').textContent = 'Lyrics text file prepared. Check your browser downloads.';
});
for (const [id,convert,ext] of [['download-lrc',toLrc,'lrc'],['download-vtt',toVtt,'vtt']]) $(id).addEventListener('click', () => {
  const error = validateCues(cues, audio.duration);
  if (error || dirty) { $('validation').textContent = dirty ? 'Build the timeline first.' : error; return; }
  download(new Blob([convert(cues)],{type:'text/plain;charset=utf-8'}), `${fileName()}.${ext}`);
});
$('save-project').addEventListener('click', () => {
  if (dirty) applyText();
  const error = validateCues(cues,audio.duration);
  if(dirty || error) { $('validation').textContent = dirty ? 'Build a valid timeline before saving.' : error; return; }
  const project = {format:'sere-project',version:1,title:$('title').value,artist:$('artist').value,theme:$('theme').value,aspect:$('aspect').value,audioName:tracks[trackIndex]?.file.name || '',cues};
  download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),`${fileName()}.sere.json`);
});
function loadProject(project) {
  if (project.format !== 'sere-project' || project.version !== 1 || !Array.isArray(project.cues) || project.cues.length > 2000) throw new Error('Invalid project');
  const imported = project.cues.map(c => ({start:Number(c.start),end:Number(c.end),text:String(c.text || '').slice(0,2000)}));
  const error = validateCues(imported); if (error && imported.length) throw new Error(error);
  cues = imported; $('title').value = String(project.title || '').slice(0,160); $('artist').value = String(project.artist || '').slice(0,160);
  automaticTitle = false;
  if (['lagoon','sunset','midnight'].includes(project.theme)) $('theme').value = project.theme;
  if (['landscape','portrait','square'].includes(project.aspect)) $('aspect').value = project.aspect;
  $('lyrics').value = cues.map(c => c.text).join('\n'); dirty = false; draftTiming = false; openEnded = false; tapIndex = 0;
  $('library-song').value = ''; $('library-source').textContent = '';
  resetLyricsStatus();
  sourceAudioOptions();
  $('timing-note').textContent = `Project loaded. Reattach ${String(project.audioName || 'your original audio')} to continue.`;
  invalidateVideo(); table();
}
$('project-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {if (file.size > 2*1024*1024) throw new Error('Too large'); loadProject(JSON.parse(await file.text()));}
  catch { $('lyrics-status').textContent = 'Choose a valid Sere project file smaller than 2 MB.'; }
  e.target.value = '';
});
function lock(locked) {
  working = locked;
  for (const el of document.querySelectorAll('.editor input,.editor select,.editor textarea,.editor button,.timeline-panel button,.timeline-panel input')) el.disabled = locked;
  audio.controls = !locked; $('cancel-export').hidden = !locked; $('export-progress').hidden = !locked;
  update();
}
$('export-video').addEventListener('click', async () => {
  if ($('export-video').disabled) return;
  invalidateVideo(); exportController = new AbortController(); lock(true); $('export-progress').value = 0;
  exportMessageFixed = true;
  $('export-status').textContent = 'Rendering your video with audio…';
  try {
    const result = await renderer.export({signal:exportController.signal,onProgress:p => {
      $('export-progress').value = p; $('export-status').textContent = `Rendering ${Math.round(p*100)}% · keep this tab open`;
    }});
    downloadUrl = URL.createObjectURL(result.blob);
    const link = $('download-video'); link.href = downloadUrl; link.download = `${fileName()}.${result.extension}`; link.hidden = false;
    $('export-status').textContent = `Your video is ready · ${(result.blob.size/1048576).toFixed(1)} MB. Download it below.`;
  } catch (error) { $('export-status').textContent = error.name === 'AbortError' ? 'Export cancelled. Your project is ready to edit.' : `Export failed: ${error.message}`; }
  finally {lock(false); exportController = null; table();}
});
$('cancel-export').addEventListener('click', () => exportController?.abort());
$('transcribe').addEventListener('click', async () => {
  const track = tracks[trackIndex]; if (!track || transcribing) return;
  const version = sourceVersion;
  if (audio.duration > 15*60) { $('transcribe-status').textContent = 'Local transcription supports tracks up to 15 minutes. You can add lyrics and export this full track, or choose a shorter recording for transcription.'; return; }
  if (track.file.size > 150*1024*1024) { $('transcribe-status').textContent = 'For a local transcript, choose an audio file smaller than 150 MB. You can still add lyrics and export this track.'; return; }
  transcribing = true; $('cancel-transcribe').hidden = false; update();
  const run = {cancelled:false}; transcriptionRun = run;
  $('transcribe-status').textContent = 'Decoding audio on this device…';
  let context;
  try {
    context = new AudioContext();
    const decoded = await context.decodeAudioData(await track.file.arrayBuffer());
    const offline = new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const resampled = await offline.startRendering();
    if (run.cancelled || version !== sourceVersion) throw new DOMException('Cancelled','AbortError');
    const result = await transcriber.transcribe(resampled.getChannelData(0).slice(),{language:'auto'});
    if (run.cancelled || version !== sourceVersion) return;
    const hasTimings = !!result.cues?.length;
    if (!hasTimings && !result.text?.trim()) throw new Error('No words were detected. Add lyrics or try a clearer recording.');
    cues = hasTimings ? result.cues.map(c => ({start:c.start,end:Math.min(c.end,audio.duration),text:c.text.trim()})).filter(c => c.end > c.start && c.text) : parseLyrics(result.text,audio.duration).cues;
    $('lyrics').value = cues.map(c => c.text).join('\n'); draftTiming = !hasTimings; openEnded = false; dirty = false; tapIndex = 0;
    $('transcribe-status').textContent = 'Transcript ready. Review and edit the words below, then copy or download the lyrics. Switch to Lyric video to sync and create a video.';
    resetLyricsStatus();
    $('timing-note').textContent = hasTimings ? 'Automatic draft. Check the words against the recording and adjust timing below.' : 'Estimated timing applied to the recognized words. Split them into sung lines and tap to sync.';
    invalidateVideo(); table();
  } catch (error) { $('transcribe-status').textContent = error.name === 'AbortError' ? 'Transcription cancelled.' : `Could not create a draft: ${error.message}`; }
  finally {await context?.close().catch(() => {}); transcriptionRun = null; transcribing = false; $('cancel-transcribe').hidden = true; update();}
});
$('cancel-transcribe').addEventListener('click', cancelTranscription);
window.addEventListener('beforeunload', e => {if(working){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide', event => { exportController?.abort(); recordingController?.abort(); if(!event.persisted){transcriber.dispose(); renderer.destroy(); tracks.forEach(t => URL.revokeObjectURL(t.url));} });
document.addEventListener('visibilitychange', () => { if (document.hidden && working) {exportController?.abort(); $('export-status').textContent = 'Export cancelled because the tab was hidden. Keep it visible and try again.';} });
const selected = new URLSearchParams(location.search).get('song');
if (selected) {const i=allSongs.findIndex(s => s.id===selected || s.title===selected); if(i>=0){$('library-song').value=String(i);useSong(i);}}
const requestedOutput = new URLSearchParams(location.search).get('output');
if (requestedOutput === 'lyrics') document.querySelector('input[name="output"][value="lyrics"]').checked = true;
setOutput(document.querySelector('input[name="output"]:checked').value);
configure(); table();
