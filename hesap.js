/* Yachting Jurnal — shared bookkeeping rules and language support, used by the window and the PDF report. */
"use strict";
(function (g) {
  const pad = n => String(n).padStart(2, "0");
  const MONTHS_ALL = {
    tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  };
  // the languages of the window; dictionaries for all but Turkish come from i18n.js (en) and dil/<code>.js
  const DILLER = ["tr", "en", "fr", "it", "es", "de", "el"];
  const LOC = { tr: "tr-TR", en: "en-GB", fr: "fr-FR", it: "it-IT", es: "es-ES", de: "de-DE", el: "el-GR" };
  const DIL_ADI = { tr: "Türkçe", en: "English", fr: "Français", it: "Italiano", es: "Español", de: "Deutsch", el: "Ελληνικά" };
  const dilGecerli = l => DILLER.includes(l) ? l : "";
  // the language for a browser / system language such as "de-AT" or "el" ("" if none of ours)
  const dilBul = x => dilGecerli(String(x || "").toLowerCase().split(/[-_]/)[0]);
  // month names from Intl (nominative: taken from "month year", which Greek needs), the fixed tables for Turkish and English
  function aylarIntl(loc, tur) {
    try {
      const f = new Intl.DateTimeFormat(loc, tur === "long" ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });
      const r = Array.from({ length: 12 }, (_, i) => (f.formatToParts(new Date(Date.UTC(2026, i, 15))).find(p => p.type === "month") || {}).value || "");
      return r.every(x => x && !/^\d/.test(x)) ? r : null;
    } catch (e) { return null; }
  }
  let LANG = "tr", NF, NF0, AY, AY_KISA, SEP;
  const KJ = {};

  /* ---------------- language ---------------- */
  function setLang(l) {
    LANG = dilGecerli(l) || "tr";
    NF = new Intl.NumberFormat(LOC[LANG], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    NF0 = new Intl.NumberFormat(LOC[LANG], { maximumFractionDigits: 2 });
    AY = MONTHS_ALL[LANG] || aylarIntl(LOC[LANG], "long") || MONTHS_ALL.en;
    AY_KISA = MONTHS_ALL[LANG] ? null : aylarIntl(LOC[LANG], "short");
    // separators inside number boxes: English "1,250.50"; French "1 250,50" (no-break space); the others "1.250,50"
    SEP = LANG === "en" ? { g: ",", d: "." } : LANG === "fr" ? { g: "\u00a0", d: "," } : { g: ".", d: "," };
    KJ.lang = LANG; KJ.loc = LOC[LANG]; KJ.MONTHS = AY; KJ.NF = NF; KJ.SEP = SEP;
    return LANG;
  }
  // raw dictionary lookup (undefined when the language has no such text)
  function sozluk(l, s) {
    const d = (g.KJ_SOZLUK || {})[l];
    return d && Object.prototype.hasOwnProperty.call(d, s) ? d[s] : undefined;
  }
  // t("Türkçe metin {x}", {x: 1}) → the text in the chosen language. Turkish text is the key.
  // A text missing in the chosen language falls back to English, then to the Turkish key; it is noted in KJ_EKSIK.
  function t(s, v) {
    let r = s;
    if (LANG !== "tr") {
      r = sozluk(LANG, s);
      if (r === undefined) {
        if (!g.KJ_EKSIK) g.KJ_EKSIK = new Set();
        g.KJ_EKSIK.add(s);
        r = LANG !== "en" ? sozluk("en", s) : undefined;
        if (r === undefined) r = s;
      }
    }
    if (typeof r === "function") r = r(v || {});
    if (v) r = String(r).replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
    return r;
  }

  // Legal texts exist only in Turkish and English; the other languages read the English text with this note.
  // The translators' dictionary wins; the built-in sentences keep the note readable if a dictionary is missing.
  const YASAL_NOT = "Bu metin yalnızca Türkçe ve İngilizce yayımlanır; İngilizce sürümü gösteriliyor. Bağlayıcı metin Türkçedir.";
  const YASAL_NOT_YEDEK = {
    fr: "Ce texte n’est publié qu’en turc et en anglais ; la version anglaise est affichée. Le texte turc fait foi.",
    it: "Questo testo è pubblicato solo in turco e in inglese; viene mostrata la versione inglese. Il testo turco è quello vincolante.",
    es: "Este texto solo se publica en turco y en inglés; se muestra la versión inglesa. El texto turco es el vinculante.",
    de: "Dieser Text wird nur auf Türkisch und Englisch veröffentlicht; angezeigt wird die englische Fassung. Verbindlich ist der türkische Text.",
    el: "Το κείμενο αυτό δημοσιεύεται μόνο στα τουρκικά και στα αγγλικά· εμφανίζεται η αγγλική έκδοση. Δεσμευτικό είναι το τουρκικό κείμενο."
  };
  const yasalNot = () => { const v = sozluk(LANG, YASAL_NOT); return typeof v === "string" ? v : YASAL_NOT_YEDEK[LANG] || t(YASAL_NOT); };

  /* ---------------- formatting ---------------- */
  // commercial rounding (half away from zero) that survives binary fractions: 1,005 → 1,01 (not 1,00)
  const yuvarla = (v, f) => { const x = (+v || 0) * f, s = x < 0 ? -1 : 1, y = s * Math.round(Math.abs(x) * (1 + Number.EPSILON)); return y === 0 ? 0 : y; };
  const r2 = v => { const x = yuvarla(v, 100) / 100; return x === 0 ? 0 : x; };
  const num = v => NF.format(r2(v));
  const qty = v => NF0.format(+v || 0);                                   // 1.400 / 1,400 — no forced decimals
  /* ---------------- currencies (ISO 4217) ----------------
     The book is kept in one currency (ayarlar.para, "TRY" when missing); every amount is in it.
     One line per currency: code, symbol, decimals (ISO 4217 minor unit), Turkish name, English name.
     Other languages take the name from Intl.DisplayNames.
     DESIGN NOTE (P4, audit 2026-11): the bookkeeping sums (kr/tk/r2, and konsolide.js) count in 1/100 units. Every
     currency here has 2 decimals, so this is exact today. Before a currency with 0 decimals (JPY) or 3 decimals
     (KWD, BHD, OMR, JOD, TND) is added, kr/tk must take the book's minor unit (10^ondalik) instead of 100, and the
     Excel format (para.go paraBicimi) already follows "ond"; a 3-decimal book would otherwise lose the third digit. */
  const PARA_TABLO = [
    ["EUR", "€", 2, "Euro", "Euro"],
    ["USD", "$", 2, "ABD doları", "US dollar"],
    ["GBP", "£", 2, "İngiliz sterlini", "Pound sterling"],
    ["TRY", "₺", 2, "Türk lirası", "Turkish lira"],
    ["CHF", "CHF", 2, "İsviçre frangı", "Swiss franc"],
    ["AUD", "A$", 2, "Avustralya doları", "Australian dollar"],
    ["AED", "AED", 2, "BAE dirhemi", "UAE dirham"]
  ];
  const CUR = {};
  PARA_TABLO.forEach(([kod, sym, ond, tr, en]) => { CUR[kod] = { sym, ond, ad: { tr, en } }; });
  const PARALAR = PARA_TABLO.map(x => x[0]);
  let PARA = "TRY";
  const ondOf = c => CUR[c] ? CUR[c].ond : 2;
  const rd = (v, d) => { const f = Math.pow(10, d), x = yuvarla(v, f) / f; return x === 0 ? 0 : x; };
  const NFD = {};
  const nfFor = d => d === 2 ? NF : (NFD[LANG + d] = NFD[LANG + d] || new Intl.NumberFormat(LOC[LANG] || LANG, { minimumFractionDigits: d, maximumFractionDigits: d }));
  function setPara(k) { PARA = CUR[k] ? k : "TRY"; KJ.para = PARA; return PARA; }
  const paraKodu = () => PARA;
  const paraSym = c => { c = c || PARA; return CUR[c] ? CUR[c].sym : c; };
  function curName(c) {
    if (!c) return "";
    if (CUR[c] && CUR[c].ad[LANG]) return CUR[c].ad[LANG];
    try { return new Intl.DisplayNames([LOC[LANG] || LANG], { type: "currency" }).of(c) || c; } catch (e) { return c; }
  }
  // 1.234,50 € · €1,234.50 · 1.234,50 CHF · CHF 1,234.50 (a symbol made of letters is set apart by a space)
  function fx(v, c) {
    const d = ondOf(c), x = rd(v, d), s = CUR[c] ? CUR[c].sym : (c || ""), n = nfFor(d).format(Math.abs(x));
    if (LANG === "en") return (x < 0 ? "-" : "") + s + (/[A-Za-z]$/.test(s) ? " " : "") + n;
    return (x < 0 ? "-" : "") + n + (s ? " " + s : "");
  }
  const tl = v => fx(v, PARA);                                            // an amount of the book (its own currency)
  // a label written with "₺" (the Turkish keys and their translations) shown with the book's own symbol
  const tp = (s, v) => String(t(s, v)).split("₺").join(paraSym());
  const dec = v => (v === "" || v == null) ? "" : String(v).replace(".", SEP.d);   // value shown inside an input
  const pct = n => LANG === "en" ? n + "%" : LANG === "tr" ? "%" + n : new Intl.NumberFormat(LOC[LANG], { style: "percent", maximumFractionDigits: 2 }).format((+n || 0) / 100);
  const ltStr = v => qty(v) + (LANG === "tr" ? " Lt" : " L");
  const perL = v => fx(v, PARA) + (LANG === "tr" ? "/Lt" : "/L");
  const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const curYM = () => todayISO().slice(0, 7);
  const monthName = m => AY[m - 1];
  const monthLabel = ym => monthName(+ym.slice(5, 7)) + " " + ym.slice(0, 4);
  const shortMon = ym => AY_KISA ? AY_KISA[+ym.slice(5, 7) - 1] : monthName(+ym.slice(5, 7)).slice(0, 3);
  const addMonth = (ym, n) => { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + "-" + pad(m); };
  const dmy = iso => iso ? iso.slice(0, 10).split("-").reverse().join(LANG === "tr" || LANG === "de" ? "." : "/") : "—";
  const dateTime = d => { if (!(d instanceof Date) || isNaN(d)) return ""; return dmy(d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lower = x => String(x ?? "").toLocaleLowerCase(LOC[LANG]).trim();

  /* ---------------- cash book rules ----------------
     Entry types: "out" expense, "in" money coming in, "tr" transfer between two accounts (hesap → hedef),
     "iade" refund of an expense (money back into hesap; reduces the expense, iadeOf = the expense's id).
     Every entry belongs to one account (hesap). Entries from before accounts existed carry only "pay":
     a card expense then belongs to the card account, everything else to the cash box, as before.
     Money is added in whole kuruş (cents), so long lists never drift by a fraction. */
  const isIn = e => e.type === "in";
  const isOut = e => !e.type || e.type === "out";
  const isTr = e => e.type === "tr";
  const isIade = e => e.type === "iade";
  const kr = v => yuvarla(v, 100);                       // amount → kuruş
  const tk = c => r2(c / 100);                           // kuruş → amount
  // an amount the rules can count: a number (or numeric text) that is not negative. A negative or broken amount
  // (a damaged file, a hand-edited backup, another device) is left out of every total and reported, never deleted.
  const tutarGecerli = e => { const v = e ? e.amount : null, a = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN; return isFinite(a) && a >= 0; };
  const gecersizKayitlar = items => (Array.isArray(items) ? items : []).filter(e => e && !tutarGecerli(e));
  const HESAP_TURLERI = ["nakit", "banka", "kart", "avans", "diger"];
  const VARSAYILAN_HESAPLAR = [
    { id: "nakit", tur: "nakit", ad: "Nakit kasa", durum: "aktif", sira: 1 },
    { id: "kart", tur: "kart", ad: "Kredi kartı", durum: "aktif", sira: 2 },
    { id: "banka", tur: "banka", ad: "Banka hesabı", durum: "aktif", sira: 3 }
  ];
  // the book's accounts: the stored list, or the three standard ones; the cash box always exists
  function hesaplar(set) {
    const l = (set && Array.isArray(set.hesaplar) && set.hesaplar.length ? set.hesaplar : VARSAYILAN_HESAPLAR).filter(h => h && typeof h.id === "string");
    const out = l.map(h => Object.assign({ durum: "aktif" }, h));
    if (!out.some(h => h.id === "nakit")) out.unshift(Object.assign({}, VARSAYILAN_HESAPLAR[0]));
    return out.sort((a, b) => (+a.sira || 99) - (+b.sira || 99));
  }
  const hesapBul = (set, id) => hesaplar(set).find(h => h.id === id) || null;
  // the account an entry belongs to (old entries: by payment method)
  const hesapOf = e => e.hesap || (isOut(e) && e.pay === "kart" ? "kart" : "nakit");
  function hesapTur(set, id) { const h = hesapBul(set, id); return h ? h.tur : id === "kart" ? "kart" : id === "banka" ? "banka" : "nakit"; }
  // how an entry changes one account, in kuruş (+ in, − out)
  function etki(e, id) {
    if (!tutarGecerli(e)) return 0;
    const a = kr(e.amount);
    if (isTr(e)) return (hesapOf(e) === id ? -a : 0) + (e.hedef === id ? a : 0);
    if (hesapOf(e) !== id) return 0;
    return isOut(e) ? -a : a;
  }
  // totals of a list: in = money coming in, out = expenses less refunds (transfers are neither)
  function sums(list) { let i = 0, o = 0; list.forEach(e => { if (!hesabaGirer(e)) return; const a = kr(e.amount); if (isIn(e)) i += a; else if (isIade(e)) o -= a; else if (isOut(e)) o += a; }); return { in: tk(i), out: tk(o) }; }
  const cmpEntry = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt || "").localeCompare(b.createdAt || "") || (a.ord || 0) - (b.ord || 0);

  // opening balance of an account: the cash box keeps the book's opening; others their own
  const acilisOf = (set, h) => h.id === "nakit" ? kr(set.opening) : kr(h.acilis);
  // one account over a period ("all" or "yyyy-mm"): devir, giren, cikan, kalan (amounts)
  function hesapFor(items, set, id, p) {
    const h = hesapBul(set, id) || { id, tur: "nakit" };
    let devir = acilisOf(set, h), gir = 0, cik = 0;
    items.forEach(e => {
      if (!hesabaGirer(e, set)) return;
      const x = etki(e, id); if (!x) return;
      const ay = (e.date || "").slice(0, 7);
      if (p !== "all" && ay < p) devir += x;
      else if (p === "all" || ay === p) { if (x > 0) gir += x; else cik -= x; }
    });
    return { devir: tk(devir), giren: tk(gir), cikan: tk(cik), kalan: tk(devir + gir - cik) };
  }
  // the physical cash box (every cash account together). Card, bank and other accounts do not change it.
  //   in  = money that came into the box (income, refunds and transfers into it)
  //   out = money that left the box (cash expenses and transfers out of it)
  // A transfer between two cash accounts stays inside the box: it is neither in nor out (the balance is the same).
  function kasaFor(items, set, p) {
    const ids = hesaplar(set).filter(h => h.tur === "nakit").map(h => h.id);
    let devir = 0, gir = 0, cik = 0;
    ids.forEach(id => { const k = hesapFor(items, set, id, p); devir += kr(k.devir); gir += kr(k.giren); cik += kr(k.cikan); });
    items.forEach(e => {
      if (!isTr(e) || !hesabaGirer(e, set)) return;
      const s = hesapOf(e); if (s === e.hedef || !ids.includes(s) || !ids.includes(e.hedef)) return;
      if (p === "all" || (e.date || "").slice(0, 7) === p) { const a = kr(e.amount); gir -= a; cik -= a; }
    });
    return { devir: tk(devir), in: tk(gir), out: tk(cik), kalan: tk(devir + gir - cik) };
  }
  // the whole book over a period: income, expenses (by account type), refunds, transfers — for the summary cards and reports
  function ozetFor(items, set, p) {
    const its = (p === "all" ? items : items.filter(e => (e.date || "").slice(0, 7) === p)).filter(e => hesabaGirer(e, set));
    const r = { gelir: 0, gider: 0, iade: 0, transfer: 0, tur: {}, hesap: {} };
    its.forEach(e => {
      if (!tutarGecerli(e)) return;
      const a = kr(e.amount);
      if (isTr(e)) { r.transfer += a; return; }
      if (isIn(e)) { r.gelir += a; return; }
      const id = hesapOf(e), tur = hesapTur(set, id), s = isIade(e) ? -a : a;
      if (isIade(e)) r.iade += a;
      r.gider += s; r.tur[tur] = (r.tur[tur] || 0) + s; r.hesap[id] = (r.hesap[id] || 0) + s;
    });
    const c = o => { for (const k in o) o[k] = tk(o[k]); return o; };
    return { gelir: tk(r.gelir), gider: tk(r.gider), iade: tk(r.iade), transfer: tk(r.transfer), tur: c(r.tur), hesap: c(r.hesap) };
  }
  // running balance after each entry, of the account it moves (transfers: the source account)
  function runningMap(items, set) {
    const b = {}, m = {};
    hesaplar(set).forEach(h => { b[h.id] = acilisOf(set, h); });
    items.slice().sort(cmpEntry).forEach(e => {
      if (!hesabaGirer(e, set)) { m[e.id] = tk(b[hesapOf(e)] || 0); return; }
      const ids = isTr(e) ? [hesapOf(e), e.hedef] : [hesapOf(e)];
      ids.forEach(id => { if (id != null) b[id] = (b[id] || 0) + etki(e, id); });
      m[e.id] = tk(b[hesapOf(e)] || 0);
    });
    return m;
  }
  // a month key is always "YYYY-MM": anything else (e.g. a crafted backup or synced setting) never reaches the page (XSS)
  const ayMi = m => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  function monthRange(items, set) {
    const ds = items.map(e => String(e.date || "").slice(0, 7)).filter(ayMi);
    if (set.openingDate) ds.push(String(set.openingDate).slice(0, 7));
    if (set.openedThrough) ds.push(set.openedThrough);
    for (let i = ds.length - 1; i >= 0; i--) if (!ayMi(ds[i])) ds.splice(i, 1);
    ds.push(curYM()); ds.sort();
    const out = []; let m = ds[0]; const end = ds[ds.length - 1]; let guard = 0;
    while (m <= end && guard++ < 600) { out.push(m); m = addMonth(m, 1); }
    return out.reverse();
  }
  const monthsWithData = items => [...new Set(items.map(e => String(e.date || "").slice(0, 7)).filter(ayMi))].sort();
  const isClosed = (set, m) => (set.closed || []).includes(m);
  /* Guards for changing the book. A closed month is final: its remaining cash has been carried into the next month,
     so an entry in it (or moved into it, or out of it) would quietly change every later carry-over. The month must be
     reopened first. An entry dated before the opening date is refused too: the opening balance is the cash counted
     on that day, so an older entry would be counted twice.
     eski = the entry before the change (null for a new one), yeni = the entry after it (null when it is deleted).
     → null, { kod: "kapali", ay } or { kod: "acilis", tarih } */
  function degisiklikEngeli(set, eski, yeni) {
    set = set || {};
    for (const e of [eski, yeni]) { const ay = ((e && e.date) || "").slice(0, 7); if (ay && isClosed(set, ay)) return { kod: "kapali", ay }; }
    const od = set.openingDate;
    if (yeni && od && yeni.date && yeni.date < od && (!eski || eski.date !== yeni.date)) return { kod: "acilis", tarih: od };
    return null;
  }
  // rows of an import split into those that can be added and those that fall in a closed month
  function kapaliAyikla(set, rows) {
    const acik = [], kapali = [];
    (rows || []).forEach(r => (isClosed(set || {}, ((r && r.date) || "").slice(0, 7)) ? kapali : acik).push(r));
    return { acik, kapali };
  }

  /* ---------------- categories (stored in Turkish, shown in the chosen language) ---------------- */
  const CATS = ["Yakıt", "Marina & bağlama", "Kumanya & market", "Temizlik & sarf", "Ekipman & malzeme", "Bakım & onarım", "Yedek parça", "Personel", "Sigorta", "Harç & belgeler", "Ulaşım", "Diğer"];
  // the labels are ordinary dictionary texts (i18n.js, dil/<code>.js); a category the user typed stays as it is
  const KATEGORI = new Set([...CATS, "Kategorisiz"]);
  const catLabel = c => KATEGORI.has(c) ? t(c) : (c || "");
  // a label typed or imported in any language ("Fuel", "Carburant", "yakıt") → the stored Turkish category
  function catKey(label) {
    const s = String(label ?? "").trim(); if (!s) return "";
    const a = s.toLocaleLowerCase("tr");
    for (const k of KATEGORI) if (k.toLocaleLowerCase("tr") === a) return k;
    for (const l of ["en", LANG, ...DILLER]) {
      if (l === "tr") continue;
      const b = s.toLocaleLowerCase(LOC[l]);
      for (const k of KATEGORI) { const v = sozluk(l, k); if (typeof v === "string" && v.toLocaleLowerCase(LOC[l]) === b) return k; }
    }
    return s;
  }
  // Order matters: the first rule that matches wins ("Market" is a shop, not the marina).
  const CAT_RULES = [
    ["Yakıt", /opet|shell|\bbp\b|petrol ofisi|total ?energies|aytemiz|yakıt|yakit|mazot|motorin|benzin|akaryakıt|akaryakit|diesel|fuel|gasoline/],
    ["Temizlik & sarf", /kireç|kirec|deterjan|temizlik|rossman|çamaşır|camasir|sabun|şampuan|cleaning|detergent|soap|laundry|bleach|shampoo/],
    ["Kumanya & market", /market|grocer|migros|carrefour|a101|\bbim\b|\bşok\b/],
    ["Marina & bağlama", /palamar|marina|bağlama|baglama|\bliman|d-marin|setur|mooring|berth|harbou?r/],
    ["Bakım & onarım", /marangoz|usta|tamir|onarım|onarim|servis|boya|bakım|bakim|kaynak|döşeme|tesisat|elektrikçi|tornacı|repair|service|maintenance|carpenter|mechanic|paint|welding|upholster|electrician/],
    ["Yedek parça", /yedek parça|yedek parca|filtre|rulman|pompa|impeller|conta|kayış|kayis|spare part|filter|bearing|pump|gasket/],
    ["Ekipman & malzeme", /yat malzeme|fener|branda|minibar|kaymaz|halat|usturmaça|trendyol|hepsiburada|amazon|nalbur|chandler|fender|rope|tarpaulin|hardware/],
    ["Ulaşım", /taksi|taxi|otobüs|otobus|uçak|ucak|transfer|bilet|havalimanı|havalimani|feribot|\bbus\b|flight|airport|ticket|ferry/],
    ["Harç & belgeler", /harç|harc|noter|vergi|belge|ruhsat|transitlog|transit log|gümrük|gumruk|acente|notary|customs|permit|licen[cs]e|\bfees?\b|\bagent\b/],
    ["Kumanya & market", /migros|macro|carrefour|a101|\bbim\b|şok|file market|pazar|fırın|firin|kuruyemiş|market|manav|kasap|ekmek|yoğurt|\bsu\b|meyve|sebze|kumanya|grocer|provision|bakery|butcher|bread|\bwater\b|fruit|vegetable/]
  ];
  function guessCat(v, d) {
    const raw = (v || "") + " " + (d || "");
    const a = raw.toLocaleLowerCase("tr"), b = raw.toLocaleLowerCase("en");
    for (const [c, re] of CAT_RULES) if (re.test(a) || re.test(b)) return c;
    return "";
  }
  const payName = p => p === "kart" ? t("Kart") : p === "nakit" ? t("Nakit") : p === "havale" ? t("Havale") : p === "eft" ? t("EFT") : "";
  // expenses split by kind of account: nakit = cash box, kart = cards, none = bank, advances and others
  function paySplit(list, set) {
    const r = { nakit: 0, kart: 0, none: 0 };
    list.forEach(e => { if (!isOut(e) && !isIade(e) || !hesabaGirer(e, set)) return; const a = kr(e.amount) * (isIade(e) ? -1 : 1), tur = hesapTur(set || {}, hesapOf(e)); if (tur === "nakit") r.nakit += a; else if (tur === "kart") r.kart += a; else r.none += a; });
    r.nakit = tk(r.nakit); r.kart = tk(r.kart); r.none = tk(r.none); return r;
  }
  function catSplit(list) { const bc = {}; list.forEach(e => { if (!isOut(e) && !isIade(e) || !hesabaGirer(e)) return; const k = e.cat || "Kategorisiz"; bc[k] = (bc[k] || 0) + kr(e.amount) * (isIade(e) ? -1 : 1); }); return Object.entries(bc).map(([k, v]) => [k, tk(v)]).filter(x => x[1] !== 0).sort((a, b) => b[1] - a[1]); }
  const isFuel = e => isOut(e) && (e.cat === "Yakıt" || +e.lt > 0);
  function fuelStats(list) {
    const fills = list.filter(e => isFuel(e) && hesabaGirer(e)).slice().sort(cmpEntry);
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
    else if (ld > -1) {   // only "." in the text: "12.50", "1.5" are decimals; "1.250", "1.250.000" are thousands (three digits after the dot); "0.250" is a decimal too (an amount never starts "0" + thousands)
      const after = s.length - ld - 1, tek = (s.match(/\./g) || []).length === 1;
      if (!(tek && /^0*$/.test(s.slice(0, ld))) && (!tek || after === 3)) s = s.replace(/\./g, "");
    }
    const n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -Math.abs(n) : n);
  }
  // Reads a number the user typed into a box. In English "." is the decimal point ("1,250.50", "37.85");
  // in the other languages it is "," ("1.250,50", "1 250,50").
  // Called with the box's decimal count (max) it reads TEXT THAT CAME FROM OUTSIDE (a paste) by the same rules the box
  // applies while typing, and it never guesses: whatever can mean two numbers gives NaN (money: do not guess).
  //   - the language's own mark is the decimal mark (at most one, at most max digits after it); the other mark before it may
  //     only be a well-formed thousands mark ("1.250,75"; not in boxes with more than 2 decimals); the other mark AFTER it ("1,250.75" in a comma box) is NaN.
  //   - only the other mark: boxes with max <= 2 (money, litres) read "1.250" / "7.123" / "1.250.000" as thousands (1-3 digits,
  //     not starting with 0, then groups of three) and "12.5" / "12.50" as decimals; "0.250", "1234.567", "1.250.50", "12.5.0" are NaN.
  //     Boxes with more decimals (the rate, max 4) always read a single other mark as the decimal mark: "1.085" is 1,085.
  // Without max the old loose reading stays (other callers, tests).
  function toNumInput(v, max) {
    if (max != null && typeof v !== "number") return toNumPaste(v, +max);
    if (SEP.d !== ".") return toNum(v);
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
  function toNumPaste(v, max) {
    const o = String(v ?? "").trim(); if (!o) return NaN;
    const neg = /^\(.*\)$/.test(o) || /^[^\d]*-\s*\d/.test(o);
    const s = o.replace(/[^\d,.]/g, ""); if (!/\d/.test(s)) return NaN;
    const a = SEP.d, b = a === "," ? "." : ",", sayi = (x, m) => x.split(m).length - 1;
    const bol = x => new RegExp("^[1-9]\\d{0,2}(?:" + (b === "." ? "\\." : ",") + "\\d{3})+$").test(x);
    let ip = "", fp = "";
    if (sayi(s, a) > 1) return NaN;
    if (sayi(s, a) === 1) {
      const i = s.indexOf(a), L = s.slice(0, i), R = s.slice(i + 1);
      if (R.length > max || R.includes(b)) return NaN;
      if (L.includes(b)) { if (max > 2 || !bol(L)) return NaN; ip = L.split(b).join(""); } else ip = L;
      fp = R;
    } else if (sayi(s, b) === 0) ip = s;
    else if (sayi(s, b) === 1) {
      const i = s.indexOf(b), L = s.slice(0, i), R = s.slice(i + 1);
      if (max <= 2 && R.length === 3) { if (!/^[1-9]\d{0,2}$/.test(L)) return NaN; ip = L + R; }
      else if (R.length <= max) { ip = L; fp = R; }
      else return NaN;
    } else { if (max <= 2 && bol(s)) ip = s.split(b).join(""); else return NaN; }
    const n = parseFloat((ip || "0") + (fp ? "." + fp : ""));
    return isNaN(n) ? NaN : (neg ? -Math.abs(n) : n);
  }
  // Reads the text that stands in a number box. The box always holds its own language's format (grouping mark + decimal mark),
  // so "1.085" in a comma box is 1085 and "1,085" is 1.085. Text that is not in that format (a value set from outside) falls
  // back to the loose reading.
  function toNumKutu(v) {
    if (typeof v === "number") return v;
    const o = String(v ?? "").trim(); if (!o) return NaN;
    const s = o.replace(/[^\d,.]/g, ""); if (!/\d/.test(s)) return NaN;
    const g = SEP.g === "\u00a0" ? "" : SEP.g, d = SEP.d, e = x => x.replace(/[.,]/g, "\\$&");
    const duz = new RegExp("^(?:\\d{1,3}(?:" + (g ? e(g) : "(?!)") + "\\d{3})+|\\d+)(?:" + e(d) + "\\d*)?$").test(s) || new RegExp("^" + e(d) + "\\d+$").test(s);
    if (!duz) return toNumInput(v);
    const n = parseFloat((g ? s.split(g).join("") : s).replace(d, "."));
    return isNaN(n) ? NaN : (/^\(.*\)$/.test(o) || /^[^\d]*-\s*\d/.test(o) ? -Math.abs(n) : n);
  }
  /* ---------------- reading Excel files written in any of the seven languages (Q-1) ----------------
     The export writes its headers, "Devir / Toplam / Kalan kasa" rows and sheet names with t(), so in the language of the
     window. The importer therefore knows the words of EVERY language, taken from the dictionaries themselves: a word
     changed in a dictionary cannot drift away from what the reader recognises. Texts are compared without case, accents
     and the final-sigma / dotless-i differences ("DÉPENSE (€)" = "Dépense", Greek capitals lose their accents). */
  const xn = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ı/g, "i").replace(/ς/g, "σ").replace(/\s+/g, " ").trim();
  const xEsc = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  const xTerim = k => { const o = new Set([xn(k)]); for (const l of DILLER) { const v = l === "tr" ? k : sozluk(l, k); if (typeof v === "string") o.add(xn(v)); } return [...o].filter(Boolean).sort((a, b) => b.length - a.length); };
  const xRe = (keys, bas, tam) => new RegExp((bas ? "^" : "(?:^|[^\\p{L}\\p{N}])") + "(?:" + [].concat(keys).flatMap(xTerim).map(xEsc).join("|") + ")" + (tam ? "$" : "(?![\\p{L}\\p{N}])"), "u");
  let XC = null;   // built on first use: every dictionary is loaded by then
  const xc = () => XC || (XC = {
    alan: [["yok", xRe(["Kasa etkisi"])], ["date", xRe(["Tarih"])], ["vendor", xRe(["Şirket", "Firma"])], ["desc", xRe(["Açıklama"])], ["out", xRe(["Harcama"])], ["in", xRe(["Gelen para"])], ["pay", xRe(["Hesap / kart"])], ["cat", xRe(["Kategori"])], ["note", xRe(["Not"])]],
    devir: xRe(["Devir"], true),
    odemeTransfer: xRe(["Ödeme / transfer"], true, true),   // the "Tür" cell of a transfer row on the Kartlar sheet
    toplam: xRe(["Toplam", "Kalan kasa", "Dönem kapandı"], true),
    kart: xRe(["Kartlar"], true, true), konsolide: xRe(["Konsolide"], true, true),   // the whole sheet name: "Cards 2025", "Konsolide Bilanço" are somebody else's sheets
    toplamEtiket: new Set(["Toplam", "Kalan kasa", "Dönem kapandı"].flatMap(xTerim).concat(["total", "totals", "grand total", "subtotal", "sub total", "balance", "cash on hand", "period closed", "genel toplam", "ara toplam"])),
    odeme: [["nakit", "Nakit"], ["kart", "Kart"], ["havale", "Havale"], ["eft", "EFT"]].map(([k, a]) => [k, new Set(xTerim(a))])
  });
  // a header cell of an export → "date" | "vendor" | "desc" | "out" | "in" | "pay" | "cat" | "note" | "yok" (a column that is not read: the cash effect) | ""
  function xlsAlan(baslik) { const n = xn(baslik); if (!n) return ""; for (const [k, re] of xc().alan) if (re.test(n)) return k; return ""; }
  // the first text of a row below the headers → "devir" (brought-forward row) | "toplam" (totals, balance, closed-period note) | ""
  function xlsSatirTuru(txt) { const n = xn(txt); if (!n) return ""; return xc().devir.test(n) ? "devir" : xc().toplam.test(n) ? "toplam" : ""; }
  // true when the text is only a totals label ("TOPLAM", "KALAN KASA  (Devir + …)", "Total", "Dönem kapandı · …"), not a name that
  // merely starts with such a word ("Total Energies", "Totale srl", "Saldo di cassa Yat Servis")
  function xlsToplamEtiketi(txt) {
    const n = xn(String(txt ?? "").split(/ · | \(/)[0]).replace(/[\s:.\-–]+$/, "");
    return !!n && (n.startsWith("krem renkli") || xc().toplamEtiket.has(n));
  }
  // true when a cell is the "Ödeme / transfer" type of a card-sheet row (in any language): a transfer between accounts, never an expense or a refund
  const xlsOdemeTransferMi = txt => typeof txt === "string" && xc().odemeTransfer.test(xn(txt));
  // the account cell of an export ("Carte de crédit ··1111", "Visa", "Nakit kasa · Nakit") → the book's account it names, in the names of every language
  // (the standard accounts are named by their dictionary text, so a French file reaches a Turkish book) → { h, belirsiz } | null
  function xlsHesapEsle(set, txt) {
    const ham = String(txt ?? ""), ad = xn(ham.split(" · ")[0]).replace(/\s*··\s*\d{4}$/, ""), son = (/··\s*(\d{4})/.exec(ham) || [])[1];
    if (!ad) return null;
    const std = VARSAYILAN_HESAPLAR.map(h => h.ad);
    let m = hesaplar(set).filter(h => (std.includes(h.ad) ? xTerim(h.ad) : [xn(h.ad)]).includes(ad));
    if (son && m.some(h => String(h.son4 || "") === son)) m = m.filter(h => String(h.son4 || "") === son);
    return m.length ? { h: m[0], belirsiz: m.length > 1 } : null;
  }
  // a sheet name → "ay" (month sheet "Kasım_2026", "Novembre_2026"…) | "kart" | "konsolide" | ""
  function xlsSayfaTuru(ad) {
    const n = xn(ad).replace(/ \(\d+\)$/, "");
    const ay = new Set(); for (const l of DILLER) { const a = MONTHS_ALL[l] || aylarIntl(LOC[l], "long"); (a || []).forEach(x => ay.add(xn(x))); }
    const m = /^(.+)_(\d{4})$/.exec(n); if (m && ay.has(m[1])) return "ay";
    return xc().kart.test(n) ? "kart" : xc().konsolide.test(n) ? "konsolide" : "";
  }
  // the account cell of an export ends with " · <how it was paid>" in the language of the file → "nakit" | "kart" | "havale" | "eft" | ""
  function xlsOdeme(txt) {
    const son = xn(String(txt ?? "").split(" · ").pop());
    for (const [k, set] of xc().odeme) if (set.has(son)) return k;
    return "";
  }

  /* ---------------- foreign-currency entries ----------------
     An entry paid in another currency keeps what was paid (cur, fxAmount) and the rate used
     (fxRate: 1 cur = fxRate of the book's currency), with the rate's date (fxDate) and source (fxSource).
     amount = fxAmount × fxRate, fixed when the entry is saved: a later rate never changes an old entry. */
  const KUR_KAYNAKLARI = ["elle", "TCMB", "ECB"];
  // a rate as stored (up to 10 significant digits): amount = shown amount × shown rate, to the cent
  const kurStr = v => new Intl.NumberFormat(LOC[LANG] || LANG, { maximumSignificantDigits: 10 }).format(+v || 0);
  const kurGecerli = k => Number.isFinite(+k) && +k > 0 && k !== "" && k !== null;
  function dovizAlanlari(tutar, cur, kur, kaynak, tarih) {
    if (!cur || cur === PARA) return { amount: rd(tutar, ondOf(PARA)), para: PARA };
    if (!CUR[cur]) throw new Error(t("Desteklenmeyen para birimi: {cur}", { cur }));
    if (!kurGecerli(kur)) throw new Error(t("Kur belirtilmeden {cur} tutarı {para} defterine işlenemez.", { cur, para: PARA }));
    // the foreign amount is rounded first, so the entry agrees with itself: amount = round(fxAmount × fxRate)
    const fxAmount = rd(tutar, ondOf(cur));
    const o = { amount: rd(fxAmount * kur, ondOf(PARA)), para: PARA, cur, fxAmount, fxRate: +kur, fxSource: KUR_KAYNAKLARI.includes(kaynak) ? kaynak : "elle" };
    if (/^\d{4}-\d{2}-\d{2}$/.test(tarih || "")) o.fxDate = tarih;
    return o;
  }
  // Adds amounts in different currencies in one currency. Every other currency needs a rate (1 cur = rate of "hedef"):
  // amounts are never added 1:1 across currencies.
  function paraToplam(list, hedef, kurlar) {
    hedef = hedef || PARA; let c = 0;
    (list || []).forEach(x => {
      const cur = x.cur || hedef, k = cur === hedef ? 1 : +nesne(kurlar)[cur];
      if (!kurGecerli(k)) throw new Error(t("{cur} ile {hedef} toplanamaz: kur belirtilmedi.", { cur, hedef }));
      c += kr((+x.tutar || 0) * k);
    });
    return tk(c);
  }
  /* Cross rates. A rate table: { baz, kaynak, tarih, kurlar: { USD: 49.98, ... } } where 1 code = kurlar[code] of baz
     (TCMB: baz TRY; ECB: baz EUR). Rate of 1 "from" in "to" = kurlar[from] / kurlar[to]. */
  // a computed rate keeps 10 significant digits: small rates (1 TRY = 0,0205063… EUR) stay exact to the cent on large amounts
  const anlamli = x => Number(x.toPrecision(10));
  function caprazKur(tablo, from, to) {
    tablo = nesne(tablo);
    const R = Object.assign({}, nesne(tablo.kurlar), tablo.baz ? { [tablo.baz]: 1 } : {}), f = +R[from], h = +R[to];
    if (!kurGecerli(f) || !kurGecerli(h)) return null;
    return { kur: from === to ? 1 : anlamli(f / h), kaynak: tablo.kaynak || "", tarih: tablo.tarih || "" };
  }
  // the rates of every supported currency in "para" (1 code = ? para) from one table
  function paraTablosu(tablo, para) {
    const out = { baz: para, kaynak: nesne(tablo).kaynak || "", tarih: nesne(tablo).tarih || "", kurlar: {} };
    PARALAR.forEach(c => { if (c === para) return; const x = caprazKur(tablo, c, para); if (x) out.kurlar[c] = x.kur; });
    return Object.keys(out.kurlar).length ? out : null;
  }
  // the rates for a book from an api/kur answer: an answer already in that currency, or its tables
  // (a lira book uses TCMB; other books use ECB, else TCMB crossed)
  function kurlarFor(yanit, para) {
    const y = nesne(yanit);
    if (y.baz === para && y.kurlar && !Array.isArray(y.kurlar)) return y;
    const T = nesne(y.tablolar), sira = para === "TRY" ? ["TCMB", "ECB"] : ["ECB", "TCMB"];
    for (const k of sira) { const r = T[k] && paraTablosu(T[k], para); if (r) return r; }
    return null;
  }
  /* Remembered rates (the last rate used for each currency), tied to the book's currency and keeping the rate's own
     date and source: ayarlar.kurHafiza["TRY/EUR"] = { kur, kaynak, tarih }. Older books only have ayarlar.rates
     { EUR: 37.85 } (a lira rate typed by hand, date unknown): read only in a lira book. */
  function hatirlananKur(set, cur, para) {
    para = para || PARA; set = nesne(set);
    const h = nesne(set.kurHafiza)[para + "/" + cur];
    if (h && kurGecerli(h.kur)) return { kur: +h.kur, kaynak: KUR_KAYNAKLARI.includes(h.kaynak) ? h.kaynak : "elle", tarih: /^\d{4}-\d{2}-\d{2}$/.test(h.tarih || "") ? h.tarih : "" };
    const eski = nesne(set.rates)[cur];
    if (para === "TRY" && kurGecerli(eski)) return { kur: +eski, kaynak: "elle", tarih: "" };
    return null;
  }
  // the settings fields to save after an entry used a rate (rates{} is kept for older versions, in lira books only)
  function kurHatirla(set, cur, kur, kaynak, tarih, para) {
    para = para || PARA; set = nesne(set);
    const out = { kurHafiza: Object.assign({}, nesne(set.kurHafiza), { [para + "/" + cur]: { kur: +kur, kaynak: KUR_KAYNAKLARI.includes(kaynak) ? kaynak : "elle", tarih: tarih || "" } }) };
    if (para === "TRY") out.rates = Object.assign({}, nesne(set.rates), { [cur]: +kur });
    return out;
  }
  /* the currency a piece of text names ("Harcama (€)", "EUR", "100 $", "TL", "Tutar (Euro)", "Dolar"), or "".
     Names are read in the team's languages (tr, en, fr, it, es, de, el). A currency that is not supported
     (¥, kr, zł, ₽, JPY, SEK…) comes back as "?" + its sign, so an import never books it 1:1 in the book's currency. */
  const kelime = w => new RegExp("(?<!\\p{L})(" + w + ")(?!\\p{L})", "u");
  const PARA_ADLARI = [   // order matters: "Australian dollar" before "dollar", "lira sterlina" before "lira"
    ["AUD", /avustralya|australi|αυστραλ/],
    ["GBP", kelime("sterlin|sterlini|sterling|sterlina|pound|pounds|pfund|libra|libras|livre|livres|στερλίνα|στερλίνες")],
    ["USD", kelime("dolar|doları|dolar[ıi]|dollar|dollars|dólar|dólares|dollaro|dollari|δολάριο|δολάρια")],
    ["CHF", kelime("frank|frankı|frangı|franc|francs|franken|franco|franchi|φράγκο|φράγκα|sfr|fr")],
    ["AED", kelime("dirhem|dirhemi|dirham|dirhams|dírham|ντιρχάμ|dhs|dh")],
    ["EUR", kelime("euro|euros|eurosu|ευρώ")],
    ["TRY", kelime("lira|lirası|liras|lire|λίρα|λίρες")]
  ];
  // names of currencies the book cannot hold (yen, krone, ruble, rupee, yuan, forint, zloty…), in the team's languages
  const YABANCI_AD = kelime("yen|krone|kroner|krona|kronor|kron|ruble|rublesi|rouble|roubles|rubel|rubli|rublo|rupee|rupees|rupi|rupisi|rupie|rupia|roupie|yuan|renminbi|forint|zloty|złoty|zlotych|zlotisi|ρούβλι|γιεν|ρουπία|γουάν");
  const YABANCI_KOD = /(^|[^A-Za-z])(JPY|CNY|RMB|SEK|NOK|DKK|ISK|PLN|CZK|HUF|RON|BGN|RUB|UAH|INR|KRW|ILS|SAR|QAR|KWD|BHD|OMR|JOD|EGP|CAD|NZD|SGD|HKD|MXN|BRL|ZAR|THB|IDR|MYR|PHP|AZN|GEL|KZT|XDR)([^A-Za-z]|$)/;
  const YABANCI_ISARET = /[¥₽₹₩₪₫฿₴₦₱₸₼₾]|zł|Kč|лв|R\$|C\$|NZ\$|HK\$|S\$|(^|[^a-zçğıöşü])(kr|kn|lei|ft)\.?([^a-zçğıöşü]|$)/i;
  function paraTani(s) {
    const x = String(s ?? ""); if (!x.trim()) return "";
    const kod = PARALAR.find(c => new RegExp("(^|[^A-Za-z])" + c + "([^A-Za-z]|$)").test(x.toUpperCase()));
    if (kod) return kod;
    if (/US\$/.test(x)) return "USD";
    const yk = YABANCI_KOD.exec(x.toUpperCase()); if (yk) return "?" + yk[2];
    const yi = YABANCI_ISARET.exec(x); if (yi) return "?" + (yi[2] || yi[0]).trim();
    if (/(^|[^A-Za-zÇĞİÖŞÜçğıöşü])TL([^A-Za-zÇĞİÖŞÜçğıöşü]|$)/.test(x)) return "TRY";
    const sem = PARALAR.filter(c => CUR[c].sym !== c).sort((a, b) => CUR[b].sym.length - CUR[a].sym.length).find(c => x.includes(CUR[c].sym));
    if (sem) return sem;
    const kucuk = x.toLocaleLowerCase("tr"), kucuk2 = x.toLowerCase();
    const ad = PARA_ADLARI.find(([, re]) => re.test(kucuk) || re.test(kucuk2));
    if (ad) return ad[0];
    const ya = YABANCI_AD.exec(kucuk2) || YABANCI_AD.exec(kucuk);
    return ya ? "?" + ya[1] : "";
  }
  /* entries saved in another book currency than the book's present one (the book's currency changed after them):
     new entries carry e.para; an older entry (before e.para) gives itself away when its foreign currency is now the
     book's own currency but its amount was converted at a rate (cur = book currency, fxRate ≠ 1) — before Faz 5 every book was in lira. */
  const uyumsuzMu = (e, p) => !!e && (typeof e.para === "string" ? e.para !== p : e.cur === p && +e.fxAmount > 0 && +e.fxRate > 0 && +e.fxRate !== 1);
  const paraUyumsuz = (items, set) => { const p = paraOf(set); return (items || []).filter(e => uyumsuzMu(e, p)); };
  /* R7: does an entry count in the totals? An entry in another book currency is never added (1.000 ₺ + 100 € is not
     1.100 of anything): balances, summaries, reports and Excel leave it out and list it with a red warning.
     set: the book (its "para"); without it, the open book (K.setPara). ONE predicate for every total, so that the
     invalid-amount filter of the Frontend (K.tutarGecerli) can be joined here: hesabaGirer = valid amount && same currency.
     DESIGN NOTE (repair, not built): per entry "convert at a rate": the user gives a rate; the entry becomes
     cur = e.para, fxAmount = amount, fxRate = rate, amount = round(amount × rate), para = book currency, fxSource "elle". */
  // tek süzgeç (Tur 1): geçerli tutar (Frontend) ve defterle aynı para birimi (Para)
  function hesabaGirer(e, set) { return tutarGecerli(e) && !uyumsuzMu(e, set === undefined || set === null ? PARA : paraOf(set)); }
  const kayitParasi = e => typeof e.para === "string" ? e.para : "TRY";
  const paraOf = set => { const p = nesne(set).para; return typeof p === "string" && CUR[p.trim().toUpperCase()] ? p.trim().toUpperCase() : "TRY"; };
  function amountNote(e) {
    const parts = [];
    if (e.cur && e.cur !== PARA && +e.fxAmount > 0) parts.push(fx(e.fxAmount, e.cur) + " × " + kurStr(e.fxRate) + (e.fxSource || e.fxDate ? " (" + [e.fxSource === "elle" ? t("elle girilen kur") : e.fxSource, e.fxDate ? dmy(e.fxDate) : ""].filter(Boolean).join(" ") + ")" : ""));
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
      if (k === "openedThrough") { const xa = ayMi(va) ? va : null, xb = ayMi(vb) ? vb : null; v = (xa || "") >= (xb || "") ? xa : xb; }   // the latest opened month
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
    const pb = paraBirlestir(aA, aB, A, B, ayar.para, kayitlar);
    if (pb !== undefined) ayar.para = pb;
    return { uygulama: "Kasa Jurnali", surum: 2, ayarlar: ayar, kayitlar, silinenler: sil };
  }
  /* The book's currency follows its entries: amounts are never converted, so merging two copies must not move a book
     with entries to another currency.
     - every entry counts with the currency it was saved in: e.para, or, for an entry without it (saved before e.para
       existed), the currency of the copy it comes from (no "para" = an old lira book);
     - all entries in one currency → that currency (an empty copy where another currency was picked changes nothing);
     - entries in different currencies = a conflict: the currency of the oldest entry (the book that existed first) is
       kept, never the newest; the entries in the other currency then show the red "currency mismatch" warning;
     - no entries → the ordinary rule (newest setting). Ties are broken by id, so the result never depends on order.
     Returns the currency to use, or undefined to keep the ordinary result. */
  function paraBirlestir(aA, aB, A, B, sonuc, kayitlar) {
    if (!kayitlar.length) return undefined;
    const now = typeof sonuc === "string" && sonuc ? sonuc.toUpperCase() : "TRY";
    const tarafPara = a => { const p = a.para; return typeof p === "string" && CUR[p.toUpperCase()] ? p.toUpperCase() : "TRY"; };
    const pA = tarafPara(aA), pB = tarafPara(aB);
    const idA = new Set((Array.isArray(A.kayitlar) ? A.kayitlar : []).map(e => e && e.id));
    const idB = new Set((Array.isArray(B.kayitlar) ? B.kayitlar : []).map(e => e && e.id));
    // an unmarked entry present in both copies: the copy whose currency setting is older (the one it was made under)
    const zA = nesne(aA._zaman).para || "", zB = nesne(aB._zaman).para || "";
    const ikisi = pA === pB ? pA : zA !== zB ? (zA < zB ? pA : pB) : (pA < pB ? pA : pB);
    const paraOfE = e => typeof e.para === "string" && CUR[e.para] ? e.para : idA.has(e.id) && idB.has(e.id) ? ikisi : idA.has(e.id) ? pA : pB;
    const paralar = new Set(kayitlar.map(paraOfE));
    let p;
    if (paralar.size === 1) p = [...paralar][0];
    else p = paraOfE(kayitlar.reduce((a, e) => { const c = kar(ISO(e.createdAt), ISO(a.createdAt)) || kar(e.id, a.id); return c < 0 ? e : a; }));
    return p === now ? undefined : p;
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
    setLang, t, pad, r2, tl, num, qty, fx, dec, pct, ltStr, perL, CUR, curName, PARALAR, setPara, paraKodu, paraSym, kurStr, tp,
    KUR_KAYNAKLARI, dovizAlanlari, paraToplam, caprazKur, paraTablosu, kurlarFor, kurGecerli, hatirlananKur, kurHatirla, paraTani, paraUyumsuz, hesabaGirer, kayitParasi, paraOfSet: paraOf, todayISO, curYM, monthName, monthLabel, shortMon, addMonth, dmy, dateTime, esc, lower,
    isIn, isOut, isTr, isIade, sums, cmpEntry, kasaFor, hesapFor, ozetFor, runningMap, HESAP_TURLERI, VARSAYILAN_HESAPLAR, hesaplar, hesapBul, hesapOf, hesapTur, etki, monthRange, ayMi, monthsWithData, isClosed, degisiklikEngeli, kapaliAyikla, tutarGecerli, gecersizKayitlar, CATS, catLabel, catKey, guessCat, payName, paySplit, catSplit,
    DILLER, LOC, DIL_ADI, dilGecerli, dilBul, sozluk, yasalNot,
    isFuel, fuelStats, parseLt, toNum, toNumInput, toNumKutu, amountNote, xlsAlan, xlsSatirTuru, xlsSayfaTuru, xlsOdemeTransferMi, xlsHesapEsle, xlsToplamEtiketi, xlsOdeme,
    YEREL_AYAR, damga, sabit, ayarFarki, birlestir, ayniMi, uzakHali, zamanOf
  });
  setLang("tr"); setPara("TRY");
  g.KJ = KJ;
})(typeof window !== "undefined" ? window : globalThis);
