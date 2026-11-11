/* Chat and scene controls. The choice is captured when each message is sent. */
(function(){
 'use strict';if(!window.NYX_BROWSER_ONLY)return;
 var current='chat',room=document.getElementById('room'),input=document.getElementById('text');
 var row=document.createElement('div');row.className='interaction-controls';
 row.innerHTML='<div class="interaction-switch" role="group" aria-label="互动方式"><button type="button" data-mode="chat" aria-pressed="true">聊天</button><button type="button" data-mode="scene" aria-pressed="false">线下</button></div><span id="interactionHint" role="status" aria-live="polite">自然说话，日常聊天</span>';
 room.insertBefore(row,document.getElementById('log'));
 var hint=row.querySelector('#interactionHint');
 function set(mode){current=mode==='scene'?'scene':'chat';room.dataset.interactionMode=current;row.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.mode===current));});hint.textContent=current==='scene'?'场景、动作与互动描写':'自然说话，日常聊天';input.placeholder=current==='scene'?'描述场景，或接着互动……':'想说些什么……';}
 row.querySelectorAll('button').forEach(function(b){b.onclick=function(){set(b.dataset.mode);};});
 window.NyxInteraction={get:function(){return current;}};set('chat');
})();
