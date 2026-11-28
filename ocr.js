/* Yachting Jurnal — "Fişi oku (otomatik doldur)": reads a receipt photo ON THIS DEVICE and writes SUGGESTIONS into the entry form.
   Engine: Tesseract.js 5.1.1 (Apache-2.0), its WebAssembly core and the Turkish + English language data, all as local files in
   ocr/ (no CDN, nothing is sent anywhere: the photo never leaves the device). The engine is loaded only when the user taps the
   button (the service worker keeps the files in their own cache "ocr-model-1", see sw.js), so people who never read a receipt
   download nothing extra. The text → fields rules are in ocr-ayikla.js (pure, tested in node).
   Rules: nothing is ever saved from here (the user checks the form and taps Save); a field that already holds the user's own
   value is not overwritten; suggestions are marked (dashed outline) until the user touches the field; an unreadable receipt
   leaves the form empty; a failing engine never blocks the normal way (typing by hand). */
"use strict";
(function (g) {
  const K = g.KJ, A = g.KJOcrAyikla;
  if (!K || !A) throw new Error("ocr.js: hesap.js ve ocr-ayikla.js önce yüklenmeli");
  const t = (s, v) => K.t(s, v);
  const BASE = (() => { try { return new URL("ocr/", document.currentScript.src).href; } catch (e) { return "ocr/"; } })();
  const MODEL_MB = 9;
  // the cache the service worker keeps the engine in (sw.js: the same name; a new engine version gets a new name and the old one is deleted)
  const ONBELLEK = "ocr-model-1";
  const DOSYALAR = ["tesseract.min.js", "worker.min.js", "core/tesseract-core-simd-lstm.wasm.js", "lang/tur.traineddata.gz", "lang/eng.traineddata.gz"];
  const metaOrtam = () => { try { const m = document.querySelector('meta[name="kj-ortam"]'); return m ? m.content : ""; } catch (e) { return ""; } };
  const OLCUM = "kj-ocr-olcum";
  const GUVEN_ESIGI = 0.6;   // an amount read with less confidence is NOT written into the form (CT-O3, CT-O4): only shown in the status line
  let sonOneri = null, calisiyor = false;

  /* ---------------- style (a dashed outline marks a suggestion) ---------------- */
  try {
    const st = document.createElement("style");
    st.textContent = ".ocr-oneri{outline:2px dashed var(--accent);outline-offset:1px;background-image:linear-gradient(var(--accent-soft),var(--accent-soft))!important}" +
      "#ocrDurum{font-size:12.5px;color:var(--muted);margin-top:6px}#ocrDurum details{margin-top:4px}#ocrDurum pre{white-space:pre-wrap;max-height:160px;overflow:auto;font-size:11.5px;background:var(--sunk);border-radius:8px;padding:8px;margin:4px 0}" +
      "#ocrDurum progress{width:100%;height:8px}#ocrDurum .ok{color:var(--ok)}#ocrDurum .uyari{color:var(--danger);font-weight:600}";
    document.head.appendChild(st);
  } catch (e) { /* no page (node) */ }

  const dugmeHTML = esc => '<button type="button" class="btn" id="ocrBtn">' + esc(t("Fişi oku (otomatik doldur)")) + '</button>';

  /* ---------------- local measure (counts only; no amounts, no text, nothing leaves the device) ---------------- */
  const ALANLAR = ["tutar", "tarih", "isletme", "kategori"];
  function olcumOku() { try { return JSON.parse(localStorage.getItem(OLCUM)) || { n: 0 }; } catch (e) { return { n: 0 }; } }
  function olcumYaz(o) { try { localStorage.setItem(OLCUM, JSON.stringify(o)); } catch (e) { /* private window: no measure */ } }
  function olcumMetni() {
    const o = olcumOku(); if (!o.n) return "";
    const f = a => { const x = o[a]; return x && x[1] ? x[0] + "/" + x[1] : "–"; };
    return t("Ölçüm (bu cihaz): {n} fiş; değiştirilmeden kaydedilen öneriler: tutar {tutar}, tarih {tarih}, işyeri {isletme}, kategori {kategori}", { n: o.n, tutar: f("tutar"), tarih: f("tarih"), isletme: f("isletme"), kategori: f("kategori") });
  }
  // At Save the values are noted (nothing is counted yet); the page calls KJOcr.kaydedildi() only when the entry was really saved, so a
  // refused Save (wrong amount, closed month ...) does not count (CT-O8). For every field filled by a suggestion: left as it was?
  document.addEventListener("submit", e => {
    try {
      if (!sonOneri || !sonOneri.alanlar || !e.target || e.target.id !== "form") return;
      if (e.target !== sonOneri.form) { sonOneri = null; return; }   // another form than the one that was read (CT-O12): nothing is counted
      sonOneri.anlik = {};
      Object.keys(sonOneri.alanlar).forEach(a => { const el = document.getElementById(sonOneri.alanlar[a].id); if (el) sonOneri.anlik[a] = el.value === sonOneri.alanlar[a].deger; });
    } catch (err) { /* the measure never blocks saving */ }
  }, true);
  function kaydedildi() {
    try {
      if (!sonOneri || !sonOneri.anlik) return;
      const o = olcumOku(); o.n = (o.n || 0) + 1;
      Object.keys(sonOneri.anlik).forEach(a => { const x = o[a] || [0, 0]; x[1]++; if (sonOneri.anlik[a]) x[0]++; o[a] = x; });
      olcumYaz(o); sonOneri = null;
    } catch (err) { /* ignore */ }
  }
  // touching a suggested field removes its mark
  document.addEventListener("input", e => { const el = e.target; if (el && el.classList && el.classList.contains("ocr-oneri")) el.classList.remove("ocr-oneri"); });
  document.addEventListener("change", e => { const el = e.target; if (el && el.classList && el.classList.contains("ocr-oneri")) el.classList.remove("ocr-oneri"); });

  /* ---------------- picture → clean grey picture (grey, contrast stretched) ---------------- */
  async function hazirla(blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob); }
    catch (e) { bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(blob); im.onload = () => res(im); im.onerror = () => rej(new Error("dec")); im.src = u; }); }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, 2000 / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data, hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) { const y = (p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8; p[i] = y; hist[y]++; }
    const n = c.width * c.height; let lo = 0, hi = 255, a = 0;
    for (; lo < 255; lo++) { a += hist[lo]; if (a > n * 0.02) break; }
    a = 0; for (; hi > 0; hi--) { a += hist[hi]; if (a > n * 0.02) break; }
    const aralik = Math.max(40, hi - lo);
    for (let i = 0; i < p.length; i += 4) { let y = Math.round((p[i] - lo) * 255 / aralik); y = y < 0 ? 0 : y > 255 ? 255 : y; p[i] = p[i + 1] = p[i + 2] = y; p[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    return c;
  }

  /* ---------------- engine ---------------- */
  function motorYukle() {
    if (g.Tesseract) return Promise.resolve(g.Tesseract);
    return new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = BASE + "tesseract.min.js";
      s.onload = () => g.Tesseract ? res(g.Tesseract) : rej(new Error("motor")); s.onerror = () => rej(new Error("motor")); document.head.appendChild(s);
    });
  }
  // WebAssembly SIMD present? (the engine core needs it: iOS 16.4+, current Chrome). A tiny module that uses a SIMD instruction.
  const simdVar = () => { try { return !!g.WebAssembly && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } };
  const ZAMAN_ASIMI = 50000;
  // The reading never waits for ever (CT-O11): if the engine cannot start (a page policy that forbids WebAssembly, an old device) or hangs,
  // after the time limit the worker is closed and the caller shows "could not be read" and unlocks the button.
  function metinOku(tuval, ilerle, sinir) {
    let w = null, bitti = false, zamanlayici;
    const kapat = () => { const x = w; w = null; if (x) { try { x.terminate(); } catch (e) { /* closed */ } } };
    const is = (async () => {
      const T = await motorYukle();
      const wp = T.createWorker(["tur", "eng"], 1, {
      workerBlobURL: false, workerPath: BASE + "worker.min.js", corePath: BASE + "core/tesseract-core-simd-lstm.wasm.js", langPath: BASE + "lang", cacheMethod: "none",
      logger: m => { if (m && typeof m.progress === "number") ilerle(m.status, m.progress); },
      });
      const zaman = new Promise((_, red) => { zamanlayici = setTimeout(() => red(new Error("zaman aşımı")), sinir || ZAMAN_ASIMI); });
      try { w = await Promise.race([wp, zaman]); }
      catch (e) { wp.then(x => { try { x.terminate(); } catch (y) { /* closed */ } }, () => { }); throw e; }   // a late worker is closed too
      if (bitti) { kapat(); throw new Error("iptal"); }
      let metin = "";
      for (const psm of ["6", "4"]) {                       // one uniform block first; columns as the second try, only if no amount was found
        await Promise.race([w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1" }), zaman]);
        const r = await Promise.race([w.recognize(tuval), zaman]);
        const m = (r && r.data && r.data.text) || "";
        if (m.length > metin.length) metin = m;
        const a = A.ayikla(m);
        if (a.tutarKurus != null && (a.guven.tutar || 0) >= 0.6) { metin = m; break; }
      }
      return metin;
    })();
    return is.finally(() => { bitti = true; clearTimeout(zamanlayici); kapat(); });
  }

  /* ---------------- form ---------------- */
  const $ = id => document.getElementById(id);
  const bugunISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  function isaretle(el) { if (el) el.classList.add("ocr-oneri"); }

  // writes the suggestions into the open form; returns the list of the field names that were filled
  function forma(r, ctx) {
    const yazilan = [], alanlar = {}; sonOneri = null;
    const kaydet = (ad, id, etiket) => { const el = $(id); if (!el) return; alanlar[ad] = { id, deger: el.value }; isaretle(el); yazilan.push(etiket); };
    const bos = el => el && !el.value.trim();
    const eskiOneri = el => el && el.classList.contains("ocr-oneri");
    const doldurabilir = el => el && (bos(el) || eskiOneri(el));
    // amount: from whole kuruş, valid by the book's rule, and only when the reading is sure enough (CT-O3, CT-O4)
    const fa = $("f_amount");
    if (r.tutarKurus != null && (r.guven.tutar || 0) >= GUVEN_ESIGI && K.tutarGecerli({ amount: r.tutarKurus / 100 }) && doldurabilir(fa)) {
      fa.value = ctx.boxText(r.tutarKurus / 100, 2); fa.dispatchEvent(new Event("input", { bubbles: true })); kaydet("tutar", "f_amount", t("Tutar"));
      // The receipt is in another currency than the book (F-29): the amount is the foreign amount, so the currency box is set to it and the
      // existing foreign-currency way takes over. The RATE is typed by the user: it is cleared here, nothing is guessed. The book's currency never changes.
      const fc = $("f_cur");
      if (fc && r.para && (r.guven.para || 0) >= 0.6 && K.PARALAR.includes(r.para) && r.para !== K.paraKodu() && fc.value !== r.para) {
        fc.value = r.para; fc.dispatchEvent(new Event("change", { bubbles: true })); isaretle(fc); yazilan.push(t("Para birimi"));
        const fr = $("f_rate"); if (fr) { fr.value = ""; fr.dispatchEvent(new Event("input", { bubbles: true })); }
        sonOneri = { yabanciPara: true };
      }
    }
    // The one exception to "a filled field is not overwritten": the date box shows TODAY by default, so today's date counts as empty.
    const fd = $("f_date");
    if (fd && r.tarih && (fd.value === "" || fd.value === bugunISO() || eskiOneri(fd))) { fd.value = r.tarih; kaydet("tarih", "f_date", t("Tarih")); }
    const fv = $("f_vendor");
    if (fv && r.isletme && doldurabilir(fv)) { fv.value = r.isletme; kaydet("isletme", "f_vendor", t("İşyeri")); }
    const fcat = $("f_cat");
    if (fcat && r.kategori && doldurabilir(fcat)) { fcat.value = K.catLabel(r.kategori); ctx.kategoriElle(); kaydet("kategori", "f_cat", t("Kategori")); }
    const fde = $("f_desc");
    if (fde && r.kdvKurus != null && bos(fde)) { fde.value = t("KDV: {tutar}", { tutar: A.kurusMetni(r.kdvKurus, (K.SEP && K.SEP.d) || ",") }); isaretle(fde); yazilan.push(t("Açıklama")); }
    sonOneri = { alanlar, form: $("form"), yabanciPara: !!(sonOneri && sonOneri.yabanciPara) };
    return yazilan;
  }

  function durum(parca) {
    const kutu = $("ocrDurum"); if (!kutu) return null;
    kutu.textContent = "";
    if (parca) kutu.appendChild(parca);
    return kutu;
  }
  const satir = (metin, sinif) => { const d = document.createElement("div"); d.textContent = metin; if (sinif) d.className = sinif; return d; };

  // ctx = { blob, boxText(n, dec), kategoriElle() }
  async function baslat(ctx) {
    if (calisiyor) return;
    if (K.ozellikIste && !K.ozellikIste("fis_okuma", t("Fişi oku (otomatik doldur)"))) return;
    if (!ctx || !ctx.blob) return;
    if (!simdVar()) { durum(satir(t("Bu cihaz fiş okumayı desteklemiyor. Formu elle doldurabilirsiniz."))); return; }
    // First use on the phone downloads the engine (all five files must be in the cache; a half download asks again). The Windows
    // program has the files inside itself: nothing is downloaded, nothing is asked (CT-O5).
    if (metaOrtam() === "web") {
      let tam = false;
      try { const c = await caches.open(ONBELLEK); tam = (await Promise.all(DOSYALAR.map(f => c.match(BASE + f)))).every(Boolean); } catch (e) { /* no cache API: ask */ }
      if (!tam && !g.confirm(t("Okuma motoru ilk kullanımda cihaza indirilir (yaklaşık {mb} MB, bir kez). Fotoğrafınız cihazdan çıkmaz. Devam edilsin mi?", { mb: MODEL_MB }))) return;
    }
    calisiyor = true;
    const formEl = $("form");                                   // the form this reading belongs to (CT-O8)
    const btn = $("ocrBtn"); if (btn) btn.disabled = true;
    const kap = document.createElement("div"), yazi = satir(t("Okuma motoru hazırlanıyor…")), bar = document.createElement("progress");
    bar.max = 100; bar.value = 0; kap.appendChild(yazi); kap.appendChild(bar);
    const kutu = durum(kap); if (kutu) kutu.setAttribute("role", "status");
    try {
      const tuval = await hazirla(ctx.blob);
      const metin = await metinOku(tuval, (durumAd, ilerleme) => {
        const yuzde = Math.round(ilerleme * 100);
        yazi.textContent = durumAd === "recognizing text" ? t("Fiş okunuyor… {n}%", { n: yuzde }) : t("Okuma motoru hazırlanıyor…");
        if (durumAd === "recognizing text") bar.value = yuzde;
      }, ctx.zamanAsimi);
      if (!formEl || $("form") !== formEl) return;              // the form was closed (or another one opened) meanwhile: write nothing
      const r = A.ayikla(metin), emin = r.tutarKurus != null && (r.guven.tutar || 0) >= GUVEN_ESIGI;
      const sonuc = document.createElement("div");
      if (r.bos) sonuc.appendChild(satir(t("Fiş okunamadı. Formu elle doldurabilirsiniz.")));
      else {
        const yazilan = forma(r, ctx);
        sonuc.appendChild(satir(yazilan.length ? t("Öneriler forma yazıldı: {alanlar}. Her alanı kontrol edin; kayıt yalnızca siz Kaydet deyince oluşur.", { alanlar: yazilan.join(", ") }) : t("Okunan değerler formdaki dolu alanların yerine yazılmadı."), yazilan.length ? "ok" : ""));
      }
      const ayrac = (K.SEP && K.SEP.d) || ",";
      if (r.iade) sonuc.appendChild(satir(t("İade fişi gibi görünüyor ({tutar}); tutar forma yazılmadı. Kaydı İade olarak elle girin.", { tutar: A.kurusMetni(r.tutarKurus, ayrac) }), "uyari"));
      else if (!r.bos && r.tutarKurus != null && !emin) {
        const ad = (r.adaylar && r.adaylar.length ? r.adaylar : [r.tutarKurus]).slice(0, 3).map(k => A.kurusMetni(k, ayrac)).join(" / ");
        sonuc.appendChild(satir(t("Okunan tutar emin değil ({tutar}); forma yazılmadı. Tutarı fişe bakarak elle yazın.", { tutar: ad }), "uyari"));
      }
      if (emin && !r.iade && $("f_amount") && $("f_amount").classList.contains("ocr-oneri")) {
        sonuc.appendChild(satir(t("Okunan tutar: {tutar}", { tutar: A.kurusMetni(r.tutarKurus, ayrac) + (r.para && r.para !== K.paraKodu() && sonOneri && sonOneri.yabanciPara ? " " + r.para : "") })));
        if (sonOneri && sonOneri.yabanciPara)
          sonuc.appendChild(satir(t("Fişte {para} görünüyor, defterin para birimi {defter}. Tutar {para} olarak yazıldı ve para birimi kutusu {para} yapıldı. Kur kutusunu kontrol edin; fiş tarihindeki kuru yazın.", { para: r.para, defter: K.paraKodu() }), "uyari"));
      } else if (!r.bos && r.para && (r.guven.para || 0) >= 0.6 && K.PARALAR.includes(r.para) && r.para !== K.paraKodu())
        sonuc.appendChild(satir(t("Fişte {para} görünüyor, defterin para birimi {defter}. Para birimi kutusunu ve kuru kendiniz ayarlayın.", { para: r.para, defter: K.paraKodu() }), "uyari"));
      if (r.tarih && r.tarihBelirsiz && $("f_date") && $("f_date").classList.contains("ocr-oneri"))
        sonuc.appendChild(satir(t("Tarih gün.ay sırasıyla okundu ({tarih}); gün ile ay ters olabilir, kontrol edin.", { tarih: r.tarih.split("-").reverse().join(".") }), "uyari"));
      const ol = olcumMetni(); if (ol) sonuc.appendChild(satir(ol));
      const det = document.createElement("details"), sm = document.createElement("summary"), pre = document.createElement("pre"), kop = document.createElement("button");
      sm.textContent = t("Okunan metni göster"); pre.textContent = metin;
      kop.type = "button"; kop.className = "btn"; kop.textContent = t("Kopyala");
      kop.addEventListener("click", () => { try { navigator.clipboard.writeText(metin); } catch (e) { /* no clipboard */ } });
      det.appendChild(sm); det.appendChild(pre); det.appendChild(kop); sonuc.appendChild(det);
      durum(sonuc);
    } catch (e) {
      try { console.warn("KJOcr:", e && e.message); } catch (x) { /* none */ }
      durum(satir(t("Fiş okunamadı. Formu elle doldurabilirsiniz.")));
    } finally {
      calisiyor = false; const b = $("ocrBtn"); if (b) b.disabled = false;
    }
  }

  g.KJOcr = { dugmeHTML, baslat, kaydedildi, ONBELLEK, DOSYALAR, olcumMetni, hazirla, BASE };
})(typeof window !== "undefined" ? window : globalThis);
