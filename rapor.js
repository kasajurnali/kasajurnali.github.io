/* Yachting Jurnal — printable A4 cash report. Built from the data the program injects. */
"use strict";
(function () {
  const K = window.KJ;
  // GT-7: veri satır içi betikte değil, çalışmayan bir JSON bloğunda gelir (CSP script-src 'self'); testler window.__RAPOR verebilir
  let D = window.__RAPOR;
  if (!D && typeof document !== "undefined" && document.getElementById) { const vb = document.getElementById("rapor-veri"); if (vb) { try { D = JSON.parse(vb.textContent); } catch (e) { D = null; } } }
  if (typeof document !== "undefined" && document.getElementById) { const yb = document.getElementById("yazdirBtn"); if (yb && typeof yb.addEventListener === "function") yb.addEventListener("click", () => window.print()); }
  const root = document.getElementById("r");
  if (!D) { root.textContent = "Rapor verisi bulunamadı. / Report data not found."; return; }
  // iPhone: the window leaves the boats and the company for the report in this tab's storage ("ek=1" in the address)
  if (!D.konsolide && typeof location !== "undefined" && /[?&]ek=1(&|$)/.test(location.search || "")) {
    try { const x = JSON.parse(sessionStorage.getItem("kj_rapor_ek") || "null"); if (x) { D.konsolide = x.konsolide || null; D.sirket = D.sirket || x.sirket || null; } } catch (e) { }
  }
  const df = D.defter || {};
  const items = Array.isArray(df.kayitlar) ? df.kayitlar : [];
  const set = Object.assign({ opening: null, openingDate: null, name: "", preparedBy: "", approvedBy: "", closed: [] }, df.ayarlar || {});
  K.setLang(D.dil || set.lang || "tr");
  K.setPara(set.para);
  document.documentElement.lang = K.lang;
  const { tl, num, esc, dmy, monthLabel, addMonth, isIn, t, pad } = K;
  const months = (D.aylar || []).slice().sort();
  const run = K.runningMap(items, set);
  const made = D.olusturma ? new Date(D.olusturma) : new Date();
  const madeStr = dmy(made.getFullYear() + "-" + pad(made.getMonth() + 1) + "-" + pad(made.getDate()));
  const token = encodeURIComponent(D.token || "");
  const name = set.name || "Yachting Jurnal";
  const inMonth = m => items.filter(e => (e.date || "").slice(0, 7) === m && K.tutarGecerli(e)).sort(K.cmpEntry);
  const sirketAd = D.sirket && D.sirket.ad ? String(D.sirket.ad).trim() : "";
  // consolidated cover (several boats): computed here when the boats' books are sent, used as is when already computed
  let kons = D.konsolide || null;
  if (kons && K.konsolide && (Array.isArray(kons) || (Array.isArray(kons.tekneler) && kons.tekneler.some(x => x && x.defter))))
    kons = K.konsolide(Array.isArray(kons) ? kons : kons.tekneler, Array.isArray(kons) ? months : (kons.donem || months));
  if (kons && !(Array.isArray(kons.tekneler) && kons.tekneler.length)) kons = null;
  if (kons) months.splice(0, months.length, ...months.filter(m => inMonth(m).length));   // this boat's detail: only its months with entries
  const spanOf = ms => !ms.length ? "" : ms.length > 1 ? monthLabel(ms[0]) + " – " + monthLabel(ms[ms.length - 1]) : monthLabel(ms[0]);
  const span = spanOf(months.length ? months : kons ? kons.aylar || [] : []);

  // photo appendix numbering
  const ek = {}; const ekList = [];
  if (D.fotograflar) months.forEach(m => inMonth(m).forEach(e => { if (typeof e.photo === "string" && /^[a-f0-9]{24,40}$/.test(e.photo)) { ek[e.id] = ekList.length + 1; ekList.push(e); } }));

  const flags = '<span class="ics" aria-hidden="true"><i class="k"></i><i class="a"></i><i class="s"></i><i class="a"></i></span>';
  let sirketBas = !!sirketAd;   // the company name goes on the cover (first page) only
  const head = (title, period, status, kurum) =>
    '<header class="rh"><div><div class="ust">' + flags + '<span>Yachting Jurnal</span></div>' + (sirketBas ? (sirketBas = false, '<div class="sirket">' + esc(sirketAd) + '</div>') : "") + '<div class="kurum">' + esc(kurum || name) + '</div><h1>' + esc(title) + '</h1></div>' +
    '<div class="rh-r"><div class="etk">' + esc(t("Dönem")) + '</div><div class="donem">' + esc(period) + '</div><div class="meta">' + esc(t("Rapor tarihi: {tarih}", { tarih: madeStr })) + '</div>' + (status || "") + '</div></header>';

  const VARS = Object.assign(Object.create(null), { nakit: "Nakit kasa", kart: "Kredi kartı", banka: "Banka hesabı" });
  const hesapAd = id => { const h = K.hesapBul(set, id); if (!h) return t(VARS[id] || "Nakit kasa"); return (VARS[h.id] && h.ad === VARS[h.id] ? t(h.ad) : h.ad) + (h.son4 ? " ··" + h.son4 : ""); };
  const ix = K.kayitIndeksi(items), eski = K.eskiMod(set);   // no accounts or cards: every expense leaves the cash box (2.5.0 rule)
  const nakitMi = id => K.hesapTur(set, id) === "nakit";
  // eski mod: how an entry was paid / arrived (no accounts exist): Nakit / Kart, or Havale / EFT for money in
  const odemeEski = e => isIn(e) ? K.payName(e.pay) : e.pay === "kart" || K.hesapTur(set, K.hesapOf(e, ix)) === "kart" ? t("Kart") : t("Nakit");
  const onceki = K.oncekiIadeler ? K.oncekiIadeler(items) : new Set();   // refunds of an earlier month's expense
  // income and expenses of every account (cards, bank, advance too): shown apart from the cash box, clearly labelled
  const tumHesaplar = (gel, gid, sGel, sGid) => '<div class="ozet" style="margin-top:0">' +
    '<div class="kutu gelen" style="grid-column:span 2"><div class="l">' + esc(t("Gelen para (tüm hesaplar)")) + '</div><div class="v">' + tl(gel) + '</div>' + (sGel ? '<div class="s">' + esc(sGel) + '</div>' : "") + '</div>' +
    '<div class="kutu" style="grid-column:span 2"><div class="l">' + esc(t("Toplam harcama (tüm hesaplar)")) + '</div><div class="v">' + tl(gid) + '</div>' + (sGid ? '<div class="s">' + esc(sGid) + '</div>' : "") + '</div></div>';
  let html = "";
  let first = true;
  const open = cls => { const s = '<section class="bolum ' + (first ? "ilk " : "") + (cls || "") + '">'; first = false; return s; };

  // Consolidated cover: every boat of the company side by side; currencies are never added together
  if (kons) {
    const tP = (v, p) => K.paraTutar(v, p);
    const satir = (s, cls, ad) => '<tr' + (cls ? ' class="' + cls + '"' : "") + '><td>' + esc(ad) + '</td><td>' + esc(s.para) + '</td><td class="n">' + tP(s.devir, s.para) + '</td><td class="n g">' + tP(s.gelen, s.para) + '</td><td class="n">' + tP(s.harcama, s.para) + '</td><td class="n y">' + tP(s.nakit, s.para) + '</td><td class="n y">' + tP(s.kart, s.para) + '</td><td class="n y">' + tP(s.diger, s.para) + '</td><td class="n' + (s.kalan < 0 ? " eksi" : "") + '">' + tP(s.kalan, s.para) + '</td></tr>';
    let rows = "";
    kons.paralar.forEach(p => {
      kons.tekneler.filter(s => s.para === p).forEach(s => { rows += satir(s, "", s.ad || s.id); });
      rows += satir(kons.toplamlar[p], "toplam", kons.karisik ? t("Toplam ({para})", { para: p }) : t("Şirket toplamı"));
    });
    const T = kons.toplam;
    html += open("kapak konsolide") + head(t("Konsolide rapor · Tüm tekneler"), spanOf(kons.aylar || []) || span, "", sirketAd || t("Tüm tekneler"));
    if (T) html += '<div class="ozet"><div class="kutu"><div class="l">' + esc(t("Açılış devri")) + '</div><div class="v">' + tP(T.devir, T.para) + '</div><div class="s">' + esc(t("{n} tekne", { n: T.tekne })) + '</div></div>' +
      '<div class="kutu gelen"><div class="l">' + esc(t("Gelen para (tüm hesaplar)")) + '</div><div class="v">' + tP(T.gelen, T.para) + '</div></div>' +
      '<div class="kutu"><div class="l">' + esc(t("Toplam harcama (tüm hesaplar)")) + '</div><div class="v">' + tP(T.harcama, T.para) + '</div><div class="s">' + esc(t("Nakit") + " " + tP(T.nakit, T.para) + " · " + t("Kart") + " " + tP(T.kart, T.para)) + '</div></div>' +
      '<div class="kutu kalan' + (T.kalan < 0 ? " acik" : "") + '"><div class="l">' + esc(T.kalan < 0 ? t("Kasa açığı") : t("Kalan kasa")) + '</div><div class="v">' + tP(T.kalan, T.para) + '</div></div></div>';
    else html += '<p class="uyari">' + esc(t("Tekneler farklı para birimleriyle tutuluyor. Tutarlar kur çevrimi yapılmadan, para birimine göre ayrı toplanmıştır.")) + '</p>';
    { const ac = kons.tekneler.filter(s => s.acilisUyari); if (ac.length) html += '<p class="uyari">' + esc(t("Başlangıç tutarı {sinir} sınırını aşıyor ya da okunamıyor; 0 sayıldı ({liste}). Ayarlar’dan düzeltin.", { sinir: new Intl.NumberFormat(K.lang === "tr" ? "tr-TR" : K.lang).format(K.TUTAR_USTSINIR), liste: ac.map(s => s.ad || s.id).join(", ") })) + '</p>'; }
    if (kons.eklenenAylar && kons.eklenenAylar.length && K.aradaAylarUyari) html += '<p class="uyari">' + esc(K.aradaAylarUyari(kons.eklenenAylar)) + '</p>';
    html += '<table class="kapak kons"><thead><tr><th>' + esc(t("Tekne")) + '</th><th>' + esc(t("Para")) + '</th><th class="n">' + esc(t("Devir")) + '</th><th class="n">' + esc(t("Gelen para")) + '</th><th class="n">' + esc(t("Harcama")) + '</th><th class="n">' + esc(t("Nakit")) + '</th><th class="n">' + esc(t("Kart")) + '</th><th class="n">' + esc(t("Diğer")) + '</th><th class="n">' + esc(t("Kalan kasa")) + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="formul" style="margin-top:3mm">' + esc(kons.eski ? t("Hesap tanımlamamış teknelerde bütün harcamalar kasadan düşer; hesap kuralına geçmiş teknelerde kart, banka ve diğer hesaplardan yapılan harcamalar nakit kasayı azaltmaz.") : t("Kalan kasa yalnızca nakit kasadır; kart, banka ve diğer hesaplardan yapılan harcamalar nakit kasayı azaltmaz.")) + '</p>';
    const katPanel = (baslik, s) => '<div class="panel"><h3>' + esc(baslik) + '</h3>' + (s.kategoriler.length ? '<table class="ozt">' + s.kategoriler.slice(0, 5).map(([c, v]) => '<tr><td>' + esc(K.catLabel(c)) + '</td><td class="y n">' + (s.harcama > 0 ? K.pct(Math.round(v / s.harcama * 100)) : "") + '</td><td class="n">' + tP(v, s.para) + '</td></tr>').join("") + '</table>' : '<p class="formul">' + esc(t("Bu dönemde harcama yok.")) + '</p>') + '</div>';
    html += '<h2 class="ara">' + esc(t("En büyük harcama kategorileri")) + '</h2><div class="kat-grid">' +
      kons.paralar.map(p => katPanel(kons.karisik ? t("Toplam ({para})", { para: p }) : t("Şirket toplamı"), kons.toplamlar[p])).join("") +
      kons.tekneler.map(s => katPanel((s.ad || s.id) + " · " + s.para, s)).join("") + '</div></section>';
  }

  // Cover summary when several months are reported together
  if (months.length > 1) {
    // totals in kuruş (cents): the cash box (in/out) and every account (income/expenses) are summed apart
    const kr = v => Math.round((+v || 0) * 100), tk = c => K.r2(c / 100);
    let cIn = 0, cOut = 0, cGel = 0, cGid = 0;
    const rows = months.map(m => { const k = K.kasaFor(items, set, m), o = K.ozetFor(items, set, m); cIn += kr(k.in); cOut += kr(k.out); cGel += kr(o.gelir); cGid += kr(o.gider); return '<tr><td>' + esc(monthLabel(m)) + '</td><td class="n">' + tl(k.devir) + '</td><td class="n g">' + tl(k.in) + '</td><td class="n">' + tl(k.out) + '</td><td class="n' + (k.kalan < 0 ? " eksi" : "") + '">' + tl(k.kalan) + '</td><td class="n g">' + tl(o.gelir) + '</td><td class="n">' + tl(o.gider) + '</td><td>' + esc(K.isClosed(set, m) ? t("Kapandı") : t("Açık")) + '</td></tr>'; }).join("");
    const tIn = tk(cIn), tOut = tk(cOut), tGel = tk(cGel), tGid = tk(cGid);
    const ilk = K.kasaFor(items, set, months[0]), son = K.kasaFor(items, set, months[months.length - 1]);
    const kapSp = K.paySplit(items.filter(e => months.includes((e.date || "").slice(0, 7))), set, ix);
    if (eski) {
      // old rule: one summary — Açılış devri, Gelen para, Toplam harcama (Nakit · Kart), Son kalan kasa — and one table
      html += open("kapak") + head(t("Kasa Raporu · Dönem özeti"), span, "") +
        '<div class="ozet"><div class="kutu"><div class="l">' + esc(t("Açılış devri")) + '</div><div class="v">' + tl(ilk.devir) + '</div><div class="s">' + esc(t("{ay} başı", { ay: monthLabel(months[0]) })) + '</div></div>' +
        '<div class="kutu gelen"><div class="l">' + esc(t("Gelen para")) + '</div><div class="v">' + tl(tIn) + '</div></div>' +
        '<div class="kutu"><div class="l">' + esc(t("Toplam harcama")) + '</div><div class="v">' + tl(tOut) + '</div>' + (kapSp.kart || kapSp.none ? '<div class="s">' + esc(t("Nakit") + " " + tl(kapSp.nakit) + " · " + t("Kart") + " " + tl(kapSp.kart) + (kapSp.none ? " · " + t("Banka ve diğer") + " " + tl(kapSp.none) : "")) + '</div>' : "") + '</div>' +
        '<div class="kutu kalan' + (son.kalan < 0 ? " acik" : "") + '"><div class="l">' + esc(son.kalan < 0 ? t("Kasa açığı") : t("Son kalan kasa")) + '</div><div class="v">' + tl(son.kalan) + '</div><div class="s">' + esc(t("{ay} sonu", { ay: monthLabel(months[months.length - 1]) })) + '</div></div></div>' +
        '<table class="kapak"><thead><tr><th>' + esc(t("Dönem")) + '</th><th class="n">' + esc(t("Devir")) + '</th><th class="n">' + esc(t("Gelen para")) + '</th><th class="n">' + esc(t("Toplam harcama")) + '</th><th class="n">' + esc(t("Kalan kasa")) + '</th><th>' + esc(t("Durum")) + '</th></tr></thead><tbody>' +
        months.map(m => { const k = K.kasaFor(items, set, m); return '<tr><td>' + esc(monthLabel(m)) + '</td><td class="n">' + tl(k.devir) + '</td><td class="n g">' + tl(k.in) + '</td><td class="n">' + tl(k.out) + '</td><td class="n' + (k.kalan < 0 ? " eksi" : "") + '">' + tl(k.kalan) + '</td><td>' + esc(K.isClosed(set, m) ? t("Kapandı") : t("Açık")) + '</td></tr>'; }).join("") +
        '<tr class="toplam"><td>' + esc(t("Toplam")) + '</td><td class="n">' + tl(ilk.devir) + '</td><td class="n g">' + tl(tIn) + '</td><td class="n">' + tl(tOut) + '</td><td class="n' + (son.kalan < 0 ? " eksi" : "") + '">' + tl(son.kalan) + '</td><td></td></tr></tbody></table>' +
        '<p class="formul" style="margin-top:3mm">' + esc(t("Her ayın devri bir önceki ayın kalan kasasıdır. Ayların ayrıntılı dökümü sonraki sayfalardadır.")) + '</p>' + paneller(items.filter(e => months.includes((e.date || "").slice(0, 7))), tGid, true) + '</section>';
    } else {
    html += open("kapak") + head(t("Kasa Raporu · Dönem özeti"), span, "") +
      '<div class="ozet"><div class="kutu"><div class="l">' + esc(t("Açılış devri")) + '</div><div class="v">' + tl(ilk.devir) + '</div><div class="s">' + esc(t("{ay} başı", { ay: monthLabel(months[0]) })) + '</div></div>' +
      '<div class="kutu gelen"><div class="l">' + esc(t("Kasaya giren")) + '</div><div class="v">' + tl(tIn) + '</div></div>' +
      '<div class="kutu"><div class="l">' + esc(t("Kasadan çıkan")) + '</div><div class="v">' + tl(tOut) + '</div></div>' +
      '<div class="kutu kalan' + (son.kalan < 0 ? " acik" : "") + '"><div class="l">' + esc(son.kalan < 0 ? t("Kasa açığı") : t("Son kalan kasa")) + '</div><div class="v">' + tl(son.kalan) + '</div><div class="s">' + esc(t("{ay} sonu", { ay: monthLabel(months[months.length - 1]) })) + '</div></div></div>' +
      tumHesaplar(tGel, tGid, "", "") +
      '<table class="kapak"><thead><tr><th>' + esc(t("Dönem")) + '</th><th class="n">' + esc(t("Devir")) + '</th><th class="n">' + esc(t("Kasaya giren")) + '</th><th class="n">' + esc(t("Kasadan çıkan")) + '</th><th class="n">' + esc(t("Kalan kasa")) + '</th><th class="n">' + esc(t("Gelen para (tüm hesaplar)")) + '</th><th class="n">' + esc(t("Harcama (tüm hesaplar)")) + '</th><th>' + esc(t("Durum")) + '</th></tr></thead><tbody>' + rows +
      '<tr class="toplam"><td>' + esc(t("Toplam")) + '</td><td class="n">' + tl(ilk.devir) + '</td><td class="n g">' + tl(tIn) + '</td><td class="n">' + tl(tOut) + '</td><td class="n' + (son.kalan < 0 ? " eksi" : "") + '">' + tl(son.kalan) + '</td><td class="n g">' + tl(tGel) + '</td><td class="n">' + tl(tGid) + '</td><td></td></tr></tbody></table>' +
      '<p class="formul" style="margin-top:3mm">' + esc(t("Her ayın devri bir önceki ayın kalan kasasıdır. Ayların ayrıntılı dökümü sonraki sayfalardadır.")) + '</p>' + paneller(items.filter(e => months.includes((e.date || "").slice(0, 7))), tGid, true) + '</section>';
    }
  }

  months.forEach(m => {
    const k = K.kasaFor(items, set, m), o = K.ozetFor(items, set, m), its = inMonth(m), closed = K.isClosed(set, m);
    const sp = K.paySplit(its, set, ix);
    const oncekiTop = K.r2(its.filter(e => onceki.has(e.id)).reduce((a, e) => a + Math.round((+e.amount || 0) * 100), 0) / 100);
    const status = '<div class="durum ' + (closed ? "kapali" : "acik") + '">' + esc(closed ? "✓ " + t("Dönem kapandı") : t("Açık dönem")) + '</div>';
    html += open("ay") + head(t("Kasa Raporu · Günlük harcama ve kasa defteri"), monthLabel(m), status);
    html += '<div class="ozet">' +
      '<div class="kutu"><div class="l">' + esc(t("Devir kasa")) + '</div><div class="v' + (k.devir < 0 ? '" style="color:var(--red)' : "") + '">' + tl(k.devir) + '</div><div class="s">' + esc(set.openingDate && m > set.openingDate.slice(0, 7) ? t("{ay} kalanı", { ay: monthLabel(addMonth(m, -1)) }) : t("Başlangıç kasası")) + '</div></div>' +
      '<div class="kutu gelen"><div class="l">' + esc(eski ? t("Gelen para") : t("Kasaya giren")) + '</div><div class="v">' + tl(k.in) + '</div></div>' +
      '<div class="kutu"><div class="l">' + esc(eski ? t("Toplam harcama") : t("Kasadan çıkan")) + '</div><div class="v">' + tl(k.out) + '</div>' + (eski && (sp.kart || sp.none) ? '<div class="s">' + esc(t("Nakit") + " " + tl(sp.nakit) + " · " + t("Kart") + " " + tl(sp.kart) + (sp.none ? " · " + t("Banka ve diğer") + " " + tl(sp.none) : "")) + '</div>' : "") + '</div>' +
      '<div class="kutu kalan' + (k.kalan < 0 ? " acik" : "") + '"><div class="l">' + esc(k.kalan < 0 ? t("Kasa açığı") : eski ? t("Kalan kasa") : t("Kalan nakit kasa")) + '</div><div class="v">' + tl(k.kalan) + '</div><div class="s">' + esc(closed ? t("{ay} devrine geçti", { ay: monthLabel(addMonth(m, 1)) }) : t("Dönem sonu")) + '</div></div></div>' +
      (eski ? "" : tumHesaplar(o.gelir, o.gider, t("{n} kayıt", { n: its.filter(isIn).length }), sp.kart || sp.none ? t("Nakit") + " " + tl(sp.nakit) + " · " + t("Kart") + " " + tl(sp.kart) + (sp.none ? " · " + t("Banka ve diğer") + " " + tl(sp.none) : "") : t("{n} fiş", { n: its.filter(K.isOut).length }))) +
      '<p class="formul">' + esc(eski ? t("Kalan kasa = Devir {devir} + kasaya giren {gir} − kasadan çıkan {cik}. Bütün harcamalar (nakit ve kart) kasadan düşer.", { devir: tl(k.devir), gir: tl(k.in), cik: tl(k.out) }) : t("Kalan kasa = Devir {devir} + kasaya giren {gir} − kasadan çıkan {cik}. Kart, banka ve avans harcamaları nakit kasayı değiştirmez; “Kasa” sütunu yalnızca nakit kayıtlarda kasada kalan parayı gösterir.", { devir: tl(k.devir), gir: tl(k.in), cik: tl(k.out) })) +
      (oncekiTop ? " " + esc(t("Önceki dönem iadesi {tutar}: önceki aylara ait harcamaların iadesi bu ayın harcamasını azaltır.", { tutar: tl(oncekiTop) })) : "") + '</p>';
    html += '<table class="defter"><colgroup><col style="width:18.5mm"><col style="width:30mm"><col><col style="width:22mm"><col style="width:20mm"><col style="width:21mm"><col style="width:21mm"><col style="width:21mm"></colgroup>' +
      '<thead><tr><th>' + esc(t("Tarih")) + '</th><th>' + esc(t("Firma / kimden")) + '</th><th>' + esc(t("Açıklama")) + '</th><th>' + esc(t("Kategori")) + '</th><th>' + esc(eski ? t("Ödeme") : t("Hesap")) + '</th><th class="n">' + esc(K.tp("Harcama ₺")) + '</th><th class="n">' + esc(K.tp("Gelen ₺")) + '</th><th class="n">' + esc(K.tp("Kasa ₺")) + '</th></tr></thead><tbody>' +
      '<tr class="devir"><td class="mono tarih">' + esc(dmy(m + "-01")) + '</td><td colspan="6">' + esc(t("Devir · önceki dönemden kalan kasa")) + '</td><td class="n' + (k.devir < 0 ? " eksi" : "") + '">' + num(k.devir) + '</td></tr>';
    if (!its.length) html += '<tr><td colspan="8" class="bos">' + esc(t("Bu dönemde kayıt yok.")) + '</td></tr>';
    its.forEach(e => {
      const inn = isIn(e), tr = K.isTr(e), iade = K.isIade(e), hid = K.hesapOf(e, ix), note = [K.amountNote(e), e.note].filter(Boolean).join(" · ");
      const dn = K.dislamaNedeni ? K.dislamaNedeni(e, set, ix) : null, disi = !!dn && dn !== "tutar";   // CT-T6: a row that is not in the totals (a refund of an excluded entry, a reset book's old entry...) says so
      const kasada = eski ? !tr : nakitMi(hid) || (tr && nakitMi(e.hedef)), kasaRun = eski || nakitMi(hid);
      html += '<tr><td class="mono tarih">' + esc(dmy(e.date)) + '</td><td>' + esc(e.vendor || "") + '</td><td>' + esc(e.desc || "") + (ek[e.id] ? '<span class="ek">' + esc(t("EK {n}", { n: ek[e.id] })) + '</span>' : "") + (note ? '<span class="alt">' + esc(note) + '</span>' : "") + (disi ? '<span class="alt toplamdisi" style="color:var(--red);font-weight:600">' + esc(t("toplam dışı")) + '</span>' : "") + '</td><td class="k">' + esc(inn ? t("Gelen para") : tr ? t("Transfer") : (iade ? (onceki.has(e.id) ? t("Önceki dönem iadesi") : t("İade")) + " · " : "") + K.catLabel(e.cat)) + '</td><td class="k">' + esc(tr ? hesapAd(hid) + " → " + hesapAd(e.hedef) : eski ? odemeEski(e) : hesapAd(hid)) + '</td>' +
        '<td class="n">' + (inn || tr ? "" : (iade ? "−" : "") + num(e.amount)) + '</td><td class="n g">' + (inn ? num(e.amount) : "") + '</td><td class="n' + (kasada && run[e.id] < 0 ? " eksi" : " k") + '">' + (kasada && kasaRun ? num(run[e.id]) : kasada ? "+" + num(e.amount) : "—") + '</td></tr>';
    });
    html += '<tr class="toplam"><td colspan="5">' + esc(t("Toplam")) + '</td><td class="n">' + num(o.gider) + '</td><td class="n g">' + num(o.gelir) + '</td><td class="n"></td></tr>' +
      '<tr class="kalan' + (k.kalan < 0 ? " acik" : "") + '"><td colspan="7">' + esc((k.kalan < 0 ? t("Kasa açığı") : eski ? t("Kalan kasa") : t("Kalan nakit kasa")) + " (" + t("Devir + kasaya giren − kasadan çıkan") + ")") + '</td><td class="n">' + num(k.kalan) + '</td></tr></tbody></table>';
    if (closed) html += '<div class="damga"><b>' + esc("✓ " + t("Dönem kapandı")) + '</b><span>' + esc(t("Kalan kasa")) + ' <b class="mono" style="letter-spacing:0;text-transform:none;color:var(--ink)">' + tl(k.kalan) + '</b> → ' + esc(t("{ay} devrine geçti", { ay: monthLabel(addMonth(m, 1)) })) + '</span></div>';

    // lower panels
    html += paneller(its, o.gider, false);
    html += imza();
    html += '</section>';
    if (D.kartEkstresi === true && K.kartEkstresi) html += ekstre(m);
  });

  function paneller(its, outTotal, whole) {
    const outs = its.filter(e => K.isOut(e) || K.isIade(e));
    const oh = K.ozetFor(its, set, "all", ix).hesap;
    let html = "";
    if (outs.length) {
      const cats = K.catSplit(outs, ix), cmax = (cats[0] && cats[0][1]) || 1, tot = outTotal || 1;
      const left = '<div class="panel"><h3>' + esc(whole ? t("Dönem boyunca kategoriye göre harcama") : t("Kategoriye göre harcama")) + '</h3><table class="ozt">' + cats.map(([c, v]) => '<tr><td>' + esc(K.catLabel(c)) + '<div class="cubuk"><i style="width:' + Math.max(1.5, v / cmax * 100).toFixed(1) + '%"></i></div></td><td class="y n">' + K.pct(Math.round(v / tot * 100)) + '</td><td class="n">' + tl(v) + '</td></tr>').join("") + '</table></div>';
      const pr = Object.entries(oh).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => { const h = K.hesapBul(set, id), n = outs.filter(e => K.hesapOf(e) === id && K.isOut(e)).length; return [hesapAd(id) + (h && h.sahip ? " · " + h.sahip : ""), v, n]; }), pmax = Math.max(...pr.map(r => r[1]), 1);
      let right = eski ? "" : '<div class="panel"><h3>' + esc(t("Hesaplara ve kartlara göre harcama")) + '</h3><table class="ozt">' + pr.map(([n, v, c]) => '<tr><td>' + esc(n) + ' <span class="y">· ' + esc(t("{n} işlem", { n: c })) + '</span><div class="cubuk p"><i style="width:' + Math.max(1.5, v / pmax * 100).toFixed(1) + '%"></i></div></td><td class="y n">' + K.pct(Math.round(v / tot * 100)) + '</td><td class="n">' + tl(v) + '</td></tr>').join("") + '</table></div>';
      const fsx = K.fuelStats(its);
      if (fsx.fills.length) right += '<div class="panel"><h3>' + esc(t("Yakıt")) + '</h3><div class="kv"><div><span>' + esc(t("Litre")) + '</span><b>' + (fsx.lt ? esc(K.qty(fsx.lt)) : "—") + '</b></div><div><span>' + esc(t("Tutar")) + '</span><b>' + tl(fsx.tot) + '</b></div><div><span>' + esc(K.tp("Ort. ₺/Lt")) + '</span><b>' + (fsx.avg ? num(fsx.avg) : "—") + '</b></div></div></div>';
      const doviz = its.filter(e => e.cur && e.cur !== K.paraKodu() && +e.fxAmount > 0);
      if (doviz.length) { // totals per currency AND direction (expense, refund, income, transfer are never added together), in cents
        const TUR = [["out", "Harcama"], ["iade", "İade"], ["in", "Gelen para"], ["tr", "Transfer"]], turOf = e => isIn(e) ? "in" : K.isTr(e) ? "tr" : K.isIade(e) ? "iade" : "out";
        const byCur = Object.create(null); doviz.forEach(e => { const b = byCur[e.cur] || (byCur[e.cur] = {}), k = turOf(e); b[k] = (b[k] || 0) + Math.round(+e.fxAmount * 100); });
        right += '<div class="panel"><h3>' + esc(t("Dövizli kayıtlar")) + '</h3><table class="ozt">' + Object.entries(byCur).map(([c, b]) => TUR.filter(([k]) => b[k]).map(([k, ad]) => '<tr><td>' + esc(K.curName(c) + " · " + t(ad)) + '</td><td class="n">' + esc((k === "iade" ? "−" : "") + K.fx(b[k] / 100, c)) + '</td></tr>').join("")).join("") + '</table><p class="formul" style="margin:1.4mm 0 0">' + esc(K.paraKodu() === "TRY" ? t("Dövizli tutarlar, kullanıcının kayıt sırasında girdiği kurla TL’ye çevrilip kasaya işlenmiştir.") : t("Dövizli tutarlar, kayıt sırasında girilen kurla defterin para birimine ({para}) çevrilip işlenmiştir.", { para: K.paraKodu() })) + '</p></div>'; }
      html += '<div class="alt-grid">' + left + '<div>' + right + '</div></div>';
    }
    return html;
  }
  // card statements and bank account movements of one month, on their own page (only when there is something to show)
  function ekstre(m) {
    const kartlar = K.kartEkstresi(items, set, m), bankalar = K.bankaHareketleri(items, set, m);
    if (!kartlar.length && !bankalar.length) return "";
    const title = kartlar.length && bankalar.length ? t("Kart ekstresi ve banka hareketleri") : kartlar.length ? t("Kart ekstresi") : t("Banka hesabı hareketleri");
    let h = open("ekstre") + head(t("Kasa Raporu") + " · " + title, monthLabel(m), "");
    kartlar.forEach(c => {
      const cmax = c.kategoriler.length ? Math.max(...c.kategoriler.map(x => Math.abs(x[1])), 1) : 1;
      h += '<div class="kart-blok"><div class="kart-bas"><div><b>' + esc(c.ad ? (VARS[c.id] && c.ad === VARS[c.id] ? t(c.ad) : c.ad) : hesapAd(c.id)) + '</b>' + (c.son4 ? ' <span class="son4">•••• ' + esc(c.son4) + '</span>' : "") +
        '<div class="sahip">' + esc(c.sahip ? t("Sahibi: {ad}", { ad: c.sahip }) : t("Sahibi belirtilmemiş")) + '</div></div>' +
        '<div class="kv k4"><div><span>' + esc(t("İşlem")) + '</span><b>' + c.islem + '</b></div><div><span>' + esc(t("Toplam harcama")) + '</span><b>' + tl(c.harcama) + '</b></div><div><span>' + esc(t("İadeler")) + '</span><b>' + (c.iade ? "−" + tl(c.iade) : "—") + '</b></div><div><span>' + esc(t("Net harcama")) + '</span><b>' + tl(c.net) + '</b></div></div></div>';
      if (c.kategoriler.length) h += '<table class="ozt kat">' + c.kategoriler.map(([k, v]) => '<tr><td>' + esc(K.catLabel(k)) + '<div class="cubuk p"><i style="width:' + Math.max(1.5, Math.abs(v) / cmax * 100).toFixed(1) + '%"></i></div></td><td class="y n">' + (c.net > 0 ? K.pct(Math.round(v / c.net * 100)) : "") + '</td><td class="n">' + tl(v) + '</td></tr>').join("") + '</table>';
      h += '<table class="defter ekst"><colgroup><col style="width:18.5mm"><col style="width:38mm"><col><col style="width:26mm"><col style="width:24mm"></colgroup><thead><tr><th>' + esc(t("Tarih")) + '</th><th>' + esc(t("Firma")) + '</th><th>' + esc(t("Açıklama")) + '</th><th>' + esc(t("Kategori")) + '</th><th class="n">' + esc(t("Tutar")) + '</th></tr></thead><tbody>' +
        c.liste.map(e => { const tr = K.isTr(e), inn = isIn(e), iade = K.isIade(e), note = K.amountNote(e);
          return '<tr><td class="mono tarih">' + esc(dmy(e.date)) + '</td><td>' + esc(e.vendor || "") + '</td><td>' + esc(e.desc || "") + (note ? '<span class="alt">' + esc(note) + '</span>' : "") + '</td><td class="k">' + esc(tr ? t("Transfer") + " · " + (e.hedef === c.id ? hesapAd(K.hesapOf(e)) + " →" : "→ " + hesapAd(e.hedef)) : inn ? t("Gelen para") : (iade ? t("İade") + " · " : "") + K.catLabel(e.cat)) + '</td>' +
            '<td class="n' + (iade || inn || (tr && e.hedef === c.id) ? " g" : "") + '">' + (iade || inn || (tr && e.hedef === c.id) ? "−" : "") + num(e.amount) + '</td></tr>'; }).join("") +
        '<tr class="toplam"><td colspan="4">' + esc(t("Net harcama")) + '</td><td class="n">' + num(c.net) + '</td></tr></tbody></table></div>';
    });
    if (bankalar.length) {
      h += '<h2 class="ara">' + esc(t("Banka hesabı hareketleri")) + '</h2>';
      bankalar.forEach(b => {
        h += '<div class="kart-blok"><div class="kart-bas"><div><b>' + esc(hesapAd(b.id)) + '</b>' + (b.sahip ? '<div class="sahip">' + esc(t("Sahibi: {ad}", { ad: b.sahip })) + '</div>' : "") + '</div></div>' +
          '<table class="defter ekst"><colgroup><col style="width:18.5mm"><col style="width:34mm"><col><col style="width:23mm"><col style="width:23mm"><col style="width:25mm"></colgroup><thead><tr><th>' + esc(t("Tarih")) + '</th><th>' + esc(t("Firma")) + '</th><th>' + esc(t("Açıklama")) + '</th><th class="n">' + esc(t("Giriş")) + '</th><th class="n">' + esc(t("Çıkış")) + '</th><th class="n">' + esc(t("Bakiye")) + '</th></tr></thead><tbody>' +
          '<tr class="devir"><td class="mono tarih">' + esc(dmy(m + "-01")) + '</td><td colspan="4">' + esc(t("Devir · önceki dönemden kalan bakiye")) + '</td><td class="n' + (b.devir < 0 ? " eksi" : "") + '">' + num(b.devir) + '</td></tr>' +
          b.satirlar.map(r => { const e = r.e, tr = K.isTr(e);
            return '<tr><td class="mono tarih">' + esc(dmy(e.date)) + '</td><td>' + esc(e.vendor || "") + '</td><td>' + esc(e.desc || (tr ? t("Transfer") : "")) + (tr ? '<span class="alt">' + esc(hesapAd(K.hesapOf(e)) + " → " + hesapAd(e.hedef)) + '</span>' : "") + '</td><td class="n g">' + (r.giris ? num(r.giris) : "") + '</td><td class="n">' + (r.cikis ? num(r.cikis) : "") + '</td><td class="n' + (r.bakiye < 0 ? " eksi" : "") + '">' + num(r.bakiye) + '</td></tr>'; }).join("") +
          '<tr class="toplam"><td colspan="3">' + esc(t("Toplam")) + '</td><td class="n g">' + num(b.giris) + '</td><td class="n">' + num(b.cikis) + '</td><td class="n"></td></tr>' +
          '<tr class="kalan' + (b.kalan < 0 ? " acik" : "") + '"><td colspan="5">' + esc(t("Dönem sonu bakiye")) + '</td><td class="n">' + num(b.kalan) + '</td></tr></tbody></table></div>';
      });
    }
    return h + '</section>';
  }
  function imza() {
    return '<div class="imza"><div class="k"><div class="r">' + esc(t("Hazırlayan")) + '</div><div class="ad">' + esc(set.preparedBy || "") + '</div><div class="tr">' + esc(t("Tarih: {tarih}", { tarih: madeStr })) + '</div><div class="bosluk"></div><div class="r">' + esc(t("İmza")) + '</div></div>' +
      '<div class="k"><div class="r">' + esc(t("Kontrol eden / onaylayan")) + '</div><div class="ad">' + esc(set.approvedBy || "") + '</div><div class="tr">' + esc(t("Tarih: {tarih}", { tarih: "……/……/…………" })) + '</div><div class="bosluk"></div><div class="r">' + esc(t("İmza")) + '</div></div></div>';
  }

  if (ekList.length) {
    html += open("ekler") + '<h2>' + esc(t("Ekler · Fiş fotoğrafları")) + '</h2><p class="aciklama">' + esc(name + " · " + span + ". " + t("Numaralar defter tablosundaki “EK” işaretleriyle eşleşir.")) + '</p>' +
      '<div class="fisgrid">' + ekList.map((e, i) => '<figure><figcaption><span><b>' + esc(t("EK {n}", { n: i + 1 })) + '</b> · ' + esc(dmy(e.date)) + ' · ' + esc(e.vendor || e.desc || "") + (e.vendor && e.desc ? " · " + esc(e.desc) : "") + '</span><span class="tutar">' + tl(e.amount) + '</span></figcaption><img alt="' + esc(t("EK {n}", { n: i + 1 })) + '" src="foto/' + esc(encodeURIComponent(e.photo)) + (token ? '?t=' + token : '') + '"></figure>').join("") + '</div></section>';
  }

  // R7: entries in another book currency are left out of every total; the report says so, in red, with the list
  const doneminMi = e => !months.length || months.includes((e.date || "").slice(0, 7));
  const dislanan = K.dislananlar ? K.dislananlar(items, set).filter(x => doneminMi(x.e)) : [];   // F-22: each reason has its own words
  const uyumsuz = K.dislananlar ? dislanan.filter(x => x.neden === "para").map(x => x.e) : (K.paraUyumsuz ? K.paraUyumsuz(items, set).filter(doneminMi) : []);
  const digerDisi = dislanan.filter(x => x.neden !== "para").map(x => x.e);
  const gecersizTutarli = (K.gecersizKayitlar ? K.gecersizKayitlar(items) : []).filter(doneminMi);
  if (uyumsuz.length) html = html.replace("</header>", "</header>" + '<div class="uyari" style="color:#b3261e;border:1px solid #b3261e;padding:2mm 3mm;margin:2mm 0">' +
    '<b>' + esc(t("Para birimi uyumsuz kayıtlar")) + '</b> · ' + esc(t("{n} kayıt başka bir para biriminde girilmiş (defter {para}); bu kayıtlar toplamlara katılmadı:", { n: uyumsuz.length, para: K.paraKodu() })) +
    '<ul style="margin:1mm 0 0 4mm;padding:0">' + uyumsuz.map(e => '<li>' + esc(dmy(e.date)) + ' · ' + esc(e.vendor || e.desc || "") + ' · ' + esc(K.fx(e.amount, K.kayitParasi(e))) + '</li>').join("") + '</ul></div>');
  const uyariKutu = (baslik, metin, liste) => '<div class="uyari" style="color:#b3261e;border:1px solid #b3261e;padding:2mm 3mm;margin:2mm 0"><b>' + esc(baslik) + '</b> · ' + esc(metin) + '<ul style="margin:1mm 0 0 4mm;padding:0">' + liste.slice(0, 20).map(e => '<li>' + esc(dmy(e.date)) + ' · ' + esc(e.vendor || e.desc || "") + ' · ' + esc(K.tutarGecerli(e) ? K.fx(e.amount, K.kayitParasi(e)) : String(e.amount === undefined || e.amount === null ? "" : e.amount).slice(0, 24)) + '</li>').join("") + (liste.length > 20 ? '<li>…</li>' : "") + '</ul></div>';
  { const ga = K.gecersizAcilis ? K.gecersizAcilis(set) : []; if (ga.length) html = html.replace("</header>", "</header>" + '<div class="uyari" style="color:#b3261e;border:1px solid #b3261e;padding:2mm 3mm;margin:2mm 0"><b>' + esc(t("Başlangıç tutarı geçersiz")) + '</b> · ' + esc(t("Başlangıç tutarı {sinir} sınırını aşıyor ya da okunamıyor; 0 sayıldı ({liste}). Ayarlar’dan düzeltin.", { sinir: new Intl.NumberFormat(K.lang === "tr" ? "tr-TR" : K.lang).format(K.TUTAR_USTSINIR), liste: ga.map(x => x.tur === "kasa" ? t("Başlangıç kasası") : x.ad).join(", ") })) + '</div>'); }
  if (digerDisi.length) html = html.replace("</header>", "</header>" + uyariKutu(t("Toplam dışı kayıtlar"), t("{n} kayıt toplamlara katılmadı (sıfırlamadan önceki defterden geri gelmiş, geçersiz tarihli ya da toplam dışı bir kaydın iadesi):", { n: digerDisi.length }), digerDisi));
  if (gecersizTutarli.length) html = html.replace("</header>", "</header>" + uyariKutu(t("Geçersiz tutar"), t("{n} kaydın tutarı geçersiz olduğu için bu raporda yok:", { n: gecersizTutarli.length }), gecersizTutarli));
  root.innerHTML = html;
  document.title = (kons ? (sirketAd || t("Tüm tekneler")) + " · " + t("Konsolide rapor") : name + " · " + t("Kasa Raporu")) + " · " + span + (ekList.length ? " (" + t("Fiş fotoğrafları") + ")" : "");   // Q-4: the PDF file name (print dialog) carries the same suffix as the other report names
  if (D.yazdir) window.addEventListener("load", () => setTimeout(() => window.print(), 400));
})();
