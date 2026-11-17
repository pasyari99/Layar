const SHELL = 'layar-shell-v1';
const MEDIA = 'layar-media-v1';            // harus sama dengan di index.html
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== MEDIA) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // API & video sumber: langsung ke jaringan
  const base = new URL(self.registration.scope).pathname;
  const rel = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : '';
  if (rel.startsWith('v/') || rel.startsWith('t/')) e.respondWith(media(e.request));
  else e.respondWith(shell(e.request));
});

// Video tersimpan, dengan dukungan Range supaya bisa di-seek (wajib di Safari)
async function media(req) {
  const res = await (await caches.open(MEDIA)).match(req.url);
  if (!res) return new Response('Tidak ditemukan', { status: 404 });
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') || '');
  if (!range) return res;
  const blob = await res.blob();
  const start = +range[1];
  const end = range[2] ? Math.min(+range[2], blob.size - 1) : blob.size - 1;
  if (start >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

// App shell: tampilkan dari cache dulu, perbarui di belakang layar
async function shell(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || (await cache.match('index.html')) || Response.error();
}
