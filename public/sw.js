const cacheName = "hormuz-static-lantern-1";
const shell = ["/", "/app-icon-192.png", "/app-icon-512.png", "/manifest.webmanifest"];
const art = ["harbor","pilot","merchant","tanker","lighthouse","strait","passage","night","reserve","industry","sea-1","sea-2","sea-3","crew-harbor","crew-energy","crew-supply",
  ...["tank","dock","oil","refinery","power","steel","water","city","welfare","optical","arms"].map(id => "facilities/"+id)].map(id=>"/harbor/"+id+".webp");
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  await cache.addAll([...shell,...art]);
  const html = await (await cache.match("/")).text();
  const files = Array.from(html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g), match => match[1].replaceAll("&amp;", "&"));
  await cache.addAll([...new Set(files)]);
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if(key.startsWith("hormuz-static-") && key!==cacheName)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
  if(event.request.mode==="navigate" && url.pathname==="/") {
    event.respondWith(fetch(event.request).catch(()=>caches.match("/") ));return;
  }
  if(url.pathname.startsWith("/_next/static/")||url.pathname.startsWith("/harbor/")||shell.includes(url.pathname)) {
    event.respondWith((async()=>{
      const cache=await caches.open(cacheName),cached=await cache.match(event.request);
      if(cached)return cached;
      const response=await fetch(event.request);
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    })());
  }
});
