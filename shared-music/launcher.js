(function(){
  'use strict';
  if(window.DimauSharedMusic)return;
  const base=new URL('.',document.currentScript.src),selector='[data-music-toggle],[data-shared-music]';
  let player=null,loading=null,playing=false;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('launcher.css',base).href;document.head.append(css);
  function state(){document.querySelectorAll(selector).forEach(b=>{b.setAttribute('data-shared-music-playing',String(playing));b.setAttribute('aria-pressed',String(playing));});}
  async function open(opener=document.activeElement){
    try{if(!player){loading=loading||import(new URL('player.mjs',base).href);player=await loading;}if(opener?.isConnected){if(opener.hasAttribute('data-shared-music-error')){opener.setAttribute('aria-label','Open shared music library');opener.title='Open shared music library';}opener.removeAttribute('data-shared-music-error');}return player.open({opener});}
    catch(_){loading=null;if(opener?.isConnected){opener.setAttribute('data-shared-music-error','true');opener.setAttribute('aria-label','Music unavailable. Tap to retry.');opener.title='Music unavailable. Tap to retry.';}return null;}
  }
  window.DimauSharedMusic=Object.freeze({open,pause(){player?.pause();}});
  function scan(node){
    if(node.nodeType!==1&&node.nodeType!==9)return;
    const slots=[...(node.matches?.('[data-shared-music-slot]')?[node]:[]),...node.querySelectorAll('[data-shared-music-slot]')].slice(0,64);
    for(const slot of slots)if(!slot.querySelector(selector)){
      const b=document.createElement('button'),img=document.createElement('img');b.type='button';b.className='dsm-launcher-button dsm-music-launcher';b.setAttribute('data-shared-music','');b.setAttribute('aria-label','Open shared music library');img.src=new URL('badge.svg',base).href;img.alt='';img.width=44;img.height=44;b.append(img);slot.append(b);
    }
    const controls=[...(node.matches?.(selector)?[node]:[]),...node.querySelectorAll(selector)].slice(0,128);
    for(const b of controls){b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-label','Open shared music library');b.setAttribute('aria-pressed',String(playing));b.setAttribute('data-shared-music-playing',String(playing));}
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest?.(selector);if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;
    event.preventDefault();event.stopImmediatePropagation();open(b);
  },true);
  window.addEventListener('dimau-shared-music-state',event=>{playing=event.detail?.playing===true;state();});
  function start(){scan(document);new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)scan(node);}).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
