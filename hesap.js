/* Yachting Jurnal — shared bookkeeping rules and language support, used by the window and the PDF report. */
"use strict";
(function (g) {
  const pad = n => String(n).padStart(2, "0");
  const MONTHS_ALL = {
    tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  };
  const LOC = { tr: "tr-TR", en: "en-GB" };
  let LANG = "tr", NF, NF0;
  const KJ = {};

  /* ---------------- language ---------------- */
  function setLang(l) {
    LANG = l === "en" ? "en" : "tr";
    NF = new Intl.NumberFormat(LOC[LANG], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    NF0 = new Intl.NumberFormat(LOC[LANG], { maximumFractionDigits: 2 });
    KJ.lang = LANG; KJ.MONTHS = MONTHS_ALL[LANG]; KJ.NF = NF;
    return LANG;
  }
  // t("Türkçe metin {x}", {x: 1}) → the text in the chosen language. Turkish text is the key.
  function t(s, v) {
    let r = s;
    if (LANG !== "tr") {
      const d = (g.KJ_SOZLUK || {})[LANG];
      if (d && Object.prototype.hasOwnProperty.call(d, s)) r = d[s];
      else if (g.KJ_EKSIK) g.KJ_EKSIK.add(s);
    }
    if (typeof r === "function") r = r(v || {});
    if (v) r = String(r).replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
    return r;
  }

  /* ---------------- formatting ---------------- */
  const r2 = v => { const x = Math.round((+v || 0) * 100) / 100; return x === 0 ? 0 : x; };
  const num = v => NF.format(r2(v));
  const qty = v => NF0.format(+v || 0);                                   // 1.400 / 1,400 — no forced decimals
  const tl = v => { const x = r2(v); return LANG === "en" ? (x < 0 ? "-" : "") + "₺" + NF.format(Math.abs(x)) : NF.format(x) + " ₺"; };
  const CUR = { TRY: { sym: "₺" }, EUR: { sym: "€" }, USD: { sym: "$" }, GBP: { sym: "£" } };
  const CUR_AD = {
    tr: { TRY: "Türk lirası", EUR: "Euro", USD: "ABD doları", GBP: "İngiliz sterlini" },
    en: { TRY: "Turkish lira", EUR: "Euro", USD: "US dollar", GBP: "Pound sterling" }
  };
  const curName = c => CUR_AD[LANG][c] || c || "";
  const fx = (v, c) => { const s = CUR[c] ? CUR[c].sym : (c || ""); return LANG === "en" ? s + NF.format(r2(v)) : NF.format(r2(v)) + " " + s; };
  const dec = v => (v === "" || v == null) ? "" : (LANG === "en" ? String(v) : String(v).replace(".", ","));   // value shown inside an input
  const pct = n => LANG === "en" ? n + "%" : "%" + n;
  const ltStr = v => qty(v) + (LANG === "en" ? " L" : " Lt");
  const perL = v => LANG === "en" ? "₺" + num(v) + "/L" : num(v) + " ₺/Lt";
  const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const curYM = () => todayISO().slice(0, 7);
  const monthName = m => MONTHS_ALL[LANG][m - 1];
  const monthLabel = ym => monthName(+ym.slice(5, 7)) + " " + ym.slice(0, 4);
  const shortMon = ym => monthName(+ym.slice(5, 7)).slice(0, 3);
  const addMonth = (ym, n) => { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + "-" + pad(m); };
  const dmy = iso => iso ? iso.slice(0, 10).split("-").reverse().join(LANG === "en" ? "/" : ".") : "—";
  const dateTime = d => { if (!(d instanceof Date) || isNaN(d)) return ""; return dmy(d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lower = x => String(x ?? "").toLocaleLowerCase(LOC[LANG]).trim();

  /* ---------------- cash book rules ---------------- */
  const isIn = e => e.type === "in";
  function sums(list) { let i = 0, o = 0; list.forEach(e => { const a = +e.amount || 0; if (isIn(e)) i += a; else o += a; }); return { in: r2(i), out: r2(o) }; }
  const cmpEntry = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt || "").localeCompare(b.createdAt || "") || (a.ord || 0) - (b.ord || 0);

  function kasaFor(items, set, p) {
    const op = +set.opening || 0;
    if (p === "all") { const s = sums(items); return { devir: r2(op), in: s.in, out: s.out, kalan: r2(op + s.in - s.out) }; }
    const b = sums(items.filter(e => (e.date || "") < p + "-01"));
    const devir = op + b.in - b.out;
    const s = sums(items.filter(e => (e.date || "").slice(0, 7) === p));
    return { devir: r2(devir), in: s.in, out: s.out, kalan: r2(devir + s.in - s.out) };
  }
  function runningMap(items, set) {
    let b = +set.opening || 0; const m = {};
    items.slice().sort(cmpEntry).forEach(e => { b = r2(b + (isIn(e) ? 1 : -1) * (+e.amount || 0)); m[e.id] = b; });
    return m;
  }
  function monthRange(items, set) {
    const ds = items.map(e => (e.date || "").slice(0, 7)).filter(Boolean);
    if (set.openingDate) ds.push(set.openingDate.slice(0, 7));
    if (set.openedThrough) ds.push(set.openedThrough);
    ds.push(curYM()); ds.sort();
    const out = []; let m = ds[0]; const end = ds[ds.length - 1]; let guard = 0;
    while (m <= end && guard++ < 600) { out.push(m); m = addMonth(m, 1); }
    return out.reverse();
  }
  const monthsWithData = items => [...new Set(items.map(e => (e.date || "").slice(0, 7)).filter(Boolean))].sort();
  const isClosed = (set, m) => (set.closed || []).includes(m);

  /* ---------------- categories (stored in Turkish, shown in the chosen language) ---------------- */
  const CATS = ["Yakıt", "Marina & bağlama", "Kumanya & market", "Temizlik & sarf", "Ekipman & malzeme", "Bakım & onarım", "Yedek parça", "Personel", "Sigorta", "Harç & belgeler", "Ulaşım", "Diğer"];
  const CAT_EN = {
    "Yakıt": "Fuel", "Marina & bağlama": "Marina & mooring", "Kumanya & market": "Provisions & groceries", "Temizlik & sarf": "Cleaning & consumables",
    "Ekipman & malzeme": "Equipment & supplies", "Bakım & onarım": "Maintenance & repairs", "Yedek parça": "Spare parts", "Personel": "Crew & staff",
    "Sigorta": "Insurance", "Harç & belgeler": "Fees & paperwork", "Ulaşım": "Transport", "Diğer": "Other", "Kategorisiz": "Uncategorised"
  };
  const catLabel = c => (LANG === "en" && CAT_EN[c]) ? CAT_EN[c] : (c || "");
  function catKey(label) {
    const s = String(label ?? "").trim(); if (!s) return "";
    const a = s.toLocaleLowerCase("tr"), b = s.toLocaleLowerCase("en");
    for (const k of Object.keys(CAT_EN)) {
      if (k.toLocaleLowerCase("tr") === a || CAT_EN[k].toLocaleLowerCase("en") === b) return k;
    }
    return s;
  }
  // Order matters: the first rule that matches wins ("Liman Market" is a shop, not the marina).
  const CAT_RULES = [
    ["Yakıt", /opet|shell|\bbp\b|petrol ofisi|total ?energies|aytemiz|yakıt|yakit|mazot|motorin|benzin|akaryakıt|akaryakit|diesel|fuel|gasoline/],
    ["Temizlik & sarf", /kireç|kirec|deterjan|temizlik|rossman|çamaşır|camasir|sabun|şampuan|cleaning|detergent|soap|laundry|bleach|shampoo/],
    ["Kumanya & market", /market|grocer|migros|carrefour|a101|\bbim\b|\bşok\b/],
    ["Marina & bağlama", /palamar|marina|bağlama|baglama|\bliman|netsel|d-marin|setur|albatros|mooring|berth|harbou?r/],
    ["Bakım & onarım", /marangoz|usta|tamir|onarım|onarim|servis|boya|bakım|bakim|kaynak|döşeme|tesisat|elektrikçi|tornacı|repair|service|maintenance|carpenter|mechanic|paint|welding|upholster|electrician/],
    ["Yedek parça", /yedek parça|yedek parca|filtre|rulman|pompa|impeller|conta|kayış|kayis|spare part|filter|bearing|pump|gasket/],
    ["Ekipman & malzeme", /yat malzeme|anfora|fener|branda|minibar|kaymaz|halat|usturmaça|trendyol|hepsiburada|amazon|nalbur|chandler|fender|rope|tarpaulin|hardware/],
    ["Ulaşım", /taksi|taxi|otobüs|otobus|uçak|ucak|transfer|bilet|havalimanı|havalimani|feribot|\bbus\b|flight|airport|ticket|ferry/],
    ["Harç & belgeler", /harç|harc|noter|vergi|belge|ruhsat|transitlog|transit log|gümrük|gumruk|acente|notary|customs|permit|licen[cs]e|\bfees?\b|\bagent\b/],
    ["Kumanya & market", /migros|macro|carrefour|a101|\bbim\b|şok|file market|pazar|fırın|firin|kuruyemiş|market|binbirçeşit|manav|kasap|ekmek|yoğurt|\bsu\b|meyve|sebze|kumanya|grocer|provision|bakery|butcher|bread|\bwater\b|fruit|vegetable/]
  ];
  function guessCat(v, d) {
    const raw = (v || "") + " " + (d || "");
    const a = raw.toLocaleLowerCase("tr"), b = raw.toLocaleLowerCase("en");
    for (const [c, re] of CAT_RULES) if (re.test(a) || re.test(b)) return c;
    return "";
  }
  const payName = p => p === "kart" ? t("Kart") : p === "nakit" ? t("Nakit") : p === "havale" ? t("Havale") : p === "eft" ? t("EFT") : "";
  function paySplit(list) { const r = { nakit: 0, kart: 0, none: 0 }; list.forEach(e => { if (isIn(e)) return; const a = +e.amount || 0; if (e.pay === "kart") r.kart += a; else if (e.pay === "nakit") r.nakit += a; else r.none += a; }); r.nakit = r2(r.nakit); r.kart = r2(r.kart); r.none = r2(r.none); return r; }
  function catSplit(list) { const bc = {}; list.forEach(e => { if (isIn(e)) return; const k = e.cat || "Kategorisiz"; bc[k] = r2((bc[k] || 0) + (+e.amount || 0)); }); return Object.entries(bc).sort((a, b) => b[1] - a[1]); }
  const isFuel = e => !isIn(e) && (e.cat === "Yakıt" || +e.lt > 0);
  function fuelStats(list) {
    const fills = list.filter(isFuel).slice().sort(cmpEntry);
    let tot = 0, lt = 0, totWithLt = 0;
    fills.forEach(e => { tot += +e.amount || 0; if (+e.lt > 0) { lt += +e.lt; totWithLt += +e.amount || 0; } });
    return { fills, tot: r2(tot), lt: r2(lt), avg: lt > 0 ? r2(totWithLt / lt) : 0 };
  }
  // "2.053,03 Lt", "900 lt", "1000 litre", "450 litres"
  function parseLt(s) {
    const m = String(s || "").match(/(\d[\d.,]*)\s*(litres?|liters?|ltr|lt|l)\b/i);
    if (!m) return 0; const v = toNum(m[1]); return isNaN(v) ? 0 : v;
  }
  // Reads numbers from Excel cells and other loose text: guesses whether "," or "." is the decimal mark.
  function toNum(v) {
    if (typeof v === "number") return v;
    if (v == null) return NaN;
    const o = String(v).trim(); if (!o) return NaN;
    const neg = /^\(.*\)$/.test(o) || /^-\s*\d/.test(o) || /^[^\d]*-\s*\d/.test(o);
    let s = o.replace(/[^\d,.]/g, ""); if (!/\d/.test(s)) return NaN;
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc > -1) { const after = s.length - lc - 1; s = ((s.match(/,/g) || []).length === 1 && after !== 3) ? s.replace(",", ".") : s.replace(/,/g, ""); }
    else if (ld > -1) { const after = s.length - ld - 1; if ((s.match(/\./g) || []).length > 1 || after === 3) s = s.replace(/\./g, ""); }
    const n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -Math.abs(n) : n);
  }
  // Reads a number the user typed into a box. In English "." is the decimal point ("1,250.50", "37.85").
  function toNumInput(v) {
    if (LANG !== "en") return toNum(v);
    if (typeof v === "number") return v;
    const o = String(v ?? "").trim(); if (!o) return NaN;
    const neg = /^\(.*\)$/.test(o) || /^[^\d]*-\s*\d/.test(o);
    let s = o.replace(/[^\d,.]/g, ""); if (!/\d/.test(s)) return NaN;
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc > -1) { const after = s.length - lc - 1; s = ((s.match(/,/g) || []).length > 1 || after === 3) ? s.replace(/,/g, "") : s.replace(",", "."); }
    else if (ld > -1 && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
    const n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -Math.abs(n) : n);
  }
  function amountNote(e) {
    const parts = [];
    if (e.cur && e.cur !== "TRY" && +e.fxAmount > 0) parts.push(fx(e.fxAmount, e.cur) + " × " + NF0.format(+e.fxRate || 0));
    if (+e.lt > 0) parts.push(ltStr(e.lt) + ((+e.amount || 0) > 0 ? " · " + perL((+e.amount) / (+e.lt)) : ""));
    return parts.join(" · ");
  }

  /* ---------------- synchronisation between devices (pure functions, shared by every device) ----------------
     Every change carries a time stamp: entries have updatedAt, deletions are kept in silinenler (id → time),
     settings keep one stamp per key in ayarlar._zaman ("closed/2026-10" and "rates/EUR" per month and currency).
     Merging two copies keeps the newest version of everything, so the result is the same in whatever order
     the devices meet, and nothing typed on one device is lost when another one is offline. */
  const YEREL_AYAR = ["lang", "kabul", "guncelleme"];      // chosen on each device separately; never sent to the others
  const ISO = z => { if (!z) return ""; const p = Date.parse(z); return isNaN(p) ? "" : new Date(p).toISOString(); };
  const zamanOf = e => ISO(e && (e.updatedAt || e.createdAt));
  const kar = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  // A time stamp later than prev, so an edit made after seeing a version always replaces it (even if this clock is a little behind).
  function damga(prev) { let n = Date.now(); const p = prev ? Date.parse(prev) : NaN; if (!isNaN(p) && n <= p) n = p + 1; return new Date(n).toISOString(); }
  // JSON with sorted keys, so two copies of the same data always compare equal.
  function sabit(v) {
    if (Array.isArray(v)) return "[" + v.map(sabit).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + sabit(v[k])).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  const nesne = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  // What changed in the settings, with a stamp for each changed key (closed months and rates one by one).
  function ayarFarki(eski, yeni) {
    eski = nesne(eski); yeni = nesne(yeni);
    const Z = nesne(eski._zaman), degisen = {}, zaman = {};
    for (const k of new Set([...Object.keys(eski), ...Object.keys(yeni)])) {
      if (k === "_zaman") continue;
      const a = eski[k], b = yeni[k];
      if (sabit(a) === sabit(b)) continue;
      degisen[k] = b === undefined ? null : b;
      if (YEREL_AYAR.includes(k)) continue;
      if (k === "closed") {
        const A = new Set(Array.isArray(a) ? a : []), B = new Set(Array.isArray(b) ? b : []);
        for (const m of new Set([...A, ...B])) if (A.has(m) !== B.has(m)) zaman["closed/" + m] = damga(Z["closed/" + m]);
      } else if (k === "rates") {
        const A = nesne(a), B = nesne(b);
        for (const c of new Set([...Object.keys(A), ...Object.keys(B)])) if (sabit(A[c]) !== sabit(B[c])) zaman["rates/" + c] = damga(Z["rates/" + c]);
      } else zaman[k] = damga(Z[k]);
    }
    return { degisen, zaman };
  }
  // Merges this device's book (A) with the copy in the cloud (B). Settings that belong to this device come from A.
  function birlestir(A, B, simdi) {
    A = nesne(A); B = nesne(B);
    const omur = (simdi || Date.now()) - 400 * 864e5;       // deletions are remembered for 400 days
    const sil = {};
    for (const S of [nesne(A.silinenler), nesne(B.silinenler)]) for (const id in S) { const z = ISO(S[id]); if (z && (!sil[id] || z > sil[id])) sil[id] = z; }
    for (const id in sil) if (Date.parse(sil[id]) < omur) delete sil[id];
    const m = new Map();
    for (const e of [...(Array.isArray(A.kayitlar) ? A.kayitlar : []), ...(Array.isArray(B.kayitlar) ? B.kayitlar : [])]) {
      if (!e || typeof e.id !== "string") continue;
      const o = m.get(e.id);
      if (!o) { m.set(e.id, e); continue; }
      const zo = zamanOf(o), ze = zamanOf(e);
      if (ze > zo || (ze === zo && sabit(e) > sabit(o))) m.set(e.id, e);
    }
    const kayitlar = [...m.values()].filter(e => !(sil[e.id] && sil[e.id] >= zamanOf(e)))
      .sort((x, y) => kar(ISO(x.createdAt), ISO(y.createdAt)) || (+x.ord || 0) - (+y.ord || 0) || kar(x.id, y.id));
    const aA = nesne(A.ayarlar), aB = nesne(B.ayarlar), zA = nesne(aA._zaman), zB = nesne(aB._zaman);
    const ayar = {}, zOut = {};
    const ust = (a, b) => a > b ? a : b;
    for (const k of new Set([...Object.keys(aA), ...Object.keys(aB)])) {
      if (k === "_zaman" || k === "closed" || k === "rates") continue;
      if (YEREL_AYAR.includes(k)) { if (k in aA) ayar[k] = aA[k]; continue; }
      const ta = zA[k] || "", tb = zB[k] || "", va = aA[k], vb = aB[k];
      let v;
      if (k === "openedThrough") v = (va || "") >= (vb || "") ? (va ?? null) : vb;   // the latest opened month
      else if (ta !== tb) v = ta > tb ? va : vb;
      else if ((va == null) !== (vb == null)) v = va == null ? vb : va;            // unknown order: keep the value that exists
      else v = sabit(va) >= sabit(vb) ? va : vb;
      ayar[k] = v === undefined ? null : v;
      if (ta || tb) zOut[k] = ust(ta, tb);
    }
    // closed months: each month on its own
    const CA = new Set(Array.isArray(aA.closed) ? aA.closed : []), CB = new Set(Array.isArray(aB.closed) ? aB.closed : []);
    const aylar = new Set([...CA, ...CB]);
    for (const z of [zA, zB]) for (const k in z) if (k.startsWith("closed/")) aylar.add(k.slice(7));
    const kapali = [];
    for (const ay of aylar) {
      const sk = "closed/" + ay, ta = zA[sk] || "", tb = zB[sk] || "", ia = CA.has(ay), ib = CB.has(ay);
      if (ia === ib ? ia : (ta === tb ? true : (ta > tb ? ia : ib))) kapali.push(ay);
      if (ta || tb) zOut[sk] = ust(ta, tb);
    }
    if ("closed" in aA || "closed" in aB || kapali.length) ayar.closed = kapali.sort();
    // exchange rates: each currency on its own
    const RA = nesne(aA.rates), RB = nesne(aB.rates);
    const para = new Set([...Object.keys(RA), ...Object.keys(RB)]);
    for (const z of [zA, zB]) for (const k in z) if (k.startsWith("rates/")) para.add(k.slice(6));
    const kur = {};
    for (const c of para) {
      const sk = "rates/" + c, ta = zA[sk] || "", tb = zB[sk] || "", ia = c in RA, ib = c in RB;
      let v;
      if (ia && ib) v = ta !== tb ? (ta > tb ? RA[c] : RB[c]) : (sabit(RA[c]) >= sabit(RB[c]) ? RA[c] : RB[c]);
      else if (ia || ib) { const var_ = ia ? ta : tb, yok = ia ? tb : ta; if (!(yok > var_)) v = ia ? RA[c] : RB[c]; }
      if (v !== undefined) kur[c] = v;
      if (ta || tb) zOut[sk] = ust(ta, tb);
    }
    if ("rates" in aA || "rates" in aB) ayar.rates = kur;
    ayar._zaman = zOut;
    return { uygulama: "Kasa Jurnali", surum: 2, ayarlar: ayar, kayitlar, silinenler: sil };
  }
  // The part of a book that travels between devices, in a fixed form for comparing.
  function ortakOzet(D) {
    D = nesne(D);
    const a = {}; for (const k in nesne(D.ayarlar)) if (!YEREL_AYAR.includes(k)) a[k] = D.ayarlar[k];
    const ky = (Array.isArray(D.kayitlar) ? D.kayitlar : []).slice().sort((x, y) => kar(x.id, y.id));
    return sabit({ a, k: ky, s: nesne(D.silinenler) });
  }
  const ayniMi = (X, Y) => ortakOzet(X) === ortakOzet(Y);
  // The copy written to the cloud: without this device's own settings.
  function uzakHali(D, cihaz) {
    const a = {}; for (const k in nesne(D.ayarlar)) if (!YEREL_AYAR.includes(k)) a[k] = D.ayarlar[k];
    return { uygulama: "Kasa Jurnali", surum: 2, kaydedilme: new Date().toISOString(), cihaz: cihaz || "", ayarlar: a, kayitlar: D.kayitlar || [], silinenler: D.silinenler || {} };
  }

  Object.assign(KJ, {
    setLang, t, pad, r2, tl, num, qty, fx, dec, pct, ltStr, perL, CUR, curName, todayISO, curYM, monthName, monthLabel, shortMon, addMonth, dmy, dateTime, esc, lower,
    isIn, sums, cmpEntry, kasaFor, runningMap, monthRange, monthsWithData, isClosed, CATS, CAT_EN, catLabel, catKey, guessCat, payName, paySplit, catSplit,
    isFuel, fuelStats, parseLt, toNum, toNumInput, amountNote,
    YEREL_AYAR, damga, sabit, ayarFarki, birlestir, ayniMi, uzakHali, zamanOf
  });
  setLang("tr");
  g.KJ = KJ;
})(typeof window !== "undefined" ? window : globalThis);
