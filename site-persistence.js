(function(){
  'use strict';
  const DATA_URL='site-data.json';
  let globalData={version:1,sections:null,settings:null};
  let globalLoaded=false;
  let syncing=false;

  function gh(){
    return {owner:localStorage.getItem('neva_gh_owner')||'',repo:localStorage.getItem('neva_gh_repo')||'',token:localStorage.getItem('neva_gh_token')||''};
  }
  function cache(){try{return JSON.parse(localStorage.getItem('neva_site_data')||'null')}catch(e){return null}}
  function saveCache(v){try{localStorage.setItem('neva_site_data',JSON.stringify(v))}catch(e){}}

  async function loadGlobal(){
    try{
      const r=await fetch(DATA_URL+'?v='+Date.now(),{cache:'no-store'});
      if(r.ok){
        const d=await r.json();
        if(d&&typeof d==='object') globalData=Object.assign(globalData,d);
      }
    }catch(e){
      const c=cache(); if(c) globalData=Object.assign(globalData,c);
    }
    if(Array.isArray(globalData.sections)){
      sections=globalData.sections;
      saveToCache('sections',sections);
    }
    if(globalData.settings&&typeof globalData.settings==='object'){
      settings=Object.assign({},settings,globalData.settings);
      saveToCache('settings',settings);
    }
    saveCache(globalData); globalLoaded=true;
  }

  async function pushGlobal(reason){
    if(syncing)return false;
    const {owner,repo,token}=gh();
    if(!owner||!repo||!token){
      console.warn('Global site data not synced: GitHub settings are missing');
      return false;
    }
    syncing=true;
    try{
      let sha=null;
      const get=await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/site-data.json`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github.v3+json'}});
      if(get.ok) sha=(await get.json()).sha;
      const payload={version:1,sections:Array.isArray(sections)?sections:[],settings:(typeof settings==='object'&&settings)?settings:{},updated_at:new Date().toISOString()};
      const body={message:reason||'Update site data from admin',content:utf8ToBase64(JSON.stringify(payload,null,2))};
      if(sha)body.sha=sha;
      const put=await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/site-data.json`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/vnd.github.v3+json'},body:JSON.stringify(body)});
      if(!put.ok)throw new Error(await put.text());
      globalData=payload; saveCache(payload);
      if(typeof showToast==='function')showToast('Изменения сохранены на GitHub ✓');
      return true;
    }catch(e){console.error('Global site data sync failed',e);if(typeof showToast==='function')showToast('Не удалось сохранить изменения на GitHub');return false}
    finally{syncing=false}
  }

  function patchSetSetting(){
    if(typeof window.setSetting!=='function'||window.setSetting.__persistence)return;
    const original=window.setSetting;
    const wrapped=async function(key,value){
      await original(key,value);
      if(globalLoaded){
        globalData.settings=Object.assign({},settings);
        await pushGlobal('Save site settings from admin');
      }
    };
    wrapped.__persistence=true; window.setSetting=wrapped;
  }

  function patchDeleteSection(){
    if(typeof window.deleteSection!=='function'||window.deleteSection.__persistence)return;
    const original=window.deleteSection;
    const wrapped=async function(id){
      const result=original(id);
      if(globalLoaded) await pushGlobal('Delete site section from admin');
      return result;
    };
    wrapped.__persistence=true; window.deleteSection=wrapped;
  }

  function patchAddSection(){
    if(typeof window.addSection!=='function'||window.addSection.__persistence)return;
    const original=window.addSection;
    const wrapped=async function(){
      const result=original();
      if(globalLoaded) await pushGlobal('Add site section from admin');
      return result;
    };
    wrapped.__persistence=true; window.addSection=wrapped;
  }

  async function boot(){
    await loadGlobal();
    patchSetSetting(); patchDeleteSection(); patchAddSection();
    if(typeof window.renderSite==='function')window.renderSite();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
