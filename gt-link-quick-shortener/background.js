"use strict";
const ROOT='/wp-json/gt-link-manager/v1/links';
chrome.runtime.onInstalled.addListener(()=>{chrome.contextMenus.create({id:'gt-short-page',title:'Shorten page with GT Link',contexts:['page']});chrome.contextMenus.create({id:'gt-short-link',title:'Shorten link with GT Link',contexts:['link']});});
function randomSlug(n){const chars='abcdefghijklmnopqrstuvwxyz0123456789';let result='';let bytes=new Uint8Array(Math.max(10,n));while(result.length<n){crypto.getRandomValues(bytes);for(const b of bytes){if(b<252)result+=chars[b%36];if(result.length===n)break;}}return result;}
function makeSlug(mode,url,title,length){const clean=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);if(mode==='random')return randomSlug(Math.min(20,Math.max(4,Number(length)||6)));if(mode==='blank')return '';return clean(mode==='domain'?new URL(url).hostname.replace(/^www\./,''):title||new URL(url).hostname);}
function auth(user,password){return 'Basic '+btoa(String.fromCharCode(...new TextEncoder().encode(user+':'+password)));}
async function notify(title,message){try{await chrome.notifications.create({type:'basic',iconUrl:'icons/128.png',title,message});}catch{}}
async function writeClipboard(value){
  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['CLIPBOARD'],justification:'Copy a short URL created by a keyboard shortcut or context-menu action.'});
    }
    const result=await chrome.runtime.sendMessage({type:'clipboard',value});
    if(result?.ok===true)return {ok:true};
    return {ok:false,reason:result?.error||'Offscreen clipboard write did not succeed'};
  } catch (e) {
    return {ok:false,reason:String(e?.message||e)};
  }
}
async function confirmSavedLink(row,config){
  // Never trust locally stored history as proof the link still exists on WordPress.
  if(!row.id)return {valid:false,reason:'No server link ID in saved history'};
  const result=await fetch(config.baseUrl.replace(/\/+$/,'')+ROOT+'/'+encodeURIComponent(row.id),{
    method:'GET',headers:{Authorization:auth(config.username,config.password),Accept:'application/json'},
    credentials:'omit',redirect:'error',cache:'no-store'
  });
  if(result.status===404||result.status===410)return {valid:false,reason:'Server link was deleted'};
  if(!result.ok)throw Error('Cannot verify existing link (HTTP '+result.status+'). No new link created.');
  const body=await result.json();const obj=body?.data?.link||body?.data||body?.link||body;
  if(!obj||obj.is_active===0||obj.trashed_at||obj.url!==row.url||obj.slug!==row.slug){
    return {valid:false,reason:'Saved link no longer matches an active server record'};
  }
  return {valid:true,row:{...row,clicks:obj.total_clicks??row.clicks}};
}
// Search the live GT Link Manager library, not only links made by this browser.
// Search is a filtered request and exact URL comparison prevents partial matches.
async function lookupServerLink(destination,config){
  const base=config.baseUrl.replace(/\/+$/,'');
  let page=1;
  while(page<=20){
    const query=new URLSearchParams({search:destination,status:'active',per_page:'200',page:String(page)});
    const response=await fetch(base+ROOT+'?'+query.toString(),{
      method:'GET',headers:{Authorization:auth(config.username,config.password),Accept:'application/json'},
      credentials:'omit',redirect:'error',cache:'no-store'
    });
    if(!response.ok)throw Error('Cannot search existing server links (HTTP '+response.status+'). No new link created.');
    const json=await response.json();
    const rows=Array.isArray(json)?json:(json?.data?.links||json?.data||json?.links||[]);
    if(!Array.isArray(rows))throw Error('Unexpected link search response. No new link created.');
    const match=rows.find(r=>r.url===destination && r.slug && r.is_active!==0 && r.is_active!==false && !r.trashed_at);
    if(match){
      const direct=[match.short_url,match.short_link,match.shortlink].find(v=>typeof v==='string'&&/^https:\/\//.test(v));
      const shortUrl=direct||new URL(base).origin+'/'+(match.link_mode==='direct'?'':(config.prefix?config.prefix.replace(/^\/+|\/+$/g,'')+'/':''))+encodeURIComponent(match.slug)+'/';
      return {id:match.id,url:destination,name:match.name,slug:match.slug,shortUrl,clicks:match.total_clicks||0,createdAt:Date.now()};
    }
    const pages=Number(response.headers.get('X-WP-TotalPages'));
    if(rows.length===0 || (Number.isFinite(pages)&&pages>0&&page>=pages) || rows.length<200)return null;
    page++;
  }
  throw Error('Server search exceeded 20 pages; no new link created to avoid duplicates.');
}
async function logAction(stage,detail='',shortUrl=''){
  await chrome.storage.local.set({gtlmLastQuickAction:{stage,detail:String(detail).slice(0,500),shortUrl,at:Date.now()}});
}
async function shorten(url,title){await logAction('started',url||'(no tab URL)');if(!/^https?:\/\//i.test(url||'')){await logAction('failed','No supported active tab URL; open an ordinary http(s) page.');await notify('GT Link Manager','Only http(s) destinations are supported.');return;}const {gtlmSettings:c={},recentLinks=[]}=await chrome.storage.local.get(['gtlmSettings','recentLinks']);if(!c.baseUrl||!c.username||!c.password){await logAction('failed','Connection settings are incomplete.');await notify('GT Link Manager','Open the popup and save your connection settings first.');return;}const origin=new URL(c.baseUrl).origin;if(!await chrome.permissions.contains({origins:[origin+'/*']})){await logAction('failed','WordPress site permission not granted. Save settings again.');await notify('GT Link Manager','Open Settings and save again to grant website access.');return;}let savedHistory=recentLinks;
try {
  const existing=c.duplicateCheck!==false?recentLinks.find(r=>r.url===url):null;
  if(existing){
    const checked=await confirmSavedLink(existing,c);
    if(checked.valid){
      const copied=await writeClipboard(existing.shortUrl);
      await logAction(copied.ok?'copied_existing':'copy_failed',copied.ok?'Verified existing link copied':'Verified existing link, but clipboard failed: '+copied.reason,existing.shortUrl);
      await notify(copied.ok?'Existing short link copied':'Existing link found; clipboard failed',existing.shortUrl);
      return;
    }
    savedHistory=recentLinks.filter(r=>r.shortUrl!==existing.shortUrl);
    await chrome.storage.local.set({recentLinks:savedHistory});
    await logAction('stale_removed',checked.reason+'; creating a replacement');
  }
} catch(e){await logAction('failed',e.message);await notify('GT Link Manager',e.message);return;}
if(c.duplicateCheck!==false){
  try{
    await logAction('server_lookup','Searching WordPress for an existing destination');
    const found=await lookupServerLink(url,c);
    if(found){
      await chrome.storage.local.set({recentLinks:[found,...savedHistory.filter(r=>r.shortUrl!==found.shortUrl)].slice(0,20)});
      const copied=await writeClipboard(found.shortUrl);
      await logAction(copied.ok?'copied_server_existing':'copy_failed',copied.ok?'Existing server link found and copied':'Existing server link found, but clipboard failed: '+copied.reason,found.shortUrl);
      await notify(copied.ok?'Existing server link copied':'Existing server link found; clipboard failed',found.shortUrl);
      return;
    }
  }catch(e){await logAction('failed',e.message);await notify('GT Link Manager',e.message);return;}
}
const slug=makeSlug(c.slugMode,url,title,c.randomLength),payload={name:(title||new URL(url).hostname).slice(0,200),url,redirect_type:Number(c.defaultRedirect||301),link_mode:c.defaultLinkMode||'standard',is_active:1,noindex:c.defaultNoindex?1:0};if(slug)payload.slug=slug;const rel=[c.defaultNofollow?'nofollow':null,c.defaultSponsored?'sponsored':null].filter(Boolean);if(rel.length)payload.rel=rel.join(',');try{const resp=await fetch(c.baseUrl.replace(/\/+$/,'')+ROOT,{method:'POST',headers:{Authorization:auth(c.username,c.password),'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),credentials:'omit',redirect:'error'});const data=await resp.json();if(!resp.ok)throw Error('HTTP '+resp.status+': '+(data.message||'Request rejected'));const obj=data.data?.link||data.link||data.data||data;const mode=obj.link_mode||payload.link_mode;const shortPrefix=mode==='direct'?'':(c.prefix?c.prefix.replace(/^\/+|\/+$/g,'')+'/':'');const shortUrl=obj.short_url||obj.short_link||origin+'/'+shortPrefix+encodeURIComponent(obj.slug||slug)+'/';if(!obj.slug&&!slug&&!obj.short_url&&!obj.short_link)throw Error('No short link returned.');await chrome.storage.local.set({recentLinks:[{id:obj.id,name:obj.name||payload.name,url,slug:obj.slug||slug,shortUrl,clicks:obj.total_clicks||0,createdAt:Date.now()},...savedHistory.filter(r=>r.shortUrl!==shortUrl)].slice(0,20)});const copied=await writeClipboard(shortUrl);await logAction(copied.ok?'created_and_copied':'created_copy_failed',copied.ok?'New link created and copied':'New link created, but clipboard failed: '+copied.reason,shortUrl);await notify(copied.ok?'Short link created and copied':'Short link created (clipboard failed)',shortUrl);}catch(e){await logAction('failed',e?.message||String(e));await notify('GT Link Manager error',e.message);}}
chrome.contextMenus.onClicked.addListener((info,tab)=>{const url=info.menuItemId==='gt-short-link'?info.linkUrl:info.pageUrl;shorten(url,info.menuItemId==='gt-short-link'?new URL(url).hostname:tab?.title);});
chrome.commands.onCommand.addListener(async (command,tab)=>{
  if(command!=='quick-shorten')return;
  try {
    await logAction('shortcut_received','Keyboard shortcut received by service worker');
    const active=tab?.url?tab:(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
    if(!active){await logAction('failed','No active tab found');await notify('GT Link Manager','No active tab found');return;}
    await shorten(active.url,active.title);
  }catch(e){await logAction('failed','Shortcut error: '+(e?.message||String(e)));await notify('GT Link Manager error',e?.message||String(e));}
});
