/* Yachting Jurnal — service worker of the iPhone app. Keeps the app on the phone so it opens without internet,
   answers the window's requests from the phone's own storage (yerel.js), and installs new versions:
   a new version waits until the app is opened again (or "Update now" is tapped), then takes over. */
"use strict";
const SURUM = "3.1.0-736a9fba6aee";
const DOSYALAR = ["index.html", "app.js", "hesap.js", "gecmis.js", "paket.js", "fiyat.js", "para-secim.js", "tekne.js", "i18n.js", "yasal.js", "google.js", "senk.js", "drive-duzen.js", "rapor-fis.js", "ocr-ayikla.js", "ocr.js", "xlsx.js", "yerel.js", "rapor.html", "rapor.js", "konsolide.js", "manifest.webmanifest", "ikon.png", "ikon-180.png", "ikon-192.png", "ikon-512.png", "favicon.ico", "fon.mp3", "dil/fr.js", "dil/it.js", "dil/es.js", "dil/de.js", "dil/el.js"];
self.KJ_SURUM = "3.1.0";
importScripts("xlsx.js", "yerel.js");
const ONBELLEK = "kj-" + SURUM;
// The receipt reader's engine (ocr/): own cache, name NOT starting with "kj-" (or the clean-up below would delete it at every version).
// A new engine version = a new name here AND in ocr.js (ocr-model-2 ...); the activate step deletes the older "ocr-model-*" caches.
const OCR_ONBELLEK = "ocr-model-1";
const kapsam = () => new URL(self.registration.scope);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(ONBELLEK).then(c => c.addAll(DOSYALAR.map(f => new Request(f, { cache: "reload" })))));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith("kj-") && k !== ONBELLEK) || (k.startsWith("ocr-model-") && k !== OCR_ONBELLEK)) await caches.delete(k);
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
  // the receipt reader's engine and language data (ocr/): fetched on first use, kept in its own cache. The name must NOT start with
  // "kj-", or the clean-up above would delete it at every new version and the phone would download 9 MB again.
  if (yol.startsWith("ocr/")) {
    e.respondWith((async () => {
      const oc = await caches.open(OCR_ONBELLEK);
      const hit = await oc.match(e.request.url);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok && r.status === 200) { try { await oc.put(e.request.url, r.clone()); } catch (err) { /* storage full: it works, just not offline */ } }
      return r;
    })());
    return;
  }
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
