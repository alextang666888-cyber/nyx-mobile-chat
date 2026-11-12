/* One viewport controller for content, keyboard, drawer and dialogs. */
(function(){
 'use strict';
 var root=document.documentElement,$=function(id){return document.getElementById(id);};
 var viewport=document.createElement('div');viewport.id='nyxViewport';viewport.className='nyx-viewport';
 document.body.appendChild(viewport);
 var bar=document.querySelector('.connection-bar');if(bar)viewport.appendChild(bar);
 ['gate','home','room','drawer'].forEach(function(id){var el=$(id);if(el)viewport.appendChild(el);});
 var text=$('text'),log=$('log'),vv=window.visualViewport,lastWidth=window.innerWidth,baseline=window.innerHeight,pending=0;
 function typing(el){return !!el&&(el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&!['button','checkbox','radio','range'].includes(el.type))||el.isContentEditable);}
 function visibleHeight(){return vv?vv.height:window.innerHeight;}
 function fitTextarea(){
  if(!text)return;var cap=Math.min(160,Math.max(72,Math.floor(visibleHeight()*.28)));
  var previousTop=text.scrollTop,atEnd=text.selectionStart===text.value.length&&text.selectionEnd===text.value.length;
  text.style.height='0px';var height=Math.min(Math.max(44,text.scrollHeight),cap);text.style.height=height+'px';text.style.overflowY=text.scrollHeight>height?'auto':'hidden';
  text.scrollTop=document.activeElement===text&&atEnd?text.scrollHeight:previousTop;
 }
 function apply(){
  pending=0;var width=vv?vv.width:window.innerWidth,height=visibleHeight(),top=vv?vv.offsetTop:0,left=vv?vv.offsetLeft:0;
  if(Math.abs(width-lastWidth)>80){baseline=Math.max(window.innerHeight,height);lastWidth=width;}
  if(!typing(document.activeElement))baseline=Math.max(window.innerHeight,height);
  root.style.setProperty('--nyx-height',height+'px');root.style.setProperty('--nyx-width',width+'px');root.style.setProperty('--nyx-top',top+'px');root.style.setProperty('--nyx-left',left+'px');
  var keyboard=typing(document.activeElement)&&baseline-height>90;root.classList.toggle('kb',keyboard);
  fitTextarea();
  if(document.activeElement===text&&log)log.scrollTop=log.scrollHeight;
  else if(typing(document.activeElement)&&document.activeElement.closest('.api-dialog'))document.activeElement.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 function sync(){if(!pending)pending=requestAnimationFrame(apply);}
 window.NyxViewport={sync:sync,fitTextarea:fitTextarea};
 window.addEventListener('resize',sync);window.addEventListener('orientationchange',function(){baseline=window.innerHeight;sync();});
 if(vv){vv.addEventListener('resize',sync);vv.addEventListener('scroll',sync);}
 document.addEventListener('focusin',function(){sync();setTimeout(sync,160);setTimeout(sync,350);});
 document.addEventListener('focusout',function(){setTimeout(sync,100);setTimeout(sync,350);});
 apply();
 var drawer=$('drawer'),panel=drawer&&drawer.querySelector('.pn');
 function closeDrawer(){if(drawer){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');}}
 if(drawer&&panel){
  var close=document.createElement('button');close.type='button';close.className='drawer-close';close.textContent='×';close.setAttribute('aria-label','关闭菜单');close.onclick=closeDrawer;panel.querySelector('.hd').appendChild(close);
  var tools=document.createElement('div');tools.className='drawer-tools';
  function item(label,action){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=function(){closeDrawer();action();};tools.appendChild(b);return b;}
  item('API 设置',function(){if(window.NyxApiSettings)window.NyxApiSettings.open();});
  item('返回首页',function(){if(window.NyxNavigation)window.NyxNavigation.home();});
  item('添加到手机桌面',install);
  item('刷新页面',function(){location.reload();});
  panel.insertBefore(tools,panel.querySelector('.homes'));
  document.addEventListener('keydown',function(e){
   if(!drawer.classList.contains('open'))return;
   if(e.key==='Escape'){closeDrawer();$('back').focus();e.preventDefault();}
   if(e.key==='Tab'){var buttons=Array.from(panel.querySelectorAll('button:not([disabled]),a[href]')).filter(function(b){return !b.closest('[hidden]');});var first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
  });
 }
 var help=document.createElement('dialog');help.className='mobile-help';help.innerHTML='<h2>像 App 一样全屏使用</h2><p>在安卓 Edge 的菜单中选择“添加到主屏幕”或“安装应用”，再从手机桌面的 Nyx 图标打开。安装版会优先使用全屏显示。浏览器支持时，也可以打开侧栏选择“全屏”。</p><button type="button">知道了</button>';document.body.appendChild(help);help.querySelector('button').onclick=function(){help.close();};
 var deferredInstall=null;
 window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredInstall=e;});
 async function install(){if(deferredInstall){var event=deferredInstall;deferredInstall=null;await event.prompt();}else help.showModal();}
 function toast(message){var n=document.createElement('div');n.className='mobile-toast';n.textContent=message;document.body.appendChild(n);setTimeout(function(){n.remove();},3800);}
 var fs=document.createElement('button');fs.type='button';fs.id='mobileFullscreen';fs.setAttribute('aria-label','进入全屏');fs.setAttribute('aria-pressed','false');fs.textContent='全屏';
 fs.onclick=async function(){
  try{if(document.fullscreenElement){await document.exitFullscreen();}else if(root.requestFullscreen&&document.fullscreenEnabled!==false){await root.requestFullscreen({navigationUI:'hide'});}else{install();}}catch(e){toast('浏览器暂不允许全屏，可从 Edge 菜单添加到手机桌面。');}sync();
 };
 if(window.NYX_BROWSER_ONLY){var tools=document.querySelector('.drawer-tools');if(tools)tools.appendChild(fs);}else if(bar)bar.insertBefore(fs,bar.lastElementChild);
 document.addEventListener('fullscreenchange',function(){var on=!!document.fullscreenElement;fs.textContent=on?'退出全屏':'全屏';fs.setAttribute('aria-label',on?'退出全屏':'进入全屏');fs.setAttribute('aria-pressed',String(on));baseline=window.innerHeight;sync();});
 window.addEventListener('appinstalled',function(){deferredInstall=null;});
})();
