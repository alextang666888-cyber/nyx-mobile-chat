/* Generated from cloud/provider.mjs and cloud/browser-bootstrap.js; AGPL-3.0. */
(function(){
// Provider discovery and encrypted browser session; AGPL-3.0.
class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
function normalizeBase(value){
  try{
    const u=new URL(String(value||'').trim());
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!['/','/v1','/v1/'].includes(u.pathname))throw 0;
    const host=u.hostname.toLowerCase();
    if(!host.includes('.')||host.includes(':')||/^[0-9.]+$/.test(host)||/\.(local|localhost|internal)$/.test(host))throw 0;
    return u.origin+(u.pathname.startsWith('/v1')?'/v1':'');
  }catch(e){throw new ApiError(400,'请填写服务商 HTTPS 地址，例如 https://linkapi.ai，可带 /v1。');}
}
function publicConfig(cfg){return {base_url:cfg?.base_url||'https://linkapi.ai',model:cfg?.model||'',group:cfg?.group||'',protocol:cfg?.protocol||'',key_set:!!cfg?.api_key,storage:'encrypted_browser_session'};}
function candidate(body,old){
  const base=normalizeBase(body.base_url);
  const key=String(body.api_key||((old?.base_url===base)?old.api_key:'')||'').trim();
  if(!key||key.length>1500||/[\r\n]/.test(key))throw new ApiError(400,'请输入 API key；更换服务商时需要重新填写。');
  return {base_url:base,api_key:key};
}
async function getJson(url,headers,fetcher){
  const response=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new ApiError(400,'读取模型失败（HTTP '+response.status+'），请检查密钥和权限。');
  const text=await response.text();
  if(text.length>4*1024*1024)throw new ApiError(502,'服务商返回的目录过大。');
  return JSON.parse(text);
}
async function discover(cfg,fetcher=fetch){
  const origin=cfg.base_url.replace(/\/v1$/,'');
  let data;
  try{data=await getJson(origin+'/v1/models',{Authorization:'Bearer '+cfg.api_key},fetcher);}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(502,'暂时读取不到模型，请检查服务商地址和网络。');}
  if(!Array.isArray(data.data))throw new ApiError(502,'服务商没有返回标准模型列表。');
  const ids=[...new Set(data.data.filter(m=>m&&typeof m.id==='string').map(m=>m.id))].sort().slice(0,3000);
  let meta=new Map(),labels={};
  try{const pricing=await getJson(origin+'/api/pricing',{},fetcher);if(pricing.success){meta=new Map((pricing.data||[]).map(m=>[m.model_name,m]));labels=pricing.usable_group||{};}}catch(e){}
  const groups=new Set();
  const models=ids.flatMap(id=>{
    const row=meta.get(id)||{}, ep=row.supported_endpoint_types||[];
    if(ep.length&&!ep.some(e=>['anthropic','openai'].includes(e)))return [];
    const gs=(row.enable_groups||[]).filter(g=>typeof g==='string');gs.forEach(g=>groups.add(g));
    return [{id,groups:gs,protocol:ep.includes('anthropic')||(!ep.length&&/claude/i.test(id))?'anthropic':'openai'}];
  });
  return {models,groups:[...groups].sort().map(id=>({id,label:String(labels[id]||id)})),group_mode:'catalog_filter',notice:'分组用于筛选模型；实际计费分组由服务商为这把 API key 设置的权限决定。'};
}
const encoder=new TextEncoder(),decoder=new TextDecoder();
function b64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function unb64(s){const x=atob(s.replaceAll('-','+').replaceAll('_','/'));return Uint8Array.from(x,c=>c.charCodeAt(0));}
async function keyFor(secret){if(!secret)throw new ApiError(503,'云端私密设置尚未就绪。');const hash=await crypto.subtle.digest('SHA-256',encoder.encode(secret));return crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);}
async function seal(cfg,secret,user){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const value=encoder.encode(JSON.stringify({...cfg,expires:Date.now()+30*86400000}));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(user)},await keyFor(secret),value);
  const token=b64(iv)+'.'+b64(new Uint8Array(encrypted));
  if(token.length>3800)throw new ApiError(400,'连接信息太长，无法保存。');
  return token;
}
async function unseal(token,secret,user){
  if(!token)return null;
  try{const [a,b]=token.split('.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(a),additionalData:encoder.encode(user)},await keyFor(secret),unb64(b));const cfg=JSON.parse(decoder.decode(plain));return cfg.expires>Date.now()?cfg:null;}catch(e){return null;}
}
function chatBody(cfg,messages){
  if(!Array.isArray(messages)||!messages.length||messages.length>18)throw new ApiError(400,'消息格式不正确。');
  const clean=messages.map(m=>{if(!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>20000)throw new ApiError(400,'消息太长或格式不正确。');return {role:m.role,content:m.content};});
  if(clean.reduce((n,m)=>n+m.content.length,0)>60000)throw new ApiError(400,'当前上下文过长，请开始新对话。');
  const system='你是用户的私人聊天伙伴，使用自然、温暖、清晰的中文交流。旧的 Ombre Brain 记忆尚未接入：不要编造共同经历，也不能声称已检索或保存长期记忆。';
  return cfg.protocol==='anthropic'?{model:cfg.model,max_tokens:2000,system,messages:clean,stream:true}:{model:cfg.model,max_tokens:2000,messages:[{role:'system',content:system},...clean],stream:true};
}
async function chat(cfg,messages,fetcher=fetch){
  if(!cfg?.api_key||!cfg.model)throw new ApiError(400,'请先在 API 设置里读取并选择模型。');
  const native=cfg.protocol==='anthropic',origin=cfg.base_url.replace(/\/v1$/,'');
  let response;
  try{response=await fetcher(origin+(native?'/v1/messages':'/v1/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',...(native?{'x-api-key':cfg.api_key,'anthropic-version':'2023-06-01'}:{Authorization:'Bearer '+cfg.api_key})},body:JSON.stringify(chatBody(cfg,messages)),redirect:'error',signal:AbortSignal.timeout(180000)});}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(502,'模型连接失败；没有自动重试。');}
  if(!response.ok)throw new ApiError(400,'模型请求失败（HTTP '+response.status+'），请检查余额、模型权限和服务商记录。');
  const source=response.body;
  let reader,cancelled=false;
  const output=new ReadableStream({async start(controller){
    const send=data=>{if(!cancelled)controller.enqueue(encoder.encode('data: '+JSON.stringify(data)+'\n\n'));};
    reader=source.getReader();const dec=new TextDecoder();let buf='',finished=false,hasText=false;
    try{
      while(true){const item=await reader.read();if(item.done)break;buf+=dec.decode(item.value,{stream:true});let cut;
        while((cut=buf.indexOf('\n'))>=0){const line=buf.slice(0,cut).trim();buf=buf.slice(cut+1);if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(data==='[DONE]'){finished=true;continue;}const ev=JSON.parse(data);
          if(ev.type==='error'||ev.error)throw new Error('provider stream error');
          if(ev.type==='message_stop')finished=true;
          const text=native?(ev.type==='content_block_delta'&&ev.delta?.type==='text_delta'?ev.delta.text:(ev.type==='content_block_start'&&ev.content_block?.type==='text'?ev.content_block.text:'')):(ev.choices?.[0]?.delta?.content||'');
          if(text){hasText=true;send({type:'text',text});}
        }
      }
      if(!finished||!hasText)throw new Error('incomplete reply');send({type:'done'});
    }catch(e){send({type:'error',message:'回复中断或没有返回正文；未自动重试，请检查服务商记录。'});}finally{await reader.cancel().catch(()=>{});if(!cancelled)controller.close();}
  },cancel(reason){cancelled=true;return reader?.cancel(reason);}});
  return new Response(output,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

// Browser-only BYOK adapter. No website accounts or chat relay are used.
if(!window.NYX_BROWSER_ONLY)return;
const networkFetch=window.fetch.bind(window);
const SESSION='nyx_direct_api_session_v1',PERSISTED='nyx_direct_api_saved_v1';
function readConfig(){
  try{return JSON.parse(sessionStorage.getItem(SESSION)||localStorage.getItem(PERSISTED)||'null');}
  catch(e){return null;}
}
function visible(cfg){return {base_url:cfg?.base_url||'https://linkapi.ai',model:cfg?.model||'',group:cfg?.group||'',protocol:cfg?.protocol||'',key_set:!!cfg?.api_key,remember:!!cfg?.remember,storage:cfg?.remember?'browser_local':'browser_session'};}
function result(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
async function directFetch(url,options={}){
  const target=new URL(url),headers=new Headers(options.headers||{});
  // LinkAPI accepts x-api-key on /v1/models; it avoids Authorization's stricter CORS rule.
  if(/(^|\.)linkapi\.(ai|pro|cc)$/.test(target.hostname)&&target.pathname==='/v1/models'&&headers.has('Authorization')){
    headers.set('x-api-key',headers.get('Authorization').replace(/^Bearer\s+/i,''));headers.delete('Authorization');
  }
  return networkFetch(url,{...options,headers,mode:'cors',credentials:'omit'});
}
window.fetch=async function(input,options={}){
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin||!['/api/provider','/api/provider/discover','/api/chat'].includes(url.pathname))return networkFetch(input,options);
  try{
    const old=readConfig(),method=options.method||'GET';
    if(url.pathname==='/api/provider'&&method==='GET')return result(visible(old));
    if(method!=='POST')throw new ApiError(405,'不支持这个操作。');
    const body=JSON.parse(options.body||'{}');
    if(url.pathname==='/api/chat')return await chat(old,body.messages,directFetch);
    const cfg=candidate(body,old),catalog=await discover(cfg,directFetch);
    if(url.pathname==='/api/provider/discover')return result(catalog);
    const selected=catalog.models.find(m=>m.id===body.model);
    if(!selected)throw new ApiError(400,'请从读取到的可用列表中选择模型。');
    Object.assign(cfg,{model:selected.id,protocol:selected.protocol,group:String(body.group||'').slice(0,100),remember:body.remember===true});
    try{
      if(cfg.remember){localStorage.setItem(PERSISTED,JSON.stringify(cfg));sessionStorage.removeItem(SESSION);}
      else{sessionStorage.setItem(SESSION,JSON.stringify(cfg));localStorage.removeItem(PERSISTED);}
    }catch(e){throw new ApiError(400,'浏览器阻止了保存，请关闭隐私限制或换一个浏览器。');}
    return result(visible(cfg));
  }catch(e){return result({detail:e instanceof ApiError?e.message:'连接未完成。这家服务商可能不允许浏览器直接访问，请检查接口地址和网络。'},e instanceof ApiError?e.status:502);}
};

})();
