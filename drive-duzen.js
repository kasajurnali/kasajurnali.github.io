/* Yachting Jurnal — the folder layout in the user's Google Drive:
     Yachting Jurnal / <boat name> / <YYYY-MM Month> / Fişler / YYYY-MM-DD_Merchant_Amount.jpg
     Yachting Jurnal / <boat name> / <YYYY-MM Month> / <the PDF and Excel reports of that month>
   The working copies the devices synchronise from (kasa-verisi.json, foto-<id>.jpg in "Kasa Jurnali") do not move; this is
   a readable copy for the user. Rules: a receipt copy is made when the receipt is in Drive, and moved (never copied again)
   when its date or boat changes; NOTHING here is ever deleted. Old receipt photos stay where they are. The app asks only
   for "drive.file", so it sees only what it created itself: folders and files are found by appProperties it wrote.
   A report that cannot be sent (no internet) waits in a queue (IndexedDB; memory when that is unavailable) and goes with a
   later synchronisation. The Drive calls come in as `ic` (senk.js), which lets the tests run everything against a mock. */
"use strict";
(function (g) {
  const KLASOR_TUR = "application/vnd.google-apps.folder", KOK_AD = "Yachting Jurnal";
  const MIME = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  const enc = encodeURIComponent;
  const tirnak = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const AP = (k, v) => "appProperties has { key='" + k + "' and value='" + tirnak(v) + "' }";

  /* ---------------- the queue of reports waiting for Drive ---------------- */
  function kuyrukYap() {
    const bellek = []; let db = null, dbDene = false;
    const idb = () => {
      if (db || dbDene) return db;
      dbDene = true;
      try {
        if (typeof indexedDB === "undefined") return null;
        db = new Promise((res, rej) => { const r = indexedDB.open("kj-rapor-kuyrugu", 1); r.onupgradeneeded = () => r.result.createObjectStore("k", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        db.catch(() => { db = null; });
      } catch (e) { db = null; }
      return db;
    };
    const istek = async (mod, f) => { const p = idb(); if (!p) throw new Error("yok"); const d = await p; return new Promise((res, rej) => { const tx = d.transaction("k", mod), o = f(tx.objectStore("k")); tx.oncomplete = () => res(o && o.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); };
    return {
      async ekle(o) { try { await istek("readwrite", s => s.put(o)); } catch (e) { bellek.push(o); } },
      async hepsi() { let l = []; try { l = (await istek("readonly", s => s.getAll())) || []; } catch (e) { } return l.concat(bellek).sort((a, b) => a.zaman - b.zaman); },
      async sil(id) { try { await istek("readwrite", s => s.delete(id)); } catch (e) { } const i = bellek.findIndex(x => x.id === id); if (i >= 0) bellek.splice(i, 1); },
      async guncelle(o) { const i = bellek.findIndex(x => x.id === o.id); if (i >= 0) bellek[i] = o; else { try { await istek("readwrite", s => s.put(o)); } catch (e) { } } }
    };
  }

  function olustur(ic) {
    const K = g.KJ, onb = new Map(), kuyruk = (ic && ic.kuyruk) || kuyrukYap();
    // One thing at a time (CT-R1): the synchronisation and a report being handed over share the folder cache and look for the same
    // folders and files; run side by side they would make two of them. Every public operation goes through this chain.
    let zincir = Promise.resolve();
    const kilit = f => { const p = zincir.then(f, f); zincir = p.catch(() => { }); return p; };
    async function liste(filtre, alanlar) {
      const l = []; let sayfa = "";
      do {
        const r = await ic.gjson("GET", "drive/v3/files?spaces=drive&pageSize=1000&orderBy=createdTime&q=" + enc(filtre + " and trashed=false") + "&fields=" + enc("nextPageToken,files(" + alanlar + ")") + (sayfa ? "&pageToken=" + enc(sayfa) : ""));
        l.push(...(r.files || [])); sayfa = r.nextPageToken || "";
      } while (sayfa);
      return l;
    }
    // a folder found by the property the program wrote on it (the oldest one when two devices made one at the same moment), else made
    async function klasorBul(anahtar, deger, ad, ust) {
      const k = anahtar + "=" + deger;
      if (onb.has(k)) return onb.get(k);
      const l = await liste(AP(anahtar, deger) + " and mimeType='" + KLASOR_TUR + "'", "id");
      let id = l.length ? l[0].id : null;
      if (!id) {
        const meta = { name: ad, mimeType: KLASOR_TUR, appProperties: { [anahtar]: deger } };
        if (ust) meta.parents = [ust];
        id = (await (await ic.istek("POST", "drive/v3/files?fields=id", JSON.stringify(meta), "application/json")).json()).id;
      }
      onb.set(k, id); return id;
    }
    const kok = () => klasorBul("kjKok", "1", KOK_AD, null);
    const tekneK = async (tid, tad) => klasorBul("kjTekne", tid, K.fisKlasorAdi(tad, K.t("Tekne")), await kok());
    const ayK = async (tid, tad, ym) => klasorBul("kjAy2", tid + "|" + ym, K.fisAyKlasorAdi(ym), await tekneK(tid, tad));
    const fislerK = async (tid, tad, ym) => klasorBul("kjFisler2", tid + "|" + ym, K.t("Fişler"), await ayK(tid, tad, ym));
    // "Yachting Jurnal / <boat> / <month>" for the screen
    const yolMetni = (tad, ym) => KOK_AD + " / " + K.fisKlasorAdi(tad, K.t("Tekne")) + " / " + K.fisAyKlasorAdi(ym);

    // Copies the receipt photos into the layout. tekneler: [{ id, ad, defter }]; uzak: Map photo id → Drive file of the working copy.
    // A copy that is already in the right folder is left alone; one whose date/boat changed is moved; a renamed entry renames the copy.
    // At most `maks` new copies per call (a large first run goes on with the next synchronisation). Nothing is deleted.
    // "Drive is full" is what Google names in the error's reason (CT-R13); a rate limit (userRateLimitExceeded ...) is not a full Drive, and the words of the message are not trusted
    const kotaMi = e => !!e && e.status === 403 && e.neden === "storageQuotaExceeded";
    function fisleriYaz(tekneler, uzak, maks) { return kilit(() => fisleriYazIc(tekneler, uzak, maks)); }
    async function fisleriYazIc(tekneler, uzak, maks) {
      onb.clear(); maks = maks || 60;
      const plan = K.fisPlani(tekneler, uzak);
      if (!plan.length) return { yeni: 0, tasinan: 0, kalan: 0, hatali: 0, kota: false };
      const var_ = new Map();
      for (const f of await liste(AP("kjFis2", "1"), "id,name,parents,appProperties")) { const p = f.appProperties || {}; if (p.kjFoto && !var_.has(p.kjFoto)) var_.set(p.kjFoto, f); }
      let yeni = 0, tasinan = 0, kalan = 0, hatali = 0, kota = false;
      for (const p of plan) {
        const f = var_.get(p.foto), anahtar = p.tid + "|" + p.ym, hash = K.fisKisaHash(p.ad);
        try {
          if (!f) {
            if (yeni >= maks) { kalan++; continue; }
            await ic.istek("POST", "drive/v3/files/" + enc(uzak.get(p.foto).id) + "/copy?fields=id", JSON.stringify({ name: p.ad, parents: [await fislerK(p.tid, p.tad, p.ym)], appProperties: { kjFis2: "1", kjFoto: p.foto, kjAy2: anahtar, kjAd: hash } }), "application/json"); yeni++;
          } else if ((f.appProperties || {}).kjAy2 !== anahtar) {
            await ic.istek("PATCH", "drive/v3/files/" + enc(f.id) + "?addParents=" + enc(await fislerK(p.tid, p.tad, p.ym)) + "&removeParents=" + enc((f.parents || []).join(",")) + "&fields=id", JSON.stringify({ name: p.ad, appProperties: { kjAy2: anahtar, kjAd: hash } }), "application/json"); tasinan++;
          } else if ((f.appProperties || {}).kjAd !== hash) {
            await ic.istek("PATCH", "drive/v3/files/" + enc(f.id) + "?fields=id", JSON.stringify({ name: p.ad, appProperties: { kjAd: hash } }), "application/json"); tasinan++;
          }
        } catch (e) {
          // one receipt that Drive refuses (a folder the user moved out of sight, a deleted source) never stops the others (CT-R2);
          // no permission, no connection: the whole pass stops (the caller handles it); storage full: stop quietly and say so (CT-R4)
          if (e && (e.kod === "izin" || e.kod === "cevrimdisi" || e.kod === "bagli-degil" || e.kod === "baglanti-koptu" || e.kod === "zamanasimi" || e.name === "AbortError")) throw e;   // CT-K3-7: a cut request (no answer) stops the pass at the first receipt; the next pass goes on
          if (kotaMi(e)) { kota = true; break; }
          hatali++;
        }
      }
      return { yeni, tasinan, kalan, hatali, kota };
    }

    // one report into its month folder; the same report (same name) replaces the earlier copy, Drive keeps the older version in its history
    const raporYaz = r => kilit(() => raporYazIc(r));
    async function raporYazIc(r) {
      onb.clear();
      const ay = await ayK(r.tid, r.tad, r.ym), mime = MIME[r.tur] || MIME.xlsx;
      const anahtar = r.tid + "|" + r.ym + "|" + K.fisKisaHash(r.ad);
      const l = await liste(AP("kjRapor", anahtar) + " and '" + tirnak(ay) + "' in parents", "id");
      if (l.length) { await ic.istek("PATCH", "upload/drive/v3/files/" + enc(l[0].id) + "?uploadType=media&fields=id", r.blob, mime); return; }
      const mp = ic.cokParca({ name: r.ad, parents: [ay], appProperties: { kjRapor: anahtar } }, r.blob, mime);
      await ic.istek("POST", "upload/drive/v3/files?uploadType=multipart&fields=id", mp.govde, mp.tur);
    }
    // The queue: tries every waiting report; a network or permission problem keeps it (and stops), a refusal that will not
    // change (Drive answers 4xx other than 401/403/429) is dropped after 5 tries. Returns how many are still waiting.
    const KUYRUK_OMRU = 30 * 86400000;   // a report that could not be sent for 30 days is dropped from the queue (it is still on this device)
    const kuyrugaBak = tadBul => kilit(() => kuyrugaBakIc(tadBul));
    // Waiting time after a failed try (CT-R12): 30 s, 1 min, 2 min ... at most 6 hours, per report. A report that Drive keeps refusing
    // (403 because Drive is full, say) is therefore tried a few times a day, not every half minute for 30 days.
    const bekle = deneme => Math.min(30000 * Math.pow(2, Math.max(0, deneme - 1)), 6 * 3600000);
    let sonraki = 0;   // when the earliest waiting report may be tried again (0 = nothing is waiting for a time)
    async function kuyrugaBakIc(tadBul) {
      let kalan = 0; sonraki = 0;
      const l = await kuyruk.hepsi(), simdi = ic.simdi || Date.now;
      for (let i = 0; i < l.length; i++) {
        const o = l[i], an = simdi();
        if (an - (o.zaman || 0) > KUYRUK_OMRU) { await kuyruk.sil(o.id); continue; }
        if ((o.sonraki || 0) > an) { kalan++; sonraki = sonraki ? Math.min(sonraki, o.sonraki) : o.sonraki; continue; }   // not yet: it failed a moment ago
        try { await raporYazIc(Object.assign({}, o, { tad: tadBul ? tadBul(o) : o.defterAdi })); await kuyruk.sil(o.id); }
        catch (e) {
          // no connection / no permission: the whole queue waits for the connection (no backoff, the synchronisation itself reports it)
          const asim = !!e && (e.kod === "zamanasimi" || e.name === "AbortError");   // CT-K3-1: cut by the time-out: this report waits with the growing time below, the others go on
          if (!asim && (!e || e.kod === "cevrimdisi" || e.kod === "izin" || e.kod === "bagli-degil" || e.kod === "baglanti-koptu" || !e.status)) { kalan += l.length - i; break; }
          const kalici = !asim && e.status >= 400 && e.status < 500 && ![401, 403, 408, 429].includes(e.status);
          const deneme = (o.deneme || 0) + 1;
          if (kalici && deneme >= 5) { await kuyruk.sil(o.id); continue; }
          const yeniSon = an + bekle(deneme);
          await kuyruk.guncelle(Object.assign({}, o, { deneme, sonraki: yeniSon }));
          kalan++; sonraki = sonraki ? Math.min(sonraki, yeniSon) : yeniSon;
        }
      }
      return kalan;
    }
    const sirala = o => kuyruk.ekle(Object.assign({ id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), zaman: Date.now(), deneme: 0 }, o));
    return { fisleriYaz, raporYaz, kuyrugaBak, sonKuyrukZamani: () => sonraki, bekle, kuyrukTemizle: async () => { for (const o of await kuyruk.hepsi()) await kuyruk.sil(o.id); }, kuyrugaAl: sirala, yolMetni, kuyruk };
  }

  g.KJDriveDuzen = { olustur, kuyrukYap, KOK_AD };
})(typeof window !== "undefined" ? window : globalThis);
