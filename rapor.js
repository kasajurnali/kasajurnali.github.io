/* Yachting Jurnal — printable A4 cash report. Built from the data the program injects. */
"use strict";
(function () {
  const K = window.KJ, D = window.__RAPOR;
  const root = document.getElementById("r");
  if (!D) { root.textContent = "Rapor verisi bulunamadı. / Report data not found."; return; }
  const df = D.defter || {};
  const items = Array.isArray(df.kayitlar) ? df.kayitlar : [];
  const set = Object.assign({ opening: null, openingDate: null, name: "", preparedBy: "", approvedBy: "", closed: [] }, df.ayarlar || {});
  K.setLang(D.dil || set.lang || "tr");
  document.documentElement.lang = K.lang;
  const { tl, num, esc, dmy, monthLabel, addMonth, isIn, t, pad } = K;
  const months = (D.aylar || []).slice().sort();
  const run = K.runningMap(items, set);
  const made = D.olusturma ? new Date(D.olusturma) : new Date();
  const madeStr = dmy(made.getFullYear() + "-" + pad(made.getMonth() + 1) + "-" + pad(made.getDate()));
  const token = encodeURIComponent(D.token || "");
  const name = set.name || "Yachting Jurnal";
  const inMonth = m => items.filter(e => (e.date || "").slice(0, 7) === m).sort(K.cmpEntry);
  const span = months.length > 1 ? monthLabel(months[0]) + " – " + monthLabel(months[months.length - 1]) : monthLabel(months[0]);

  // photo appendix numbering
  const ek = {}; const ekList = [];
  if (D.fotograflar) months.forEach(m => inMonth(m).forEach(e => { if (e.photo) { ek[e.id] = ekList.length + 1; ekList.push(e); } }));

  const flags = '<span class="ics" aria-hidden="true"><i class="k"></i><i class="a"></i><i class="s"></i><i class="a"></i></span>';
  const head = (title, period, status) =>
    '<header class="rh"><div><div class="ust">' + flags + '<span>Yachting Jurnal</span></div><div class="kurum">' + esc(name) + '</div><h1>' + esc(title) + '</h1></div>' +
    '<div class="rh-r"><div class="etk">' + esc(t("Dönem")) + '</div><div class="donem">' + esc(period) + '</div><div class="meta">' + esc(t("Rapor tarihi: {tarih}", { tarih: madeStr })) + '</div>' + (status || "") + '</div></header>';

  let html = "";
  let first = true;
  const open = cls => { const s = '<section class="bolum ' + (first ? "ilk " : "") + (cls || "") + '">'; first = false; return s; };

  // Cover summary when several months are reported together
  if (months.length > 1) {
    let tIn = 0, tOut = 0;
    const rows = months.map(m => { const k = K.kasaFor(items, set, m); tIn += k.in; tOut += k.out; return '<tr><td>' + esc(monthLabel(m)) + '</td><td class="n">' + tl(k.devir) + '</td><td class="n g">' + tl(k.in) + '</td><td class="n">' + tl(k.out) + '</td><td class="n' + (k.kalan < 0 ? " eksi" : "") + '">' + tl(k.kalan) + '</td><td>' + esc(K.isClosed(set, m) ? t("Kapandı") : t("Açık")) + '</td></tr>'; }).join("");
    const ilk = K.kasaFor(items, set, months[0]), son = K.kasaFor(items, set, months[months.length - 1]);
    html += open("kapak") + head(t("Kasa Raporu · Dönem özeti"), span, "") +
      '<div class="ozet"><div class="kutu"><div class="l">' + esc(t("Açılış devri")) + '</div><div class="v">' + tl(ilk.devir) + '</div><div class="s">' + esc(t("{ay} başı", { ay: monthLabel(months[0]) })) + '</div></div>' +
      '<div class="kutu gelen"><div class="l">' + esc(t("Toplam gelen")) + '</div><div class="v">' + tl(tIn) + '</div></div>' +
      '<div class="kutu"><div class="l">' + esc(t("Toplam harcama")) + '</div><div class="v">' + tl(tOut) + '</div></div>' +
      '<div class="kutu kalan' + (son.kalan < 0 ? " acik" : "") + '"><div class="l">' + esc(son.kalan < 0 ? t("Kasa açığı") : t("Son kalan kasa")) + '</div><div class="v">' + tl(son.kalan) + '</div><div class="s">' + esc(t("{ay} sonu", { ay: monthLabel(months[months.length - 1]) })) + '</div></div></div>' +
      '<table class="kapak"><thead><tr><th>' + esc(t("Dönem")) + '</th><th class="n">' + esc(t("Devir")) + '</th><th class="n">' + esc(t("Gelen para")) + '</th><th class="n">' + esc(t("Harcama")) + '</th><th class="n">' + esc(t("Kalan kasa")) + '</th><th>' + esc(t("Durum")) + '</th></tr></thead><tbody>' + rows +
      '<tr class="toplam"><td>' + esc(t("Toplam")) + '</td><td class="n">' + tl(ilk.devir) + '</td><td class="n g">' + tl(tIn) + '</td><td class="n">' + tl(tOut) + '</td><td class="n' + (son.kalan < 0 ? " eksi" : "") + '">' + tl(son.kalan) + '</td><td></td></tr></tbody></table>' +
      '<p class="formul" style="margin-top:3mm">' + esc(t("Her ayın devri bir önceki ayın kalan kasasıdır. Ayların ayrıntılı dökümü sonraki sayfalardadır.")) + '</p>' + paneller(items.filter(e => months.includes((e.date || "").slice(0, 7))), tOut, true) + '</section>';
  }

  months.forEach(m => {
    const k = K.kasaFor(items, set, m), its = inMonth(m), closed = K.isClosed(set, m);
    const sp = K.paySplit(its);
    const status = '<div class="durum ' + (closed ? "kapali" : "acik") + '">' + esc(closed ? "✓ " + t("Dönem kapandı") : t("Açık dönem")) + '</div>';
    html += open("ay") + head(t("Kasa Raporu · Günlük harcama ve kasa defteri"), monthLabel(m), status);
    html += '<div class="ozet">' +
      '<div class="kutu"><div class="l">' + esc(t("Devir kasa")) + '</div><div class="v' + (k.devir < 0 ? '" style="color:var(--red)' : "") + '">' + tl(k.devir) + '</div><div class="s">' + esc(set.openingDate && m > set.openingDate.slice(0, 7) ? t("{ay} kalanı", { ay: monthLabel(addMonth(m, -1)) }) : t("Başlangıç kasası")) + '</div></div>' +
      '<div class="kutu gelen"><div class="l">' + esc(t("Gelen para")) + '</div><div class="v">' + tl(k.in) + '</div><div class="s">' + esc(t("{n} kayıt", { n: its.filter(isIn).length })) + '</div></div>' +
      '<div class="kutu"><div class="l">' + esc(t("Toplam harcama")) + '</div><div class="v">' + tl(k.out) + '</div><div class="s">' + esc(sp.nakit || sp.kart ? t("Nakit") + " " + tl(sp.nakit) + " · " + t("Kart") + " " + tl(sp.kart) : t("{n} fiş", { n: its.filter(e => !isIn(e)).length })) + '</div></div>' +
      '<div class="kutu kalan' + (k.kalan < 0 ? " acik" : "") + '"><div class="l">' + esc(k.kalan < 0 ? t("Kasa açığı") : t("Kalan kasa")) + '</div><div class="v">' + tl(k.kalan) + '</div><div class="s">' + esc(closed ? t("{ay} devrine geçti", { ay: monthLabel(addMonth(m, 1)) }) : t("Dönem sonu")) + '</div></div></div>' +
      '<p class="formul">' + esc(t("Kalan kasa = Devir + Gelen para − Harcama. Kasa sütunu, her kayıttan sonra kasada kalan parayı gösterir.")) + '</p>';
    html += '<table class="defter"><colgroup><col style="width:18.5mm"><col style="width:30mm"><col><col style="width:26mm"><col style="width:12mm"><col style="width:21mm"><col style="width:21mm"><col style="width:21mm"></colgroup>' +
      '<thead><tr><th>' + esc(t("Tarih")) + '</th><th>' + esc(t("Şirket / kimden")) + '</th><th>' + esc(t("Açıklama")) + '</th><th>' + esc(t("Kategori")) + '</th><th>' + esc(t("Ödeme")) + '</th><th class="n">' + esc(t("Harcama ₺")) + '</th><th class="n">' + esc(t("Gelen ₺")) + '</th><th class="n">' + esc(t("Kasa ₺")) + '</th></tr></thead><tbody>' +
      '<tr class="devir"><td class="mono tarih">' + dmy(m + "-01") + '</td><td colspan="6">' + esc(t("Devir · önceki dönemden kalan kasa")) + '</td><td class="n' + (k.devir < 0 ? " eksi" : "") + '">' + num(k.devir) + '</td></tr>';
    if (!its.length) html += '<tr><td colspan="8" class="bos">' + esc(t("Bu dönemde kayıt yok.")) + '</td></tr>';
    its.forEach(e => {
      const inn = isIn(e), note = [K.amountNote(e), e.note].filter(Boolean).join(" · ");
      html += '<tr><td class="mono tarih">' + dmy(e.date) + '</td><td>' + esc(e.vendor || "") + '</td><td>' + esc(e.desc || "") + (ek[e.id] ? '<span class="ek">' + esc(t("EK {n}", { n: ek[e.id] })) + '</span>' : "") + (note ? '<span class="alt">' + esc(note) + '</span>' : "") + '</td><td class="k">' + esc(inn ? t("Gelen para") : K.catLabel(e.cat)) + '</td><td class="k">' + esc(inn ? "" : K.payName(e.pay)) + '</td>' +
        '<td class="n">' + (inn ? "" : num(e.amount)) + '</td><td class="n g">' + (inn ? num(e.amount) : "") + '</td><td class="n' + (run[e.id] < 0 ? " eksi" : " k") + '">' + num(run[e.id]) + '</td></tr>';
    });
    html += '<tr class="toplam"><td colspan="5">' + esc(t("Toplam")) + '</td><td class="n">' + num(k.out) + '</td><td class="n g">' + num(k.in) + '</td><td class="n"></td></tr>' +
      '<tr class="kalan' + (k.kalan < 0 ? " acik" : "") + '"><td colspan="7">' + esc((k.kalan < 0 ? t("Kasa açığı") : t("Kalan kasa")) + " (" + t("Devir + Gelen para − Harcama") + ")") + '</td><td class="n">' + num(k.kalan) + '</td></tr></tbody></table>';
    if (closed) html += '<div class="damga"><b>' + esc("✓ " + t("Dönem kapandı")) + '</b><span>' + esc(t("Kalan kasa")) + ' <b class="mono" style="letter-spacing:0;text-transform:none;color:var(--ink)">' + tl(k.kalan) + '</b> → ' + esc(t("{ay} devrine geçti", { ay: monthLabel(addMonth(m, 1)) })) + '</span></div>';

    // lower panels
    html += paneller(its, k.out, false);
    html += imza();
    html += '</section>';
  });

  function paneller(its, outTotal, whole) {
    const outs = its.filter(e => !isIn(e));
    const sp = K.paySplit(its);
    let html = "";
    if (outs.length) {
      const cats = K.catSplit(outs), cmax = cats[0][1] || 1, tot = outTotal || 1;
      const left = '<div class="panel"><h3>' + esc(whole ? t("Dönem boyunca kategoriye göre harcama") : t("Kategoriye göre harcama")) + '</h3><table class="ozt">' + cats.map(([c, v]) => '<tr><td>' + esc(K.catLabel(c)) + '<div class="cubuk"><i style="width:' + Math.max(1.5, v / cmax * 100).toFixed(1) + '%"></i></div></td><td class="y n">' + K.pct(Math.round(v / tot * 100)) + '</td><td class="n">' + tl(v) + '</td></tr>').join("") + '</table></div>';
      const pr = [[t("Nakit"), sp.nakit], [t("Kart"), sp.kart], [t("Belirtilmemiş"), sp.none]].filter(r => r[1] > 0), pmax = Math.max(...pr.map(r => r[1]), 1);
      let right = '<div class="panel"><h3>' + esc(t("Ödeme şekli")) + '</h3><table class="ozt">' + pr.map(([n, v]) => '<tr><td>' + esc(n) + '<div class="cubuk p"><i style="width:' + Math.max(1.5, v / pmax * 100).toFixed(1) + '%"></i></div></td><td class="y n">' + K.pct(Math.round(v / tot * 100)) + '</td><td class="n">' + tl(v) + '</td></tr>').join("") + '</table></div>';
      const fsx = K.fuelStats(its);
      if (fsx.fills.length) right += '<div class="panel"><h3>' + esc(t("Yakıt")) + '</h3><div class="kv"><div><span>' + esc(t("Litre")) + '</span><b>' + (fsx.lt ? esc(K.qty(fsx.lt)) : "—") + '</b></div><div><span>' + esc(t("Tutar")) + '</span><b>' + tl(fsx.tot) + '</b></div><div><span>' + esc(t("Ort. ₺/Lt")) + '</span><b>' + (fsx.avg ? num(fsx.avg) : "—") + '</b></div></div></div>';
      const doviz = its.filter(e => e.cur && e.cur !== "TRY" && +e.fxAmount > 0);
      if (doviz.length) { const byCur = {}; doviz.forEach(e => { byCur[e.cur] = (byCur[e.cur] || 0) + (+e.fxAmount); }); right += '<div class="panel"><h3>' + esc(t("Dövizli kayıtlar")) + '</h3><table class="ozt">' + Object.entries(byCur).map(([c, v]) => '<tr><td>' + esc(K.curName(c)) + '</td><td class="n">' + esc(K.fx(v, c)) + '</td></tr>').join("") + '</table><p class="formul" style="margin:1.4mm 0 0">' + esc(t("Dövizli tutarlar, kullanıcının kayıt sırasında girdiği kurla TL’ye çevrilip kasaya işlenmiştir.")) + '</p></div>'; }
      html += '<div class="alt-grid">' + left + '<div>' + right + '</div></div>';
    }
    return html;
  }
  function imza() {
    return '<div class="imza"><div class="k"><div class="r">' + esc(t("Hazırlayan")) + '</div><div class="ad">' + esc(set.preparedBy || "") + '</div><div class="tr">' + esc(t("Tarih: {tarih}", { tarih: madeStr })) + '</div><div class="bosluk"></div><div class="r">' + esc(t("İmza")) + '</div></div>' +
      '<div class="k"><div class="r">' + esc(t("Kontrol eden / Onaylayan")) + '</div><div class="ad">' + esc(set.approvedBy || "") + '</div><div class="tr">' + esc(t("Tarih: {tarih}", { tarih: "……/……/…………" })) + '</div><div class="bosluk"></div><div class="r">' + esc(t("İmza")) + '</div></div></div>';
  }

  if (ekList.length) {
    html += open("ekler") + '<h2>' + esc(t("Ekler · Fiş fotoğrafları")) + '</h2><p class="aciklama">' + esc(name + " · " + span + ". " + t("Numaralar defter tablosundaki “EK” işaretleriyle eşleşir.")) + '</p>' +
      ekList.map((e, i) => '<figure><figcaption><span><b>' + esc(t("EK {n}", { n: i + 1 })) + '</b> · ' + dmy(e.date) + ' · ' + esc(e.vendor || e.desc || "") + (e.vendor && e.desc ? " · " + esc(e.desc) : "") + '</span><span class="tutar">' + tl(e.amount) + '</span></figcaption><img alt="' + esc(t("EK {n}", { n: i + 1 })) + '" src="foto/' + esc(e.photo) + (token ? '?t=' + token : '') + '"></figure>').join("") + '</section>';
  }

  root.innerHTML = html;
  document.title = name + " · " + t("Kasa Raporu") + " · " + span;
  if (D.yazdir) window.addEventListener("load", () => setTimeout(() => window.print(), 400));
})();
