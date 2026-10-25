'use strict';
const $ = (id) => document.getElementById(id);
const DEFAULTS = {baseUrl:'',username:'',password:'',prefix:'go',defaultRedirect:'301',slugMode:'random',randomLength:'6',defaultNofollow:false,defaultSponsored:false,defaultNoindex:false,duplicateCheck:true,quickOnPopup:false};
let config = {...DEFAULTS};
let lastTab = null;
let currentShortUrl = '';
let pendingDuplicate=null;
const API_ROOT='/wp-json/gt-link-manager/v1/links';
const settingsKeys = Object.keys(DEFAULTS);
const sanitizeSlug = (value) => String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
const trimUrl = (v) => String(v||'').trim().replace(/\/+$/,'');
const validHttpUrl = (v) => {try{const u=new URL(v);return ['http:','https:'].includes(u.protocol) && Boolean(u.hostname)}catch{return false}};
const originBase = (v) => {const u=new URL(v); if(u.protocol!=='https:')throw Error('Use an HTTPS WordPress URL.'); if(u.username||u.password||u.search||u.hash)throw Error('Enter the WordPress base URL without credentials, query or fragment.');return u.origin+u.pathname.replace(/\/+$/,'')};
const msg = (text,kind='') => { $('status').textContent=text; $('status').className='status '+kind; };
function randomSlug(){const length=Number(config.randomLength);if(!Number.isInteger(length)||length<4||length>20)throw Error('Random slug length must be between 4 and 20.');const chars='abcdefghijklmnopqrstuvwxyz0123456789';const bytes=new Uint8Array(length);const max=256-(256%chars.length);let out='';while(out.length<length){crypto.getRandomValues(bytes);for(const b of bytes){if(b<max)out+=chars[b%chars.length];if(out.length===length)break;}}return out;}
function slugForTab(tab) {if(config.slugMode==='random')return randomSlug();if(config.slugMode==='blank')return '';if(config.slugMode==='domain'){try{return sanitizeSlug(new URL(tab?.url||'').hostname.replace(/^www\./,''))}catch{return ''}}return sanitizeSlug(tab?.title||'');}
async function populateTab(){try{const tabs=await chrome.tabs.query({active:true,currentWindow:true});const tab=tabs[0];if(tab){lastTab=tab;if(validHttpUrl(tab.url)){$('destination').value=tab.url;$('linkName').value=(tab.title||new URL(tab.url).hostname).slice(0,200);$('slug').value=slugForTab(tab);msg('');}else{msg('Open an http(s) web page, or enter a destination URL manually.')}}}catch(e){msg('Could not read the current tab. Enter the URL manually.','error')}}
function applySettings(){for(const k of settingsKeys){let e=$(k);if(k==='password'){e.value='';continue;}if(e.type==='checkbox')e.checked=Boolean(config[k]);else e.value=config[k]??'';}updatePasswordHint();applyDefaults();}
function updatePasswordHint(){$('passwordHint').textContent=config.password?'Application Password saved. Leave blank to keep it, or enter a new one to replace it.':'Enter a WordPress Application Password. It will be hidden after saving.';}
function applyDefaults(){ $('redirect').value=config.defaultRedirect; $('nofollow').checked=config.defaultNofollow; $('sponsored').checked=config.defaultSponsored; $('noindex').checked=config.defaultNoindex; }
async function updateShortcutStatus(){try{const commands=await chrome.commands.getAll();const command=commands.find(c=>c.name==='quick-shorten');$('shortcutStatus').textContent=command?.shortcut?'Current shortcut: '+command.shortcut:'No keyboard shortcut assigned.';}catch{$('shortcutStatus').textContent='View your shortcut in Chrome extension settings.';}}
async function load(){const data=await chrome.storage.local.get({gtlmSettings:DEFAULTS});config={...DEFAULTS,...(data.gtlmSettings||{})};applySettings();await updateShortcutStatus();await populateTab();await updateRecentSummary();await applyHistoryReuse();if(!new URLSearchParams(location.search).has('reuse') && config.quickOnPopup && config.baseUrl && config.password && lastTab && validHttpUrl(lastTab.url)){await quickCreate();}if(!config.baseUrl||!config.username||!config.password){$('settings').hidden=false;msg('Set up your WordPress connection in Settings to begin.');}}
async function saveSettings(){try{const next={};for(const k of settingsKeys){const e=$(k);next[k]=k==='password'?(e.value.trim() || config.password):(e.type==='checkbox'?e.checked:e.value.trim());}next.baseUrl=originBase(next.baseUrl);if(!next.username)throw Error('Enter your WordPress username.');if(!next.password)throw Error('Enter an Application Password.');next.prefix=next.prefix.replace(/^\/+|\/+$/g,'').trim();if(!/^(?:[4-9]|1[0-9]|20)$/.test(next.randomLength))throw Error('Random slug length must be 4–20 characters.');if(next.prefix&&!/^[a-zA-Z0-9/_-]+$/.test(next.prefix))throw Error('Short link prefix can only contain letters, numbers, dashes, underscores and slashes.');const granted=await chrome.permissions.request({origins:[new URL(next.baseUrl).origin+'/*']});if(!granted)throw Error('Site permission is needed to use the WordPress API.');config=next;await chrome.storage.local.set({gtlmSettings:config});$('password').value='';updatePasswordHint();$('settingsMessage').textContent='Saved on this device.';if(lastTab)$('slug').value=slugForTab(lastTab);$('settings').hidden=true;msg('Settings saved.');}catch(e){$('settingsMessage').textContent=e.message;}}
function basicAuth(username, password){const bytes=new TextEncoder().encode(username+':'+password);let s='';for(const b of bytes)s+=String.fromCharCode(b);return 'Basic '+btoa(s);}
function connectionFromInputs(){
  return {base:originBase($('baseUrl').value.trim()),username:$('username').value.trim(),password:$('password').value.trim() || config.password};
}
async function apiRequest(url, method, username, password, payload){
  const headers={Authorization:basicAuth(username,password),Accept:'application/json'};
  if(payload!==undefined)headers['Content-Type']='application/json';
  // No browser session cookies: always authenticate via the explicitly supplied Application Password.
  const response=await fetch(url,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),credentials:'omit',redirect:'error',cache:'no-store'});
  const raw=await response.text();let json;
  try{json=JSON.parse(raw)}catch{json=null;}
  return {status:response.status,ok:response.ok,json,raw};
}
function apiError(result){
  const code=result.json?.code||result.json?.error||'unknown';
  const message=result.json?.message||'Request failed';
  return `HTTP ${result.status} · ${code}: ${message}`;
}
async function testConnection(){
  const output=$('connectionReport');output.hidden=false;output.className='diagnostic';output.textContent='Testing WordPress authentication…';
  let settings;try{settings=connectionFromInputs();if(!settings.username||!settings.password)throw Error('Enter a username and Application Password first.')}catch(e){output.className='diagnostic fail';output.textContent=e.message;return;}
  $('testConnection').disabled=true;
  try{
    const user=await apiRequest(settings.base+'/wp-json/wp/v2/users/me','GET',settings.username,settings.password);
    if(!user.ok){output.className='diagnostic fail';output.textContent='WordPress authentication: FAILED\n'+apiError(user)+'\nCheck extension credentials against the successful curl command. No password is displayed.';return;}
    const identity=user.json?.slug||user.json?.name||'ID '+user.json?.id;
    output.textContent=`WordPress authentication: PASS\nAuthenticated user: ${identity} (ID ${user.json?.id??'unknown'})\nChecking GT Link Manager…`;
    const links=await apiRequest(settings.base+'/wp-json/gt-link-manager/v1/links?per_page=1','GET',settings.username,settings.password);
    output.className='diagnostic '+(links.ok?'pass':'fail');
    output.textContent=`WordPress authentication: PASS\nAuthenticated user: ${identity} (ID ${user.json?.id??'unknown'})\nGT Link Manager GET: ${links.ok?'PASS':'FAILED'} (HTTP ${links.status})`+(links.ok?'\nGET is successful. Create a link to confirm POST permissions.':'\n'+apiError(links));
  }catch(e){output.className='diagnostic fail';output.textContent='Connection test failed: '+e.message+'\nIf curl works but Chrome fails, check server security or CORS rules for requests from chrome-extension://.';}
  finally{$('testConnection').disabled=false;}
}
function pickLink(data,base,slug){const obj=data?.data?.link || data?.link || data?.data || data || {};const direct=[obj.short_url,obj.short_link,obj.shortlink,obj.redirect_url,data?.short_url,data?.short_link].find(v=>typeof v==='string'&&validHttpUrl(v));if(direct)return direct;const returnedSlug=obj.slug||data?.slug||slug;if(returnedSlug){return base+'/'+(config.prefix?config.prefix+'/':'')+encodeURIComponent(returnedSlug)+'/';}return '';}
async function createLink(force=false){ $('result').hidden=true;msg('');const dest=$('destination').value.trim();const name=$('linkName').value.trim();const slug=$('slug').value.trim();if(!validHttpUrl(dest))return msg('Enter a valid http(s) destination URL.','error');if(!name)return msg('Enter a link name.','error');if(slug&&!/^[a-z0-9_-]+$/.test(slug))return msg('Slug must contain lowercase letters, numbers, hyphens or underscores.','error');if(!config.baseUrl||!config.username||!config.password){$('settings').hidden=false;return msg('Save your WordPress connection settings first.','error');}
let base;try{base=originBase(config.baseUrl)}catch(e){return msg(e.message,'error')}
const payload={name,url:dest,redirect_type:Number($('redirect').value),link_mode:'standard',is_active:1,noindex:$('noindex').checked?1:0};if(slug)payload.slug=slug;const rel=['nofollow','sponsored','ugc'].filter(v=>$(v).checked);if(rel.length)payload.rel=rel.join(',');const category=$('category').value.trim();if(category){if(!Number.isSafeInteger(Number(category))||Number(category)<1)return msg('Category ID must be a positive integer.','error');payload.category_id=Number(category)}if($('tags').value.trim())payload.tags=$('tags').value.trim();if($('notes').value.trim())payload.notes=$('notes').value.trim();
$('create').disabled=true;msg('Checking and creating short link…');try{if(config.duplicateCheck && !force){const existing=await findDuplicate(dest);if(existing){pendingDuplicate={existing,payload};showDuplicate(existing);$('create').disabled=false;return;}}$('duplicateNotice').hidden=true;const endpoint=base+'/wp-json/gt-link-manager/v1/links';const response=await apiRequest(endpoint,'POST',config.username,config.password,payload);const json=response.json;if(!json)throw Error('Server returned non-JSON content (HTTP '+response.status+'). Check the site URL and REST API endpoint.');if(!response.ok){$('settings').hidden=false;throw Error(apiError(response)+'\nOpen Settings → Test connection to verify the extension credentials.')}if(json?.success===false)throw Error(json?.message||'API reported failure');const shortUrl=pickLink(json,base,slug);if(!shortUrl)throw Error('Link may have been created, but the API did not return a slug or short URL. Check GT Link Manager before retrying.');currentShortUrl=shortUrl;$('shortLink').textContent=shortUrl;$('shortLink').href=shortUrl;const record=json?.data?.link||json?.link||json?.data||json;await rememberLink({id:record.id,slug:record.slug||slug,name,url:dest,shortUrl,clicks:record.total_clicks??0,createdAt:Date.now()});$('resultMeta').textContent='Created successfully'+(record?.id?' · Link ID '+record.id:'');$('result').hidden=false;try{await navigator.clipboard.writeText(shortUrl);$('copy').textContent='Copied ✓';msg('Short link created and copied to clipboard.','ok');}catch{$('copy').textContent='Copy link';msg('Short link created. Automatic copying was blocked; click Copy link.','ok');}}catch(e){msg(e instanceof TypeError?'Could not connect. Check HTTPS, the site address, permissions, and whether the WordPress API is reachable.':e.message,'error')}finally{$('create').disabled=false;}}
async function findDuplicate(dest){
  const {recentLinks=[]}=await chrome.storage.local.get('recentLinks');
  const local=recentLinks.find(r=>r.url===dest);
  if(local){
    let isLive=false;
    if(local.id){
      const check=await apiRequest(originBase(config.baseUrl)+API_ROOT+'/'+encodeURIComponent(local.id),'GET',config.username,config.password);
      if(!check.ok && ![404,410].includes(check.status))throw Error('Could not verify saved link (HTTP '+check.status+'). Try again.');
      const row=check.json?.data?.link||check.json?.data||check.json?.link||check.json;
      isLive=check.ok && row?.url===dest && row?.slug===local.slug && row?.is_active!==0 && !row?.trashed_at;
    }
    if(isLive)return local;
    await chrome.storage.local.set({recentLinks:recentLinks.filter(r=>r.shortUrl!==local.shortUrl)});
  }
  // Search is advisory; verify the exact destination before reuse.
  const base=originBase(config.baseUrl);let res=await apiRequest(base+API_ROOT+'?search='+encodeURIComponent(dest)+'&per_page=100','GET',config.username,config.password);
  if(!res.ok)throw Error('Could not search existing links: '+apiError(res)+'. No new link created.');
  if(res.ok){const rows=Array.isArray(res.json)?res.json:(res.json?.data?.links||res.json?.data||[]);if(Array.isArray(rows)){const match=rows.find(r=>r.url===dest&&r.slug&&r.is_active!==0&&r.is_active!==false&&!r.trashed_at&&(!r.link_mode||r.link_mode==='standard'));if(match)return {id:match.id,url:dest,name:match.name,slug:match.slug,shortUrl:pickLink(match,base,match.slug),clicks:match.total_clicks||0};}}
  return null;
}
function showDuplicate(row){$('duplicateNotice').hidden=false;$('duplicateText').textContent='This destination already has a short link: '+row.shortUrl+' . Reuse it or create a new one?';msg('Existing link found. Choose reuse or create a new one.');}
async function rememberLink(record){const {recentLinks=[]}=await chrome.storage.local.get('recentLinks');const next=[record,...recentLinks.filter(r=>r.shortUrl!==record.shortUrl)].slice(0,20);await chrome.storage.local.set({recentLinks:next});await updateRecentSummary();}
async function updateRecentSummary(){const {recentLinks=[]}=await chrome.storage.local.get('recentLinks');$('recentSummary').textContent=recentLinks.length+' saved link'+(recentLinks.length===1?'':'s')+' · Open history to copy, reuse or refresh stats.';}
async function applyHistoryReuse(){const key=new URLSearchParams(location.search).get('reuse');if(!key)return;const {recentLinks=[]}=await chrome.storage.local.get('recentLinks');const item=recentLinks.find(r=>r.shortUrl===key);if(!item)return;$('destination').value=item.url||'';$('linkName').value=item.name||'';$('slug').value=item.slug||'';$('settings').hidden=true;msg('Loaded a previous link. Change its slug before creating a new link.');}
async function quickCreate(){if(!lastTab||!validHttpUrl(lastTab.url))return msg('Open a normal webpage before using Quick shorten.','error');if(!config.baseUrl||!config.username||!config.password){$('settings').hidden=false;return msg('Save connection settings first.','error');}const dest=lastTab.url;$('destination').value=dest;$('linkName').value=(lastTab.title||new URL(dest).hostname).slice(0,200);$('slug').value=slugForTab(lastTab);await createLink();}
$('quickCreate').addEventListener('click',quickCreate);
$('configureShortcut').addEventListener('click',()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'}));
$('openHistory').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('history.html')}));
$('useExisting').addEventListener('click',async()=>{if(!pendingDuplicate)return;let r=pendingDuplicate.existing;currentShortUrl=r.shortUrl;$('shortLink').href=r.shortUrl;$('shortLink').textContent=r.shortUrl;$('result').hidden=false;$('duplicateNotice').hidden=true;await rememberLink({...r,createdAt:Date.now()});try{await navigator.clipboard.writeText(r.shortUrl);msg('Existing short link copied.','ok')}catch{msg('Select the existing short link to copy it.','error')}});
$('createAnyway').addEventListener('click',()=>createLink(true));
$('clearHistory').addEventListener('click',async()=>{await chrome.storage.local.remove('recentLinks');await updateRecentSummary();$('settingsMessage').textContent='Local history cleared.'});
$('forgetPassword').addEventListener('click',async()=>{config.password='';$('password').value='';await chrome.storage.local.set({gtlmSettings:config});updatePasswordHint();$('settingsMessage').textContent='Saved Application Password erased. Enter a new one to connect.'});
$('settingsToggle').addEventListener('click',()=>{$('settings').hidden=!$('settings').hidden;});$('saveSettings').addEventListener('click',saveSettings);$('testConnection').addEventListener('click',testConnection);$('useTab').addEventListener('click',populateTab);$('regenerate').addEventListener('click',()=>{$('slug').value=randomSlug();msg('Generated a new random slug.');});$('create').addEventListener('click',()=>createLink(false));$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(currentShortUrl);$('copy').textContent='Copied ✓';setTimeout(()=>$('copy').textContent='Copy link',1700);}catch{msg('Clipboard failed. Select and copy the short link above.','error')}});$('open').addEventListener('click',()=>{if(currentShortUrl)chrome.tabs.create({url:currentShortUrl})});load().catch(e=>msg('Could not load saved settings: '+e.message,'error'));

async function refreshQuickDiagnostics(){
  const {gtlmLastQuickAction:r}=await chrome.storage.local.get('gtlmLastQuickAction');
  $('quickDiagnosticsText').textContent=r?`${new Date(r.at).toLocaleString()} — ${r.stage}: ${r.detail}${r.shortUrl?' | '+r.shortUrl:''}`:'No background quick action recorded yet. Press your configured shortcut on a normal webpage, then click Refresh.';
}
$('refreshQuickDiagnostics').addEventListener('click',()=>refreshQuickDiagnostics().catch(e=>$('quickDiagnosticsText').textContent=e.message));
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.gtlmLastQuickAction)refreshQuickDiagnostics().catch(()=>{});});
refreshQuickDiagnostics().catch(()=>{});
