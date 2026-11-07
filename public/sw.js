/* Static-only offline cache. Player data and daily rewards always use the network. */
const CACHE = 'hormuz-static-v4';
const CORE = ['/', '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-512.png'];
const MODEL_ASSETS = [
  ...['cannon','heavy','missile','air','ew','boat'].flatMap(kind => ['1','2','3','a','b'].map(level => `/assets/models/towers/${kind}-${level}.png`)),
  ...['oil','tank','dock','refinery','steel','arms','power','water','city'].map(name => `/assets/buildings/${name}.png`),
  ...['harbor','energy','supply'].map(name => `/assets/managers/${name}.jpg`),
  '/assets/reward-crate.png','/images/hormuz-map-optimized.jpg','/images/hormuz-map-portrait-optimized.jpg',
  ...['patrol','destroyer','cruiser','battleship','carrier','submarine','aircraft','merchant','freighter','container','tanker','gun','battleship-gun'].map(name=>`/assets/ships/${name}.png`),
  ...['ship_small_body','ship_small_b_body','ship_medium_body','ship_medium_body_b','ship_large_body','ship_small_body_destroyed','ship_medium_body_destroyed','ship_large_body_destroyed','ship_gun_gray','ship_gun_dual_gray','ship_big_gun_dual'].map(name=>`/assets/ships/chabull/${name}.png`),
  ...['small','medium','big'].flatMap(size=>[0,1,2,3,4].map(frame=>`/assets/ships/chabull/water_ripple_${size}_00${frame}.png`)),
  '/assets/towers/Missile.png','/assets/towers/Bullet_Cannon.png',

];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    const shell = await cache.match('/');
    const html = shell ? await shell.text() : '';
    const chunks = [...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match => match[1].replaceAll('&amp;','&'));
    await Promise.allSettled([...new Set([...chunks,...MODEL_ASSETS])].map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hormuz-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
async function remember(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  const keys = await cache.keys();
  if (keys.length > 180) {
    const removable = keys.filter(key => !CORE.includes(new URL(key.url).pathname));
    await Promise.all(removable.slice(0, keys.length - 180).map(key => cache.delete(key)));
  }
  return response;
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) throw new Error('Game shell unavailable');
      return remember('/', response);
    }).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/') || url.pathname.startsWith('/app-icon') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => remember(request, response))));
  }
});
