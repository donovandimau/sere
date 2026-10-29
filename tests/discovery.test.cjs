const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const zlib = require('node:zlib');
const root = require('node:path').resolve(__dirname,'..');
const read = p => fs.readFileSync(`${root}/${p}`,'utf8');
function app({storageError=false,hash='',storedIds=[]}={}) {
  const nodes = new Map(), events = {};
  class El {
    constructor(id) { this.id=id; this.value=''; this.hidden=false; this.open=false; this.paused=true; this.ended=false; this.duration=23.88; this.currentTime=0; this.listeners={}; this.dataset={}; this.attrs={}; this.classList={add(){},remove(){},toggle(){},contains(){return false;}}; this.tagName='BUTTON'; this.isConnected=true; }
    addEventListener(e,fn) { this.listeners[e]=fn; }
    setAttribute(n,v) { this.attrs[n]=v; }
    focus() { document.activeElement=this; }
    showModal() { this.open=true; }
    close() { this.open=false; this.listeners.close?.(); }
    getContext() { return null; }
    scrollIntoView() {}
    async play() { this.paused=false; this.listeners.play?.(); }
    pause() { this.paused=true; this.listeners.pause?.(); }
  }
  const get=id=>{ if(!nodes.has(id)) nodes.set(id,new El(id)); return nodes.get(id); };
  get('sort').value='featured'; get('q').tagName='INPUT';
  const filters=['all','available','pending','saved'].map(f=>{let n=new El(f);n.dataset.filter=f;return n;});
  const document={getElementById:get,body:new El('body'),activeElement:new El('body'),hidden:false,addEventListener(e,f){events[e]=f;},querySelectorAll(s){return s==='[data-filter]'?filters:[];},querySelector(s){return filters.find(f=>s.includes(`"${f.dataset.filter}"`));}};
  const location={hash,pathname:'/',search:''};
  const history={replaceState(_,__,url){location.hash=url.startsWith('#')?url:'';}};
  const context={document,location,history,URL,console,Uint8Array,Set,Map,Number,String,JSON,Math,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem(){if(storageError)throw Error();return JSON.stringify(storedIds);},setItem(){if(storageError)throw Error();}}};
  context.window=context; context.addEventListener=()=>{}; vm.createContext(context);
  for(const p of ['songs.js','rights.js','app.js']) vm.runInContext(read(p),context);
  function click(dataset={},id='') { const b=new El(id);b.dataset=dataset; events.click({target:{closest:()=>b}}); }
  return {get,context,click,events};
}
test('all four supplied records are byte-for-byte identical to main',()=>{
  const prior=cp.execFileSync('git',['show','68099fac871582b85877143b2c8e539cde8fcb72:songs.js'],{cwd:root});
  assert.deepEqual(fs.readFileSync(`${root}/songs.js`),prior);
  const a=app();assert.equal(a.context.SONGS.length,4);
});
test('preview lists 5 cards and all four documented pending states',()=>{
  const a=app(); assert.equal((a.get('songs').innerHTML.match(/class="song-card"/g)||[]).length,5);
  assert.equal((a.get('songs').innerHTML.match(/Rights pending · song story/g)||[]).length,4);
  assert.equal(a.get('count').textContent,'5 songs to explore');
  for(const s of a.context.SONGS) assert.equal(a.context.SERE_RIGHTS[s.id].status,'pending');
});
test('pending song details preserve current credits/reference and never render supplied text',()=>{
  const a=app();
  for(const s of a.context.SONGS){
    a.click({open:s.id});const html=a.get('dialog-content').innerHTML;
    assert.ok(html.includes('Lyrics &amp;')||html.includes('Lyrics & recording rights pending'));
    assert.ok(html.includes(new URL(s.source).hostname));
    assert.ok(!html.includes(s.lyricsFijian.split('\n')[0]));
    assert.ok(!html.includes(s.translationEnglish.split('\n')[0]));
    assert.ok(!html.includes('<audio')); assert.ok(!html.includes('dialog-play'));
  }
});
test('search handles case, multi-word order, no matches and clearing',()=>{
  const a=app(); a.get('q').value='LEI';a.get('q').listeners.input();
  assert.equal(a.get('count').textContent,'1 song to explore');assert.ok(a.get('songs').innerHTML.includes('Isa Lei'));
  a.get('q').value='Fiji Prescott';a.get('q').listeners.input();assert.equal(a.get('count').textContent,'1 song to explore');
  a.get('q').value='<script>alert(1)</script>';a.get('q').listeners.input();assert.equal(a.get('count').textContent,'0 songs to explore'); assert.equal(a.get('empty').hidden,false);
  a.get('clear-search').listeners.click();assert.equal(a.get('count').textContent,'5 songs to explore');
});
test('availability filters and saved collection work with storage blocked',()=>{
  const a=app({storageError:true});a.click({filter:'available'});assert.equal(a.get('count').textContent,'1 song to explore');
  a.click({filter:'pending'});assert.equal(a.get('count').textContent,'4 songs to explore');
  a.click({save:'isa-lei'});assert.equal(a.get('saved-count').textContent,1);assert.ok(a.get('toast').textContent.includes('for this visit only'));
  a.click({filter:'saved'});assert.equal(a.get('count').textContent,'1 song saved');
  a.click({save:'isa-lei'});assert.equal(a.get('count').textContent,'0 songs saved');
});
test('original playback, pause, seek and mute use actual audio controls',async()=>{
  const a=app();await a.get('player-play').listeners.click(); await Promise.resolve();
  assert.equal(a.get('audio').paused,false);assert.equal(a.get('player-play').attrs['aria-label'],'Pause Lagoon 01');
  a.get('seek').value=10;a.get('seek').listeners.input();assert.equal(a.get('audio').currentTime,10);
  a.get('mute').listeners.click();assert.equal(a.get('audio').muted,true);
  a.get('player-play').listeners.click();assert.equal(a.get('audio').paused,true);
});
test('direct legacy song links open preserved details',()=>{
  const a=app({hash:'#isa-lei'});assert.equal(a.get('song-dialog').open,true);assert.ok(a.get('dialog-content').innerHTML.includes('Isa Lei'));
});
test('no external resource dependencies; small shell and opt-in audio',()=>{
  let total=0;for(const f of ['index.html','style.css','app.js','songs.js','rights.js','assets/icon.svg','assets/lagoon.svg']) total+=zlib.gzipSync(read(f)).length;
  assert.ok(total<23000,`initial gzip shell is ${total} bytes`);
  assert.ok(read('index.html').includes('preload="none"'));
  assert.ok(!read('index.html').match(/(?:src|href)="https:\/\/.*\.(?:js|css|mp3|woff)/));
  assert.ok(read('style.css').includes('prefers-reduced-motion:reduce'));
  assert.ok(read('index.html').includes('noindex,nofollow'));
});
test('bundled original MP3 exists, has audio, and is below 300 KB',()=>{
  const p=`${root}/assets/lagoon-01.mp3`;assert.ok(fs.statSync(p).size<300000);
  const info=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,sample_rate','-of','json',p]));
  assert.ok(+info.format.duration>23);assert.ok(info.streams.some(s=>s.codec_type==='audio'));
});


test('new visitor hero opens playable music, clears old search and never autoplays',()=>{
  const a=app();assert.match(a.get('hero-discover').innerHTML,/Explore available music/);
  a.get('q').value='no match';a.get('q').listeners.input();
  let prevented=false;a.get('hero-discover').listeners.click({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(a.get('q').value,'');
  assert.equal(a.get('count').textContent,'1 song to explore');
  assert.match(a.get('songs').innerHTML,/Lagoon 01/);assert.doesNotMatch(a.get('songs').innerHTML,/Rights pending/);
  assert.equal(a.get('audio').paused,true);assert.equal(a.get('song-dialog').open,false);
});
test('returning hero uses only actual saved IDs and adapts when the collection is emptied',()=>{
  const a=app({storedIds:['isa-lei','unknown-song']});
  assert.equal(a.get('saved-count').textContent,1);assert.match(a.get('hero-discover').innerHTML,/Open your collection/);
  a.get('q').value='no match';a.get('hero-discover').listeners.click({preventDefault(){}});
  assert.equal(a.get('q').value,'');assert.equal(a.get('count').textContent,'1 song saved');
  assert.match(a.get('songs').innerHTML,/Isa Lei/);assert.equal(a.get('audio').paused,true);
  a.click({save:'isa-lei'});assert.equal(a.get('saved-count').textContent,0);
  assert.match(a.get('hero-discover').innerHTML,/Explore available music/);
});
