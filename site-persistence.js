(function(){
  'use strict';

  const DATA_URL='./site-data.json';
  let globalData={version:1,sections:null,settings:null,updated_at:null,magazine_works:null};
  let globalLoaded=false;
  let syncing=false;
  let queued=false;
  let bootResolve;
  const ready=new Promise(resolve=>{bootResolve=resolve});
  window.nevaPersistenceReady=ready;

  function gh(){return {owner:localStorage.getItem('neva_gh_owner')||'',repo:localStorage.getItem('neva_gh_repo')||'',token:localStorage.getItem('neva_gh_token')||''};}
  function saveCache(v){try{localStorage.setItem('neva_site_data',JSON.stringify(v))}catch(e){}}

  async function fetchRemote(){
    if(window.__NEVA_SHARED_DATA__&&typeof window.__NEVA_SHARED_DATA__==='object') return window.__NEVA_SHARED_DATA__;
    const r=await fetch(DATA_URL+'?v='+Date.now(),{cache:'no-store',credentials:'same-origin'});
    if(!r.ok) throw new Error('site-data.json HTTP '+r.status);
    const d=await r.json();
    if(!d||typeof d!=='object') throw new Error('Invalid site-data.json');
    return d;
  }

  function applyPublicState(){
    const s=globalData.settings||{};
    const magazine=document.querySelector('#main-content .magazine-section');
    if(magazine) magazine.style.display=s.mag_enabled==='false'?'none':'';
    const tickets=document.getElementById('tickets-box');
    if(tickets) tickets.style.display=s.mag_hide_tickets==='true'?'none':'flex';
    const merch=s.mag_hide_merch==='true';
    if(merch){
      const productSections=document.querySelectorAll('#main-content .products-section');
      productSections.forEach(x=>x.style.display='none');
    }
  }

  function applyRemote(){
    if(Array.isArray(globalData.sections)){sections=globalData.sections;saveToCache('sections',sections)}
    if(globalData.settings&&typeof globalData.settings==='object'){settings=Object.assign({},globalData.settings);saveToCache('settings',settings)}
    if(Array.isArray(globalData.magazine_works)){
      magazineWorks=globalData.magazine_works;
      saveToCache('magazine_works',magazineWorks);
    }
    saveCache(globalData);
  }

  async function loadGlobal(){
    try{
      globalData=Object.assign(globalData,await fetchRemote());
      applyRemote();
      globalLoaded=true;
      bootResolve(true);
      if(typeof window.renderSite==='function') window.renderSite();
      setTimeout(applyPublicState,0);
      setTimeout(applyPublicState,250);
      return true;
    }catch(e){
      console.error('Shared site data load failed:',e);
      globalLoaded=true;
      bootResolve(false);
      return false;
    }
  }

  async function pushGlobal(reason){
    await ready;
    if(syncing){queued=true;return false;}
    const {owner,repo,token}=gh();
    if(!owner||!repo||!token){
      console.warn('Shared site data was not saved: GitHub API settings are missing on this device.');
      if(typeof showToast==='function')showToast('Не сохранено: в этой админке нет GitHub токена');
      return false;
    }
    syncing=true;
    try{
      let sha=null;
      const get=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/site-data.json`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'}});
      if(get.ok) sha=(await get.json()).sha;
      else if(get.status!==404) throw new Error('GitHub GET '+get.status);
      const payload={
        version:1,
        sections:Array.isArray(sections)?sections:[],
        settings:(settings&&typeof settings==='object')?settings:{},
        magazine_works:Array.isArray(magazineWorks)?magazineWorks:[],
        updated_at:new Date().toISOString()
      };
      const body={message:reason||'Update shared site data',content:utf8ToBase64(JSON.stringify(payload,null,2))};
      if(sha) body.sha=sha;
      const put=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/site-data.json`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify(body)});
      if(!put.ok) throw new Error('GitHub PUT '+put.status+': '+await put.text());
      globalData=payload;saveCache(payload);window.__NEVA_SHARED_DATA__=payload;
      if(typeof showToast==='function')showToast('Изменения сохранены для всех устройств ✓');
      return true;
    }catch(e){console.error('Shared site data sync failed:',e);if(typeof showToast==='function')showToast('Ошибка сохранения на GitHub');return false}
    finally{syncing=false;if(queued){queued=false;setTimeout(()=>pushGlobal('Save queued admin changes'),0)}}
  }

  function patchSetSetting(){
    if(typeof window.setSetting!=='function'||window.setSetting.__persistence)return;
    const original=window.setSetting;
    const wrapped=async function(key,value){await original(key,value);if(globalLoaded){globalData.settings=Object.assign({},settings);return pushGlobal('Save site setting: '+key)}return ready.then(()=>pushGlobal('Save site setting: '+key))};
    wrapped.__persistence=true;window.setSetting=wrapped;
  }
  function patchDeleteSection(){
    if(typeof window.deleteSection!=='function'||window.deleteSection.__persistence)return;
    const original=window.deleteSection;
    const wrapped=async function(id){const result=await original(id);await pushGlobal('Delete site section from admin');return result};
    wrapped.__persistence=true;window.deleteSection=wrapped;
  }
  function patchAddSection(){
    if(typeof window.addSection!=='function'||window.addSection.__persistence)return;
    const original=window.addSection;
    const wrapped=async function(){const result=await original();await pushGlobal('Add site section from admin');return result};
    wrapped.__persistence=true;window.addSection=wrapped;
  }
  function patchMagazineWorks(){
    const originalSave=window.saveToCache;
    if(typeof originalSave!=='function'||originalSave.__persistence)return;
    const wrapped=function(key,value){const result=originalSave(key,value);if(key==='magazine_works'&&globalLoaded){globalData.magazine_works=Array.isArray(value)?value:[];pushGlobal('Save magazine contest works').catch(()=>{})}return result};
    wrapped.__persistence=true;window.saveToCache=wrapped;
  }
  async function boot(){patchSetSetting();patchDeleteSection();patchAddSection();await loadGlobal();patchMagazineWorks();if(typeof window.renderSite==='function')window.renderSite();setTimeout(applyPublicState,0)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
