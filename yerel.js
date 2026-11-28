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
  // Several boats (tekne.js): the first boat ("ana") keeps the keys it always had ("defter", "rev");
  // further boats use "defter:<id>" and "rev:<id>". The list of boats is "tekneler" (+ "tekneler-rev").
  const ANA = "ana", TEKNE = /^[a-z0-9]{1,32}$/;
  const anahtar = (ad, tekne) => !tekne || tekne === ANA ? ad : ad + ":" + tekne;
  async function defterAl(tekne) {
    const d = await al("kv", anahtar("defter", tekne)), rev = (await al("kv", anahtar("rev", tekne))) || 0;
    const df = Object.assign(bos(), d || {});
    if (!df.ayarlar || typeof df.ayarlar !== "object") df.ayarlar = {};
    if (!Array.isArray(df.kayitlar)) df.kayitlar = [];
    if (!df.silinenler || typeof df.silinenler !== "object") df.silinenler = {};
    return { df, rev, var: !!d };
  }
  // photos of entries cleared by "reset the book" ({id: time} in the setting korunanFoto): valid id, younger than 400 days, at most 5000 (same rule as app/tekne.go korunanFotolar)
  function korunanFoto(ayar) {
    const m = ayar && ayar.korunanFoto, l = [];
    if (!m || typeof m !== "object" || Array.isArray(m)) return l;
    for (const id of Object.keys(m)) { const z = Date.parse(m[id]); if (/^[a-f0-9]{24,40}$/.test(id) && typeof m[id] === "string" && !isNaN(z) && Date.now() - z <= 400 * 864e5) { l.push(id); if (l.length >= 5000) break; } }
    return l;
  }
  const gun = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  async function yaz(df, rev, onceki, tekne) {
    // a copy of the book as it was before today's first change; the newest 30 days are kept (for each boat)
    const on = !tekne || tekne === ANA ? "kasa-verisi-" : "tekne-" + tekne + "-", ad = on + gun();
    if (onceki && !(await al("yedek", ad))) {
      await koy("yedek", ad, JSON.stringify(onceki));
      const ys = (await anahtarlar("yedek")).filter(k => String(k).startsWith(on)).sort().reverse();
      for (const k of ys.slice(30)) await sil("yedek", k);
    }
    df.uygulama = "Kasa Jurnali"; df.surum = 2; df.kaydedilme = new Date().toISOString();
    await tx("kv", "readwrite", s => { s.put(df, anahtar("defter", tekne)); s.put(rev + 1, anahtar("rev", tekne)); });
    return rev + 1;
  }

  /* ---------------- the list of boats (same rules as app/tekne.go) ---------------- */
  const varsayilanIndeks = () => ({ surum: 1, sirket: { ad: "" }, tekneler: [{ id: ANA, ad: "", sira: 0, durum: "aktif" }] });
  async function indeksAl() { return { x: (await al("kv", "tekneler")) || varsayilanIndeks(), rev: (await al("kv", "tekneler-rev")) || 0 }; }
  function indeksDogrula(x) {
    if (!x || typeof x !== "object" || !Array.isArray(x.tekneler) || x.tekneler.length > 200) throw new Hata("geçersiz istek");
    const gor = new Set(), l = [];
    for (const t of x.tekneler) {
      if (!t || !TEKNE.test(t.id || "") || gor.has(t.id)) throw new Hata("geçersiz tekne kimliği");
      if (t.durum !== "aktif" && t.durum !== "arsiv") throw new Hata("geçersiz tekne durumu");
      const ad = String(t.ad || "").trim(); if (ad.length > 120) throw new Hata("geçersiz tekne adı");
      gor.add(t.id); l.push(Object.assign({ id: t.id, ad, sira: +t.sira || 0, durum: t.durum }, t.zaman ? { zaman: String(t.zaman).slice(0, 40) } : {}));
    }
    if (!gor.has(ANA)) l.unshift({ id: ANA, ad: "", sira: 0, durum: "aktif" });
    l.sort((a, b) => a.sira - b.sira);
    const s = x.sirket && typeof x.sirket === "object" ? x.sirket : {}, sad = String(s.ad || "").trim();
    if (sad.length > 200) throw new Hata("geçersiz şirket adı");
    return { surum: 1, sirket: Object.assign({ ad: sad }, s.zaman ? { zaman: String(s.zaman).slice(0, 40) } : {}), tekneler: l };
  }
  // the boat a request is for ("ana" when none); null for a boat that is not in the list
  async function tekneOf(istek, url) {
    const id = istek.headers.get("X-KJ-Tekne") || (url && url.searchParams.get("tekne")) || ANA;
    if (id === ANA) return ANA;
    if (!TEKNE.test(id)) return null;
    return (await indeksAl()).x.tekneler.some(t => t.id === id) ? id : null;
  }

  /* ---------------- the same rules as app/veri.go ---------------- */
  const KIMLIK = /^[A-Za-z0-9_-]{1,64}$/, FOTO = /^[a-f0-9]{24,40}$/;
  const YEREL = ["lang", "kabul", "guncelleme"];
  class Hata extends Error { constructor(m, kod, durum) { super(m); this.kod = kod || ""; this.durum = durum || 500; } }
  // date: YYYY-MM-DD, a real day, 2000-2100 (same as app/veri.go tarihGecerli and KJ.tarihGecerli in hesap.js)
  const TARIH_SIFIR = "0000-00-00", PARA_KOD = /^[A-Za-z]{3}$/;
  function tarihGecerli(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  // a whole book arriving (synchronisation, restore) is cleaned, never refused for these fields (CT-31); rules as app/veri.go kayitTemizle
  // and KJ.kayitTemizle (hesap.js): para / cur / date / photo / temizlenen, the originals kept, shortened, in `temizlenen`
  const alanYok = v => v === undefined || v === null || v === "";
  const kisalt = (v, n) => { const a = Array.from(typeof v === "string" ? v : (JSON.stringify(v) === undefined ? String(v) : JSON.stringify(v))); return a.length > n ? a.slice(0, n).join("") + "…" : a.join(""); };
  function temizlenenGecerli(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const k = Object.keys(v);
    return k.length <= 4 && k.every(a => typeof v[a] === "string" && (a === "zaman" ? v[a].length <= 40 && v[a].includes("T") : ["date", "para", "cur"].includes(a) && Array.from(v[a]).length <= 41));
  }
  function kayitTemizle(e) {
    const alan = [], ozgun = {};
    if (!alanYok(e.temizlenen) && !temizlenenGecerli(e.temizlenen)) { delete e.temizlenen; alan.push("temizlenen"); }
    if (!alanYok(e.photo) && !(typeof e.photo === "string" && FOTO.test(e.photo))) { delete e.photo; alan.push("photo"); }
    for (const a of ["para", "cur"]) {
      const v = e[a];
      if (alanYok(v) || (typeof v === "string" && PARA_KOD.test(v))) continue;
      ozgun[a] = v;
      if (a === "para" && typeof v !== "string") delete e[a]; else e[a] = "XXX";
      alan.push(a);
    }
    if (!tarihGecerli(e.date)) {
      if (e.date !== TARIH_SIFIR) { if (e.date !== undefined && e.date !== null) ozgun.date = e.date; alan.push("date"); }
      e.date = TARIH_SIFIR;
      if (e.para !== "XXX") {
        if (!alanYok(e.para) && !("para" in ozgun)) ozgun.para = e.para;
        e.para = "XXX";
        if (!alan.includes("para") && !alan.includes("date")) alan.push("para");
      }
    }
    if (Object.keys(ozgun).length && (e.temizlenen === undefined || e.temizlenen === null)) {
      const t = { zaman: new Date().toISOString() };
      for (const a in ozgun) t[a] = kisalt(ozgun[a], 40);
      e.temizlenen = t;
    }
    return alan;
  }
  let sonNotlar = [];
  function kayitlariTemizle(kayitlar) {
    sonNotlar = [];
    const liste = (kayitlar || []).filter(e => e && typeof e === "object"), temizler = [];
    for (const e of liste) {
      const tr = e.date, sat = e.vendor || e.desc || "", alanlar = kayitTemizle(e);
      if (alanlar.length) { const n = { tarih: kisalt(tr === undefined || tr === null ? "" : tr, 40), satici: kisalt(sat, 60), alanlar }; sonNotlar.push(n); temizler.push([n, e.id]); }
    }
    for (const [n, id] of temizler) if (n.alanlar.includes("date")) { const k = liste.filter(o => o.type === "iade" && o.iadeOf === id).length; if (k) n.iade = k; }
    // F-13: a refund bound to an entry with the date "0000-00-00" leaves the totals too (para "XXX"; as app/veri.go iadeleriDisla and KJ.kayitlariTemizle)
    const sifir = new Set(liste.filter(o => o.date === TARIH_SIFIR && o.id !== undefined).map(o => o.id));
    if (sifir.size) for (const o of liste) {
      if (o.type !== "iade" || !sifir.has(o.iadeOf) || o.para === "XXX") continue;
      if (typeof o.para === "string" && o.para !== "" && (o.temizlenen === undefined || o.temizlenen === null)) o.temizlenen = { zaman: new Date().toISOString(), para: kisalt(o.para, 40) };
      o.para = "XXX";
    }
  }
  // F-17/Q-2: a refused entry is told apart from a write failure ("Kayıt geçersiz", not "check the disk")
  function dogrula(k, toplu) { try { dogrulaIc(k, toplu); } catch (e) { if (e instanceof Hata) e.kayit = true; throw e; } }
  function dogrulaIc(k, toplu) {
    if (!k || typeof k !== "object" || !KIMLIK.test(k.id || "")) throw new Hata("geçersiz kayıt kimliği");
    if (!["in", "out", "tr", "iade"].includes(k.type)) throw new Hata("geçersiz kayıt türü");
    // a numeric text amount is read as the number (as K.tutarGecerli and app/veri.go do), CT-47
    // F-5: a single entry takes digits and a decimal point only ("12.5", " 12 "; not "1e3", "0x10", "1_000", "12,5") and at most 1e11; a whole book (toplu) is never refused for the ceiling: the window leaves such an entry out of the totals
    if (typeof k.amount === "string" && (toplu ? /^\s*\d+(\.\d+)?([eE][+-]?\d+)?\s*$/ : /^\s*\d+(\.\d+)?\s*$/).test(k.amount) && isFinite(Number(k.amount))) k.amount = Number(k.amount);
    if (typeof k.amount !== "number" || !isFinite(k.amount)) throw new Hata("tutar sayı olmalı");
    if (!toplu && (k.amount < 0 || k.amount > 1e11)) throw new Hata("tutar sınırı aşıldı");
    if (typeof k.date !== "string" || !k.date) throw new Hata("tarih eksik");
    if (!tarihGecerli(k.date) && !(toplu && k.date === TARIH_SIFIR && k.para === "XXX")) throw new Hata("geçersiz tarih");
    for (const a of ["para", "cur"]) if (!alanYok(k[a]) && !(typeof k[a] === "string" && PARA_KOD.test(k[a]))) throw new Hata("geçersiz para birimi");   // GT-1 (as app/veri.go)
    if (!alanYok(k.photo) && !(typeof k.photo === "string" && FOTO.test(k.photo))) throw new Hata("geçersiz fotoğraf kimliği");   // CT-44: it ends up in a web address
    if (!alanYok(k.temizlenen) && !temizlenenGecerli(k.temizlenen)) throw new Hata("geçersiz temizlik kaydı");
  }
  const acilisGecerli = v => { if (v === undefined || v === null || v === "") return true; const x = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(\.\d+)?([eE][+-]?\d+)?\s*$/.test(v.replace(/^\s*-/, "")) ? Number(v) : NaN; return isFinite(x) && Math.abs(x) <= 1e11; };   // as K.acilisGecerli (hesap.js) and acilisGecerli in app/veri.go
  const isoMu = z => typeof z === "string" && !isNaN(Date.parse(z)) && /^\d{4}-\d{2}-\d{2}T/.test(z);
  // deleted entries older than 400 days leave the archive; at most the newest 2000 are kept (same rule as gecmis.js and veri.go)
  function arsivBuda(a) {
    const sinir = Date.now() - 400 * 864e5;
    const l = Object.keys(a).filter(id => { const z = Date.parse((a[id] || {}).zaman); if (isNaN(z) || z < sinir) { delete a[id]; return false; } return true; });
    l.sort((x, y) => Date.parse(a[y].zaman) - Date.parse(a[x].zaman)).slice(2000).forEach(id => { delete a[id]; });
  }
  function uygula(df, rev, is) {
    sonNotlar = [];
    switch (is.islem) {
      case "kaydet": {
        dogrula(is.kayit);
        const i = df.kayitlar.findIndex(k => k.id === is.kayit.id);
        if (i >= 0) df.kayitlar[i] = is.kayit; else df.kayitlar.push(is.kayit);
        if (df.silinenKayitlar) delete df.silinenKayitlar[is.kayit.id];   // a restored entry leaves the archive
        break;
      }
      case "sil":
        if (!KIMLIK.test(is.id || "")) throw new Hata("geçersiz kayıt kimliği");
        df.kayitlar = df.kayitlar.filter(k => k.id !== is.id);
        df.silinenler[is.id] = isoMu(is.zaman) ? is.zaman : new Date().toISOString();
        if (is.arsiv && is.arsiv.kayit && is.arsiv.kayit.id === is.id) { df.silinenKayitlar = Object.assign({}, df.silinenKayitlar, { [is.id]: is.arsiv }); arsivBuda(df.silinenKayitlar); }
        break;
      case "senk": {
        if (!is.defter || typeof is.taban !== "number") throw new Hata("defter eksik");
        if (is.taban !== rev) throw new Hata("çakışma", "cakisma", 409);
        kayitlariTemizle(is.defter.kayitlar);
        (is.defter.kayitlar || []).forEach(k => dogrula(k, true));
        const a = Object.assign({}, is.defter.ayarlar || {});
        for (const k of YEREL) { if (k in df.ayarlar) a[k] = df.ayarlar[k]; else delete a[k]; }
        df.ayarlar = a; df.kayitlar = is.defter.kayitlar || []; df.silinenler = is.defter.silinenler || {};
        df.silinenKayitlar = is.defter.silinenKayitlar || {};
        break;
      }
      case "ayar": {
        const d = is.degisen || {}, z = is.damgalar || {};
        if (!Object.keys(d).length && !Object.keys(z).length) throw new Hata("ayarlar eksik");
        const eskiHes = new Map((Array.isArray(df.ayarlar.hesaplar) ? df.ayarlar.hesaplar : []).filter(h => h && typeof h === "object").map(h => [h.id, h.acilis]));   // a value already stored unchanged is not refused (CT-T4)
        if ((!acilisGecerli(d.opening) && String(d.opening) !== String(df.ayarlar.opening)) || (Array.isArray(d.hesaplar) && d.hesaplar.some(h => h && typeof h === "object" && !acilisGecerli(h.acilis) && !(eskiHes.has(h.id) && String(eskiHes.get(h.id)) === String(h.acilis))))) throw new Hata("tutar sınırı aşıldı");   // F-19: an opening above 1e11 is refused here (a whole book that arrives never is)
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
        (is.kayitlar || []).forEach(k => dogrula(k));   // (an index must never become the `toplu` flag, CT-45)
        df.kayitlar.push(...(is.kayitlar || []));
        break;
      case "tumunu": case "geriyukle":
        if (!is.defter) throw new Hata("defter eksik");
        if (typeof is.taban === "number" && is.taban !== rev) throw new Hata("çakışma", "cakisma", 409);
        kayitlariTemizle(is.defter.kayitlar);
        (is.defter.kayitlar || []).forEach(k => dogrula(k, true));
        df.ayarlar = is.defter.ayarlar || {}; df.kayitlar = is.defter.kayitlar || [];
        if (is.defter.silinenler) df.silinenler = is.defter.silinenler;
        if (is.defter.silinenKayitlar) df.silinenKayitlar = is.defter.silinenKayitlar;
        break;
      default: throw new Hata("bilinmeyen işlem");
    }
  }

  /* ---------------- answers ---------------- */
  const json = (v, durum) => new Response(JSON.stringify(v), { status: durum || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const yok = () => new Response(null, { status: 204 });
  const hata = (m, durum, kod) => json({ hata: m, kod: kod || "" }, durum || 500);
  const EN = {
    "geçersiz kayıt kimliği": "invalid entry id", "geçersiz kayıt türü": "invalid entry type", "tutar sayı olmalı": "amount must be a number", "tarih eksik": "date missing", "geçersiz para birimi": "invalid currency", "geçersiz tarih": "invalid date", "geçersiz fotoğraf kimliği": "invalid photo id", "geçersiz temizlik kaydı": "invalid clean-up record",
    "defter eksik": "book missing", "ayarlar eksik": "settings missing", "geçersiz ayar": "invalid setting", "geçersiz ayar zamanı": "invalid setting time", "bilinmeyen işlem": "unknown operation",
    "Kaydedilemedi": "Could not save", "Kayıt geçersiz": "Entry not valid", "tutar sınırı aşıldı": "the amount is above the limit", "Fotoğraf kaydedilemedi": "The photo could not be saved", "Kayıtlar bu arada değişti; yeniden deneyin.": "The records changed meanwhile; please try again.",
    "Bu dosya bir Excel (.xlsx) dosyası değil. Eski .xls dosyalarını Excel'de açıp .xlsx olarak kaydedin.": "This file is not an Excel (.xlsx) file. Open old .xls files in Excel and save them as .xlsx.",
    "Excel dosyası okunamadı (çalışma kitabı yok).": "The Excel file could not be read (no workbook).", "Excel dosyasında okunabilir sayfa bulunamadı.": "No readable sheet was found in the Excel file.", "Excel dosyası beklenenden çok büyük açılıyor; okunmadı.": "The Excel file unpacks to far more than expected; it was not read.",
    "Rapor bulunamadı": "Report not found", "Tekne bulunamadı": "Boat not found", "geçersiz tekne kimliği": "invalid boat id", "geçersiz tekne durumu": "invalid boat status", "geçersiz tekne adı": "invalid boat name", "geçersiz şirket adı": "invalid company name", "geçersiz istek": "invalid request", "Bu işlem iPhone uygulamasında yok.": "This is not available in the iPhone app."
  };
  // the window's languages; this storage's own messages exist in Turkish and English (English for all but Turkish)
  const DILLER = ["tr", "en", "fr", "it", "es", "de", "el"];
  const dilOf = d => DILLER.includes(d) ? d : "";
  const cevir = (dil, m) => dil && dil !== "tr" ? (EN[m] || m.split(": ").map(p => EN[p] || p).join(": ")) : m;

  async function veri(tekne) {
    const { df, rev, var: v } = await defterAl(tekne);
    if (tekne !== ANA) {   // settings chosen on this phone (language, terms) are the same whichever boat is open
      const ana = (await defterAl(ANA)).df.ayarlar;
      for (const k of YEREL) { if (k in ana) df.ayarlar[k] = ana[k]; else delete df.ayarlar[k]; }
    }
    return json({ defter: df, rev, klasor: "", dosya: "", ilk: !v, uyari: "", surum: g.KJ_SURUM || "" });
  }
  async function islem(govde, dil, tekne) {
    let is;
    try { is = JSON.parse(govde); } catch (e) { return hata(cevir(dil, "geçersiz istek"), 400); }
    return sirayla(async () => {
      if (tekne !== ANA && is.islem === "ayar" && is.degisen) {   // device settings go to the first boat's book
        const yerel = {}, kalan = {};
        for (const k in is.degisen) (YEREL.includes(k) ? yerel : kalan)[k] = is.degisen[k];
        if (Object.keys(yerel).length) {
          const a = await defterAl(ANA), o = JSON.parse(JSON.stringify(a.df));
          try { uygula(a.df, a.rev, { islem: "ayar", degisen: yerel }); } catch (e) { return hata(cevir(dil, "Kaydedilemedi: " + e.message), 500); }
          await yaz(a.df, a.rev, o, ANA);
        }
        is = Object.assign({}, is, { degisen: kalan });
        if (!Object.keys(kalan).length && !Object.keys(is.damgalar || {}).length) return json({ rev: (await defterAl(tekne)).rev, zaman: new Date().toISOString() });
      }
      const { df, rev } = await defterAl(tekne);
      const onceki = JSON.parse(JSON.stringify(df));
      try { uygula(df, rev, is); }
      catch (e) {
        if (e.kod === "cakisma") return hata(cevir(dil, "Kayıtlar bu arada değişti; yeniden deneyin."), 409, "cakisma");
        if (e.kayit) return hata(cevir(dil, "Kayıt geçersiz: " + e.message), 400, "kayit-gecersiz");
        return hata(cevir(dil, "Kaydedilemedi: " + e.message), 500);
      }
      const yeni = await yaz(df, rev, onceki, tekne);
      return json(Object.assign({ rev: yeni, zaman: new Date().toISOString() }, sonNotlar.length ? { temizlenen: sonNotlar.map(n => ({ tarih: n.tarih, satici: n.satici, alanlar: n.alanlar })) } : {}));
    });
  }
  async function fotoKoy(id, istek) {
    const veri = await istek.arrayBuffer();
    if (veri.byteLength > 25 << 20) throw new Hata("çok büyük");
    await koy("foto", id, { tur: istek.headers.get("Content-Type") || "image/jpeg", veri, zaman: Date.now() });
  }
  const yeniId = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); };

  // Receipt pictures of the Excel "Fişler" sheet (rapor-fis.js): the photos kept on this phone are read, shrunk (longest side 900 px) and
  // handed to xlsx.js. The phone keeps less in memory than the computer: at most 150 pictures and 30 MB per workbook; the limit is
  // checked BEFORE a picture is added (a photo that cannot be shrunk is only used when it still fits), the rest is left out.
  async function resimleriHazirla(sayfalar) {
    let sayi = 0, toplam = 0;
    for (const sf of Array.isArray(sayfalar) ? sayfalar : []) {
      const l = Array.isArray(sf.resimler) ? sf.resimler : [], sig = sf.sig; delete sf.sig;
      sf.resimler = [];
      for (const r of l) {
        if (sayi >= 150 || toplam >= 30 << 20) break;
        if (!r || !FOTO.test(r.foto || "")) continue;
        try {
          const f = await al("foto", r.foto); if (!f || !f.veri) continue;
          const k = await kucult(f.veri); if (!k || toplam + k.veri.length > 30 << 20) continue;
          sayi++; toplam += k.veri.length;
          sf.resimler.push({ r: r.r, veri: k.veri, kutuGen: r.kutuGen, kutuYuk: r.kutuYuk });
        } catch (e) { }
      }
      const eksik = l.filter(r => r && FOTO.test(r.foto || "")).length - sf.resimler.length;   // pictures that did not go in: the sheet says so (CT-R14)
      if (eksik > 0 && sig && /^[A-Z]{1,3}\d{1,6}$/.test(sig.r || "") && typeof sig.metin === "string") (sf.hucreler = sf.hucreler || []).push({ r: sig.r, v: sig.metin.replace("{n}", String(eksik)), st: "etiket", f: "" });
    }
  }
  async function kucult(veri) {   // → { veri: Uint8Array } (JPEG, at most 900 px); the photo as it is when the phone cannot shrink it
    const ham = new Uint8Array(veri);
    if (!(ham[0] === 0xFF && ham[1] === 0xD8)) return null;
    try {
      if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return { veri: ham };
      const bmp = await createImageBitmap(new Blob([ham], { type: "image/jpeg" })), k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
      if (k >= 1) return { veri: ham };
      const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k))), x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      return { veri: new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg", quality: 0.72 })).arrayBuffer()) };
    } catch (e) { return { veri: ham }; }
  }

  async function rapor(url, dil0) {
    const q = url.searchParams, aylar = (q.get("ay") || "").split(",").filter(a => /^\d{4}-\d{2}$/.test(a));
    const dil = dilOf(q.get("dil")) || dilOf(dil0) || "tr";
    if (!aylar.length) return new Response(cevir(dil, "Rapor bulunamadı"), { status: 404 });
    const sablon = await caches.match(new URL("rapor.html", g.registration.scope).href);
    if (!sablon) return new Response("rapor.html", { status: 500 });
    const tekne = q.get("tekne") || ANA;
    if (tekne !== ANA && !(await indeksAl()).x.tekneler.some(t => t.id === tekne)) return new Response(cevir(dil, "Tekne bulunamadı"), { status: 404 });
    const { df } = await defterAl(tekne);
    const veri = JSON.stringify({ defter: df, aylar, fotograflar: q.get("foto") !== "0", yazdir: false, kartEkstresi: q.get("kart") === "1", dil, olusturma: new Date().toISOString(), token: "", surum: g.KJ_SURUM || "", ortam: "web" }).replace(/</g, "\\u003c");
    const T = dil !== "tr"
      ? { alt: "Prepared with Yachting Jurnal · For information only; not an official accounting record.", sayfa: '"Page " counter(page) " of " counter(pages)', yazdir: "Print / PDF", geri: "‹ Back" }
      : { alt: "Yachting Jurnal ile hazırlanmıştır · Bilgi amaçlıdır; resmî muhasebe kaydı yerine geçmez.", sayfa: '"Sayfa " counter(page) " / " counter(pages)', yazdir: "Yazdır / PDF", geri: "‹ Geri" };
    let h = await sablon.text();
    h = h.split("{{DIL}}").join(dil).split("{{ALT}}").join(T.alt).split("{{SAYFA}}").join(T.sayfa).split("{{YAZDIR}}").join(T.yazdir)
      .split("{{GERI}}").join('<a class="geri" href="./">' + T.geri + "</a>");
    h = h.split("/*VERI*/null").join(veri);   // CT-G9: veri en son (kayıt metnindeki {{...}} sonradan değişmez)
    return new Response(h, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // yanitla: answers one request of the window (path is relative to the app's address)
  async function yanitla(istek, yol, url) {
    const m = istek.method, dil = dilOf(istek.headers.get("X-KJ-Dil")) || "tr";
    try {
      if (yol === "api/kimlik") return json({ uygulama: "kasa-jurnali", surum: g.KJ_SURUM || "" });
      if (yol === "api/tekneler") {
        if (m === "GET") { const { x, rev } = await indeksAl(); return json({ indeks: x, rev }); }
        if (m === "POST") {
          let b; try { b = JSON.parse(await istek.text()); } catch (e) { return hata(cevir(dil, "geçersiz istek"), 400); }
          return sirayla(async () => {
            const { rev } = await indeksAl();
            if (typeof b.taban === "number" && b.taban !== rev) return hata(cevir(dil, "Kayıtlar bu arada değişti; yeniden deneyin."), 409, "cakisma");
            let x; try { x = indeksDogrula(b.indeks); } catch (e) { return hata(cevir(dil, "Kaydedilemedi: " + e.message), 400); }
            await tx("kv", "readwrite", s => { s.put(x, "tekneler"); s.put(rev + 1, "tekneler-rev"); });
            return json({ indeks: x, rev: rev + 1 });
          });
        }
      }
      if (yol === "api/veri" || yol === "api/ping" || yol === "api/islem") {
        const tekne = await tekneOf(istek, url);
        if (!tekne) return hata(cevir(dil, "Tekne bulunamadı"), 404);
        if (yol === "api/veri" && m === "GET") return await veri(tekne);
        if (yol === "api/ping") return json({ rev: (await al("kv", anahtar("rev", tekne))) || 0, trev: (await al("kv", "tekneler-rev")) || 0 });
        if (yol === "api/islem" && m === "POST") return await islem(await istek.text(), dil, tekne);
      }
      if (yol === "api/sifirlama-kopya") {   // the full copy of the book taken just before "reset the book": its own key, never pruned (only the latest; 400 days or "delete for good")
        const tekne = await tekneOf(istek, url);
        if (!tekne) return hata(cevir(dil, "Tekne bulunamadı"), 404);
        const ad = anahtar("sifirlama", tekne);
        if (m === "POST") return sirayla(async () => {
          const { df, var: varMi } = await defterAl(tekne);
          if (!varMi) return hata(cevir(dil, "Kaydedilemedi: defter yok"), 409);
          const kayit = { zaman: new Date().toISOString(), kayitSayisi: df.kayitlar.length, para: df.ayarlar.para || "", defter: JSON.parse(JSON.stringify(df)) };
          await koy("kv", ad, kayit);                                             // an error here fails the request: the caller does not reset
          const geri = await al("kv", ad);
          if (!geri || geri.zaman !== kayit.zaman || !geri.defter || geri.defter.kayitlar.length !== kayit.kayitSayisi || JSON.stringify(geri.defter) !== JSON.stringify(kayit.defter)) return hata(cevir(dil, "Kaydedilemedi: kopya doğrulanamadı"), 500);
          return json({ zaman: kayit.zaman, kayitSayisi: kayit.kayitSayisi, para: kayit.para });
        });
        if (m === "GET") {
          const k = await al("kv", ad);
          if (k && Date.now() - Date.parse(k.zaman || 0) > 400 * 864e5) { await sil("kv", ad); return json({ var: false }); }
          if (!k || !k.defter) return json({ var: false });
          return json(url.searchParams.get("tam") === "1" ? { var: true, zaman: k.zaman, kayitSayisi: k.kayitSayisi, para: k.para, defter: k.defter } : { var: true, zaman: k.zaman, kayitSayisi: k.kayitSayisi, para: k.para });
        }
        if (m === "DELETE") { await sil("kv", ad); return yok(); }
      }
      if (yol === "api/kur") {   // TCMB rates: kur.json on the site (refreshed there by a scheduled task); the last one stays for offline use
        try {
          const r = await fetch(new URL("kur.json", g.registration.scope).href, { cache: "no-store" });
          if (r.ok) { const y = await r.json(); if (y && Array.isArray(y.kurlar) && y.kurlar.length) { await koy("kv", "kur", y); return json(y); } }
        } catch (e) { /* offline: fall back to the last rates */ }
        const eski = await al("kv", "kur");
        return eski ? json(Object.assign({}, eski, { eski: true })) : json({ hata: "Kurlar alınamadı." }, 502);
      }
      if (yol === "api/foto" && m === "POST") { const id = yeniId(); await fotoKoy(id, istek); return json({ id }); }
      if (yol.startsWith("api/foto/")) {
        const id = yol.slice(9); if (!FOTO.test(id)) return hata(cevir(dil, "Fotoğraf kaydedilemedi") + ": invalid id", 400);
        if (m === "PUT") { await fotoKoy(id, istek); return yok(); }
        if (m === "DELETE") { await sil("foto", id); return yok(); }
      }
      if (yol === "api/fotolar") return json({ ids: (await anahtarlar("foto")).filter(k => FOTO.test(k)) });
      if (yol === "api/foto-temizle" && m === "POST") {
        const tut = new Set((JSON.parse(await istek.text() || "{}").tut) || []);
        const dl = {}; for (const t of (await indeksAl()).x.tekneler) dl[t.id] = (await defterAl(t.id)).df;   // every boat's photos stay, archived boats too
        for (const d of Object.values(dl)) for (const k of [...(d.kayitlar || []), ...Object.values(d.silinenKayitlar || {}).map(x => x && x.kayit || {})]) if (k && k.photo) tut.add(k.photo);   // + deleted-entry archives (T-3)
        for (const d of Object.values(dl)) for (const id of korunanFoto(d.ayarlar)) tut.add(id);   // + the photos of a reset book, kept 400 days
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
        await resimleriHazirla(x.sayfalar);
        return new Response(g.KJ_XLSX.yaz(x.sayfalar, x.dil, x.para), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Cache-Control": "no-store" } });
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
