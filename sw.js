/* Kasa Jurnali — service worker of the iPhone app. Keeps the app on the phone so it opens without internet,
   answers the window's requests from the phone's own storage (yerel.js), and installs new versions:
   a new version waits until the app is opened again (or "Update now" is tapped), then takes over. */
"use strict";
const SURUM = "2.1.1-16abb96d8dc5";
const DOSYALAR = ["index.html", "app.js", "hesap.js", "i18n.js", "yasal.js", "google.js", "senk.js", "xlsx.js", "yerel.js", "rapor.html", "rapor.js", "manifest.webmanifest", "ikon.png", "ikon-180.png", "ikon-192.png", "ikon-512.png", "favicon.ico"];
self.KJ_SURUM = "2.1.1";
importScripts("xlsx.js", "yerel.js");
const ONBELLEK = "kj-" + SURUM;
const kapsam = () => new URL(self.registration.scope);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(ONBELLEK).then(c => c.addAll(DOSYALAR.map(f => new Request(f, { cache: "reload" })))));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("kj-") && k !== ONBELLEK) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("message", e => { if (e.data === "guncelle") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url), k = kapsam();
  if (url.origin !== k.origin || !url.pathname.startsWith(k.pathname)) return;   // Google and other sites: straight to the network
  const yol = url.pathname.slice(k.pathname.length);
  if (yol.startsWith("api/") || yol.startsWith("foto/") || yol === "rapor") { e.respondWith(self.KJ_YEREL.yanitla(e.request, yol, url)); return; }
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    const c = await caches.open(ONBELLEK);
    const r = await c.match(new URL(yol === "" ? "index.html" : yol, k).href, { ignoreSearch: true });
    if (r) return r;
    try { return await fetch(e.request); }
    catch (err) {
      if (e.request.mode === "navigate") { const i = await c.match(new URL("index.html", k).href); if (i) return i; }
      throw err;
    }
  })());
});
