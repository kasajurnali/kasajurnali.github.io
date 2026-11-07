/* Yachting Jurnal — the iPhone app's own storage. It runs inside the service worker (sw.js) and answers the same
   requests as the computer program (app/sunucu.go + app/veri.go), so the window code is the same on both.
   Everything is kept in the app's IndexedDB on the phone: the book, receipt photos and daily backups. */
"use strict";
(function (g) {
  const DB_ADI = "kasa-jurnali";
  let dbSoz = null;
  function db() {
    if (!dbSoz) dbSoz = new Promise((res, rej) => {
      const r = indexedDB.open(DB_ADI, 1);
      r.onupgradeneeded = () => { const d = r.result; for (const s of ["kv", "foto", "yedek"]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbSoz = null; }; res(d); };
      r.onerror = () => { dbSoz = null; rej(r.error); };
    });
    return dbSoz;
  }
  async function tx(depo, mod, f) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(depo, mod), s = t.objectStore(depo); let sonuc;
      const r = f(s); if (r) r.onsuccess = () => { sonuc = r.result; };
      t.oncomplete = () => res(sonuc); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("iptal"));
    });
  }
  const al = (depo, k) => tx(depo, "readonly", s => s.get(k));
  const koy = (depo, k, v) => tx(depo, "readwrite", s => s.put(v, k));
  const sil = (depo, k) => tx(depo, "readwrite", s => s.delete(k));
  const anahtarlar = depo => tx(depo, "readonly", s => s.getAllKeys());

  // one change at a time (the same as the program's lock)
  let kuyruk = Promise.resolve();
  const sirayla = f => { const p = kuyruk.then(f, f); kuyruk = p.catch(() => { }); return p; };

  const bos = () => ({ uygulama: "Kasa Jurnali", surum: 2, kaydedilme: "", ayarlar: {}, kayitlar: [], silinenler: {} });
  async function defterAl() {
    const d = await al("kv", "defter"), rev = (await al("kv", "rev")) || 0;
    const df = Object.assign(bos(), d || {});
    if (!df.ayarlar || typeof df.ayarlar !== "object") df.ayarlar = {};
    if (!Array.isArray(df.kayitlar)) df.kayitlar = [];
    if (!df.silinenler || typeof df.silinenler !== "object") df.silinenler = {};
    return { df, rev, var: !!d };
  }
  const gun = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  async function yaz(df, rev, onceki) {
    // a copy of the book as it was before today's first change; the newest 30 days are kept
    const ad = "kasa-verisi-" + gun();
    if (onceki && !(await al("yedek", ad))) {
      await koy("yedek", ad, JSON.stringify(onceki));
      const ys = (await anahtarlar("yedek")).filter(k => String(k).startsWith("kasa-verisi-")).sort().reverse();
      for (const k of ys.slice(30)) await sil("yedek", k);
    }
    df.uygulama = "Kasa Jurnali"; df.surum = 2; df.kaydedilme = new Date().toISOString();
    await tx("kv", "readwrite", s => { s.put(df, "defter"); s.put(rev + 1, "rev"); });
    return rev + 1;
  }

  /* ---------------- the same rules as app/veri.go ---------------- */
  const KIMLIK = /^[A-Za-z0-9_-]{1,64}$/, FOTO = /^[a-f0-9]{24,40}$/;
  const YEREL = ["lang", "kabul", "guncelleme"];
  class Hata extends Error { constructor(m, kod, durum) { super(m); this.kod = kod || ""; this.durum = durum || 500; } }
  function dogrula(k) {
    if (!k || typeof k !== "object" || !KIMLIK.test(k.id || "")) throw new Hata("geçersiz kayıt kimliği");
    if (k.type !== "in" && k.type !== "out") throw new Hata("geçersiz kayıt türü");
    if (typeof k.amount !== "number" || !isFinite(k.amount)) throw new Hata("tutar sayı olmalı");
    if (typeof k.date !== "string" || k.date.length !== 10) throw new Hata("tarih eksik");
  }
  const isoMu = z => typeof z === "string" && !isNaN(Date.parse(z)) && /^\d{4}-\d{2}-\d{2}T/.test(z);
  function uygula(df, rev, is) {
    switch (is.islem) {
      case "kaydet": {
        dogrula(is.kayit);
        const i = df.kayitlar.findIndex(k => k.id === is.kayit.id);
        if (i >= 0) df.kayitlar[i] = is.kayit; else df.kayitlar.push(is.kayit);
        break;
      }
      case "sil":
        if (!KIMLIK.test(is.id || "")) throw new Hata("geçersiz kayıt kimliği");
        df.kayitlar = df.kayitlar.filter(k => k.id !== is.id);
        df.silinenler[is.id] = isoMu(is.zaman) ? is.zaman : new Date().toISOString();
        break;
      case "senk": {
        if (!is.defter || typeof is.taban !== "number") throw new Hata("defter eksik");
        if (is.taban !== rev) throw new Hata("çakışma", "cakisma", 409);
        (is.defter.kayitlar || []).forEach(dogrula);
        const a = Object.assign({}, is.defter.ayarlar || {});
        for (const k of YEREL) { if (k in df.ayarlar) a[k] = df.ayarlar[k]; else delete a[k]; }
        df.ayarlar = a; df.kayitlar = is.defter.kayitlar || []; df.silinenler = is.defter.silinenler || {};
        break;
      }
      case "ayar": {
        const d = is.degisen || {}, z = is.damgalar || {};
        if (!Object.keys(d).length && !Object.keys(z).length) throw new Hata("ayarlar eksik");
        for (const k in d) { if (!k || k === "_zaman" || k.length > 64) throw new Hata("geçersiz ayar"); df.ayarlar[k] = d[k]; }
        if (Object.keys(z).length) {
          const zz = Object.assign({}, df.ayarlar._zaman || {});
          for (const k in z) { if (!isoMu(z[k]) || k.length > 80) throw new Hata("geçersiz ayar zamanı"); zz[k] = z[k]; }
          df.ayarlar._zaman = zz;
        }
        break;
      }
      case "ayarlar":
        if (!is.ayarlar || typeof is.ayarlar !== "object") throw new Hata("ayarlar eksik");
        df.ayarlar = is.ayarlar;
        break;
      case "toplu":
        (is.kayitlar || []).forEach(dogrula);
        df.kayitlar.push(...(is.kayitlar || []));
        break;
      case "tumunu": case "geriyukle":
        if (!is.defter) throw new Hata("defter eksik");
        if (typeof is.taban === "number" && is.taban !== rev) throw new Hata("çakışma", "cakisma", 409);
        (is.defter.kayitlar || []).forEach(dogrula);
        df.ayarlar = is.defter.ayarlar || {}; df.kayitlar = is.defter.kayitlar || [];
        if (is.defter.silinenler) df.silinenler = is.defter.silinenler;
        break;
      default: throw new Hata("bilinmeyen işlem");
    }
  }

  /* ---------------- answers ---------------- */
  const json = (v, durum) => new Response(JSON.stringify(v), { status: durum || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const yok = () => new Response(null, { status: 204 });
  const hata = (m, durum, kod) => json({ hata: m, kod: kod || "" }, durum || 500);
  const EN = {
    "geçersiz kayıt kimliği": "invalid entry id", "geçersiz kayıt türü": "invalid entry type", "tutar sayı olmalı": "amount must be a number", "tarih eksik": "date missing",
    "defter eksik": "book missing", "ayarlar eksik": "settings missing", "geçersiz ayar": "invalid setting", "geçersiz ayar zamanı": "invalid setting time", "bilinmeyen işlem": "unknown operation",
    "Kaydedilemedi": "Could not save", "Fotoğraf kaydedilemedi": "The photo could not be saved", "Kayıtlar bu arada değişti; yeniden deneyin.": "The records changed meanwhile; please try again.",
    "Bu dosya bir Excel (.xlsx) dosyası değil. Eski .xls dosyalarını Excel'de açıp .xlsx olarak kaydedin.": "This file is not an Excel (.xlsx) file. Open old .xls files in Excel and save them as .xlsx.",
    "Excel dosyası okunamadı (çalışma kitabı yok).": "The Excel file could not be read (no workbook).", "Excel dosyasında okunabilir sayfa bulunamadı.": "No readable sheet was found in the Excel file.",
    "Rapor bulunamadı": "Report not found", "geçersiz istek": "invalid request", "Bu işlem iPhone uygulamasında yok.": "This is not available in the iPhone app."
  };
  const cevir = (dil, m) => dil === "en" ? (EN[m] || m.split(": ").map(p => EN[p] || p).join(": ")) : m;

  async function veri() {
    const { df, rev, var: v } = await defterAl();
    return json({ defter: df, rev, klasor: "", dosya: "", ilk: !v, uyari: "", surum: g.KJ_SURUM || "" });
  }
  async function islem(govde, dil) {
    let is;
    try { is = JSON.parse(govde); } catch (e) { return hata(cevir(dil, "geçersiz istek"), 400); }
    return sirayla(async () => {
      const { df, rev } = await defterAl();
      const onceki = JSON.parse(JSON.stringify(df));
      try { uygula(df, rev, is); }
      catch (e) {
        if (e.kod === "cakisma") return hata(cevir(dil, "Kayıtlar bu arada değişti; yeniden deneyin."), 409, "cakisma");
        return hata(cevir(dil, "Kaydedilemedi: " + e.message), 500);
      }
      const yeni = await yaz(df, rev, onceki);
      return json({ rev: yeni, zaman: new Date().toISOString() });
    });
  }
  async function fotoKoy(id, istek) {
    const veri = await istek.arrayBuffer();
    if (veri.byteLength > 25 << 20) throw new Hata("çok büyük");
    await koy("foto", id, { tur: istek.headers.get("Content-Type") || "image/jpeg", veri, zaman: Date.now() });
  }
  const yeniId = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); };

  async function rapor(url, dil0) {
    const q = url.searchParams, aylar = (q.get("ay") || "").split(",").filter(a => /^\d{4}-\d{2}$/.test(a));
    const dil = q.get("dil") === "en" ? "en" : dil0 === "en" ? "en" : "tr";
    if (!aylar.length) return new Response(cevir(dil, "Rapor bulunamadı"), { status: 404 });
    const sablon = await caches.match(new URL("rapor.html", g.registration.scope).href);
    if (!sablon) return new Response("rapor.html", { status: 500 });
    const { df } = await defterAl();
    const veri = JSON.stringify({ defter: df, aylar, fotograflar: q.get("foto") !== "0", yazdir: false, dil, olusturma: new Date().toISOString(), token: "", surum: g.KJ_SURUM || "", ortam: "web" }).replace(/<\//g, "<\\/");
    const T = dil === "en"
      ? { alt: "Prepared with Yachting Jurnal · For information only; not an official accounting record.", sayfa: '"Page " counter(page) " of " counter(pages)', yazdir: "Print / PDF", geri: "‹ Back" }
      : { alt: "Yachting Jurnal ile hazırlanmıştır · Bilgi amaçlıdır; resmî muhasebe kaydı yerine geçmez.", sayfa: '"Sayfa " counter(page) " / " counter(pages)', yazdir: "Yazdır / PDF", geri: "‹ Geri" };
    let h = await sablon.text();
    h = h.split("/*VERI*/null").join(veri).split("{{DIL}}").join(dil).split("{{ALT}}").join(T.alt).split("{{SAYFA}}").join(T.sayfa).split("{{YAZDIR}}").join(T.yazdir)
      .split("{{GERI}}").join('<a class="geri" href="./">' + T.geri + "</a>");
    return new Response(h, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // yanitla: answers one request of the window (path is relative to the app's address)
  async function yanitla(istek, yol, url) {
    const m = istek.method, dil = istek.headers.get("X-KJ-Dil") === "en" ? "en" : "tr";
    try {
      if (yol === "api/kimlik") return json({ uygulama: "kasa-jurnali", surum: g.KJ_SURUM || "" });
      if (yol === "api/veri" && m === "GET") return await veri();
      if (yol === "api/ping") return json({ rev: (await al("kv", "rev")) || 0 });
      if (yol === "api/kur") {   // TCMB rates: kur.json on the site (refreshed there by a scheduled task); the last one stays for offline use
        try {
          const r = await fetch(new URL("kur.json", g.registration.scope).href, { cache: "no-store" });
          if (r.ok) { const y = await r.json(); if (y && Array.isArray(y.kurlar) && y.kurlar.length) { await koy("kv", "kur", y); return json(y); } }
        } catch (e) { /* offline: fall back to the last rates */ }
        const eski = await al("kv", "kur");
        return eski ? json(Object.assign({}, eski, { eski: true })) : json({ hata: "Kurlar alınamadı." }, 502);
      }
      if (yol === "api/islem" && m === "POST") return await islem(await istek.text(), dil);
      if (yol === "api/foto" && m === "POST") { const id = yeniId(); await fotoKoy(id, istek); return json({ id }); }
      if (yol.startsWith("api/foto/")) {
        const id = yol.slice(9); if (!FOTO.test(id)) return hata(cevir(dil, "Fotoğraf kaydedilemedi") + ": invalid id", 400);
        if (m === "PUT") { await fotoKoy(id, istek); return yok(); }
        if (m === "DELETE") { await sil("foto", id); return yok(); }
      }
      if (yol === "api/fotolar") return json({ ids: (await anahtarlar("foto")).filter(k => FOTO.test(k)) });
      if (yol === "api/foto-temizle" && m === "POST") {
        const tut = new Set((JSON.parse(await istek.text() || "{}").tut) || []);
        const { df } = await defterAl(); df.kayitlar.forEach(k => { if (k.photo) tut.add(k.photo); });
        let n = 0;
        for (const id of await anahtarlar("foto")) { if (tut.has(id)) continue; const f = await al("foto", id); if (f && Date.now() - (f.zaman || 0) > 3600e3) { await sil("foto", id); n++; } }
        return json({ silinen: n });
      }
      if (yol.startsWith("foto/") && m === "GET") {
        const f = await al("foto", yol.slice(5).replace(/\.jpg$/, ""));
        return f ? new Response(f.veri, { headers: { "Content-Type": f.tur || "image/jpeg", "Cache-Control": "private, max-age=86400" } }) : new Response("", { status: 404 });
      }
      if (yol === "api/excel" && m === "POST") {
        const x = JSON.parse(await istek.text());
        return new Response(g.KJ_XLSX.yaz(x.sayfalar, x.dil), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Cache-Control": "no-store" } });
      }
      if (yol === "api/excel-oku" && m === "POST") {
        try { return json(await g.KJ_XLSX.oku(await istek.arrayBuffer())); }
        catch (e) { return hata(cevir(dil, e.message), 400); }
      }
      if (yol === "api/anahtar") {   // the Google key, kept only on this phone
        if (m === "GET") return json((await al("kv", "google")) || {});
        if (m === "POST") { await koy("kv", "google", JSON.parse(await istek.text())); return yok(); }
        if (m === "DELETE") { await sil("kv", "google"); return yok(); }
      }
      if (yol === "rapor") return await rapor(url, dil);
      if (yol === "api/kapat" || yol === "api/veda") return yok();
      return hata(cevir(dil, "Bu işlem iPhone uygulamasında yok."), 404);
    } catch (e) {
      return hata(String(e && e.message || e), 500);
    }
  }
  g.KJ_YEREL = { yanitla };
})(self);
