/* Yachting Jurnal — receipt text parser (the pure part of "Fişi oku").
   Takes the raw text an OCR engine read from a receipt and returns SUGGESTIONS: amount (whole kuruş), currency, date,
   merchant, category, VAT. No page, no storage, no network, no floating point sums: amounts are cut out of the text as
   digit strings and turned into whole kuruş (integer) by string rules. Used by ocr.js (the page) and the node tests.
   Rule of the product: a wrong value that looks sure is worse than an empty one, so every field carries a confidence
   (0..1) and an unsure or ambiguous reading stays EMPTY. The user always checks and saves; nothing is saved from here.
   Languages of the keywords: tr, en, fr, it, es, de, el. */
"use strict";
(function (g) {
  const ENCOK_KURUS = 1e13;   // 1e11 (the book's amount limit, K.TUTAR_USTSINIR) × 100; larger is not a receipt amount

  /* ---------------- text helpers ---------------- */
  // lower case, no accents, Turkish ı/İ → i, Greek accents off, final sigma → σ; keeps one character per character where it can
  function katla(s) {
    return String(s == null ? "" : s).replace(/İ/g, "i").replace(/I/g, "i").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/ς/g, "σ").replace(/ß/g, "ss");
  }
  const satirlar = m => String(m == null ? "" : m).replace(/\r/g, "\n").split("\n").map(x => x.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
  // word-start match of a (folded) keyword list against folded text: "akaryakit" matches "akaryakiti"; "su" does not match "sut"
  const kelimeRe = liste => new RegExp("(?:^|[^a-z0-9\\u03b1-\\u03c9])(?:" + liste.map(katla).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "u");

  /* ---------------- amounts ---------------- */
  // One digit-and-separator token ("1.234,56", "1,234.56", "12,5", "1250", "1 234,50") → { kurus, guven } or null.
  //  - both "." and "," present: the LAST one is the decimal mark when 1–2 digits follow it; three digits after it is not money → null
  //  - one kind of mark, once: 1–2 digits after it = decimal; exactly 3 digits = thousands (a money amount has no 3 decimals), less sure
  //  - one kind of mark, several times: only if every group is 3 digits (thousands, whole units); else null
  //  - no mark: whole units (less sure: a lost decimal mark would look the same)
  function tutarKurus(token) {
    let s = String(token == null ? "" : token).trim();
    s = s.replace(/(\d)\s(?=\d{3}(?:[.,]\d{1,2})?(?!\d))/g, "$1");   // "1 234,50" (a space as the thousands mark)
    if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s) || /[.,]{2}/.test(s)) return null;
    const noktaSay = (s.match(/\./g) || []).length, virgulSay = (s.match(/,/g) || []).length;
    let tam, kes = "", guven = 1;
    const bol = (str, ayrac) => { const i = str.lastIndexOf(ayrac); return [str.slice(0, i), str.slice(i + 1)]; };
    if (noktaSay && virgulSay) {
      const son = Math.max(s.lastIndexOf("."), s.lastIndexOf(",")), ayrac = s[son], bin = ayrac === "," ? "." : ",";
      const [ip, fp] = bol(s, ayrac);
      if (fp.length < 1 || fp.length > 2) return null;
      if (ip.includes(ayrac)) return null;
      if (!new RegExp("^\\d{1,3}(\\" + bin + "\\d{3})+$").test(ip)) return null;
      tam = ip.split(bin).join(""); kes = fp;
    } else if (noktaSay || virgulSay) {
      const ayrac = noktaSay ? "." : ",", say = noktaSay || virgulSay;
      if (say === 1) {
        const [ip, fp] = bol(s, ayrac);
        if (fp.length >= 1 && fp.length <= 2) { tam = ip; kes = fp; if (fp.length === 1) guven = 0.8; }
        else if (fp.length === 3 && /^[1-9]\d{0,2}$/.test(ip)) { tam = ip + fp; guven = 0.5; }   // "1.234": thousands
        else return null;
      } else {
        const parcalar = s.split(ayrac);
        if (!/^[1-9]\d{0,2}$/.test(parcalar[0]) || !parcalar.slice(1).every(p => /^\d{3}$/.test(p))) return null;
        tam = parcalar.join(""); guven = 0.7;
      }
    } else { tam = s; guven = 0.5; }
    if (tam.length > 1) tam = tam.replace(/^0+(?=\d)/, "");
    if (tam.length > 13) return null;
    const kurus = Number(tam) * 100 + Number((kes + "00").slice(0, 2));
    if (!Number.isSafeInteger(kurus) || kurus < 1 || kurus > ENCOK_KURUS) return null;
    return { kurus, guven };
  }
  // every amount in a line, in order of appearance: [{ kurus, guven, ondalik }]; percentages ("%20", "20%") and times are not amounts
  const TOKEN = /\d[\d.,]*(?: \d{3}(?:[.,]\d{1,2})?(?!\d))*/g;
  // OCR often reads a zero as the letter O inside a number ("1.7O5,25"): an O/o touching a digit or a separator of a number is a zero (F-30)
  const sifirla = x => String(x).replace(/(?<=[\d.,])[Oo](?=[\d.,]|(?![A-Za-z]))|(?<![A-Za-z])[Oo](?=\d)/g, "0");
  function satirTutarlari(satir) {
    const out = [], s = sifirla(satir);
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(s))) {
      const bas = m.index, son = bas + m[0].length;
      const onceki = s.slice(Math.max(0, bas - 2), bas), sonraki = s.slice(son, son + 2);
      if (/%$/.test(onceki) || /^\s*%/.test(sonraki)) continue;           // a rate
      if (/^:\d{2}/.test(sonraki) || /\d:$/.test(onceki)) continue;          // a time 12:34
      if (/[A-Za-z]$/.test(s.slice(0, bas)) && !/(?:TL|TRY|EUR|USD|GBP|CHF|AED)$/i.test(s.slice(0, bas))) continue;   // a code like "A101", "No1234"
      if (/[-/]\d/.test(s.slice(son, son + 2)) || /\d[-/]$/.test(onceki)) continue;                                      // a date piece
      let tk = m[0].replace(/[.,]+$/, "");
      const r = tutarKurus(tk);
      if (r) {
        // A space can join a quantity and a price ("2 125,50" = 2 pieces, 125,50) just as well as it can be a thousands mark (CT-O4):
        // such a number is NEVER sure (confidence ≤ 0.45, so the form is not filled) and its other reading is kept as an alternative.
        const bosluk = / /.test(tk), alt = bosluk ? tutarKurus(tk.slice(tk.lastIndexOf(" ") + 1)) : null;
        out.push({ kurus: r.kurus, guven: bosluk ? Math.min(r.guven, 0.45) : r.guven, ondalik: /[.,]\d{1,2}$/.test(tk.replace(/(\d) (?=\d{3})/g, "$1")), alt: alt ? alt.kurus : null });
      }
    }
    return out;
  }

  /* ---------------- keywords ---------------- */
  const TOPLAM_GUCLU = kelimeRe(["genel toplam", "ödenecek", "odenecek", "toplam tutar", "grand total", "total due", "amount due", "balance due", "total to pay", "to pay", "total ttc", "net à payer", "net a payer", "à payer", "a payer", "montant total", "totale complessivo", "totale da pagare", "da pagare", "total a pagar", "importe total", "gesamtbetrag", "gesamtsumme", "zu zahlen", "endbetrag", "γενικό σύνολο", "γενικο συνολο", "πληρωτέο", "προς πληρωμή"]);
  const TOPLAM_NORMAL = kelimeRe(["toplam", "total", "totale", "summe", "gesamt", "σύνολο", "συνολο", "tutar", "amount", "montant", "importo", "importe", "betrag", "ποσό", "ποσο", "tot."]);
  const TOPLAM_DISI = kelimeRe(["ara toplam", "ara tutar", "subtotal", "sub total", "sub-total", "sous-total", "sous total", "subtotale", "subtotal", "zwischensumme", "μερικό σύνολο", "μερικο συνολο", "nakit", "cash", "espèces", "especes", "contanti", "efectivo", "bargeld", "μετρητά", "μετρητα", "para üstü", "para ustu", "change", "rendu", "monnaie", "resto", "cambio", "vuelto", "rückgeld", "ruckgeld", "wechselgeld", "ρέστα", "ρεστα", "indirim", "discount", "remise", "sconto", "descuento", "rabatt", "έκπτωση", "εκπτωση", "kdv", "vat", "tax", "tva", "iva", "mwst", "ust", "φπα", "kart no", "card no", "fiş no", "fis no", "z no", "ekü", "eku"]);
  // lines that are about something else than the money to pay: counts, points, litres, savings, instalments (F-27)
  const YARDIMCI = kelimeRe(["puan", "point", "adet", "kalem", "urun", "litre", "items", "qty", "tasarruf", "savings", "saving", "taksit", "aylik", "matrah", "articl", "artikel", "stuck", "pieces", "piezas", "τεμαχ", "ειδη", "μοναδ", "bonus"]);
  const YARDIMCI_LT = /(?:^|[^a-z0-9])lt(?![a-z0-9])/;
  // "discounted total" is the amount that is really paid, and so STRONG (F-26); "total discount" is not
  const INDIRIMLI = kelimeRe(["indirimli", "discounted", "after discount", "total remise", "apres remise", "scontato", "dopo sconto", "con descuento", "descontado", "rabattiert", "nach rabatt", "μετα την εκπτωση", "με εκπτωση"]);
  const KDV_DAHIL = /(?:dahil|incl|inkl|included|ttc|compris|inclus|inclus|incluido|συμπεριλ)/;
  // a refund slip (F-28): words in the first lines or in the total line; "no refund" footers are not refunds
  const IADE = kelimeRe(["iade", "refund", "return", "avoir", "remboursement", "storno", "gutschrift", "rimborso", "nota di credito", "devolucion", "abono", "reembolso", "επιστροφ", "πιστωτικ"]);
  const IADE_DEGIL = /(?:iade\s+(?:edilmez|edilemez|yapilmaz|kabul)|no\s+refund|non[- ]?remboursable|nicht\s+erstatt|non\s+rimborsabil|no\s+reembols|return\s+policy)/;
  const KART_SATIR = kelimeRe(["kredi kart", "banka kart", "kart", "card", "visa", "mastercard", "carte", "carta", "tarjeta", "karte", "καρτα", "cb "]);
  const NAKIT_SATIR = kelimeRe(["nakit", "cash", "especes", "contanti", "efectivo", "bargeld", "μετρητα"]);
  const BAR_SATIR = /(?:^|[^a-z0-9])bar(?![a-z0-9])/;
  const UST_SATIR = kelimeRe(["para ustu", "change", "rendu", "monnaie", "resto", "cambio", "vuelto", "ruckgeld", "wechselgeld", "ρεστα"]);
  const KDV_SATIR = kelimeRe(["kdv", "vat", "tax", "tva", "iva", "mwst", "mehrwertsteuer", "umsatzsteuer", "φπα", "topkdv"]);
  const KDV_TOPLAM = kelimeRe(["toplam kdv", "topkdv", "top. kdv", "top kdv", "total vat", "total tax", "vat total", "tax total", "tva totale", "total tva", "totale iva", "iva totale", "total iva", "mwst gesamt", "gesamt mwst", "σύνολο φπα", "συνολο φπα"]);
  const TARIH_ETIKET = kelimeRe(["tarih", "date", "datum", "fecha", "data", "ημερομηνία", "ημερομηνια", "ημ/νία", "ημ/νια", "le "]);

  /* ---------------- total ---------------- */
  function toplamBul(satirlarDizisi) {
    const adaylar = [];
    satirlarDizisi.forEach((satir, i) => {
      const k = katla(satir);
      const indirimli = INDIRIMLI.test(k);
      const guclu = TOPLAM_GUCLU.test(k) || indirimli, normal = TOPLAM_NORMAL.test(k);
      if (!guclu && !normal) return;
      if (YARDIMCI.test(k) || YARDIMCI_LT.test(k)) return;            // total of points, items, litres, savings ... (F-27)
      if (!guclu && TOPLAM_DISI.test(k)) return;                      // subtotal, tax, cash, change: not the total
      if (guclu && !indirimli && /(?:ara|sub|zwischen|sous)/.test(k) && !/(?:genel|grand|total to pay)/.test(k)) return;
      if (guclu && KDV_SATIR.test(k) && !KDV_DAHIL.test(k)) return;   // "ÖDENECEK KDV": the tax to pay, not the total (F-27)
      let tutarlar = satirTutarlari(satir);
      let sonraki = false;
      if (!tutarlar.length && i + 1 < satirlarDizisi.length) {        // the number sits on the next line, and the next line is ONLY a number (F-30)
        const sl = satirlarDizisi[i + 1];
        const n = satirTutarlari(sl);
        if (n.length && !/\p{L}{2}/u.test(sl.replace(/(?:TL|TRY|EUR|USD|GBP|CHF|AED)\b/gi, ""))) { tutarlar = n; sonraki = true; }
      }
      if (!tutarlar.length) return;
      const t = tutarlar[tutarlar.length - 1];                         // the amount is the last number of its line ("TOPLAM  *125,50")
      const eksi = /-\s*\d[\d.,]*\s*(?:TL|TRY|EUR|USD|GBP|€|₺|\$|£)?\s*$/i.test(sifirla(satir)) || /\d[.,]\d{2}\s*-\s*$/.test(satir) || /\(\s*\d[\d.,]*\s*\)\s*$/.test(satir);
      adaylar.push({ kurus: t.kurus, alt: t.alt, oncelik: guclu ? 1 : 0.85, guven: t.guven, ondalik: t.ondalik, satir: i, sonraki, eksi });
    });
    if (adaylar.length) {
      // strongest keyword first, then the LAST such line (a receipt ends with its total), then the sure format
      adaylar.sort((a, b) => b.oncelik - a.oncelik || b.satir - a.satir);
      const en = adaylar[0];
      const ayniDeger = adaylar.filter(a => a.kurus === en.kurus).length;
      const celiski = adaylar.some(a => a.oncelik === en.oncelik && a.kurus !== en.kurus && a.satir !== en.satir);
      let guven = en.oncelik * en.guven * (en.sonraki ? 0.85 : 1);
      if (ayniDeger > 1 && en.guven > 0.5) guven = Math.min(1, guven + 0.1);   // a second line with the same value only helps a reading that has its decimal mark (F-25)
      if (celiski) guven *= 0.5;                                              // two strong lines that disagree: never written (F-27)
      // other lines that must add up to the total: card, cash minus change (F-31); one that does not match = misread total
      const diger = capraz(satirlarDizisi, en.satir, en.kurus);
      if (diger === false) guven *= 0.5;
      // a refund slip: a minus sign on the total, or refund words in the first lines / the total line (F-28)
      const ust = katla(satirlarDizisi.slice(0, 6).join(" ") + " " + satirlarDizisi[en.satir]);
      const iade = en.eksi || (IADE.test(ust) && !IADE_DEGIL.test(ust));
      return { kurus: en.kurus, guven: Math.round(guven * 100) / 100, kaynak: "toplam", iade, capraz: diger, adaylar: [...new Set(adaylar.reduce((x, a) => x.concat(a.alt ? [a.kurus, a.alt] : [a.kurus]), []))] };
    }
    // no total line: the biggest amount WITH decimals; unsure by nature
    let en = null;
    for (const satir of satirlarDizisi) {
      if (TOPLAM_DISI.test(katla(satir)) && !/toplam|total/.test(katla(satir))) continue;
      for (const t of satirTutarlari(satir)) if (t.ondalik && (!en || t.kurus > en.kurus)) en = t;
    }
    return en ? { kurus: en.kurus, guven: 0.3, kaynak: "enBuyuk", iade: false, adaylar: [en.kurus] } : null;
  }

  // Cross-check of the chosen total with the payment lines (F-31). Returns true (something confirms it), false (something that must
  // equal it does not) or null (nothing to check). Card = total; cash − change = total; cash alone cannot be below the total.
  function capraz(sat, toplamSatiri, kurus) {
    let dogru = false, yanlis = false, nakit = null, ust = null, kart = [];
    sat.forEach((satir, i) => {
      if (i === toplamSatiri) return;
      const k = katla(satir); if (/(?:ara toplam|subtotal|zwischen|sous-total|kart no|card no|\bno\b|\bnr\b)/.test(k)) return;
      const t = satirTutarlari(satir).filter(x => x.ondalik); if (!t.length) return;
      const son = t[t.length - 1].kurus;
      if (UST_SATIR.test(k)) ust = son;
      else if (NAKIT_SATIR.test(k) || BAR_SATIR.test(k)) nakit = son;
      else if (KART_SATIR.test(k)) kart.push(son);
    });
    // subtotal (− discount, + tax if the subtotal is without tax) must give the total; with a service / tip line the sum is not ours to judge
    let ara = null, ind = 0, kdv = 0, ek = false;
    sat.forEach((satir, i) => {
      if (i === toplamSatiri) return;
      const k = katla(satir), t = satirTutarlari(satir).filter(x => x.ondalik); if (!t.length) return;
      const son = t[t.length - 1].kurus;
      if (/(?:ara toplam|ara tutar|subtotal|sub total|sub-total|sous-total|zwischensumme|μερικο συνολο)/.test(k)) ara = son;
      else if (INDIRIMLI.test(k)) return;
      else if (/(?:indirim|discount|remise|sconto|descuento|rabatt|εκπτωση)/.test(k)) ind += son;
      else if (KDV_SATIR.test(k) && !KDV_TOPLAM.test(k)) kdv = kdv || son;
      else if (/(?:servis|service|tip|bahsis|cover|coperto|propina|trinkgeld|servizio|pourboire|φιλοδωρημα)/.test(k)) ek = true;
    });
    if (ara != null && !ek) { const uygun = [ara, ara - ind, ara + kdv, ara + kdv - ind]; if (uygun.includes(kurus)) dogru = true; else yanlis = true; }
    kart.forEach(x => { if (x === kurus) dogru = true; else yanlis = true; });
    if (nakit != null && ust != null) { if (nakit - ust === kurus) dogru = true; else yanlis = true; }
    else if (nakit != null && nakit < kurus) yanlis = true;
    if (yanlis && !dogru) return false;
    return dogru ? true : null;
  }

  /* ---------------- VAT ---------------- */
  function kdvBul(satirlarDizisi, toplamKurus) {
    let toplamSatir = null; const tekler = [];
    satirlarDizisi.forEach(satir => {
      const k = katla(satir);
      if (!KDV_SATIR.test(k)) return;
      const t = satirTutarlari(satir.replace(/%\s*\d+([.,]\d+)?|\d+([.,]\d+)?\s*%/g, " "));
      if (!t.length) return;
      if (KDV_TOPLAM.test(k)) toplamSatir = t[t.length - 1].kurus;
      else if (/\*?\s*\d/.test(k)) tekler.push(t[t.length - 1].kurus);
    });
    let kdv = toplamSatir;
    if (kdv == null && tekler.length) { kdv = 0; tekler.forEach(x => { kdv += x; }); }   // whole kuruş, integer sum
    if (kdv == null || kdv < 1) return null;
    if (toplamKurus != null && kdv >= toplamKurus) return null;             // a tax cannot be as big as the total
    return { kurus: kdv, guven: toplamSatir != null ? 0.7 : 0.5 };
  }

  /* ---------------- currency ---------------- */
  const PARA_KALIPLARI = [
    ["TRY", /₺|\bTL\b|\bTRY\b|T\.L\./i], ["EUR", /€|\bEUR\b|\bEURO\b/i], ["USD", /\$|\bUSD\b|\bUS\s?DOLLAR/i],
    ["GBP", /£|\bGBP\b/i], ["CHF", /\bCHF\b|\bSFr\b/i], ["AED", /\bAED\b|\bDH\b|\bDHS\b/i],
  ];
  function paraBul(metin, toplamSatiri) {
    const say = {};
    const sayi = (s, agirlik) => PARA_KALIPLARI.forEach(([kod, re]) => { const m = s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")); if (m) say[kod] = (say[kod] || 0) + m.length * agirlik; });
    sayi(metin, 1);
    if (toplamSatiri) sayi(toplamSatiri, 3);
    const sirali = Object.entries(say).sort((a, b) => b[1] - a[1]);
    if (!sirali.length) return null;
    if (sirali[1] && sirali[1][1] === sirali[0][1]) return { kod: sirali[0][0], guven: 0.3 };
    return { kod: sirali[0][0], guven: sirali[1] ? 0.6 : 0.85 };
  }

  /* ---------------- date ---------------- */
  const AYGUN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const takvimde = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= AYGUN[m - 1] && (m !== 2 || d <= 28 || (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)));
  const iki = n => String(n).padStart(2, "0");
  // today as [y, m, d] (injectable for the tests); a receipt from the future (beyond tomorrow) is not trusted
  function tarihBul(satirlarDizisi, bugun) {
    const b = bugun || (() => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; })();
    const bugunSayi = b[0] * 10000 + b[1] * 100 + b[2] + 2;   // two days of slack (time zones, a receipt of "tomorrow")
    const adaylar = [];
    const ekle = (y, m, d, guven, i, etiket, belirsiz) => {
      if (y < 100) y += 2000;
      if (y < 2000 || !takvimde(y, m, d)) return;
      if (y * 10000 + m * 100 + d > bugunSayi) return;
      if (y < b[0] - 5) return;                                   // a receipt older than five years is not suggested (F-32)
      adaylar.push({ iso: y + "-" + iki(m) + "-" + iki(d), guven: etiket ? Math.min(1, guven + 0.1) : guven, satir: i, belirsiz: !!belirsiz });
    };
    satirlarDizisi.forEach((satir, i) => {
      const etiket = TARIH_ETIKET.test(katla(satir));
      const s = satir;
      let m;
      const reIso = /(?<![\d.\/-])(20\d{2})[-.\/](\d{1,2})[-.\/](\d{1,2})(?![\d])/g;
      while ((m = reIso.exec(s))) ekle(+m[1], +m[2], +m[3], 0.9, i, etiket);
      const reGMY = /(?<![\d.\/-])(\d{1,2})\s?[.\/-]\s?(\d{1,2})\s?[.\/-]\s?(\d{4}|\d{2})(?![\d])/g;
      while ((m = reGMY.exec(s))) {
        const a = +m[1], bb = +m[2], yil = +m[3];
        // day.month (as in Turkey and Europe) when both could be a month and they differ, day and month MAY be the other way round (US style): flagged
        if (a > 12 || a >= 1 && bb <= 12) { if (takvimde(yil < 100 ? yil + 2000 : yil, bb, a)) { ekle(yil, bb, a, m[3].length === 4 ? (a <= 12 && bb <= 12 ? 0.8 : 0.9) : 0.7, i, etiket, a <= 12 && bb <= 12 && a !== bb); continue; } }
        if (bb > 12 && a <= 12) ekle(yil, a, bb, 0.5, i, etiket, true);                              // month/day (US style), unsure
      }
    });
    if (!adaylar.length) return null;
    adaylar.sort((a, b) => b.guven - a.guven || a.satir - b.satir);
    const en = adaylar[0];
    const celiski = adaylar.some(a => a.iso !== en.iso && a.guven >= en.guven - 0.05);
    return { iso: en.iso, guven: Math.round((celiski ? en.guven * 0.8 : en.guven) * 100) / 100, belirsiz: en.belirsiz };
  }

  /* ---------------- merchant ---------------- */
  const ISLETME_ATLA = kelimeRe(["vkn", "vergi", "v.d.", "vd:", "tel", "fax", "faks", "www", "http", "@", "fiş no", "fis no", "fatura", "invoice", "receipt", "recu", "reçu", "ricevuta", "recibo", "beleg", "quittung", "απόδειξη", "αποδειξη", "ticket", "mersis", "ticaret sicil", "tax id", "tax no", "siret", "p.iva", "partita", "cif", "nif", "ust-id", "αφμ", "δοy", "δου", "saat", "tarih", "date", "datum", "kasiyer", "cashier", "kasa", "adres", "cad.", "cd.", "sok.", "sk.", "mah.", "bulvar", "blv", "no:", "street", "str.", "road", "rue ", "via ", "calle", "platz", "οδός", "οδος", "teşekkür", "tesekkur", "thank", "merci", "grazie", "gracias", "danke", "ευχαριστ", "hoş geldiniz", "hos geldiniz", "welcome", "bienvenue", "benvenuti", "bienvenido", "willkommen"]);
  const SIRKET_EKI = /\b(A\.?\s?Ş\.?|AS|LTD\.?|ŞTİ\.?|STI|SAN\.?|TİC\.?|TIC\.?|S\.?A\.?|S\.?A\.?R\.?L\.?|S\.?R\.?L\.?|S\.?L\.?|GMBH|AG|KG|OHG|INC\.?|LLC|PLC|BV|NV|Α\.?Ε\.?|Ε\.?Π\.?Ε\.?|Ο\.?Ε\.?)\b/i;
  function isletmeBul(satirlarDizisi) {
    const ust = satirlarDizisi.slice(0, 8);
    let en = null;
    ust.forEach((satir, i) => {
      const s = satir.replace(/[*=_#~|<>]+/g, " ").replace(/\s+/g, " ").trim();
      const harf = (s.match(/\p{L}/gu) || []).length, rakam = (s.match(/\d/g) || []).length;
      if (harf < 3 || harf / s.length < 0.55 || rakam > harf) return;
      if (ISLETME_ATLA.test(katla(s)) || /^\d{1,2}[./:-]\d{1,2}/.test(s)) return;
      if (satirTutarlari(s).length && /\d[.,]\d{2}\b/.test(s)) return;
      let puan = 0.62 - i * 0.04 + (SIRKET_EKI.test(s) ? 0.18 : 0);
      if (s.length > 45) puan -= 0.15;
      if (!en || puan > en.puan) en = { ad: s.slice(0, 60).replace(/[\s.,;:\-]+$/g, ""), puan, satir: i };
    });
    return en && en.ad.length >= 3 ? { ad: en.ad, guven: Math.round(Math.max(0.2, Math.min(0.9, en.puan)) * 100) / 100 } : null;
  }

  /* ---------------- category (a suggestion; the user decides) ---------------- */
  // keys are the book's category keys (hesap.js CATS); words are folded (no accents) and matched at a word start
  const KATEGORI_SOZLUGU = [
    ["Yakıt", ["akaryakit", "benzin", "dizel", "motorin", "petrol", "opet", "po ", "shell", "bp ", "aytemiz", "lukoil", "fuel", "diesel", "gasoline", "gasolina", "gasoil", "carburant", "gazole", "essence", "station service", "carburante", "gasolio", "benzina", "distributore", "combustible", "gasoleo", "gasolinera", "estacion de servicio", "kraftstoff", "tankstelle", "καυσιμα", "βενζιν", "πετρελαι", "πρατηριο"]],
    ["Marina & bağlama", ["marina", "liman", "baglama", "palamar", "iskele", "mooring", "berth", "harbour", "harbor", "port dues", "quay", "amarrage", "port de plaisance", "capitainerie", "ormeggio", "porto turistico", "amarre", "puerto", "atraque", "liegeplatz", "hafen", "yachthafen", "λιμανι", "μαρινα", "ελλιμενισμ"]],
    ["Kumanya & market", ["market", "migros", "bim ", "a101", "sok ", "carrefour", "macro", "bakkal", "manav", "kasap", "firin", "grocery", "grocer", "supermarket", "bakery", "butcher", "provision", "supermarche", "boulangerie", "boucherie", "epicerie", "alimentari", "supermercato", "panetteria", "macelleria", "supermercado", "panaderia", "carniceria", "supermarkt", "baeckerei", "backerei", "metzgerei", "lidl", "aldi", "σουπερ", "μανα", "αρτοποι", "κρεοπω", "ab βασιλοπουλος", "sklavenitis"]],
    ["Temizlik & sarf", ["temizlik", "deterjan", "camasir", "cop torbasi", "kagit havlu", "cleaning", "detergent", "laundry", "trash bag", "paper towel", "nettoyage", "lessive", "pulizia", "detersivo", "limpieza", "lavanderia", "reinigung", "waschmittel", "καθαριστικ", "απορρυπαντ"]],
    ["Yedek parça", ["yedek parca", "rulman", "filtre", "impeller", "conta", "kayis", "spare part", "bearing", "filter", "gasket", "piece detachee", "pieces detachees", "ricambi", "repuesto", "recambio", "ersatzteil", "ανταλλακτικ"]],
    ["Ekipman & malzeme", ["nalbur", "yat malzeme", "halat", "usturmaca", "branda", "chandler", "hardware", "fender", "rope", "quincaillerie", "accastillage", "ferramenta", "nautica", "ferreteria", "baumarkt", "bootszubehor", "bootszubehoer", "ναυτικα", "σιδηρικ"]],
    ["Bakım & onarım", ["tamir", "onarim", "servis", "bakim", "boya", "tersane", "repair", "service", "maintenance", "paint", "boatyard", "reparation", "entretien", "riparazione", "manutenzione", "reparacion", "mantenimiento", "reparatur", "wartung", "werft", "επισκευ", "συντηρηση", "ναυπηγει"]],
    ["Personel", ["maas", "ucret bordro", "personel", "mürettebat", "murettebat", "wages", "salary", "payroll", "crew", "salaire", "equipage", "stipendio", "equipaggio", "salario", "tripulacion", "gehalt", "lohn", "besatzung", "μισθ", "πληρωμα"]],
    ["Sigorta", ["sigorta", "insurance", "assurance", "assicurazione", "seguro", "versicherung", "ασφαλ"]],
    ["Harç & belgeler", ["harc", "noter", "gumruk", "acente", "ruhsat", "transitlog", "transit log", "notary", "customs", "permit", "licence", "license", "agency", "douane", "notaire", "dogana", "notaio", "aduana", "notario", "zoll", "genehmigung", "τελωνει", "συμβολαιογρ", "αδεια"]],
    ["Ulaşım", ["taksi", "otobus", "ucak", "bilet", "feribot", "havalimani", "taxi", "bus ", "flight", "ticket", "ferry", "airport", "train", "billet", "vol ", "aeroport", "biglietto", "volo", "aeroporto", "traghetto", "billete", "vuelo", "aeropuerto", "fahrkarte", "flug", "flughafen", "fahre", "ταξι", "εισιτηριο", "πλοιο", "αεροδρομιο"]],
  ];
  const KATEGORI_RE = KATEGORI_SOZLUGU.map(([k, l]) => [k, kelimeRe(l)]);
  // hits in the merchant name count double; every line counts once per category; the best category must lead clearly
  function kategoriBul(isletme, satirlarDizisi) {
    const puan = {}; const ad = katla(isletme || "");
    const ustSatirlar = satirlarDizisi.slice(0, 4).map(katla), gov = satirlarDizisi.map(katla);
    KATEGORI_RE.forEach(([k, re]) => {
      let p = 0;
      if (ad && re.test(ad)) p += 2;
      ustSatirlar.forEach(s => { if (re.test(s)) p += 1; });
      gov.forEach(s => { if (re.test(s)) p += 0.6; });
      if (p) puan[k] = p;
    });
    const sira = Object.entries(puan).sort((a, b) => b[1] - a[1]);
    if (!sira.length) return null;
    const [k, p] = sira[0], ikinci = sira[1] ? sira[1][1] : 0;
    if (p - ikinci < 0.5) return null;                       // a tie is no suggestion
    return { kategori: k, guven: Math.round(Math.min(0.85, 0.35 + p * 0.15) * 100) / 100 };
  }

  /* ---------------- all together ---------------- */
  // secenek.bugun = [y, m, d] (tests); returns { tutarKurus, para, tarih, isletme, kdvKurus, kategori, guven:{...}, bos }
  function ayikla(metin, secenek) {
    const sat = satirlar(metin), s = secenek || {};
    const r = { tutarKurus: null, para: "", tarih: "", tarihBelirsiz: false, isletme: "", kdvKurus: null, kategori: "", guven: {}, adaylar: [], iade: false, bos: true };
    if (!sat.length || (metin || "").replace(/\s/g, "").length < 6) return r;
    const t = toplamBul(sat);
    if (t && t.guven >= 0.3) { r.tutarKurus = t.kurus; r.guven.tutar = t.guven; r.adaylar = t.adaylar; }
    // a refund slip: the amount is never suggested (the user enters it by hand as a refund) (F-28)
    if (t && t.iade && r.tutarKurus != null) { r.iade = true; r.guven.tutar = Math.min(r.guven.tutar, 0.2); }
    const toplamSatiri = t && t.kaynak === "toplam" ? sat.find(x => satirTutarlari(x).some(y => y.kurus === t.kurus) && TOPLAM_NORMAL.test(katla(x))) : "";
    const p = paraBul(sat.join("\n"), toplamSatiri);
    if (p) { r.para = p.kod; r.guven.para = p.guven; }
    const d = tarihBul(sat, s.bugun);
    if (d) { r.tarih = d.iso; r.guven.tarih = d.guven; r.tarihBelirsiz = !!d.belirsiz; }
    const i = isletmeBul(sat);
    if (i) { r.isletme = i.ad; r.guven.isletme = i.guven; }
    const v = kdvBul(sat, r.tutarKurus);
    if (v) { r.kdvKurus = v.kurus; r.guven.kdv = v.guven; }
    const c = kategoriBul(r.isletme, sat);
    if (c) { r.kategori = c.kategori; r.guven.kategori = c.guven; }
    r.bos = r.tutarKurus == null && !r.tarih && !r.isletme;
    return r;
  }

  // whole kuruş → text for a message or the description ("12,34"); integer arithmetic only
  function kurusMetni(kurus, ondalik) {
    const k = Math.round(Math.abs(kurus)), tam = Math.floor(k / 100), kes = String(k % 100).padStart(2, "0");
    return String(tam).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (ondalik || ",") + kes;
  }

  const API = { ayikla, tutarKurus, satirTutarlari, toplamBul, kdvBul, paraBul, tarihBul, isletmeBul, kategoriBul, kurusMetni, katla, KATEGORI_SOZLUGU };
  g.KJOcrAyikla = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : window);
