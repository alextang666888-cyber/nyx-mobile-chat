/* Composer accessories share one flat menu. AGPL-3.0. */
(function(){
 'use strict';if(!window.NYX_BROWSER_ONLY)return;
 var current='chat',room=document.getElementById('room'),input=document.getElementById('text'),button=document.getElementById('chatPlus'),menu=document.getElementById('chatExtras'),mode=document.getElementById('extraMode');
 function close(){menu.hidden=true;button.setAttribute('aria-expanded','false');}
 function set(value){current=value==='scene'?'scene':'chat';room.dataset.interactionMode=current;document.getElementById('modeStatus').textContent=current==='scene'?'线下':'聊天';mode.setAttribute('aria-pressed',String(current==='scene'));mode.querySelector('span').textContent='模式切换';input.placeholder='想说些什么……';}
 button.onclick=function(){var open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)input.blur();};
 document.getElementById('extraImage').onclick=function(){close();document.getElementById('file').click();};
 mode.onclick=function(){set(current==='chat'?'scene':'chat');close();};
 document.addEventListener('pointerdown',function(e){if(!menu.hidden&&!menu.contains(e.target)&&!button.contains(e.target))close();});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!menu.hidden){close();button.focus();}});
 window.NyxInteraction={get:function(){return current;},close:close};set('chat');
})();
