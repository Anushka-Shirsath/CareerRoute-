const CACHE='careerquest-static-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/icon.svg','/manifest.webmanifest'])));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
// Student APIs, share tokens, uploads and HTML responses are always network-only.
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin)return;if(url.pathname==='/icon.svg'||url.pathname==='/manifest.webmanifest')event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))});
