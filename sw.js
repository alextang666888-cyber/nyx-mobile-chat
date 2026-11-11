/* Installable shell only. Never cache chats, keys, or API responses. */
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(event){event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',function(event){if(event.request.method==='GET'&&new URL(event.request.url).origin===self.location.origin){event.respondWith(fetch(event.request));}});
