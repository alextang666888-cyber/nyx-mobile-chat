(function(){
'use strict';
var $=function(id){return document.getElementById(id);}, catalog=null,saved=null,busy=false;
var dialog=document.createElement('dialog');dialog.className='api-dialog';dialog.id='apiSettings';
dialog.innerHTML='<div class="api-heading"><h2>API 设置</h2><button id="apiClose" type="button" aria-label="关闭设置">×</button></div><div class="api-body"><p>填入服务商网址和 API key，再从读取到的列表里选择模型。</p><label for="apiBase">服务商网址</label><input id="apiBase" type="url" value="https://linkapi.ai" placeholder="https://linkapi.ai" autocomplete="off" spellcheck="false"><label for="apiKey">API key</label><input id="apiKey" type="password" placeholder="粘贴你的 API key" autocomplete="new-password" spellcheck="false"><label id="apiRememberRow" class="api-remember" hidden><input id="apiRemember" type="checkbox">在这台设备记住 API key</label><div class="api-buttons"><button type="button" id="apiDiscover">读取分组和模型</button></div><div id="apiCatalog" hidden><label for="apiGroup">分组目录</label><select id="apiGroup"></select><p class="api-fine" id="apiGroupNote"></p><label for="apiSearch">查找模型</label><input id="apiSearch" type="search" placeholder="例如 Opus、4.6、Sonnet" autocomplete="off"><label for="apiModel">选择模型</label><select id="apiModel"></select><div id="apiCount" class="api-count"></div></div><div class="api-status" id="apiStatus" role="status" aria-live="polite"></div><div class="api-buttons"><button id="apiSave" type="button" class="primary" disabled>保存并使用</button></div><p class="api-fine" id="apiStorageNote">密钥只提交给自己的聊天后端，不会写进聊天记录。读取列表不会调用聊天模型。</p></div>';
document.body.appendChild(dialog);
var openButton=document.createElement('button');openButton.className='api-open';openButton.type='button';openButton.textContent='API 设置';
var bar=document.querySelector('.connection-bar');if(bar)bar.insertBefore(openButton,bar.lastElementChild);
function note(text,error){$('apiStatus').textContent=text;$('apiStatus').dataset.error=error?'true':'false';}
function api(path,body){
 var base=window.NYX_HOSTED?'':(window.NYX.relay||'/relay').replace(/\/relay\/?$/,'');
 var headers={'Content-Type':'application/json'};
 if(!window.NYX_HOSTED){var access=localStorage.getItem('nyx_key');if(access)headers.Authorization='Bearer '+access;}
 return fetch(base+'/api/provider'+path,{method:body?'POST':'GET',headers:headers,credentials:'same-origin',cache:'no-store',body:body?JSON.stringify(body):undefined}).then(async function(r){var data=await r.json();if(!r.ok)throw new Error(data.detail||'请求失败');return data;});
}
function setBusy(value){busy=value;$('apiDiscover').disabled=value;$('apiSave').disabled=value||!catalog||!$('apiModel').value;}
function resetCatalog(){catalog=null;$('apiCatalog').hidden=true;$('apiSave').disabled=true;}
function option(select,value,label){var o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);}
function filter(preferred){
 if(!catalog)return;
 var previous=preferred||$('apiModel').value,group=$('apiGroup').value,query=$('apiSearch').value.trim().toLowerCase();
 var models=catalog.models.filter(function(m){return (!group||m.groups.includes(group))&&(!query||m.id.toLowerCase().includes(query));});
 $('apiModel').replaceChildren();models.forEach(function(m){option($('apiModel'),m.id,m.id);});
 if(models.some(function(m){return m.id===previous;}))$('apiModel').value=previous;
 else if(models.some(function(m){return m.id==='claude-opus-4-6-r';}))$('apiModel').value='claude-opus-4-6-r';
 $('apiCount').textContent='当前显示 '+models.length+' / '+catalog.models.length+' 个模型';
 $('apiSave').disabled=busy||!models.length;
}
function paintCatalog(data){
 catalog=data;$('apiCatalog').hidden=false;$('apiGroup').replaceChildren();option($('apiGroup'),'','全部可用模型');
 data.groups.forEach(function(g){option($('apiGroup'),g.id,g.id+' · '+g.label);});
 if(saved&&data.groups.some(function(g){return g.id===saved.group;}))$('apiGroup').value=saved.group;
 $('apiGroup').disabled=!data.groups.length;
 $('apiGroupNote').textContent=data.groups.length?data.notice:'服务商未提供分组目录，仍可从这把 key 返回的模型列表中选择。';
 filter(saved&&saved.model);
}
async function open(){
 dialog.showModal();note('');
 if(window.NYX_DEMO){note('当前为界面演示。请返回正式聊天页面后填写真实密钥。',true);$('apiDiscover').disabled=true;$('apiSave').disabled=true;return;}
 try{saved=await api('');$('apiBase').value=saved.base_url;$('apiKey').value='';$('apiKey').placeholder=saved.key_set?'已保存；留空继续使用原密钥':'粘贴你的 API key';
 $('apiRememberRow').hidden=!window.NYX_BROWSER_ONLY;$('apiRemember').checked=saved.remember===true;
 if(window.NYX_BROWSER_ONLY){$('apiStorageNote').textContent='网页直接连接你填写的服务商，不经过本站服务器。默认只在当前标签页会话中保留 key；勾选后会明文保存在此浏览器。聊天记录也仅在这台设备，不会随链接分享。';}
 else $('apiStorageNote').textContent=saved.storage==='encrypted_browser_session'?'连接信息在当前浏览器加密保留 30 天，密钥仅服务器可读取。聊天记录也保存在此浏览器；换设备或清除网站数据后需重新设置。读取目录不会发起聊天请求。':'设置保存在自己的云端后端；完整密钥不会回传网页。读取目录不会发起聊天请求。';
 note(saved.key_set?'已保存模型：'+saved.model+'。需要更换时，点击读取列表。':'尚未配置。填写 key 后点击“读取分组和模型”。');
 }catch(e){note(e.message+(window.NYX_BROWSER_ONLY?'':'。本机/VPS 版本请先用网页访问口令进入聊天。'),true);}
}
openButton.onclick=open;$('apiClose').onclick=function(){if(!busy)dialog.close();};
dialog.addEventListener('click',function(e){if(e.target===dialog&&!busy)dialog.close();});
$('apiBase').addEventListener('input',resetCatalog);$('apiKey').addEventListener('input',resetCatalog);
$('apiGroup').onchange=function(){filter();};$('apiSearch').oninput=function(){filter();};$('apiModel').onchange=function(){$('apiSave').disabled=busy||!this.value;};
$('apiDiscover').onclick=async function(){
 setBusy(true);note('正在读取这把 API key 可用的模型……');
 try{paintCatalog(await api('/discover',{base_url:$('apiBase').value,api_key:$('apiKey').value}));note(catalog.models.length?'已读取 '+catalog.models.length+' 个模型，请选择后保存。':'这把 key 没有返回可用聊天模型，请检查服务商权限。',!catalog.models.length);}catch(e){resetCatalog();note(e.message,true);}finally{setBusy(false);}
};
$('apiSave').onclick=async function(){
 if(!catalog||!$('apiModel').value)return;setBusy(true);note('正在核对模型权限并保存……');
 try{saved=await api('',{base_url:$('apiBase').value,api_key:$('apiKey').value,model:$('apiModel').value,group:$('apiGroup').value,remember:$('apiRemember').checked});$('apiKey').value='';$('apiKey').placeholder='已保存；留空继续使用原密钥';note('已保存，后续消息使用 '+saved.model+'。');window.dispatchEvent(new Event('nyx-provider-saved'));}catch(e){note(e.message,true);}finally{setBusy(false);}
};
window.NyxApiSettings={open:open};
})();
