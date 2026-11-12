/* Device-local conversation and Relay compatibility. AGPL-3.0. */
(function(){
 if(!window.NYX_HOSTED||new URLSearchParams(location.search).get('preview')==='1')return;
 var realFetch=window.fetch.bind(window),subs=new Set(),enc=new TextEncoder(),storage='nyx_cloud_chat_v1',processing=false,active=null;
 var messages=[];try{messages=JSON.parse(localStorage.getItem(storage)||'[]');if(!Array.isArray(messages))messages=[];}catch(e){}
 function push(ev){subs.forEach(function(c){try{c.enqueue(enc.encode('data: '+JSON.stringify(ev)+'\n\n'));}catch(e){subs.delete(c);}});}
 function persist(){try{localStorage.setItem(storage,JSON.stringify(messages.slice(-500)));}catch(e){}}
 function add(from,text,meta){var row={id:messages.length?messages[messages.length-1].id+1:1,ts:new Date().toISOString(),from:from,kind:from==='human'?'user':'reply',text:text,meta:meta||{}};messages.push(row);persist();push(row);return row;}
 function json(data,status){return Promise.resolve(new Response(JSON.stringify(data),{status:status||200,headers:{'Content-Type':'application/json'}}));}
 function state(on){processing=on;push({type:'turn_state',busy:on});if(window.dispatchEvent)window.dispatchEvent(new CustomEvent('nyx-turn-state',{detail:{busy:on}}));}
 function finish(turn,stopped){
  if(turn.finished)return;turn.finished=true;
  if(turn.accepted){push({type:'reply_delta',stream_id:turn.stream,done:true,final_text:turn.text});if(turn.text)add('ai',turn.text,{api_error:!turn.success&&!stopped,stopped:!!stopped,stream_id:turn.stream,interaction_mode:turn.mode});else push({type:'reply_cancel',stream_id:turn.stream});}
  if(active===turn){active=null;state(false);push({type:'typing',active:false});}
  if(window.dispatchEvent)window.dispatchEvent(new CustomEvent('nyx-chat-timing',{detail:{totalMs:Date.now()-turn.started,firstTextMs:turn.firstText,modelRounds:turn.modelRounds}}));
 }
 async function contextFor(turn,body,attachments){
  var prior=messages.filter(m=>!m.meta?.api_error).slice(-16),remaining=4,selected=new Set();
  for(var i=prior.length-1;i>=0;i--){var n=prior[i].meta?.attachments?.length||0;if(n&&n<=remaining){selected.add(prior[i].id);remaining-=n;}}
  var context=[];for(var m of prior){turn.controller.signal.throwIfAborted();var text=m.text,atts=m.meta?.attachments||[],content=text;
   if(atts.length&&selected.has(m.id)){try{content=await window.NyxImages.content(text,atts,turn.controller.signal);}catch(e){if(turn.controller.signal.aborted)throw e;content=text+'\n[这条历史消息的图片在本轮无法载入，不要声称看到了图片。]';}}
   else if(atts.length)content=text+'\n[这条历史消息曾附带图片，本轮未重新载入。]';
   if(m.meta?.stopped){if(typeof content==='string')content+='\n[这条回复被用户停止，尚未完成。]';else content.push({type:'text',text:'[这条回复被用户停止，尚未完成。]'});}
   context.push({role:m.from==='human'?'user':'assistant',content});
  }
  context.push({role:'user',content:attachments.length?await window.NyxImages.content(body.text||'',attachments,turn.controller.signal):body.text});return context;
 }
 async function answer(turn,context){
  try{
   var r=await realFetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:context,interaction_mode:turn.mode}),signal:turn.controller.signal});
   if(turn.finished){await r.body?.cancel();return;}
   if(!r.ok){var error=await r.json();throw Error(error.detail||'模型连接失败');}
   var reader=turn.reader=r.body.getReader(),dec=new TextDecoder(),buf='';
   while(!turn.finished){var result=await reader.read();if(result.done)break;turn.controller.signal.throwIfAborted();buf+=dec.decode(result.value,{stream:true});var cut;
    while(!turn.finished&&(cut=buf.indexOf('\n\n'))>=0){var frame=buf.slice(0,cut);buf=buf.slice(cut+2);var line=frame.split('\n').find(x=>x.startsWith('data:'));if(!line)continue;var ev=JSON.parse(line.slice(5));if(ev.type==='error')throw Error(ev.message);if(ev.type==='done'){turn.success=true;turn.modelRounds=ev.model_rounds||1;}if(ev.type==='text'){if(!turn.firstText)turn.firstText=Date.now()-turn.started;turn.text+=ev.text;push({type:'reply_delta',stream_id:turn.stream,text:ev.text,done:false});}}
   }
   if(!turn.finished&&!turn.success)throw Error('回复中断，未自动重试。');
  }catch(e){if(!turn.finished&&!turn.controller.signal.aborted)turn.text+=(turn.text?'\n\n':'')+'⚠ '+e.message;}
  finally{if(turn.reader)turn.reader.cancel().catch(()=>{});finish(turn,turn.controller.signal.aborted);}
 }
 window.fetch=function(input,opt){
  var u=new URL(typeof input==='string'?input:input.url,location.href);opt=opt||{};
  if(u.origin!==location.origin||!u.pathname.startsWith('/relay/'))return realFetch(input,opt);
  var path=u.pathname.slice(6);
  if(path==='/app/history'){var since=Number(u.searchParams.get('since')||0);return json({messages:messages.filter(m=>m.id>since)});}
  if(path==='/app/stream'){
   var ctl,timer;var stream=new ReadableStream({start(c){ctl=c;subs.add(c);c.enqueue(enc.encode(': connected\n\n'));timer=setInterval(()=>{try{c.enqueue(enc.encode(': ping\n\n'));}catch(e){clearInterval(timer);}},15000);},cancel(){subs.delete(ctl);clearInterval(timer);}});
   if(opt.signal)opt.signal.addEventListener('abort',()=>{subs.delete(ctl);clearInterval(timer);try{ctl.close();}catch(e){}},{once:true});
   return Promise.resolve(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
  }
  if(path.startsWith('/app/media/'))return window.NyxImages.get(u.pathname).then(blob=>new Response(blob,{headers:{'Content-Type':blob.type,'Cache-Control':'no-store'}})).catch(()=>new Response('图片不可用',{status:404}));
  if(path==='/app/upload')return window.NyxImages.put(opt.body,u.searchParams.get('name')).then(a=>json(a)).catch(e=>json({detail:e.message},400));
  if(path==='/app/stop'){
   var turn=active;if(turn){turn.controller.abort();if(turn.reader)turn.reader.cancel().catch(()=>{});finish(turn,true);}return json({stopped:!!turn});
  }
  if(path==='/app/send'){
   if(processing)return json({detail:'上一条消息仍在回复，可以先停止回复。'},409);
   var body,attachments;try{body=JSON.parse(opt.body||'{}');if(typeof body.text!=='string'||body.text.length>20000)throw Error('消息为空或太长');if(body.attachments?.length&&!window.NyxImages)throw Error('图片功能尚未就绪。');attachments=window.NyxImages?window.NyxImages.attachments(body.attachments):[];if(!body.text.trim()&&!attachments.length)throw Error('消息为空。');}catch(e){return json({detail:e.message||'消息格式不正确'},400);}
   var turn=active={controller:new AbortController(),reader:null,finished:false,accepted:false,success:false,text:'',stream:'cloud-'+Date.now(),mode:body.interaction_mode==='scene'?'scene':'chat',started:Date.now(),firstText:0,modelRounds:0};state(true);
   return realFetch('/api/provider',{credentials:'same-origin',cache:'no-store',signal:turn.controller.signal}).then(async r=>{
    var cfg=await r.json();turn.controller.signal.throwIfAborted();if(!r.ok||!cfg.key_set){finish(turn,false);return json({detail:cfg.detail||'请先打开 API 设置，保存服务商和模型。'},400);}
    var context=await contextFor(turn,body,attachments);turn.controller.signal.throwIfAborted();var row=add('human',body.text,{quote:body.quote,attachments,interaction_mode:turn.mode});turn.accepted=true;push({type:'typing',active:true});answer(turn,context);return json({id:row.id});
   }).catch(e=>{finish(turn,turn.controller.signal.aborted);return json({detail:turn.controller.signal.aborted?'已取消发送。':(e.message||'连接未完成。'),cancelled:turn.controller.signal.aborted},turn.controller.signal.aborted?409:502);});
  }
  if(path==='/app/busy')return json({state:processing?'busy':'idle',label:processing?'正在回复':''});
  if(path==='/app/status')return json({online:true});
  if(path==='/app/connection')return realFetch('/api/provider',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)return r;var s=await r.json();return json({model:s.model||'尚未选择模型',model_configured:s.key_set,memory_configured:!!window.NyxMemory?.hasAuth(),memory_online:!!window.NyxMemory?.status().ready,memory_write_enabled:!!window.NyxMemory?.status().ready,memory_error:window.NyxMemory?.status().error||'',last_memory:{retrieved:!!window.NyxMemory?.status().lastRead}});});
  return json({detail:'当前版本未启用这个功能'},404);
 };
})();
