/* Private browser MCP connection for Ombre Brain. AGPL-3.0. No credentials in source. */
(function(){
 'use strict';
 if(!window.NYX_BROWSER_ONLY)return;
 const ORIGIN='https://ombre-brain-nzh4.onrender.com',RESOURCE=ORIGIN+'/mcp';
 const AUTH='nyx_ob_auth_v1',PENDING='nyx_ob_pending_v1';
 const network=window.fetch.bind(window),CORE=new Set(['pulse','breath','breath_search','breath_advanced','hold','grow','trace']);
 let auth=read(AUTH,localStorage),session='',version='2025-03-26',tools=[],opening=null,refreshing=null,nextId=1,coreCache=null;
 let state={connected:!!auth,ready:false,busy:false,lastAction:'',lastRead:false,lastWrite:false,error:'',tools:[],events:[]};
 function read(key,store){try{return JSON.parse(store.getItem(key)||'null');}catch(e){return null;}}
 function emit(change){Object.assign(state,change);window.dispatchEvent(new CustomEvent('nyx-memory-status',{detail:publicState()}));}
 function publicState(){return {...state,tools:state.tools.slice(),events:state.events.slice()};}
 function event(tool,status,message){state.events=[{tool,status,message,time:new Date().toISOString()},...state.events].slice(0,20);emit({lastAction:message});}
 function error(message){const e=new Error(message);e.memory=true;return e;}
 function bytes(value){return btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
 function random(){return bytes(crypto.getRandomValues(new Uint8Array(32)));}
 function callbackURL(){return new URL('./',location.href).href.split('?')[0].split('#')[0];}
 function persist(value){auth=value;localStorage.setItem(AUTH,JSON.stringify(value));}
 function scrub(text){let value=String(text||'');for(const secret of [auth?.access_token,auth?.refresh_token])if(secret)value=value.split(secret).join('[private credential]');return value;}
 async function jsonResponse(response,label){let data;try{data=await response.json();}catch(e){throw error(label+'没有返回有效响应。');}if(!response.ok)throw error(label+'失败（HTTP '+response.status+'），请重新连接或稍后再试。');return data;}
 async function authorize(){
  if(state.busy)return;emit({busy:true,error:''});
  try{
   const redirect=callbackURL(),response=await network(ORIGIN+'/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Nyx Mobile Chat',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']}),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)});
   const registration=await jsonResponse(response,'注册私人连接');if(!registration.client_id)throw error('记忆库没有返回连接标识。');
   const verifier=random(),oauthState=random();const challenge=bytes(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
   sessionStorage.setItem(PENDING,JSON.stringify({client_id:registration.client_id,verifier,state:oauthState,redirect,created:Date.now()}));
   const target=new URL(ORIGIN+'/oauth/authorize');for(const [key,value] of Object.entries({response_type:'code',client_id:registration.client_id,redirect_uri:redirect,scope:'mcp',resource:RESOURCE,state:oauthState,code_challenge:challenge,code_challenge_method:'S256'}))target.searchParams.set(key,value);
   location.assign(target.href);
  }catch(e){emit({busy:false,error:scrub(e.message||'连接失败，请检查记忆库服务。')});throw e;}
 }
 async function receiveCallback(){
  const params=new URLSearchParams(location.search);if(!params.has('code')&&!params.has('error'))return false;
  const pending=read(PENDING,sessionStorage);const code=params.get('code'),returnedState=params.get('state');
  params.delete('code');params.delete('state');const denial=params.get('error');params.delete('error');params.delete('error_description');
  history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+'#chat');
  if(!pending||Date.now()-pending.created>15*60*1000||pending.state!==returnedState||pending.redirect!==callbackURL()){emit({error:'授权回调无效或已过期，请重新连接记忆库。'});return true;}
  sessionStorage.removeItem(PENDING);
  if(denial||!code){emit({error:'记忆库授权未完成。'});return true;}
  try{
   const body=new URLSearchParams({grant_type:'authorization_code',client_id:pending.client_id,redirect_uri:pending.redirect,code,code_verifier:pending.verifier,resource:RESOURCE});
   const response=await network(ORIGIN+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)});
   const token=await jsonResponse(response,'记忆库授权');if(!token.access_token)throw error('记忆库没有签发访问授权。');
   persist({...token,client_id:pending.client_id,expires_at:Date.now()+Math.max(30,Number(token.expires_in)||3600)*1000});emit({connected:true,error:''});await open();
  }catch(e){emit({error:scrub(e.message||'记忆库授权失败。')});}return true;
 }
 async function access(force=false){
  if(!auth)throw error('请先连接自己的记忆库。');
  if(!force&&auth.expires_at>Date.now()+30000)return auth.access_token;
  if(refreshing)return refreshing;
  refreshing=(async()=>{
   if(!auth.refresh_token)throw error('记忆库授权已过期，请重新连接。');
   const previous=auth,body=new URLSearchParams({grant_type:'refresh_token',refresh_token:auth.refresh_token,client_id:auth.client_id,resource:RESOURCE});
   const response=await network(ORIGIN+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)});
   if(response.status===400||response.status===401){auth=null;localStorage.removeItem(AUTH);session='';tools=[];emit({connected:false,ready:false,error:'记忆库授权已失效，请重新连接。'});throw error('记忆库授权已失效，请重新连接。');}
   const token=await jsonResponse(response,'刷新记忆授权');if(!token.access_token)throw error('刷新授权没有返回访问令牌。');
   persist({...previous,...token,expires_at:Date.now()+Math.max(30,Number(token.expires_in)||3600)*1000});return auth.access_token;
  })();try{return await refreshing;}finally{refreshing=null;}
 }
 async function parseRpc(response,id){
  if(response.status===202||response.status===204)return null;
  const ct=response.headers.get('Content-Type')||'';let data;
  if(ct.includes('application/json'))data=await response.json();
  else{
   const reader=response.body.getReader(),decoder=new TextDecoder();let buf='';
   try{while(true){const chunk=await reader.read();if(chunk.done)break;buf+=decoder.decode(chunk.value,{stream:true}).replaceAll('\r','');if(buf.length>4*1024*1024)throw error('记忆库返回的数据过大。');let cut;
    while((cut=buf.indexOf('\n\n'))>=0){const frame=buf.slice(0,cut).replaceAll('\r','');buf=buf.slice(cut+2);const text=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(!text)continue;const value=JSON.parse(text);if(value.id===id){data=value;return unwrap(data);}}
   }}finally{await reader.cancel().catch(()=>{});}
  }
  if(id==null)return null;if(!data||data.id!==id)throw error('记忆库返回的会话响应不完整。');return unwrap(data);
 }
 function unwrap(data){if(data.error)throw error('记忆工具调用失败：'+scrub(data.error.message||'未知错误'));return data.result;}
 async function rpc(method,params,notification=false){
  const id=notification?null:nextId++;const message={jsonrpc:'2.0',method,...(!notification?{id}:{}),...(params?{params}:{})};
  async function send(force){const token=await access(force);const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':'Bearer '+token,'MCP-Protocol-Version':version};if(session)headers['Mcp-Session-Id']=session;return network(RESOURCE,{method:'POST',headers,body:JSON.stringify(message),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(120000)});}
  let response=await send(false);if(response.status===401)response=await send(true);
  if(!response.ok){if(response.status===404){session='';tools=[];coreCache=null;emit({ready:false});}throw error('记忆库请求失败（HTTP '+response.status+'）。写入不会自动重试，请先查询结果。');}
  const sid=response.headers.get('Mcp-Session-Id');if(sid)session=sid;
  return parseRpc(response,id);
 }
 async function open(){
  if(opening)return opening;if(state.ready&&tools.length)return tools;
  opening=(async()=>{const init=await rpc('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'nyx-mobile-chat',version:'1.1.0'}});version=init?.protocolVersion||version;await rpc('notifications/initialized',null,true);
   let cursor,listed=[];for(let i=0;i<10;i++){const page=await rpc('tools/list',cursor?{cursor}:{});listed.push(...(page.tools||[]));cursor=page.nextCursor;if(!cursor)break;}
   tools=listed.filter(t=>CORE.has(t.name));emit({connected:true,ready:true,error:'',tools:tools.map(t=>t.name)});return tools;
  })();try{return await opening;}catch(e){emit({ready:false,error:scrub(e.message||'记忆连接失败。')});throw e;}finally{opening=null;}
 }
 function resultText(result){const parts=(result?.content||[]).filter(x=>x.type==='text').map(x=>x.text||'');if(!parts.length&&result?.structuredContent)parts.push(JSON.stringify(result.structuredContent));const value=scrub(parts.join('\n'));let parsed=result?.structuredContent;try{if(!parsed&&parts.length===1)parsed=JSON.parse(value);}catch(e){}if(result?.isError||(parsed&&typeof parsed==='object'&&(parsed.error||parsed.ok===false||parsed.success===false)))throw error(value||'记忆工具报告失败。');return value||'(工具已完成，没有正文)';}
 async function call(name,args={},options={}){
  await open();if(!CORE.has(name)||!tools.some(t=>t.name===name))throw error('当前记忆库不提供这个操作。');
  if(name==='trace'&&([args.delete,args.hard_delete].some(v=>v===true||v===1||v==='true'||v==='1')||['approve','approved'].includes(args.deletion_decision))&&!/(删除|删掉|移除.*记忆)/.test(options.userText||''))throw error('删除记忆需要用户明确提出；当前只允许查询和更新。');
  const write=['hold','grow','trace'].includes(name);event(name,'running',write?'正在保存或更新记忆…':'正在读取记忆…');
  try{const result=await rpc('tools/call',{name,arguments:args});const text=resultText(result);if(write)coreCache=null;emit({error:'',...(write?{lastWrite:true}:{lastRead:true})});event(name,'success',write?'记忆保存/更新调用已完成':'记忆读取已完成');return text;}
  catch(e){const message=scrub(e.message||'记忆操作失败。');emit({error:message,...(write?{lastWrite:false}:{lastRead:false})});event(name,'error',message);throw e;}
 }
 async function prepare(query){
  if(!auth)return {context:'',tools:[],available:false};
  emit({lastRead:false,lastWrite:false});
  try{
   await open();let parts=[];
   if(tools.some(t=>t.name==='breath_search')){
    if(!coreCache&&tools.some(t=>t.name==='breath'))coreCache=await call('breath',{});if(coreCache)parts.push(coreCache.slice(0,6000));
    const schema=tools.find(t=>t.name==='breath_search').inputSchema?.properties||{};const args={query:String(query||'').slice(0,600)};if(schema.max_results)args.max_results=6;if(schema.max_tokens)args.max_tokens=1800;parts.push(await call('breath_search',args));
   }else if(tools.some(t=>t.name==='breath')){const schema=tools.find(t=>t.name==='breath').inputSchema?.properties||{};parts.push(await call('breath',schema.query?{query:String(query||'').slice(0,600)}:{}));}
   else throw error('当前记忆库没有提供检索工具。');
   return {context:parts.join('\n\n').slice(0,14000),tools:tools.slice(),available:true};
  }catch(e){emit({lastRead:false,error:scrub(e.message)});return {context:'',tools:[],available:false,failed:true};}
 }
 async function search(query){await open();if(tools.some(t=>t.name==='breath_search'))return call('breath_search',{query});const t=tools.find(t=>t.name==='breath');if(!t)throw error('没有可用的检索工具。');return call('breath',t.inputSchema?.properties?.query?{query}:{});}
 function disconnect(){auth=null;session='';tools=[];coreCache=null;localStorage.removeItem(AUTH);sessionStorage.removeItem(PENDING);emit({connected:false,ready:false,lastRead:false,lastWrite:false,error:'',tools:[],lastAction:'此设备已断开记忆库连接'});}
 window.NyxMemory={hasAuth:()=>!!auth,status:publicState,connect:authorize,disconnect,open,call,search,prepare};
 const callback=receiveCallback();window.NyxMemory.callback=callback;
 callback.then(handled=>{if(!handled&&auth)open().catch(()=>{});});
})();
