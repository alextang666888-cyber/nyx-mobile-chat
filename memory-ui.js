(function(){
 'use strict';if(!window.NYX_BROWSER_ONLY||!window.NyxMemory)return;
 let latestTiming=null;const memory=window.NyxMemory,$=id=>document.getElementById(id);
 const dialog=document.createElement('dialog');dialog.id='memoryDialog';dialog.className='api-dialog memory-dialog';
 dialog.innerHTML='<div class="api-heading"><h2>记忆库</h2><button type="button" id="memoryClose" aria-label="关闭记忆库">×</button></div><div class="api-body"><p id="memoryConnection" role="status" aria-live="polite"></p><div class="api-buttons"><button type="button" id="memoryConnect" class="primary">连接原来的 OB</button><button type="button" id="memoryDisconnect" hidden>在此设备断开</button></div><p class="api-fine">首次会跳到你自己的 OB 页面授权，用原管理密码确认。授权仅保存在此设备，不随网页链接分享。</p><div id="memoryFunctions" hidden><label for="memoryQuery">查询记忆或信件</label><input id="memoryQuery" type="search" placeholder="输入想找的人、经历或关键词" autocomplete="off"><div class="api-buttons"><button id="memorySearch" type="button">查询</button><button id="memoryLetters" type="button">读取信件</button><button id="memoryOverview" type="button">读取概览</button></div><label for="memoryContent">保存一条记忆</label><textarea id="memoryContent" rows="4" placeholder="写下要长期保存的事实或经历"></textarea><div class="api-buttons"><button id="memorySave" type="button" class="primary">保存到原 OB</button></div><p class="api-fine">聊天时会先检索相关旧记忆。你也可以直接说“记住……”或“更新这条记忆……”，让模型调用记忆工具。</p></div><div id="memoryNotice" class="api-status" role="status" aria-live="polite"></div><pre id="memoryResult" class="memory-result" hidden></pre><p id="memoryTiming" class="api-fine"></p><details class="memory-events"><summary>最近操作</summary><div id="memoryEvents"></div></details><p class="api-fine"><a href="https://ombre-brain-nzh4.onrender.com/" target="_blank" rel="noopener noreferrer">打开原记忆库管理页面</a></p></div>';
 document.body.appendChild(dialog);
 const button=document.createElement('button');button.type='button';button.id='memoryOpen';button.textContent='记忆';button.title='连接、查询和保存原来的记忆';
 const bar=document.querySelector('.connection-bar');if(bar)bar.insertBefore(button,bar.querySelector('#connectionReset'));
 function setNotice(text,bad=false){$('memoryNotice').textContent=text;$('memoryNotice').dataset.error=String(bad);}
 function render(){
  const s=memory.status();$('memoryConnection').textContent=s.ready?'原 OB 已连接，可读取和保存。':(s.connected?'授权已保存，正在连接记忆服务……':'尚未连接旧记忆。');
  $('memoryConnect').textContent=s.connected?'重新授权':'连接原来的 OB';$('memoryConnect').disabled=s.busy;$('memoryDisconnect').hidden=!s.connected;$('memoryFunctions').hidden=!s.ready;
  $('memoryLetters').disabled=!s.tools.includes('letter_read');
  $('memoryTiming').textContent=(s.retrieveMs?'最近自动检索 '+(s.retrieveMs/1000).toFixed(1)+' 秒 · 载入 '+s.contextChars+' 字符'+(s.contextLimited?' · 有整份结果超出预算，未载入':''):'')+(latestTiming?'；最近回复 '+(latestTiming.totalMs/1000).toFixed(1)+' 秒 · 首字 '+(latestTiming.firstTextMs/1000).toFixed(1)+' 秒 · 模型请求 '+latestTiming.modelRounds+' 次':'');
  button.textContent=s.error?'记忆 !':(s.ready?'记忆 ✓':'记忆');button.title=s.error||'连接、查询和保存原来的记忆';button.dataset.connected=String(s.ready);
  if(s.error)setNotice(s.error,true);
  $('memoryEvents').replaceChildren();for(const item of s.events){const row=document.createElement('p');row.textContent=new Date(item.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' · '+item.message;$('memoryEvents').appendChild(row);}
 }
 function open(){render();dialog.showModal();}
 button.onclick=open;$('memoryClose').onclick=()=>dialog.close();
 $('memoryConnect').onclick=()=>memory.connect().catch(e=>setNotice(e.message||'授权未完成。',true));
 $('memoryDisconnect').onclick=()=>{memory.disconnect();$('memoryResult').hidden=true;setNotice('此浏览器已断开连接。');render();};
 async function run(operation,message){
  const ids=['memorySearch','memoryOverview','memoryLetters','memorySave'];ids.forEach(id=>$(id).disabled=true);setNotice(message);$('memoryResult').hidden=true;
  try{const value=await operation();$('memoryResult').textContent=value;$('memoryResult').hidden=false;setNotice('操作已完成，结果如下。');}
  catch(e){setNotice(e.message||'操作未完成。',true);}finally{ids.forEach(id=>$(id).disabled=false);render();}
 }
 $('memorySearch').onclick=()=>{const query=$('memoryQuery').value.trim();if(!query){setNotice('请输入要查询的关键词。',true);return;}run(()=>memory.search(query),'正在查询原 OB……');};
 $('memoryLetters').onclick=()=>run(()=>memory.letters($('memoryQuery').value.trim()),'正在读取信件原文（优先一封）……');
 $('memoryOverview').onclick=()=>run(()=>memory.call('pulse',{}),'正在读取记忆概览……');
 $('memorySave').onclick=()=>{const content=$('memoryContent').value.trim();if(!content){setNotice('请输入要保存的内容。',true);return;}run(()=>memory.call('hold',{content,importance:5,pinned:false},{userText:'保存这条记忆'}),'正在保存到原 OB……');};
 const drawer=document.querySelector('.drawer-tools');if(drawer){const item=document.createElement('button');item.type='button';item.textContent='记忆库';item.onclick=()=>{const d=$('drawer');d.classList.remove('open');d.setAttribute('aria-hidden','true');open();};drawer.insertBefore(item,drawer.firstChild);}
 window.addEventListener('nyx-chat-timing',e=>{latestTiming=e.detail;render();});window.addEventListener('nyx-memory-status',render);render();memory.callback.then(()=>{render();if(memory.status().error)setNotice(memory.status().error,true);});
 window.NyxMemoryPanel={open};
})();
