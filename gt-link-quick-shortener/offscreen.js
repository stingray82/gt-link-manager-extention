"use strict";
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type!=='clipboard')return;
  (async()=>{
    try{
      // execCommand is Chrome's documented clipboard approach for MV3 offscreen documents.
      const area=document.createElement('textarea');
      area.value=String(msg.value||'');
      area.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(area);
      area.focus();area.select();
      const copied=document.execCommand('copy');
      area.remove();
      if(copied)return {ok:true};
      try{await navigator.clipboard.writeText(msg.value);return {ok:true};}
      catch(e){return {ok:false,error:'execCommand(copy) returned false; navigator.clipboard: '+(e?.message||e)};}
    }catch(e){return {ok:false,error:String(e?.message||e)};}
  })().then(sendResponse,err=>sendResponse({ok:false,error:String(err)}));
  return true;
});
