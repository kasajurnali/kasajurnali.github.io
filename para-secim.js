/* Yachting Jurnal — choosing the book's currency on first use (a new, empty book).
   KJ.paraOneri({dil, bolge, saatDilimi}) → "EUR" | "GBP" | "USD" | "TRY" | "CHF" | "AUD" | "AED" | "" ("" = no suggestion: the user chooses).
   Order: the region (country) → the language (only when there is no region) → the time zone. Only the currencies of KJ.PARALAR are suggested.
   KJ.paraSecimGerekli(ayarlar, kayitlar) → true only for an EMPTY book whose currency was never chosen: no entries, no `paraSecildi`, no `para`,
   no opening cash. A book that has entries (or an old book with any of those fields) never asks, and no total changes.
   KJ.paraKartHTML({oneri, secili}) → the window "Choose your book's currency" (confirmation needed, cannot be dismissed).
   Amounts are never converted: the choice is only possible while the book is empty (app.js paraKilitli). */
(function (g) {
  "use strict";
  const KJ = g.KJ = g.KJ || {};
  // country (ISO 3166 alpha-2) → currency, for the currencies of PARA_TABLO (hesap.js) only
  const ULKE = {};
  const ekle = (kod, ulkeler) => ulkeler.split(" ").forEach(u => { ULKE[u] = kod; });
  ekle("EUR", "AT BE CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES HR BG MC SM VA AD ME XK");   // euro area (+ countries that use it)
  ekle("GBP", "GB GG JE IM");
  ekle("USD", "US PR GU VI AS MP");
  ekle("TRY", "TR");
  ekle("CHF", "CH LI");
  ekle("AUD", "AU CX CC NF");
  ekle("AED", "AE");
  const DIL = { tr: "TRY", de: "EUR", fr: "EUR", it: "EUR", es: "EUR", el: "EUR" };   // "en" says nothing about the country: no suggestion
  const EURO_ZONLARI = new Set(["Vienna", "Brussels", "Nicosia", "Tallinn", "Helsinki", "Paris", "Berlin", "Athens", "Dublin", "Rome", "Riga", "Vilnius",
    "Luxembourg", "Malta", "Amsterdam", "Lisbon", "Bratislava", "Ljubljana", "Madrid", "Zagreb", "Sofia", "Monaco", "San_Marino", "Vatican", "Andorra", "Podgorica"]);
  const GBP_ZONLARI = new Set(["London", "Belfast", "Jersey", "Guernsey", "Isle_of_Man"]);
  // the time zones of the United States only (America/Toronto, America/Mexico_City … are other countries)
  const ABD_ZONLARI = new Set(["New_York", "Detroit", "Chicago", "Menominee", "Denver", "Boise", "Phoenix", "Los_Angeles", "Anchorage", "Juneau", "Sitka",
    "Metlakatla", "Yakutat", "Nome", "Adak", "Puerto_Rico", "Indianapolis", "Louisville", "Fort_Wayne", "Knox_IN", "Shiprock", "Atka", "Honolulu"]);

  const desteklenen = k => !!k && (!KJ.PARALAR || KJ.PARALAR.includes(k)) ? k : "";
  // "DE", "de-DE", "de_DE", "zh-Hans-CN" → "DE" ; "de", "" → ""
  function bolgeKodu(s, tekHarfBolgeMi) {
    const p = String(s == null ? "" : s).trim().split(/[-_]/);
    if (p.length === 1) return tekHarfBolgeMi && /^[A-Za-z]{2}$/.test(p[0]) ? p[0].toUpperCase() : "";
    const r = p.slice(1).find(x => /^[A-Za-z]{2}$/.test(x));
    return r ? r.toUpperCase() : "";
  }
  const dilKodu = s => String(s == null ? "" : s).trim().split(/[-_]/)[0].toLowerCase();
  function saatDiliminden(z) {
    z = String(z == null ? "" : z).trim();
    const m = /^([A-Za-z_]+)\/(.+)$/.exec(z); if (!m) return "";
    const alan = m[1], yer = m[2];
    if (alan === "Europe" || alan === "Asia") { if (yer === "Istanbul") return "TRY"; }
    if (alan === "Europe") { if (GBP_ZONLARI.has(yer)) return "GBP"; if (EURO_ZONLARI.has(yer)) return "EUR"; if (yer === "Zurich" || yer === "Vaduz") return "CHF"; return ""; }
    if (alan === "Asia") { if (yer === "Nicosia") return "EUR"; if (yer === "Dubai") return "AED"; return ""; }
    if (alan === "Atlantic") return /^(Azores|Madeira|Canary)$/.test(yer) ? "EUR" : "";
    if (alan === "Africa") return yer === "Ceuta" ? "EUR" : "";
    if (alan === "Australia") return "AUD";
    if (alan === "Pacific") return yer === "Honolulu" ? "USD" : "";
    if (alan === "US") return "USD";
    if (alan === "America") return ABD_ZONLARI.has(yer.split("/")[0]) || /^(Indiana|Kentucky|North_Dakota)\//.test(yer) ? "USD" : "";
    return "";
  }
  function paraOneri(o) {
    o = o || {};
    const bolge = bolgeKodu(o.bolge, true) || bolgeKodu(o.dil, false);
    if (bolge) { const k = desteklenen(ULKE[bolge]); if (k) return k; }
    else { const k = desteklenen(DIL[dilKodu(o.dil)]); if (k) return k; }   // a region that is known but not supported (fr-CA …) is not guessed from the language
    // F-15: the time zone alone (no region, no clear language) is not enough to preselect a currency: the card still asks, with no "Suggested" badge.
    // It is only used to place a region that is known but unsupported (fr-CA in Paris).
    return bolge ? desteklenen(saatDiliminden(o.saatDilimi)) : "";
  }
  // what this browser says (language with region, time zone); never throws
  function paraOneriTarayici(dilYedek) {
    let dil = "", z = "";
    try { dil = (g.navigator && (g.navigator.language || (g.navigator.languages || [])[0])) || ""; } catch (e) { }
    try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { }
    return paraOneri({ dil: dil || dilYedek || "", saatDilimi: z });
  }
  // a book that has never been given a currency: empty, and none of the fields that say it was chosen
  // ek = { silinenKayitlar, silinenler } (optional): a book with a closed month, or with deleted entries (archive / tombstones: it has history, maybe on another
  // device) never asks (F-14). The only deletions of a book emptied by "reset the book" (paraSifirlandi) are its own: that book asks again.
  const doluNesne = o => !!o && typeof o === "object" && Object.keys(o).length > 0;
  function paraSecimGerekli(ayarlar, kayitlar, ek) {
    const a = ayarlar && typeof ayarlar === "object" ? ayarlar : {};
    if (Array.isArray(kayitlar) && kayitlar.length) return false;
    if (Array.isArray(a.closed) && a.closed.length) return false;
    if (ek && !a.paraSifirlandi && (doluNesne(ek.silinenKayitlar) || doluNesne(ek.silinenler))) return false;
    if (ek && doluNesne(ek.silinenKayitlar)) return false;
    if (a.paraSecildi === true || a.paraSecildi === "sifirlandi" || (a.para != null && a.para !== "")) return false;
    if (a.opening != null) return false;
    if (Array.isArray(a.hesaplar) && a.hesaplar.some(h => h && +h.acilis !== 0 && !isNaN(+h.acilis))) return false;   // an account with an opening balance already holds amounts in some currency
    return true;
  }
  /* "Reset the book and change the currency" — only for someone who chose the WRONG currency. Offered only when it is safe and certain:
     entries exist, none is refused by K.degisiklikEngeli (no closed month, no date before the opening), no currency mismatch (that has its own repair),
     no archive of deleted entries, and the synchronisation state is known (ek.senkBelirsiz = false). */
  function paraSifirlaUygun(ayarlar, kayitlar, ek) {
    const a = ayarlar && typeof ayarlar === "object" ? ayarlar : {}; ek = ek || {};
    if (!Array.isArray(kayitlar) || !kayitlar.length) return false;
    if (Array.isArray(a.closed) && a.closed.length) return false;
    if (doluNesne(ek.silinenKayitlar) || ek.senkBelirsiz) return false;
    if (KJ.paraUyumsuz && KJ.paraUyumsuz(kayitlar, a).length) return false;
    if (KJ.degisiklikEngeli && kayitlar.some(e => KJ.degisiklikEngeli(a, e, null))) return false;
    return true;
  }
  // the emptied book, built on COPIES (nothing passed in is changed): every entry gets a deletion stamp (so no device brings it back), the opening cash and
  // the account openings are zero, the currency is cleared (the card asks again); name, rules and everything else stay. No amount is converted.
  function paraSifirlaDefter(d, simdi) {
    const cl = o => JSON.parse(JSON.stringify(o === undefined ? null : o));
    d = d || {}; const set = cl(d.set || {}), sil = Object.assign({}, cl(d.silinenler || {}));
    for (const e of d.items || []) if (e && typeof e.id === "string") sil[e.id] = KJ.damga(e.updatedAt || e.createdAt);
    set.opening = null; set.openingDate = null;
    if (Array.isArray(set.hesaplar)) set.hesaplar.forEach(h => { if (h && typeof h === "object" && h.acilis) h.acilis = 0; });
    delete set.para; delete set.paraSecildi;
    // the receipt photos of the cleared entries are kept 400 days (a later synchronisation / photo clean-up leaves them; a restored backup finds them again)
    const koru = {}, simdiMs = simdi ? Date.parse(simdi) : Date.now();
    for (const id of korunanFotoIdler(set, simdiMs)) koru[id] = set.korunanFoto[id];
    for (const e of d.items || []) if (e && typeof e.photo === "string" && FOTO_ID.test(e.photo)) koru[e.photo] = new Date(simdiMs).toISOString();
    const idler = Object.keys(koru).sort((x, y) => (koru[y] > koru[x] ? 1 : -1)).slice(0, 2000);
    if (idler.length) set.korunanFoto = Object.fromEntries(idler.map(id => [id, koru[id]])); else delete set.korunanFoto;
    set.paraSifirlandi = simdi || new Date().toISOString();
    const f = KJ.ayarFarki(d.setBase || {}, set);
    set._zaman = Object.assign({}, (d.set || {})._zaman, f.zaman);
    return { ayarlar: set, kayitlar: [], silinenler: sil, silinenKayitlar: cl(d.silinenKayitlar || {}) };
  }
  // the photo ids kept after a reset: {id: time} in the setting "korunanFoto"; valid id, younger than 400 days, at most 5000 (also used by senk.js)
  const FOTO_ID = /^[a-f0-9]{24,40}$/, KORUMA_GUN = 400, KORUMA_EN = 5000;
  function korunanFotoIdler(ayarlar, simdi) {
    const m = ayarlar && ayarlar.korunanFoto, l = [], n = simdi || Date.now();
    if (!m || typeof m !== "object" || Array.isArray(m)) return l;
    for (const id of Object.keys(m)) { const z = Date.parse(m[id]); if (FOTO_ID.test(id) && typeof m[id] === "string" && !isNaN(z) && n - z <= KORUMA_GUN * 864e5) { l.push(id); if (l.length >= KORUMA_EN) break; } }
    return l;
  }
  // Two devices that reset at the same time: the merge of the setting korunanFoto is the UNION of both lists (newest time per id), whatever the order; every
  // other setting is merged as before. Wraps KJ.birlestir (as gecmis.js does) so hesap.js stays untouched.
  if (KJ.birlestir && !KJ.birlestir._korunanFoto) {
    const asil = KJ.birlestir;
    KJ.birlestir = function (A, B, simdi) {
      const m = asil.apply(this, arguments), u = {};
      for (const X of [A, B]) { const l = X && X.ayarlar && X.ayarlar.korunanFoto; if (l && typeof l === "object" && !Array.isArray(l)) for (const id of Object.keys(l)) if (FOTO_ID.test(id) && typeof l[id] === "string" && (!u[id] || l[id] > u[id])) u[id] = l[id]; }
      const ids = Object.keys(u).sort((x, y) => (u[y] > u[x] ? 1 : -1)).slice(0, KORUMA_EN);
      if (ids.length && m && m.ayarlar) m.ayarlar.korunanFoto = Object.fromEntries(ids.map(id => [id, u[id]]));
      return m;
    };
    KJ.birlestir._korunanFoto = true;
  }
  // the word the user types to confirm, in the app's language; compared without case, accents or spaces around
  const sozNorm = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const sifirlaSozcuk = () => KJ.t("SIFIRLA");
  const sifirlaSozcukTamam = girilen => sozNorm(girilen) === sozNorm(sifirlaSozcuk()) && sozNorm(girilen) !== "";
  function paraSifirlaHTML(o) {
    const { esc, t } = KJ; o = o || {};
    return '<div class="scrim" id="scrim"><form class="sheet" id="psForm" role="dialog" aria-modal="true" aria-labelledby="psBas" novalidate>' +
      '<h3 id="psBas">' + esc(t("Defter sıfırlansın mı?")) + '</h3>' +
      '<p class="lead" style="margin:0 0 10px"><b>' + esc(t("Bu defterdeki tüm kayıtlar silinecek. Bu işlem geri alınamaz. Para tutarları başka bir para birimine çevrilmez; defter boş başlar ve para birimini yeniden seçersiniz.")) + '</b></p>' +
      '<p class="small" style="margin:0 0 8px">' + esc(t("Başlangıç kasası ve hesap açılış bakiyeleri de sıfırlanır. Tekne adı ve kurallar korunur.")) + '</p>' +
      '<p class="small" style="margin:0 0 8px">' + esc(t("İşlemden önce defterin yedeği otomatik alınır. Yedek alınamazsa hiçbir şey silinmez.")) + '</p>' +
      (o.belirsiz && !o.esitleme ? '<p class="small" id="psSenk2" style="margin:0 0 8px">' + esc(t("Başka cihazlarda da silinebilir.")) + '</p>' : "") +
      (o.indirme ? '<p class="small" style="margin:0 0 8px">' + esc(t("Bu cihazda yedek bir dosya olarak indirilir; inip inmediği doğrulanamaz. Dosyayı kaydettikten sonra aşağıyı işaretleyin.")) + '</p>' +
        '<div class="btns" style="justify-content:flex-start;margin:0 0 8px"><button type="button" class="btn" id="psIndir">' + esc(t("Yedek dosyasını indir")) + '</button></div>' +
        '<label class="chk" style="display:flex;gap:8px;align-items:flex-start;margin:0 0 10px"><input type="checkbox" id="psKaydettim" style="margin-top:3px"><span>' + esc(t("Yedek dosyasını kaydettim")) + '</span></label>' : "") +
      (o.esitleme ? '<p class="small" id="psSenk" style="margin:0 0 8px;color:var(--danger)"><b>' + esc(t("Eşitleme açık: bu kayıtlar eşitlenen diğer cihazlarda da silinecek.")) + '</b></p>' +
        '<p class="small" id="psSenk3" style="margin:0 0 8px">' + esc(t("Sıfırlamadan önce diğer cihazlarınızı açıp eşitleyin; eşitlenmemiş kayıtlar sıfırlamayla çakışabilir.")) + '</p>' : "") +
      '<div class="field"><label for="psSoz">' + esc(t("Onaylamak için aşağıya {sozcuk} yazın.", { sozcuk: sifirlaSozcuk() })) + '</label><input id="psSoz" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>' +
      '<div class="err-t" id="pserr" role="alert"></div>' +
      '<div class="acts"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><div class="r"><button type="submit" class="btn danger" id="psOnay" disabled>' + esc(o.indirme ? t("Sıfırla") : t("Yedekle ve sıfırla")) + '</button></div></div></form></div>';
  }

  // the last currency chosen on this device (a new boat starts with it); only a supported currency is returned
  const SON_ANAHTAR = "kj-son-para";
  function sonPara() { try { return desteklenen(g.localStorage.getItem(SON_ANAHTAR)); } catch (e) { return ""; } }
  function sonParaYaz(k) { try { if (desteklenen(k)) g.localStorage.setItem(SON_ANAHTAR, k); } catch (e) { } }

  function paraKartHTML(o) {
    const { esc, t, CUR, PARALAR, curName } = KJ;
    o = o || {};
    const secili = PARALAR.includes(o.secili) ? o.secili : "", oneri = PARALAR.includes(o.oneri) ? o.oneri : "";
    const secenek = PARALAR.map(c => '<label class="pkopt"><input type="radio" name="paraSec" value="' + c + '"' + (c === secili ? " checked" : "") + '>' +
      '<span class="pksym" aria-hidden="true">' + esc(CUR[c].sym) + '</span><span class="pkad"><b>' + esc(c) + '</b><small>' + esc(curName(c)) + '</small></span>' +
      (c === oneri ? '<span class="pkoneri">' + esc(t("Önerilen")) + '</span>' : "") + '</label>').join("");
    return '<div class="scrim" id="paraScrim"><form class="sheet pkart" id="paraKart" role="dialog" aria-modal="true" aria-labelledby="pkBas" novalidate>' +
      '<h3 id="pkBas">' + esc(t("Defterinizin para birimini seçin")) + '</h3>' +
      '<p class="lead" style="margin:0 0 12px">' + esc(t("Bütün tutarlar, raporlar, Excel ve PDF seçtiğiniz para biriminde hazırlanır. İlk kayıttan sonra değiştirilemez, çünkü tutarlar çevrilmez.")) + '</p>' +
      (oneri ? '<p class="small" style="margin:0 0 10px">' + esc(t("Bölgenize göre {para} önerildi; onaylayabilir ya da başka birim seçebilirsiniz.", { para: oneri })) + '</p>' : '<p class="small" style="margin:0 0 10px">' + esc(t("Bölgenizden para birimi anlaşılamadı; lütfen birini seçin.")) + '</p>') +
      '<div class="pkliste" role="radiogroup" aria-labelledby="pkBas">' + secenek + '</div>' +
      '<div class="err-t" id="pkerr" role="alert"></div>' +
      '<div class="acts">' + (o.esitleme ? '<button type="button" class="btn linkbtn" id="pkEsitle" data-para-esitle>' + esc(t("Defteriniz başka cihazda mı? Eşitlemeyi aç")) + '</button>' : "") + '<div class="r"><button type="submit" class="btn pri" id="pkOnay">' + esc(t("Onayla ve devam et")) + '</button></div></div></form></div>';
  }

  // Tab stays inside the card while it is open (only this card): from the last control to the first and back; a radio group is one stop
  if (g.document && g.document.addEventListener) g.document.addEventListener("keydown", e => {
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
    const kart = g.document.getElementById("paraKart"); if (!kart) return;
    const l = [...kart.querySelectorAll("input[type=radio],button")].filter(x => !x.disabled && (x.type !== "radio" || x.checked || !kart.querySelector("input[type=radio]:checked")));
    const ilkRadyo = kart.querySelector("input[type=radio]"); if (ilkRadyo && !kart.querySelector("input[type=radio]:checked") && !l.includes(ilkRadyo)) l.unshift(ilkRadyo);
    if (!l.length) return;
    const a = g.document.activeElement, i = l.indexOf(a);
    if (i < 0) { e.preventDefault(); l[e.shiftKey ? l.length - 1 : 0].focus(); }
    else if (e.shiftKey && i === 0) { e.preventDefault(); l[l.length - 1].focus(); }
    else if (!e.shiftKey && i === l.length - 1) { e.preventDefault(); l[0].focus(); }
  }, true);

  Object.assign(KJ, { paraOneri, paraOneriTarayici, paraSecimGerekli, paraSifirlaUygun, paraSifirlaDefter, paraSifirlaHTML, sifirlaSozcuk, sifirlaSozcukTamam, korunanFotoIdler, paraKartHTML, sonPara, sonParaYaz });
})(typeof window !== "undefined" ? window : globalThis);
