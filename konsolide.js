/* Yachting Jurnal — report calculations that build on hesap.js: the consolidated (several boats) summary
   and the monthly card statements / bank account movements. Pure functions: no page, no storage.
   Used by the PDF report (rapor.js), the Excel export (app.js) and the tests (node). */
"use strict";
(function (g) {
  const K = g.KJ;
  if (!K) throw new Error("konsolide.js: hesap.js önce yüklenmeli");
  const kr = v => Math.round((+v || 0) * 100);          // amount → kuruş (cents)
  const tk = c => K.r2(c / 100);                        // kuruş → amount
  const ayOf = e => (e.date || "").slice(0, 7);
  const paraOf = set => (set && typeof set.para === "string" && set.para.trim() ? set.para.trim().toUpperCase() : "TRY");

  // amount in a given currency ("TRY" when none): 1.234,50 ₺ / 1.234,50 € / 1.234,50 CHF
  function paraTutar(v, cur) { return K.fx(v, cur || "TRY"); }   // always the boat's own currency, whatever the open book uses

  // which months a period means: "all"/empty = every month with data, "yyyy-mm", or a list of months.
  // A list is always made consecutive (first month → last month): the remaining cash of the last month includes
  // every month in between, so income and expenses must include them too, or the totals would not add up.
  function aylarOf(items, donem) {
    if (Array.isArray(donem)) {
      const l = [...new Set(donem.filter(a => /^\d{4}-(0[1-9]|1[0-2])$/.test(a)))].sort();
      if (l.length < 2) return l;
      const out = []; for (let a = l[0]; a <= l[l.length - 1] && out.length < 1200; a = K.addMonth(a, 1)) out.push(a);
      return out;
    }
    if (typeof donem === "string" && /^\d{4}-\d{2}$/.test(donem)) return [donem];
    return null;                                          // whole book
  }

  // top categories of an expense list (refunds lower their category): [[cat, amount], ...]
  const enBuyuk = (bc, n) => Object.entries(bc).map(([k, v]) => [k, tk(v)]).filter(x => x[1] !== 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

  /* konsolide(tekneler, donem)
     tekneler: [{ id, ad, defter: { ayarlar, kayitlar } }]; donem: "all" | "yyyy-mm" | ["yyyy-mm", ...]
     → { aylar, tekneler: [{ id, ad, para, devir, gelen, harcama, iade, kalan, nakit, kart, diger, islem, kategoriler }],
         paralar: ["EUR", "TRY"], toplamlar: { EUR: {...}, TRY: {...} }, karisik, toplam }
     Amounts are never converted: boats in different currencies get separate totals per currency;
     "toplam" (company total) is given only when every boat uses the same currency, otherwise it is null. */
  function konsolide(tekneler, donem, secenek) {
    const nKat = (secenek && secenek.kategori) || 5;
    const liste = (Array.isArray(tekneler) ? tekneler : []).filter(x => x && typeof x === "object");
    const tumAylar = new Set();
    const satirlar = liste.map((tk0, i) => {
      const df = tk0.defter || {}, set = df.ayarlar || {}, items = (Array.isArray(df.kayitlar) ? df.kayitlar : []).filter(e => e && !e.silindi && (K.hesabaGirer ? K.hesabaGirer(e, set) : true));   // R7: other-currency entries never added
      const para = paraOf(set);
      let aylar = aylarOf(items, donem);
      let devir, kalan;
      if (aylar && aylar.length) {
        devir = K.kasaFor(items, set, aylar[0]).devir;
        kalan = K.kasaFor(items, set, aylar[aylar.length - 1]).kalan;
      } else {
        const k = K.kasaFor(items, set, "all"); devir = k.devir; kalan = k.kalan;
        aylar = K.monthsWithData(items);
      }
      aylar.forEach(a => tumAylar.add(a));
      const icinde = aylarOf(items, donem) ? new Set(aylar) : null;
      const its = icinde ? items.filter(e => icinde.has(ayOf(e))) : items;
      const ix = K.kayitIndeksi(items), oz = K.ozetFor(its, set, "all", ix), sp = K.paySplit(its, set, ix);
      const bc = {};
      its.forEach(e => { if (!K.isOut(e) && !K.isIade(e)) return; const c = e.cat || "Kategorisiz"; bc[c] = (bc[c] || 0) + kr(e.amount) * (K.isIade(e) ? -1 : 1); });
      return {
        id: tk0.id != null ? String(tk0.id) : String(i + 1), ad: tk0.ad || set.name || "", para,
        devir, gelen: oz.gelir, harcama: oz.gider, iade: oz.iade, kalan,
        nakit: sp.nakit, kart: sp.kart, diger: sp.none, eski: K.eskiMod(set), islem: its.filter(e => !K.isTr(e)).length,
        kategoriler: enBuyuk(bc, nKat), _bc: bc
      };
    });
    const toplamlar = {};
    satirlar.forEach(s => {
      const T = toplamlar[s.para] || (toplamlar[s.para] = { para: s.para, tekne: 0, devir: 0, gelen: 0, harcama: 0, iade: 0, kalan: 0, nakit: 0, kart: 0, diger: 0, islem: 0, _bc: {} });
      T.tekne++; T.islem += s.islem;
      ["devir", "gelen", "harcama", "iade", "kalan", "nakit", "kart", "diger"].forEach(k => { T[k] += kr(s[k]); });
      for (const c in s._bc) T._bc[c] = (T._bc[c] || 0) + s._bc[c];
    });
    const paralar = Object.keys(toplamlar).sort((a, b) => (a === "TRY") - (b === "TRY") || a.localeCompare(b));
    paralar.forEach(p => {
      const T = toplamlar[p];
      ["devir", "gelen", "harcama", "iade", "kalan", "nakit", "kart", "diger"].forEach(k => { T[k] = tk(T[k]); });
      T.kategoriler = enBuyuk(T._bc, nKat); delete T._bc;
    });
    satirlar.forEach(s => { delete s._bc; });
    const karisik = paralar.length > 1;
    const secilen = Array.isArray(donem) ? new Set(donem) : null, aylar = aylarOf([], donem) || [...tumAylar].sort();
    // months that were not asked for but lie between the chosen ones (added so the period is consecutive)
    const eklenenAylar = secilen ? aylar.filter(a => !secilen.has(a)) : [];
    const eski = satirlar.some(s => s.eski);   // some boat has no accounts: its cash box is the 2.5.0 one (every expense leaves it)
    return { aylar, eklenenAylar, tekneler: satirlar, paralar, toplamlar, karisik, eski, toplam: !karisik && paralar.length ? toplamlar[paralar[0]] : null };
  }

  // warning for a consolidated period whose chosen months had gaps (the months in between were added)
  const aradaAylarUyari = ms => t("Dönem ardışık olmalı: seçilen aylar arasındaki {aylar} de toplamlara dahil edildi.", { aylar: ms.map(K.monthLabel).join(", ") });

  /* oncekiIadeler(items): ids of refunds whose original expense is in an earlier month ("prior period refund").
     Such a refund lowers the expenses of the month it is entered in, so the report names it. */
  function oncekiIadeler(items) {
    const ay = {}, out = new Set();
    (items || []).forEach(e => { if (e && e.id != null) ay[e.id] = ayOf(e); });
    (items || []).forEach(e => { if (e && K.isIade(e) && e.iadeOf != null && ay[e.iadeOf] && ay[e.iadeOf] < ayOf(e)) out.add(e.id); });
    return out;
  }

  /* kartEkstresi(items, set, ay): one statement per card (and per advance / other account) used in the month.
     → [{ id, ad, sahip, son4, tur, islem, harcama (gross), iade, net, odeme (payments/transfers into it), kategoriler, liste }] */
  function kartEkstresi(items, set, ay) {
    const ix = K.kayitIndeksi(items);
    const its = (items || []).filter(e => ayOf(e) === ay && (K.hesabaGirer ? K.hesabaGirer(e, set) : true)).sort(K.cmpEntry);
    return K.hesaplar(set).filter(h => h.tur !== "nakit" && h.tur !== "banka").map(h => {
      const liste = its.filter(e => K.etki(e, h.id, ix) !== 0 || (!K.isTr(e) && K.hesapOf(e, ix) === h.id && K.tutarGecerli(e) && +e.amount === 0));
      if (!liste.length) return null;
      let harcama = 0, iade = 0, odeme = 0; const bc = {};
      liste.forEach(e => {
        const a = kr(e.amount);
        if (K.isTr(e)) { if (e.hedef === h.id) odeme += a; else odeme -= a; return; }
        if (K.isIn(e)) { odeme += a; return; }
        const c = e.cat || "Kategorisiz";
        if (K.isIade(e)) { iade += a; bc[c] = (bc[c] || 0) - a; } else { harcama += a; bc[c] = (bc[c] || 0) + a; }
      });
      return { id: h.id, ad: h.ad || "", sahip: h.sahip || "", son4: h.son4 || "", tur: h.tur, durum: h.durum,
        islem: liste.filter(e => K.isOut(e) || K.isIade(e)).length, harcama: tk(harcama), iade: tk(iade), net: tk(harcama - iade), odeme: tk(odeme),
        kategoriler: enBuyuk(bc, 99), liste };
    }).filter(Boolean);
  }

  /* bankaHareketleri(items, set, ay): the movements of every bank account in the month, with a running balance.
     → [{ id, ad, son4, devir, giris, cikis, kalan, satirlar: [{ e, giris, cikis, bakiye }] }] */
  function bankaHareketleri(items, set, ay) {
    const ix = K.kayitIndeksi(items);
    const its = (items || []).filter(e => ayOf(e) === ay && (K.hesabaGirer ? K.hesabaGirer(e, set) : true)).sort(K.cmpEntry);
    return K.hesaplar(set).filter(h => h.tur === "banka").map(h => {
      const ilgili = its.filter(e => K.etki(e, h.id, ix) !== 0);
      if (!ilgili.length) return null;
      const k = K.hesapFor(items, set, h.id, ay);
      let b = kr(k.devir);
      const satirlar = ilgili.map(e => { const x = K.etki(e, h.id, ix); b += x; return { e, giris: x > 0 ? tk(x) : 0, cikis: x < 0 ? tk(-x) : 0, bakiye: tk(b) }; });
      return { id: h.id, ad: h.ad || "", son4: h.son4 || "", sahip: h.sahip || "", devir: k.devir, giris: k.giren, cikis: k.cikan, kalan: k.kalan, satirlar };
    }).filter(Boolean);
  }

  /* ---------------- Excel sheets (same cell format as app.js sheetSpec: {ad, sutunlar, birlesik, dondur, hucreler}) ---------------- */
  const t = (s, v) => K.t(s, v);
  const up = s => String(s).toLocaleUpperCase(K.loc);   // the language of the file (it/fr/es/de: "i" stays "I", never "İ")
  const serial = iso => { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  const VARS = { nakit: "Nakit kasa", kart: "Kredi kartı", banka: "Banka hesabı" };
  const hesapEtiket = (set, id) => { const h = K.hesapBul(set, id); if (!h) return t(VARS[id] || "Nakit kasa"); return (VARS[h.id] && h.ad === VARS[h.id] ? t(h.ad) : h.ad) + (h.son4 ? " ··" + h.son4 : ""); };
  const donemYazi = aylar => !aylar.length ? "" : aylar.length > 1 ? K.monthLabel(aylar[0]) + " – " + K.monthLabel(aylar[aylar.length - 1]) : K.monthLabel(aylar[0]);

  // "Kartlar" sheet: per card totals (formulas over the list below) and every card transaction of the months
  function kartlarSayfasi(items, set, aylar) {
    const H = []; const put = (r, v, st, f) => H.push({ r, v: v === undefined ? null : v, st: st || "", f: f || "" });
    const P = "para", PK = "parakalin";   // same money format as the cash sheets: the workbook is formatted in the book's currency
    const ekstreler = []; aylar.forEach(m => kartEkstresi(items, set, m).forEach(c => ekstreler.push(c)));
    const kartlar = []; ekstreler.forEach(c => { if (!kartlar.some(x => x.id === c.id)) kartlar.push(c); });
    if (!kartlar.length) return null;
    const TH = t("Harcama"), TI = t("İade"), TO = t("Ödeme / transfer");
    put("A1", set.name || "Yachting Jurnal", "baslik");
    put("A2", t("Kart ekstresi") + " · " + donemYazi(aylar) + (paraOf(set) !== "TRY" ? " · " + paraOf(set) : ""), "etiket");
    ["Kart / hesap", "Sahibi", "Son 4 hane", "İşlem", "Toplam harcama", "İadeler", "Net harcama"].forEach((x, i) => put("ABCDEFG"[i] + "4", up(t(x)), i >= 3 ? "basliksatirsag" : "basliksatir"));
    const satirlar = [];
    ekstreler.forEach(c => c.liste.forEach(e => satirlar.push({ c, e })));
    satirlar.sort((x, y) => K.cmpEntry(x.e, y.e));
    const bas = 5 + kartlar.length + 3, ilk = bas + 1, son = Math.max(ilk, bas + satirlar.length);
    // column H (hidden) holds the card's id: totals are summed by it, not by the visible name, so two cards with
    // the same name and last 4 digits (e.g. a renewed card) never take each other's amounts
    const rH = "$H$" + ilk + ":$H$" + son, rF = "$F$" + ilk + ":$F$" + son, rG = "$G$" + ilk + ":$G$" + son;
    kartlar.forEach((c, i) => {
      const r = 5 + i, hepsi = ekstreler.filter(x => x.id === c.id), top = k => tk(hepsi.reduce((a, x) => a + kr(x[k]), 0));
      put("A" + r, hesapEtiket(set, c.id), "metin"); put("B" + r, c.sahip || "", "metin"); put("C" + r, c.son4 || "", "metin");
      put("D" + r, hepsi.reduce((a, x) => a + x.islem, 0), "sayi", 'COUNTIFS(' + rH + ',H' + r + ',' + rF + ',"' + TH + '")+COUNTIFS(' + rH + ',H' + r + ',' + rF + ',"' + TI + '")');
      put("E" + r, top("harcama"), P, 'SUMIFS(' + rG + ',' + rH + ',H' + r + ',' + rF + ',"' + TH + '")');
      put("F" + r, top("iade"), P, '-SUMIFS(' + rG + ',' + rH + ',H' + r + ',' + rF + ',"' + TI + '")');
      put("G" + r, top("net"), P, "E" + r + "-F" + r); put("H" + r, String(c.id), "metin");
    });
    const tr = 5 + kartlar.length, son1 = tr - 1;
    put("A" + tr, up(t("Toplam")), "kalinzemin"); ["B", "C"].forEach(x => put(x + tr, null, "kalinzemin"));
    put("D" + tr, ekstreler.reduce((a, x) => a + x.islem, 0), "sayikalin", "SUM(D5:D" + son1 + ")");
    ["harcama", "iade", "net"].forEach((k, i) => { const col = "EFG"[i]; put(col + tr, tk(ekstreler.reduce((a, x) => a + kr(x[k]), 0)), PK, "SUM(" + col + "5:" + col + son1 + ")"); });
    ["Tarih", "Kart / hesap", "Firma", "Açıklama", "Kategori", "Tür", "Tutar"].forEach((x, i) => put("ABCDEFG"[i] + bas, up(t(x)), i === 6 ? "basliksatirsag" : "basliksatir"));
    satirlar.forEach(({ c, e }, i) => {
      const r = ilk + i, trf = K.isTr(e), iade = K.isIade(e), giris = K.isIn(e) || (trf && e.hedef === c.id);
      put("A" + r, serial(e.date), "tarih"); put("B" + r, hesapEtiket(set, c.id), "metin"); put("C" + r, e.vendor || "", "metin");
      put("D" + r, [e.desc || "", trf ? hesapEtiket(set, K.hesapOf(e)) + " → " + hesapEtiket(set, e.hedef) : "", K.amountNote(e)].filter(Boolean).join(" · "), "metin");
      put("E" + r, trf || K.isIn(e) ? "" : (iade ? t("İade") + " · " : "") + K.catLabel(e.cat), "metin");
      put("F" + r, trf || K.isIn(e) ? TO : iade ? TI : TH, "metin");
      put("G" + r, (iade || giris ? -1 : 1) * (+e.amount || 0), P); put("H" + r, String(c.id), "metin");
    });
    return { ad: t("Kartlar"), sutunlar: [12, 26, 28, 34, 22, 16, 15, 0], dondur: 0, birlesik: ["A1:D1", "A2:G2"], hucreler: H };
  }

  // consolidated sheet: one row per boat, totals per currency (formulas); currencies are never added together
  function konsolideSayfasi(kons, baslik) {
    const H = []; const put = (r, v, st, f) => H.push({ r, v: v === undefined ? null : v, st: st || "", f: f || "" });
    put("A1", baslik || t("Tüm tekneler"), "baslik");
    put("A2", t("Konsolide rapor") + " · " + donemYazi(kons.aylar || []), "etiket");
    const B = ["Tekne", "Para", "Devir", "Gelen para", "Harcama", "Nakit", "Kart", "Diğer", "Kalan kasa", "En büyük kategoriler"];
    B.forEach((x, i) => put("ABCDEFGHIJ"[i] + "4", up(t(x)), i >= 2 && i <= 8 ? "basliksatirsag" : "basliksatir"));
    const K9 = ["devir", "gelen", "harcama", "nakit", "kart", "diger", "kalan"];
    let r = 5;
    kons.paralar.forEach(p => {
      const ilk = r;
      kons.tekneler.filter(s => s.para === p).forEach(s => {
        put("A" + r, s.ad || s.id, "metin"); put("B" + r, s.para, "metin");
        K9.forEach((k, i) => put("CDEFGHI"[i] + r, s[k], "sayi"));
        put("J" + r, s.kategoriler.slice(0, 3).map(([c, v]) => K.catLabel(c) + " " + K.num(v)).join(" · "), "metin"); r++;
      });
      const T = kons.toplamlar[p];
      put("A" + r, up(kons.karisik ? t("Toplam ({para})", { para: p }) : t("Şirket toplamı")), "kalinzemin"); put("B" + r, p, "kalinzemin");
      K9.forEach((k, i) => { const col = "CDEFGHI"[i]; put(col + r, T[k], "sayikalin", "SUM(" + col + ilk + ":" + col + (r - 1) + ")"); });
      put("J" + r, T.kategoriler.slice(0, 3).map(([c, v]) => K.catLabel(c) + " " + K.num(v)).join(" · "), "kalinzemin");
      r += 2;
    });
    put("A" + r, kons.karisik ? t("Tekneler farklı para birimleriyle tutuluyor. Tutarlar kur çevrimi yapılmadan, para birimine göre ayrı toplanmıştır.") : kons.eski ? t("Hesap tanımlamamış teknelerde bütün harcamalar kasadan düşer; hesap kuralına geçmiş teknelerde kart, banka ve diğer hesaplardan yapılan harcamalar nakit kasayı azaltmaz.") : t("Kalan kasa yalnızca nakit kasadır; kart, banka ve diğer hesaplardan yapılan harcamalar nakit kasayı azaltmaz."), "etiket");
    if (kons.eklenenAylar && kons.eklenenAylar.length) put("A" + (r + 1), aradaAylarUyari(kons.eklenenAylar), "etiket");
    return { ad: t("Konsolide"), sutunlar: [24, 8, 15, 15, 15, 15, 15, 15, 15, 44], dondur: 5, birlesik: ["A1:E1", "A2:E2"], hucreler: H };
  }

  Object.assign(K, { konsolide, aradaAylarUyari, oncekiIadeler, kartEkstresi, bankaHareketleri, paraTutar, paraOf, kartlarSayfasi, konsolideSayfasi });
})(typeof window !== "undefined" ? window : globalThis);
