/* Dimau Music Visuals v1 — original implementation, no runtime dependencies. */
(function(root){
  'use strict';
  if(root.DimauMusicVisuals)return;
  const graphs=new WeakMap();
  const modes=['spectrum','waveform','halo','ocean'];
  const palettes={ocean:['#62e2ef','#7f93ff','#b1fff0'],ember:['#ffbd82','#f28ba3','#ffe3ad'],violet:['#b8a3ff','#76c6ff','#e9dcff'],mono:['#e1edf5','#8fa8c1','#ffffff']};
  const abortError=signal=>signal?.reason||new DOMException('Cancelled','AbortError');
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  let context;
  function canAnalyse(audio){
    if(!audio)return false;
    const raw=audio.currentSrc||audio.getAttribute('src')||'';
    if(!raw)return true;
    try{const u=new URL(raw,root.location?.href||'https://localhost/');return u.protocol==='blob:'||u.protocol==='data:'||u.origin===root.location?.origin||audio.crossOrigin==='anonymous';}catch{return false;}
  }
  function audioGraph(audio){
    let graph=graphs.get(audio);if(graph)return graph;
    if(!canAnalyse(audio))throw Error('This source does not support visual analysis. Music can keep playing.');
    const C=root.AudioContext||root.webkitAudioContext;if(!C)throw Error('Audio visuals are unavailable in this browser. Music can keep playing.');
    if(!context||context.state==='closed')context=new C();
    const analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.78;
    const source=context.createMediaElementSource(audio);
    // One speaker route. Analysis and recording branch from the same source.
    source.connect(context.destination);source.connect(analyser);
    graph={context,source,analyser,frequency:new Uint8Array(analyser.frequencyBinCount),wave:new Uint8Array(analyser.fftSize)};
    graphs.set(audio,graph);return graph;
  }
  function sample(audio){const g=graphs.get(audio);if(!g)return null;g.analyser.getByteFrequencyData(g.frequency);g.analyser.getByteTimeDomainData(g.wave);return g;}
  function bins(frequency,count,sampleRate=48000){
    const result=new Float32Array(count);if(!frequency?.length)return result;
    const nyquist=sampleRate/2,low=35,high=Math.min(16000,nyquist);
    for(let i=0;i<count;i++){
      const start=clamp(Math.floor(low*Math.pow(high/low,i/count)/nyquist*frequency.length),0,frequency.length-1);
      const end=clamp(Math.ceil(low*Math.pow(high/low,(i+1)/count)/nyquist*frequency.length),start+1,frequency.length);
      let value=0;for(let j=start;j<end;j++)value+=frequency[j]*frequency[j];
      result[i]=Math.sqrt(value/(end-start))/255;
    }return result;
  }
  function draw(ctx,w,h,settings={},state={},data=null,background=true){
    const colours=palettes[settings.theme]||palettes.ocean,mode=modes.includes(settings.mode)?settings.mode:'spectrum';
    const gain=clamp(Number(settings.gain)||1,.5,2),f=bins(data?.frequency,64,data?.context?.sampleRate),wave=data?.wave;
    const unit=Math.min(w,h),base=h*.79;ctx.save();
    if(background){
      const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#102337');bg.addColorStop(1,'#050c17');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      const aura=ctx.createRadialGradient(w*.52,h*.4,0,w*.52,h*.4,w*.6);aura.addColorStop(0,colours[1]+'22');aura.addColorStop(1,colours[1]+'00');ctx.fillStyle=aura;ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#b4d9f00d';ctx.lineWidth=1;for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(w*.06,h*i/5);ctx.lineTo(w*.94,h*i/5);ctx.stroke();}
    }
    const gradient=ctx.createLinearGradient(0,h,0,0);gradient.addColorStop(0,colours[1]);gradient.addColorStop(.65,colours[0]);gradient.addColorStop(1,colours[2]);ctx.fillStyle=gradient;ctx.strokeStyle=gradient;
    if(mode==='spectrum'){
      if(!state.peaks)state.peaks=new Float32Array(64);
      for(let i=0;i<64;i++){
        const v=clamp(f[i]*gain,0,1),x=w*.07+i*w*.86/64,bw=Math.max(1,w*.86/64*.65),height=Math.max(1,v*h*.62);
        ctx.globalAlpha=.8;ctx.fillRect(x,base-height,bw,height);ctx.globalAlpha=.1;ctx.fillRect(x,base+4,bw,height*.2);
        const decay=Number.isFinite(state.dt)?clamp(state.dt,0,100)/1000*.32:.012;
        state.peaks[i]=Math.max(v,state.peaks[i]-decay);ctx.globalAlpha=.9;ctx.fillStyle=colours[2];ctx.fillRect(x,base-state.peaks[i]*h*.62-3,bw,1.5);ctx.fillStyle=gradient;
      }
    }else if(mode==='halo'){
      const radius=unit*.22,cx=w/2,cy=h*.49;
      ctx.lineWidth=1;ctx.globalAlpha=.2;for(let ring=0;ring<3;ring++){ctx.beginPath();ctx.arc(cx,cy,radius-ring*5,0,Math.PI*2);ctx.stroke();}
      ctx.lineWidth=Math.max(1,unit*.008);ctx.globalAlpha=.95;
      for(let i=0;i<128;i++){const a=i/128*Math.PI*2-Math.PI/2,v=f[i<64?i:127-i]*gain,r=radius+clamp(v,0,1)*unit*.2;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();}
      ctx.globalAlpha=.7;ctx.fillStyle=colours[2];ctx.font=`500 ${Math.max(10,unit*.045)}px system-ui`;ctx.textAlign='center';ctx.fillText('D I M A U',cx,cy+4);
    }else{
      const layers=mode==='ocean'?5:1;ctx.lineWidth=mode==='ocean'?1.4:2;
      for(let layer=0;layer<layers;layer++){
        ctx.globalAlpha=mode==='ocean'?.25+layer*.12:.95;ctx.beginPath();
        const points=Math.min(512,wave?.length||256);
        for(let i=0;i<points;i++){
          const x=w*.06+i/(points-1)*w*.88;
          const signal=wave?(wave[Math.floor(i/points*wave.length)]-128)/128:0;
          const y=h*.48+(layer-(layers-1)/2)*h*.045+signal*gain*h*(.27-layer*.028);
          if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }ctx.stroke();
      }
    }ctx.restore();
  }
async function finalizeWebmDuration(blob, durationSeconds, { signal } = {}) {
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


  const css=`:host{display:block;min-width:0;max-width:100%;margin:14px 0;color:#e8f3ff;font:13px/1.45 system-ui,sans-serif;color-scheme:dark}*{box-sizing:border-box}.shell{border:1px solid #39526b;background:#0c1726;border-radius:12px;overflow:hidden}.heading{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:13px 15px;border-bottom:1px solid #263c53}.heading strong{font-size:10px;letter-spacing:.18em;color:#b7d8f0}.state{font-size:11px;color:#b8d4e5}.stage{position:relative;background:#0a1220}canvas{display:block;width:100%;height:220px;object-fit:fill}.caption{position:absolute;bottom:10px;left:15px;right:15px;display:flex;justify-content:space-between;gap:10px;color:#a9c7df;font-size:9px;letter-spacing:.16em;pointer-events:none}.tools{display:flex;flex-wrap:wrap;align-items:end;gap:8px;padding:12px}label{display:flex;flex:1 1 90px;flex-direction:column;gap:4px;font-size:11px;color:#bad0e4}button,select,input{font:inherit}button,select{min-height:44px;border:1px solid #44617b;border-radius:6px;color:#eef8ff;background:#152a40;padding:9px 10px;max-width:100%}button{cursor:pointer}button:hover{background:#25425e}button:focus-visible,select:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #75e4ed;outline-offset:3px}button[aria-pressed=true]{background:#28535f;border-color:#75e4ed}input[type=range]{width:100%;min-height:44px;accent-color:#75e4ed}button:disabled{opacity:.55;cursor:default}.note{padding:0 14px 12px;margin:0;color:#b2cada;font-size:11px}a{color:#9feef2;display:inline-block;padding:8px;min-height:44px}[hidden]{display:none!important}:host(:fullscreen){margin:0;background:#07101c;padding:3vw;display:flex;align-items:center;justify-content:center}.shell:fullscreen{width:100%}:host(:fullscreen) .shell{width:min(1200px,100%)}:host(:fullscreen) canvas{height:60vh}@media(max-width:420px){canvas{height:185px}.tools{gap:6px;padding:10px}.tools>button{flex:1 1 110px}}@media(forced-colors:active){.shell{border:1px solid CanvasText}button,select{border:1px solid ButtonText}}`;
  if(root.HTMLElement&&root.customElements){
    class Visualiser extends root.HTMLElement{
      constructor(){super();this.attachShadow({mode:'open'});this.settings={mode:'spectrum',theme:'ocean',gain:1};this.enabled=false;this.frame=0;this.visible=true;this.last=0;this.drawState={};this.handlers=[];}
      connectedCallback(){
        if(this.built)return;this.built=true;
        try{const saved=JSON.parse(root.localStorage.getItem('dimau.music.visuals.v1')||'null');if(saved){if(modes.includes(saved.mode))this.settings.mode=saved.mode;if(palettes[saved.theme])this.settings.theme=saved.theme;this.settings.gain=clamp(Number(saved.gain)||1,.5,2);}}catch{}
        this.shadowRoot.innerHTML=`<style>${css}</style><section class="shell" aria-label="Music visuals"><div class="heading"><strong>SOUND IN MOTION</strong><span class="state">Ready</span></div><div class="stage"><canvas aria-label="Audio-reactive music visualiser" role="img"></canvas><div class="caption"><span>FREQUENCY / FORM</span><span>DIMAU MUSIC</span></div></div><div class="tools"><button class="toggle" type="button" aria-pressed="false">Enable visuals</button><label>Visual<select class="mode"><option value="spectrum">Spectrum</option><option value="waveform">Waveform</option><option value="halo">Halo</option><option value="ocean">Ocean waves</option></select></label><label>Colour<select class="theme"><option value="ocean">Ocean</option><option value="ember">Ember</option><option value="violet">Violet</option><option value="mono">Silver</option></select></label><label>Intensity<input class="gain" type="range" min="0.5" max="2" step="0.1" value="1"></label><button class="fullscreen" type="button">Fullscreen</button></div><p class="note" role="status">Enable, then play your music. Visuals use the sound from this player.</p></section>`;
        const $=s=>this.shadowRoot.querySelector(s);this.$=$;this.canvas=$('canvas');this.ctx=this.canvas.getContext('2d');
        for(const key of ['mode','theme','gain']){const control=$('.'+key);control.value=this.settings[key];control.addEventListener('input',()=>{this.settings[key]=key==='gain'?Number(control.value):control.value;try{root.localStorage.setItem('dimau.music.visuals.v1',JSON.stringify(this.settings));}catch{}this.changed();this.render();});}
        $('.toggle').addEventListener('click',()=>this.toggle());
        $('.fullscreen').addEventListener('click',async()=>{try{if(root.document.fullscreenElement===this)await root.document.exitFullscreen();else await this.requestFullscreen();}catch{this.note('Fullscreen is unavailable here. Use the player in its own tab.');}});
        this.motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
        const motion=()=>{if(this.motion?.matches&&this.enabled){this.enabled=false;this.stop();this.changed();this.note('Motion paused for your reduced-motion preference. Enable to animate.');}};
        this.motion?.addEventListener('change',motion);this.handlers.push(()=>this.motion?.removeEventListener('change',motion));
        const visibility=()=>{if(root.document.hidden){if(this.recording)this.finishRecording();this.stop();}else this.wake();};root.document.addEventListener('visibilitychange',visibility);this.handlers.push(()=>root.document.removeEventListener('visibilitychange',visibility));
        this.resize=new root.ResizeObserver(()=>this.render());this.resize.observe(this);
        this.intersection=new root.IntersectionObserver(entries=>{this.visible=entries[0]?.isIntersecting!==false;this.wake();});this.intersection.observe(this);
        this.bind();this.render();
        if(this.hasAttribute('export'))this.addExport();
      }
      bind(){
        const audio=this._media||root.document.getElementById(this.getAttribute('for'));
        if(this.audio===audio)return;this.unbind?.();this.audio=audio;if(!audio)return;
        const wake=()=>this.wake();const play=()=>{graphs.get(audio)?.context.resume().catch(()=>{});this.wake();};
        const names=['pause','ended','emptied','loadedmetadata','error'];names.forEach(n=>audio.addEventListener(n,wake));audio.addEventListener('play',play);
        this.unbind=()=>{names.forEach(n=>audio.removeEventListener(n,wake));audio.removeEventListener('play',play);};
      }
      set media(value){this._media=value;if(this.built){this.stop();this.bind();this.wake();}}
      note(text){this.$('.note').textContent=text;}
      changed(){if(!this.$)return;this.$('.toggle').textContent=this.enabled?'Pause visuals':'Enable visuals';this.$('.toggle').setAttribute('aria-pressed',String(this.enabled));this.dispatchEvent(new root.CustomEvent('visualchange',{detail:{...this.settings,enabled:this.enabled},bubbles:true}));}
      async toggle(){
        if(this.recording){this.note('Finish the clip before pausing visuals.');return;}
        if(this.enabled){this.enabled=false;this.stop();this.changed();this.note('Visuals paused. Music keeps playing.');return;}
        this.bind();if(!this.audio){this.note('Choose a song in this player first.');return;}
        try{await audioGraph(this.audio).context.resume();this.enabled=true;this.changed();this.note('Live audio visuals. Pause visuals at any time without stopping music.');this.wake();}catch(e){this.note(e.message);}
      }
      wake(){
        this.stop();this.render();const active=this.enabled&&this.audio&&!this.audio.paused&&!this.audio.ended&&!root.document.hidden&&this.visible&&this.getClientRects().length>0;
        this.$('.state').textContent=active?'LIVE AUDIO':this.enabled?'Waiting for music':'Motion paused';
        if(active)this.frame=root.requestAnimationFrame(t=>this.tick(t));
      }
      tick(time){
        this.frame=0;if(!this.isConnected||!this.enabled||this.audio?.paused||root.document.hidden||!this.visible||!this.getClientRects().length){this.wake();return;}
        const fps=root.navigator?.connection?.saveData?15:30;
        if(time-this.last>=1000/fps){this.drawState.dt=time-this.last;this.last=time;this.render();}
        this.frame=root.requestAnimationFrame(t=>this.tick(t));
      }
      render(){
        if(!this.ctx)return;
        const bounds=this.canvas.getBoundingClientRect(),ratio=Math.min(root.devicePixelRatio||1,2);
        const w=clamp(Math.round((bounds.width||600)*ratio),1,1920),h=clamp(Math.round((bounds.height||220)*ratio),1,1080);
        if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
        draw(this.ctx,w,h,this.settings,this.drawState,this.enabled?sample(this.audio):null);
      }
      stop(){if(this.frame)root.cancelAnimationFrame(this.frame);this.frame=0;}
      addExport(){
        const tools=this.shadowRoot.querySelector('.tools');const label=root.document.createElement('label');label.textContent='Clip length';const select=root.document.createElement('select');for(const n of [15,30,60]){const o=root.document.createElement('option');o.value=n;o.textContent=n+' seconds';select.append(o);}label.append(select);
        const button=root.document.createElement('button');button.type='button';button.textContent='Record visual clip';
        const download=root.document.createElement('a');download.hidden=true;download.textContent='Download WebM';download.download='dimau-music-visual.webm';
        tools.append(label,button,download);this.exportButton=button;this.download=download;
        button.addEventListener('click',()=>this.recording?this.finishRecording():this.record(Number(select.value)));
      }
      async record(seconds){
        if(!this.enabled||!this.audio||this.audio.paused){this.note('Enable visuals and play your music before recording.');return;}
        if(this.starting)return;
        if(!root.MediaRecorder||!this.canvas.captureStream){this.note('Clip recording is unavailable in this browser. Try current Chrome or Edge.');return;}
        this.starting=true;this.exportButton.disabled=true;
        let destination,canvasStream,stream,graph;
        try{
          graph=audioGraph(this.audio);await graph.context.resume();
          const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>root.MediaRecorder.isTypeSupported(t));if(!mime)throw Error('This browser cannot record WebM clips.');
          destination=graph.context.createMediaStreamDestination();graph.source.connect(destination);
          canvasStream=this.canvas.captureStream(30);stream=new root.MediaStream([...canvasStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
          const recorder=new root.MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});const chunks=[];
          let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(this.recordTimer);graph.source.disconnect(destination);stream.getTracks().forEach(t=>t.stop());this.audio.removeEventListener('pause',this.finish);this.audio.removeEventListener('ended',this.finish);this.recording=null;this.exportButton.textContent='Record visual clip';this.$('.toggle').disabled=false;};
          recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};let failed=false;
          recorder.onerror=()=>{failed=true;this.note('Recording failed. Try a shorter clip.');};
          recorder.onstop=async()=>{const duration=(root.performance.now()-started)/1000;cleanup();if(failed||!chunks.length){this.note('No clip was captured. Try again while music is playing.');return;}if(this.downloadUrl)root.URL.revokeObjectURL(this.downloadUrl);let blob;try{blob=await finalizeWebmDuration(new root.Blob(chunks,{type:mime}),duration);}catch(e){this.note('Clip finalisation failed: '+e.message);return;}if(!this.isConnected)return;this.downloadUrl=root.URL.createObjectURL(blob);this.download.href=this.downloadUrl;this.download.hidden=false;this.note('Your clip is ready, with audio. Download WebM.');};
          const started=root.performance.now();recorder.start(250);this.recording=recorder;this.finish=()=>this.finishRecording();this.audio.addEventListener('pause',this.finish);this.audio.addEventListener('ended',this.finish);
          this.recordTimer=setTimeout(this.finish,clamp(seconds,1,60)*1000);this.exportButton.textContent='Finish clip';this.$('.toggle').disabled=true;this.download.hidden=true;
          this.note('Recording picture and sound. Keep this tab visible; up to '+seconds+' seconds.');
        }catch(e){if(graph&&destination)try{graph.source.disconnect(destination);}catch{}stream?.getTracks().forEach(t=>t.stop());canvasStream?.getTracks().forEach(t=>t.stop());this.note('Could not record: '+e.message);}
        finally{this.starting=false;this.exportButton.disabled=false;}
      }
      finishRecording(){if(this.recording&&this.recording.state!=='inactive')this.recording.stop();}
      disconnectedCallback(){this.finishRecording();this.stop();this.unbind?.();this.resize?.disconnect();this.intersection?.disconnect();this.handlers.forEach(fn=>fn());this.handlers=[];if(this.downloadUrl)root.URL.revokeObjectURL(this.downloadUrl);this.built=false;}
    }
    root.customElements.define('dimau-music-visualiser',Visualiser);
  }
  root.DimauMusicVisuals={version:'1.0.0',finalizeWebmDuration,audioGraph,canAnalyse,sample,bins,draw,modes,palettes};
  if(typeof module==='object'&&module.exports)module.exports=root.DimauMusicVisuals;
})(typeof globalThis!=='undefined'?globalThis:this);
