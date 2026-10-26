import {loadCatalogue} from './core.mjs';
let dialog,audio,shadow,status,list,search,count,title,play,prev,next,retry,badge,origin,tracks=[],selected=null,loading=0,attempt=0,buffering=false,lastPlaying=false;
const asset=name=>new URL(name,import.meta.url).href;
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function button(text,fn,cls){const node=el('button',text,cls);node.type='button';node.addEventListener('click',fn);return node;}
function live(){return !!audio&&!audio.paused&&!audio.ended&&!audio.error&&!buffering;}
function sync(){
  const playing=live(),pausable=!audio.paused&&!audio.ended&&!audio.error;dialog.setAttribute('data-playing',String(playing));play.textContent=pausable?'Pause':'Play';play.setAttribute('aria-pressed',String(pausable));
  play.disabled=!tracks.length;prev.disabled=next.disabled=tracks.length<2;title.textContent=selected?.title||'Choose a song';
  list.querySelectorAll('[data-track]').forEach(b=>{if(b.dataset.track===selected?.id)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
  if(playing!==lastPlaying){lastPlaying=playing;window.dispatchEvent(new CustomEvent('dimau-shared-music-state',{detail:{playing}}));}
}
export function pause(){attempt++;if(audio){audio.pause();buffering=false;status.textContent=selected?'Paused · '+selected.title:'Choose a song to begin.';sync();}}
async function choose(index){
  const track=tracks[index];if(!track)return;
  const run=++attempt;
  if(selected?.id!==track.id||!audio.getAttribute('src')||audio.error){audio.pause();selected=track;audio.src=track.url;}
  buffering=true;status.textContent='Loading · '+track.title;sync();
  try{await audio.play();if(run!==attempt)return;status.textContent=live()?'Playing · '+track.title:'Loading · '+track.title;sync();}
  catch(_){if(run===attempt){buffering=false;status.textContent='Could not play this song. Tap Play to retry, or choose another song.';sync();}}
}
function move(delta){const current=tracks.findIndex(t=>t.id===selected?.id);choose(current<0?0:(current+delta+tracks.length)%tracks.length);}
function render(){
  list.replaceChildren();const query=search.value.trim().toLocaleLowerCase();let shown=0;
  tracks.forEach((track,index)=>{if(query&&!track.title.toLocaleLowerCase().includes(query))return;shown++;const row=el('li'),pick=button('',()=>choose(index));pick.dataset.track=track.id;pick.append(el('span',String(index+1).padStart(2,'0'),'number'),el('span',track.title));pick.setAttribute('aria-label','Play '+track.title);row.append(pick);list.append(row);});
  if(!shown&&tracks.length)list.append(el('li','No songs match your search.','empty'));
  count.textContent=query?`${shown} of ${tracks.length} songs`:`${tracks.length} songs`;sync();
}
async function load(force=false){
  const run=++loading;retry.disabled=true;status.textContent='Connecting to the shared library…';
  try{const result=await loadCatalogue({force});if(run!==loading)return;tracks=result.tracks;render();status.textContent=result.stale?'Saved catalogue · Connection unavailable. Music needs an internet connection.':selected?(live()?'Playing · ':'Selected · ')+selected.title:'Choose a song to begin. Music starts only when you press Play.';retry.hidden=!result.stale;}
  catch(_){if(run!==loading)return;status.textContent='The shared music library could not connect. Try again when your signal returns.';if(!tracks.length)count.textContent='Songs unavailable';retry.hidden=false;sync();}
  finally{if(run===loading)retry.disabled=false;}
}
function close(){if(typeof dialog.close==='function')dialog.close();else{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));}}
function create(){
  const host=el('div');host.setAttribute('data-dimau-shared-music-host','');shadow=host.attachShadow({mode:'open'});
  const css=el('link');css.rel='stylesheet';css.href=asset('player.css');shadow.append(css);
  dialog=el('dialog');dialog.setAttribute('aria-labelledby','dsm-title');dialog.setAttribute('aria-modal','true');
  const box=el('div',undefined,'player'),head=el('header'),heading=el('h2','Your shared music');heading.id='dsm-title';const quit=button('×',close,'close');quit.setAttribute('aria-label','Close music library');head.append(heading,quit);
  const hero=el('section',undefined,'hero');badge=el('img');badge.src=asset('badge.svg');badge.alt='';badge.width=72;badge.height=72;title=el('strong','Choose a song');hero.append(badge,title);
  audio=el('audio');audio.controls=true;audio.crossOrigin='anonymous';audio.preload='none';audio.setAttribute('aria-label','Shared music audio');audio.setAttribute('data-dimau-shared-music-audio','');
  const transport=el('div',undefined,'transport');transport.setAttribute('role','group');transport.setAttribute('aria-label','Music playback');prev=button('Previous',()=>move(-1));play=button('Play',()=>!audio.paused&&!audio.ended?pause():choose(Math.max(0,tracks.findIndex(t=>t.id===selected?.id))));next=button('Next',()=>move(1));transport.append(prev,play,next);
  status=el('p','Connecting to the shared library…','status');status.setAttribute('role','status');retry=button('Retry library',()=>load(true),'retry');retry.hidden=true;
  const label=el('label','Find your next favourite');label.htmlFor='dsm-search';search=el('input');search.id='dsm-search';search.type='search';search.placeholder='Search songs or artists';search.maxLength=120;search.addEventListener('input',render);
  count=el('p','Loading songs…','count');list=el('ol');list.setAttribute('aria-label','Shared library songs');
  box.append(head,hero,audio,transport,status,retry,label,search,count,list);dialog.append(box);shadow.append(dialog);document.body.append(host);
  audio.addEventListener('play',()=>{buffering=true;sync();});audio.addEventListener('playing',()=>{buffering=false;status.textContent='Playing · '+(selected?.title||'music');sync();});
  for(const event of ['pause','ended','emptied'])audio.addEventListener(event,()=>{buffering=false;if(selected)status.textContent='Paused · '+selected.title;sync();});
  audio.addEventListener('waiting',()=>{buffering=true;if(selected)status.textContent='Buffering · '+selected.title;sync();});
  audio.addEventListener('stalled',()=>{if(audio.readyState<3){buffering=true;if(selected)status.textContent='Buffering · '+selected.title;}sync();});
  audio.addEventListener('error',()=>{buffering=false;status.textContent='This song could not load. Tap Play to retry, or choose another song.';sync();});
  document.addEventListener('play',event=>{if(event.target!==audio&&['AUDIO','VIDEO'].includes(event.target?.tagName)){pause();}},true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{if(!dialog.open&&origin?.isConnected)origin.focus({preventScroll:true});});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button,input,audio')].filter(n=>!n.disabled&&!n.hidden),first=nodes[0],last=nodes.at(-1),focused=shadow.activeElement;if(event.shiftKey&&focused===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&focused===last){event.preventDefault();first.focus();}}});
  sync();
}
export function open({opener=document.activeElement}={}){
  if(!dialog)create();if(dialog.open)return;
  origin=opener;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('.close').focus();load();
}
