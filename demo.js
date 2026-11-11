/* Explicit UI simulation. Never contacts a model or OB, never contains real memories. */
(function(){
  if(!window.NYX_DEMO)return;
  var realFetch=window.fetch.bind(window), subscribers=new Set(), enc=new TextEncoder();
  var messages=[];
  try{messages=JSON.parse(sessionStorage.getItem('nyx_preview_messages')||'[]');}catch(e){}
  function store(){try{sessionStorage.setItem('nyx_preview_messages',JSON.stringify(messages));}catch(e){}}
  function push(data){subscribers.forEach(function(c){try{c.enqueue(enc.encode('data: '+JSON.stringify(data)+'\n\n'));}catch(e){subscribers.delete(c);}});}
  function add(from,text){var row={id:messages.length?messages[messages.length-1].id+1:1,ts:new Date().toISOString(),from:from,kind:from==='human'?'user':'reply',text:text,meta:{preview:true}};messages.push(row);store();push(row);return row;}
  if(!messages.length)add('ai','这是 Nyx 的界面预览。你可以试发消息、引用消息、切换日夜。\n\n这里还没有连接 Claude 和 Ombre Brain；以下演示提示不来自模型，也不是旧记忆。');
  window.fetch=function(input,opt){
    var raw=typeof input==='string'?input:input.url;
    var u=new URL(raw,location.href);
    if(u.origin!==location.origin || !u.pathname.startsWith('/relay/'))return realFetch(input,opt);
    var path=u.pathname.slice(6), data={};
    function json(body,status){return Promise.resolve(new Response(JSON.stringify(body),{status:status||200,headers:{'Content-Type':'application/json'}}));}
    if(path==='/app/history'){var since=Number(u.searchParams.get('since')||0);return json({messages:messages.filter(function(m){return m.id>since;})});}
    if(path==='/app/stream'){
      var ctl, timer;
      var stream=new ReadableStream({start:function(c){ctl=c;subscribers.add(c);c.enqueue(enc.encode(': preview\n\n'));timer=setInterval(function(){try{c.enqueue(enc.encode(': ping\n\n'));}catch(e){clearInterval(timer);}},15000);},cancel:function(){subscribers.delete(ctl);clearInterval(timer);}});
      if(opt&&opt.signal)opt.signal.addEventListener('abort',function(){subscribers.delete(ctl);clearInterval(timer);try{ctl.close();}catch(e){}});
      return Promise.resolve(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
    }
    if(path==='/app/send'){
      try{data=JSON.parse(opt.body||'{}');}catch(e){}
      var row=add('human',String(data.text||''));
      setTimeout(function(){add('ai','【界面演示提示】消息已显示在当前浏览器。正式接通后，这里会出现 Claude 的回复；这次没有调用模型、读取旧记忆或写入 OB。');},450);
      return json({id:row.id});
    }
    if(path==='/app/busy')return json({state:'idle'});
    if(path==='/app/status')return json({online:true,preview:true});
    return json({detail:'界面预览未启用这个功能'},404);
  };
})();
