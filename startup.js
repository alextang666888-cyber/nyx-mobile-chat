(function(){
  'use strict';
  var params=new URLSearchParams(location.search);
  var preview=window.NYX_PREVIEW_ONLY || params.get('preview')==='1';
  window.NYX_DEMO=!!preview;
  var url=document.getElementById('gateUrl');
  try { url.value=localStorage.getItem('nyx_backend_origin')||''; }catch(e){}
  if(preview){
    window.NYX.relay='/relay';
    document.getElementById('gateKey').value='interface-preview';
    document.getElementById('gateConnectFields').hidden=true;
    document.getElementById('gateSubmit').textContent='进入界面预览';
    document.getElementById('gateDescription').textContent='可以试着输入、发送和切换日夜。这里没有调用 Claude，也没有读取旧记忆。';
    document.getElementById('previewButton').hidden=true;
  }else if(window.NYX_HOSTED){
    window.NYX.relay='/relay';
    document.getElementById('gateConnectFields').hidden=true;
    document.getElementById('gateKey').hidden=true;
    document.getElementById('gateKey').value='cloud-session';
    try{localStorage.setItem('nyx_key','cloud-session');localStorage.removeItem('nyx_relay');localStorage.removeItem('nyx_chat_key');}catch(e){}
    if(!location.hash)history.replaceState(null,'',location.pathname+location.search+'#chat');
  }else if(url.value){ window.NYX.relay=url.value.replace(/\/$/,'')+'/relay'; }
  var bar=document.createElement('div'); bar.className='connection-bar';
  var note=document.createElement('span'); note.id='connectionNote';
  note.textContent=preview?'界面预览 · 模型未连接 · 旧记忆未连接':'等待连接 · 旧记忆尚未接回';
  var reset=document.createElement('button');reset.id='connectionReset';reset.type='button';reset.textContent=window.NYX_BROWSER_ONLY?'刷新':'返回入口';
  reset.onclick=function(){
    ['nyx_key','nyx_relay','nyx_chat_key','nyx_ai'].forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});
    if(!window.NYX_PREVIEW_ONLY){location.href=location.pathname;}else{location.reload();}
  };
  bar.append(note,reset);document.body.prepend(bar);
  document.getElementById('previewButton').onclick=function(){location.href=location.pathname+'?preview=1#chat';};
  document.getElementById('gateForm').addEventListener('submit',function(e){
    if(preview)return;
    var value=url.value.trim().replace(/\/$/,'');
    if(value){
      try{
        var u=new URL(value);
        if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw 0;
        if(u.protocol!=='https:' && !(u.protocol==='http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)))throw 0;
        value=u.origin;
      }catch(err){e.preventDefault();e.stopImmediatePropagation();document.getElementById('gateErr').textContent='请填写后端的 HTTPS 根地址，例如 https://chat.example.com';return;}
    }
    if(value!==(localStorage.getItem('nyx_backend_origin')||'')){
      e.preventDefault();e.stopImmediatePropagation();
      localStorage.setItem('nyx_backend_origin',value);
      // Do not carry an access key across different backend origins.
      ['nyx_key','nyx_relay','nyx_chat_key','nyx_ai'].forEach(function(k){localStorage.removeItem(k);});
      location.reload();return;
    }
    if(!location.hash)history.replaceState(null,'',location.pathname+location.search+'#chat');
  },true);
  async function status(){
    if(preview)return;
    var key;try{key=localStorage.getItem('nyx_key');}catch(e){}
    if(!key)return;
    try{
      var r=await fetch(window.NYX.relay+'/app/connection',{headers:{Authorization:'Bearer '+key},cache:'no-store'});
      if(!r.ok)throw 0;
      var s=await r.json();
      if(window.NYX_HOSTED){note.textContent=s.model_configured?s.model+' · '+(s.memory_error?'记忆调用失败':(s.memory_online?(s.last_memory.retrieved?'已检索旧记忆':'记忆已连接'):'旧记忆未连接')):'先点 API 设置，连接模型';note.title='聊天记录保存在当前浏览器；记忆读写以实际连接和工具结果为准。';return;}
      note.textContent=(s.model_configured?s.model:'模型密钥未配置')+' · '+(s.memory_online?(s.last_memory.retrieved?'本轮已检索旧记忆':'记忆已连接，等待检索'):(s.memory_configured?'记忆暂不可用':'旧记忆未连接'))+(window.NYX_HOSTED?' · 聊天记录保存在此浏览器':(s.memory_write_enabled?'':' · 未启用长期保存'));
    }catch(e){note.textContent='后端暂不可达 · 记忆状态未确认';}
  }
  window.addEventListener('nyx-provider-saved',status);
  window.addEventListener('nyx-memory-status',status);
  setInterval(status,4500);setTimeout(status,1200);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(function(){});
})();
