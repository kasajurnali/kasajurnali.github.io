/* Yachting Jurnal — receipts in the reports and the names the receipts get in Google Drive.
   Pure rules (no page, no storage, no money arithmetic): which entries have a receipt photo, the Excel sheet "Fişler"
   (one row per receipt, the picture beside it), the question "Add the receipts to the report?", the file and folder
   names of the Drive layout "Yachting Jurnal / <boat> / <YYYY-MM Month> / Fişler" (drive-duzen.js uses them),
   and the hand-over of a finished report to Drive (senk.js: KJSenk.raporYukle). Used by app.js and the node tests. */
"use strict";
(function (g) {
  const K = g.KJ;
  if (!K) throw new Error("rapor-fis.js: hesap.js önce yüklenmeli");
  const FOTO = /^[a-f0-9]{24,40}$/;
  const AY = /^\d{4}-(0[1-9]|1[0-2])$/;
  const EXCEL_EN_COK = 300;   // receipts with a picture in one Excel file (the Go writer has the same limit, excel_resim.go)
  const ayOf = e => (e.date || "").slice(0, 7);

  // entries that have a receipt photo, in the given months (a list; empty / null = every month); the same filter as the PDF appendix (rapor.js inMonth: valid amount, and here also a valid photo id as there)
  function fisliKayitlar(items, aylar) {
    const ay = Array.isArray(aylar) && aylar.length ? new Set(aylar) : null;
    return (items || []).filter(e => e && typeof e.photo === "string" && FOTO.test(e.photo) && K.tutarGecerli(e) && (!ay || ay.has(ayOf(e)))).sort(K.cmpEntry);
  }

  /* ---------------- names ---------------- */
  // a piece of a file or folder name: letters, digits and . _ ( ) - only; everything else becomes "-"; spaces become "-"
  function guvenliAd(s, en) {
    let x = String(s == null ? "" : s).normalize("NFC").replace(/[^\p{L}\p{N}._() -]/gu, "-").replace(/\s+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
    x = [...x].slice(0, en || 40).join("").replace(/[-.]+$/g, "");
    return x;
  }
  // a folder name (boat names keep their spaces): only what a file system refuses is replaced
  const klasorAdi = (s, yedek) => [...String(s == null ? "" : s).normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim()].slice(0, 80).join("").trim() || yedek || "";
  // the month a receipt belongs to: its date's month, else "tarihsiz"
  const fisAyi = e => K.tarihGecerli && K.tarihGecerli(e.date) && AY.test(ayOf(e)) ? ayOf(e) : "tarihsiz";
  // "2026-11 Kasım" (in the language of the program); "Tarihsiz" for an entry without a valid date
  const ayKlasorAdi = ym => ym === "tarihsiz" ? K.t("Tarihsiz") : ym + " " + K.monthName(+ym.slice(5, 7));
  // YYYY-MM-DD_Merchant_Amount.jpg (a currency code follows the amount when the entry is in another currency than the boat's)
  function fisAdi(e, para) {
    const tarih = K.tarihGecerli && K.tarihGecerli(e.date) ? e.date : "tarihsiz";
    const isyeri = guvenliAd(e.vendor || e.desc || "", 40) || "fis";
    const tutar = (Number.isFinite(+e.amount) ? Math.abs(+e.amount) : 0).toFixed(2);
    const cur = typeof e.para === "string" && /^[A-Za-z]{3}$/.test(e.para) ? e.para.toUpperCase() : "";   // e.para: the currency the entry was saved in (the boat's own when absent)
    return tarih + "_" + isyeri + "_" + tutar + (cur && cur !== (para || "TRY") ? "-" + cur : "") + ".jpg";
  }
  // a short stable hash for Drive appProperties (key + value may not pass 124 bytes)
  function kisaHash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }

  // The plan of the copies in Drive: one item per receipt photo that is in Drive already (uzak: Map of photo id → file).
  // tekneler: [{ id, ad, defter }]. Two receipts of one folder with the same name get "_2", "_3" (stable: the photo id decides the order).
  function fisPlani(tekneler, uzak) {
    const plan = [];
    for (const t of tekneler || []) {
      const d = t.defter || {}, para = K.paraOfSet ? K.paraOfSet(d.ayarlar || {}) : "TRY";
      for (const e of d.kayitlar || []) {
        if (!e || typeof e.photo !== "string" || !FOTO.test(e.photo) || !uzak.has(e.photo)) continue;
        plan.push({ tid: t.id, tad: t.ad, ym: fisAyi(e), foto: e.photo, ad: fisAdi(e, para) });
      }
    }
    plan.sort((a, b) => a.tid < b.tid ? -1 : a.tid > b.tid ? 1 : a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : a.foto < b.foto ? -1 : a.foto > b.foto ? 1 : 0);
    const gor = new Map(), gorFoto = new Set(), out = [];
    for (const p of plan) {
      if (gorFoto.has(p.foto)) continue;   // one photo used by two entries: one copy
      gorFoto.add(p.foto);
      const k = p.tid + "|" + p.ym + "|" + p.ad.toLowerCase(), n = (gor.get(k) || 0) + 1;
      gor.set(k, n);
      out.push(n === 1 ? p : Object.assign({}, p, { ad: p.ad.replace(/\.jpg$/, "_" + n + ".jpg") }));
    }
    return out;
  }
  // the month folder a report goes to: a single month = that month; several months = the newest one
  const raporAyi = aylar => { const l = (aylar || []).filter(a => AY.test(a)).sort(); return l.length ? l[l.length - 1] : ""; };
  // the name of a report file in Drive: the same report (same period, same choice about receipts) replaces the earlier copy
  // tarih: for a CLOSED period the name carries the day, so an earlier report that may have gone to an auditor is never overwritten (Drive keeps old versions only 30 days)
  const raporDriveAdi = (taban, ek, uzanti, tarih) => klasorAdi(taban, "Yachting Jurnal") + (ek ? " (" + K.t("Fiş fotoğrafları") + ")" : "") + (tarih ? " " + tarih : "") + uzanti;

  /* ---------------- the question ---------------- */
  // no answer is preselected: the question is asked every time. n = receipt photos in the chosen period.
  function fisSorusuHTML(n, sinir) {   // sinir: the picture limit of one Excel file on this device (the phone: 150); said before the choice when n is above it (Q-2)
    const { esc, t } = K;
    if (!n) return '<p class="small" id="fisYok" style="margin:12px 0 0">' + esc(t("Seçili dönemde fiş fotoğrafı yok; rapora yalnız yazılı kayıtlar girer.")) + '</p>';
    return '<fieldset class="fisSoru" id="fisSoru" style="border:0;margin:12px 0 0;padding:0"><legend style="font-weight:600;padding:0">' + esc(t("Fişler rapora eklensin mi?")) + '</legend>' +
      '<p class="small" style="margin:4px 0 6px">' + esc(t("Seçili dönemde {n} fiş fotoğrafı var.", { n })) + '</p>' +
      (sinir > 0 && n > sinir ? '<p class="small" id="fisSinir" style="margin:0 0 6px">' + esc(t("Bu cihazda bir Excel dosyasına en çok {sinir} fiş fotoğrafı konur; seçili dönemde {n} var. Excel’e ilk {sinir} fiş girer; kalanlar için PDF raporunu kullanın.", { n, sinir })) + '</p>' : "") +
      '<label class="check"><input type="radio" name="fis" value="1"> <span>' + esc(t("Evet, fiş fotoğrafları da rapora girsin")) + '</span></label>' +
      '<p class="small" id="fisPaylasim" style="margin:2px 0 6px 26px">' + esc(t("Raporu paylaşırsanız fiş fotoğrafları da paylaşılır; fişlerde kişisel bilgi olabilir.")) + '</p>' +
      '<label class="check"><input type="radio" name="fis" value="0"> <span>' + esc(t("Hayır, yalnız yazılı kayıtlar")) + '</span></label></fieldset>';
  }

  /* ---------------- the Excel sheet "Fişler" ---------------- */
  const serial = iso => { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  // sheet spec (like app.js sheetSpec): one row per receipt, the picture in column F; resimler names the photos, the program puts the pictures in.
  // No total, no formula: the sheet only shows. Amounts of the book's currency are numbers; others are written as text.
  function fisSayfasi(items, set, aylar, ad, enCok) {
    enCok = enCok > 0 ? Math.min(enCok, EXCEL_EN_COK) : EXCEL_EN_COK;   // the phone puts fewer pictures into a file than the computer (CT-R14): the rows and the message follow the real limit
    const l = fisliKayitlar(items, aylar);
    if (!l.length) return null;
    const up = s => s.toLocaleUpperCase(K.loc), H = [], resimler = [], satirYuk = [];
    const put = (r, v, st) => H.push({ r, v: v === undefined ? null : v, st: st || "", f: "" });
    const KUTU_GEN = 230, KUTU_YUK = 180, SATIR_PT = 141;
    const donem = aylar && aylar.length ? (aylar.length > 1 ? K.monthLabel(aylar[0]) + " – " + K.monthLabel(aylar[aylar.length - 1]) : K.monthLabel(aylar[0])) : "";
    put("A1", (set && set.name) || "Yachting Jurnal", "baslik");
    put("A2", K.t("Fiş fotoğrafları") + (donem ? " · " + donem : ""), "etiket");
    // the headers are not the ones of the month sheets ("Tarih", "Firma"): an older version that imports this file must not read the receipts sheet as entries (CT-R9)
    [K.t("EK {n}", { n: "" }).trim(), K.t("Fiş tarihi"), K.t("İşyeri"), K.t("Açıklama"), K.t("Tutar") + (K.paraSym ? " (" + K.paraSym() + ")" : ""), K.t("Fotoğraf")].map(up).forEach((x, i) => put("ABCDEF"[i] + "4", x, i === 4 ? "basliksatirsag" : "basliksatir"));
    const goster = l.slice(0, enCok);
    goster.forEach((e, i) => {
      const r = 5 + i, gir = K.hesabaGirer(e, set);
      put("A" + r, K.t("EK {n}", { n: i + 1 }), "metin"); put("B" + r, K.tarihGecerli(e.date) ? serial(e.date) : null, "fistarih");
      put("C" + r, e.vendor || "", "metin"); put("D" + r, e.desc || "", "metin");
      if (gir && Number.isFinite(+e.amount)) put("E" + r, Math.abs(+e.amount), "fispara"); else put("E" + r, K.fx(e.amount, K.kayitParasi(e)), "metin");
      put("F" + r, null, "metin");
      resimler.push({ r: "F" + r, foto: e.photo, kutuGen: KUTU_GEN, kutuYuk: KUTU_YUK });
      satirYuk.push({ satir: r, pt: SATIR_PT });
    });
    if (l.length > goster.length) put("A" + (5 + goster.length + 1), K.t("{n} fiş daha var; bir Excel dosyasına en çok {sinir} fiş fotoğrafı konur. Kalanlar için PDF raporu kullanın.", { n: l.length - goster.length, sinir: enCok }), "etiket");
    // sig: where the program writes "n receipts did not fit" when it cannot put every picture in (size limit of the file, an unreadable photo)
    return { ad: ad || K.t("Fişler"), sutunlar: [8, 12, 26, 28, 14, 34], hucreler: H, dondur: 5, resimler, satirYuk,
      sig: { r: "A" + (5 + goster.length + 2), metin: K.t("{n} fiş fotoğrafı bu dosyaya sığmadı. Kalanlar için PDF raporu kullanın.") } };
  }

  /* ---------------- a finished report goes to Drive ---------------- */
  // o: { tur: "pdf" | "xlsx", aylar, ad (the name in Drive), blob | yol (+ api), tekne, defterAdi, fisli }
  // → { durum: "yuklendi" | "kuyrukta" | "kapali" | "hata", yol } ; never throws: the report is already on this device
  async function driveaGonder(o) {
    const S = g.KJSenk;
    if (!S || typeof S.raporYukle !== "function") return { durum: "kapali" };
    try {
      let blob = o.blob;
      if (!blob && o.yol && typeof o.api === "function") blob = await (await o.api("api/rapor-dosya?yol=" + encodeURIComponent(o.yol), { raw: true })).blob();
      if (!blob) return { durum: "hata" };
      return await S.raporYukle({ tid: o.tekne || "ana", defterAdi: o.defterAdi || "", ym: raporAyi(o.aylar), ad: o.ad, tur: o.tur === "pdf" ? "pdf" : "xlsx", blob });
    } catch (e) { return { durum: "hata", mesaj: e && e.message }; }
  }
  // the line shown under a finished report
  function driveSatiri(d) {
    if (!d || !d.yol) return "";
    if (d.durum === "yuklendi") return K.t("Rapor Google Drive’a da kaydedildi: {yol}", { yol: d.yol });
    if (d.durum === "kuyrukta") return K.t("Rapor, bağlantı gelince Google Drive’a yüklenecek: {yol}", { yol: d.yol });
    return "";
  }

  Object.assign(K, { fisliKayitlar, fisGuvenliAd: guvenliAd, fisKlasorAdi: klasorAdi, fisAyi, fisAyKlasorAdi: ayKlasorAdi, fisAdi, fisKisaHash: kisaHash, fisPlani, fisRaporAyi: raporAyi, fisRaporDriveAdi: raporDriveAdi,
    fisSorusuHTML, fisSayfasi, fisDriveaGonder: driveaGonder, fisDriveSatiri: driveSatiri, FIS_EXCEL_EN_COK: EXCEL_EN_COK, FIS_EXCEL_EN_COK_TELEFON: 150 });
})(typeof window !== "undefined" ? window : globalThis);
