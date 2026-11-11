/* Cloud-hosted chat keeps history on this device; provider secrets never enter browser storage. */
(function(){
 if(!window.NYX_HOSTED||new URLSearchParams(location.search).get('preview')==='1')return;
 var realFetch=window.fetch.bind(window),subs=new Set(),enc=new TextEncoder(),storage='nyx_cloud_chat_v1',processing=false;
 var messages=[];try{messages=JSON.parse(localStorage.getItem(storage)||'[]');if(!Array.isArray(messages))messages=[];}catch(e){}
 function push(ev){subs.forEach(function(c){try{c.enqueue(enc.encode('data: '+JSON.stringify(ev)+'\n\n'));}catch(e){subs.delete(c);}});}
 function persist(){try{localStorage.setItem(storage,JSON.stringify(messages.slice(-500)));}catch(e){}}
 function add(from,text,meta){var row={id:messages.length?messages[messages.length-1].id+1:1,ts:new Date().toISOString(),from:from,kind:from==='human'?'user':'reply',text:text,meta:meta||{}};messages.push(row);persist();push(row);return row;}
 function json(data,status){return Promise.resolve(new Response(JSON.stringify(data),{status:status||200,headers:{'Content-Type':'application/json'}}));}
 async function answer(context){
  var text='',stream='cloud-'+Date.now(),success=false;
  try{
   var r=await realFetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:context})});
   if(!r.ok){var error=await r.json();throw Error(error.detail||'模型连接失败');}
   var reader=r.body.getReader(),dec=new TextDecoder(),buf='';
   while(true){var result=await reader.read();if(result.done)break;buf+=dec.decode(result.value,{stream:true});var cut;
    while((cut=buf.indexOf('\n\n'))>=0){var frame=buf.slice(0,cut);buf=buf.slice(cut+2);var line=frame.split('\n').find(function(x){return x.startsWith('data:');});if(!line)continue;var ev=JSON.parse(line.slice(5));if(ev.type==='error')throw Error(ev.message);if(ev.type==='done')success=true;if(ev.type==='text'){text+=ev.text;push({type:'reply_delta',stream_id:stream,text:ev.text,done:false});}}
   }
   if(!success)throw Error('回复中断，未自动重试。');
  }catch(e){text+=(text?'\n\n':'')+'⚠ '+e.message;}
  finally{
   push({type:'reply_delta',stream_id:stream,done:true,final_text:text});
   add('ai',text,{api_error:!success});processing=false;push({type:'typing',active:false});
  }
 }
 window.fetch=function(input,opt){
  var u=new URL(typeof input==='string'?input:input.url,location.href);
  if(u.origin!==location.origin||!u.pathname.startsWith('/relay/'))return realFetch(input,opt);
  var path=u.pathname.slice(6);
  if(path==='/app/history'){var since=Number(u.searchParams.get('since')||0);return json({messages:messages.filter(function(m){return m.id>since;})});}
  if(path==='/app/stream'){
   var ctl,timer;var stream=new ReadableStream({start:function(c){ctl=c;subs.add(c);c.enqueue(enc.encode(': connected\n\n'));timer=setInterval(function(){try{c.enqueue(enc.encode(': ping\n\n'));}catch(e){clearInterval(timer);}},15000);},cancel:function(){subs.delete(ctl);clearInterval(timer);}});
   if(opt&&opt.signal)opt.signal.addEventListener('abort',function(){subs.delete(ctl);clearInterval(timer);try{ctl.close();}catch(e){}});
   return Promise.resolve(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
  }
  if(path==='/app/send'){
   if(processing)return json({detail:'上一条消息仍在回复，请稍后发送。'},409);
   var body;try{body=JSON.parse(opt.body||'{}');}catch(e){return json({detail:'消息格式不正确'},400);}
   if(!body.text||body.text.length>20000)return json({detail:'消息为空或太长'},400);
   processing=true;
   return realFetch('/api/provider',{credentials:'same-origin',cache:'no-store'}).then(async function(r){
    var cfg=await r.json();if(!r.ok||!cfg.key_set){processing=false;return json({detail:cfg.detail||'请先打开 API 设置，保存服务商和模型。'},400);}
    var context=messages.filter(function(m){return !m.meta.api_error;}).slice(-16).map(function(m){return {role:m.from==='human'?'user':'assistant',content:m.text};});
    context.push({role:'user',content:body.text});var row=add('human',body.text,{quote:body.quote});push({type:'typing',active:true});answer(context);return json({id:row.id});
   }).catch(function(){processing=false;return json({detail:'暂时连接不到云端后端。'},502);});
  }
  if(path==='/app/busy')return json({state:processing?'busy':'idle',label:processing?'正在回复':''});
  if(path==='/app/status')return json({online:true});
  if(path==='/app/connection')return realFetch('/api/provider',{credentials:'same-origin',cache:'no-store'}).then(async function(r){if(!r.ok)return r;var s=await r.json();return new Response(JSON.stringify({model:s.model||'尚未选择模型',model_configured:s.key_set,memory_configured:!!window.NyxMemory?.hasAuth(),memory_online:!!window.NyxMemory?.status().ready,memory_write_enabled:!!window.NyxMemory?.status().ready,memory_error:window.NyxMemory?.status().error||'',last_memory:{retrieved:!!window.NyxMemory?.status().lastRead}}),{headers:{'Content-Type':'application/json'}});});
  return json({detail:'当前版本未启用这个功能'},404);
 };
})();
