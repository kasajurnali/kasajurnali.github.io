/* Yachting Jurnal — Google Drive synchronisation. The same engine runs in the computer program and on the iPhone.
   The book is kept as one file (kasa-verisi.json) and the receipt photos as foto-<id>.jpg in the program's own
   "Kasa Jurnali" folder in the user's Google Drive. The program asks only for "drive.file": it sees the files it
   created itself and nothing else in Drive. (Google does not accept "drive.appdata" for this sign-in method.)
   Every device keeps its full copy; a synchronisation merges this device's copy with the one in Drive
   (KJ.birlestir: newest version of each entry and setting wins, deletions are remembered) and writes the
   result back to both. Nothing is lost when a device is offline: its changes travel the next time it syncs. */
"use strict";
(function (g) {
  const K = g.KJ;
  // Several boats (tekne.js): the first boat's book stays kasa-verisi.json; further boats are kasa-verisi-<id>.json;
  // the list of boats and the company's details are tekneler.json. Every boat is merged on its own with KJ.birlestir.
  const INDEKS = "tekneler.json", ANA = "ana";
  const DOSYA = "kasa-verisi.json", KLASOR = "Kasa Jurnali", KLASOR_TUR = "application/vnd.google-apps.folder";
  const enc = encodeURIComponent;
  const O = {};                 // set by kur(): ortam, api, ham, fotoURL, cihaz, onDurum, onYerelDegisti, onBilgi
  const S = { hazir: false, bagli: false, hesap: "", durum: "kapali", hata: "", kod: "", son: null, calisiyor: false, tekrar: false,
    tk: {}, ix: {}, sonFoto: 0, zaman: null, ilk: true, klasorSon: 0,
    lisansAcik: false, lisans: null, lisansSon: 0, lisansHata: "" };
  const GUN = 86400000, LISANS_ARALIK = 6 * 3600000, CEVRIMDISI_SURE = 14 * GUN;

  const hata = (mesaj, kod, status) => { const e = new Error(mesaj); e.kod = kod || ""; e.status = status || 0; return e; };
  const cevrimdisi = () => hata(K.t("İnternet bağlantısı yok"), "cevrimdisi");
  // A request to Google that never answers must not hold the synchronisation lock (S.calisiyor) for ever: it is cut after a while and counts as "offline" (the caller's catch),
  // so the next synchronisation tries again. ms: sign-in and small calls 30 s, Drive calls 90 s, uploads 180 s (a photo on a slow mobile line).
  const ASIM = { kucuk: 30000, lisans: 60000, api: 90000, yukleme: 180000 };
  // a request that was cut by the time-out has its OWN code: unlike a missing connection it is not retried every 30 s (a big report would be sent again and again),
  // the report queue gives it the growing waiting time of CT-R12 (drive-duzen.js). For everything else it counts as "offline" (kodAsim).
  const zamanasimi = () => hata(K.t("İnternet bağlantısı yok"), "zamanasimi");
  const asimMi = e => !!e && (e.name === "AbortError" || e.kod === "zamanasimi");
  const baglantiYok = e => asimMi(e) ? zamanasimi() : cevrimdisi();
  function zamanAsimli(url, secenek, ms) {
    if (typeof AbortController === "undefined") return fetch(url, secenek);
    const ac = new AbortController(), z = setTimeout(() => ac.abort(), ms || ASIM.api);
    if (z && z.unref) z.unref();   // (node tests) the timer alone never keeps a process alive
    // the timer is NOT stopped when the headers arrive: it also covers the reading of the body (a stalled download); an abort after a finished read changes nothing
    return fetch(url, Object.assign({}, secenek, { signal: ac.signal })).catch(e => { clearTimeout(z); throw asimMi(e) ? zamanasimi() : e; });
  }

  /* ---------------- connection to Google: through the program (computer) or directly (iPhone) ---------------- */
  function googleAyar() {
    const a = Object.assign({ oauth: "https://oauth2.googleapis.com", api: "https://www.googleapis.com" }, g.KJ_GOOGLE || {});
    try {   // test servers, only when the page itself runs on this computer
      if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { const t = JSON.parse(localStorage.getItem("kj-google-test") || "null"); if (t) Object.assign(a, t); }
    } catch (e) { }
    if (a.gizli && !a._acik) { try { a.gizli = atob(a.gizli); } catch (e) { a.gizli = ""; } a._acik = true; }
    return a;
  }

  // Computer: the program signs in and holds the key; the window only sees Drive's answers.
  const pc = {
    durum: () => O.api("api/google/durum"),
    baslat: () => O.api("api/google/baslat", { method: "POST" }),
    bekle: () => O.api("api/google/bekle", { method: "POST" }),
    cikis: () => O.api("api/google/cikis", { method: "POST" }),
    async yonetim(govde) {
      let r;
      try { r = await O.ham("api/google/yonetim", { method: "POST", body: JSON.stringify(govde), headers: { "Content-Type": "application/json" } }); }
      catch (e) { throw hata(K.t("Program arka planda kapanmış."), "program"); }
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw hata(b.hata || K.t("İnternet bağlantısı yok"), b.kod || "", r.status);
      return b;
    },
    async istek(method, yol, govde, tur) {
      let r;
      try { r = await O.ham("api/google/" + yol, { method, body: govde, headers: tur ? { "Content-Type": tur } : {} }); }
      catch (e) { throw hata(K.t("Program arka planda kapanmış."), "program"); }
      if (r.status === 401 || r.status === 502) {
        const b = await r.clone().json().catch(() => null);
        if (b && b.kod) throw hata(b.hata || K.t("Google hesabı bağlı değil"), b.kod, r.status);
      }
      return r;
    }
  };

  // iPhone: the page talks to Google itself; the key is kept in the app's own storage on the phone.
  const web = {
    cihazKodu: "",
    kayit: async () => (await O.api("api/anahtar")) || {},
    kaydet: k => O.api("api/anahtar", { method: "POST", json: k }),
    async form(yol, alanlar) {
      let r;
      try { r = await zamanAsimli(googleAyar().oauth + yol, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(alanlar).toString() }, ASIM.kucuk); }
      catch (e) { throw baglantiYok(e); }
      return { status: r.status, m: await r.json().catch(() => ({})) };
    },
    async durum() {
      const k = await web.kayit(), a = googleAyar();
      let zorunlu = true;   // the app opens only after signing in (tests on this computer may turn it off)
      try { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && localStorage.getItem("kj-giris-istege") === "1") zorunlu = false; } catch (e) { }
      return { hazir: !!(a.istemci && a.gizli), bagli: !!k.yenileme, hesap: k.hesap || "", zorunlu, lisans: !!a.lisans };
    },
    async baslat() {
      const a = googleAyar();
      if (!(a.istemci && a.gizli)) throw hata(K.t("Google Drive eşitlemesi bu sürümde ayarlanmamış"));
      const { status, m } = await web.form("/device/code", { client_id: a.istemci, scope: a.kapsam || "https://www.googleapis.com/auth/drive.file email" });
      if (status !== 200 || !m.device_code) throw hata("Google: " + (m.error_description || m.error || status));
      web.cihazKodu = m.device_code;
      return { kod: m.user_code, adres: m.verification_url || m.verification_uri, aralik: m.interval || 5, sure: m.expires_in };
    },
    async bekle() {
      if (!web.cihazKodu) return { durum: "suresi-doldu" };
      const a = googleAyar();
      const { status, m } = await web.form("/token", { client_id: a.istemci, client_secret: a.gizli, device_code: web.cihazKodu, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
      if (status === 200 && m.refresh_token) {
        web.cihazKodu = "";
        const k = { yenileme: m.refresh_token, erisim: m.access_token, bitis: Date.now() + (m.expires_in || 3600) * 1000, hesap: "" };
        try { const r = await zamanAsimli(a.oauth + "/tokeninfo?access_token=" + encodeURIComponent(k.erisim), {}, ASIM.kucuk); k.hesap = (await r.json()).email || ""; } catch (e) { }
        await web.kaydet(k); web._k = k;
        return { durum: "tamam", hesap: k.hesap };
      }
      if (m.error === "authorization_pending") return { durum: "bekliyor" };
      if (m.error === "slow_down") return { durum: "bekliyor", yavasla: true };
      if (m.error === "access_denied") { web.cihazKodu = ""; return { durum: "reddedildi" }; }
      if (m.error === "expired_token") { web.cihazKodu = ""; return { durum: "suresi-doldu" }; }
      throw hata("Google: " + (m.error_description || m.error || status));
    },
    async erisim(yenile) {
      const k = web._k || (web._k = await web.kayit());
      if (!k.yenileme) throw hata(K.t("Google hesabı bağlı değil"), "bagli-degil");
      if (!yenile && k.erisim && k.bitis - Date.now() > 60000) return k.erisim;
      const a = googleAyar();
      const { status, m } = await web.form("/token", { client_id: a.istemci, client_secret: a.gizli, refresh_token: k.yenileme, grant_type: "refresh_token" });
      if (status !== 200) {
        if (m.error === "invalid_grant") { web._k = null; await O.api("api/anahtar", { method: "DELETE" }).catch(() => { }); throw hata(K.t("Google hesabı bağlantısı kaldırılmış; yeniden bağlayın"), "baglanti-koptu"); }
        throw hata("Google: " + (m.error_description || m.error || status));
      }
      k.erisim = m.access_token; k.bitis = Date.now() + (m.expires_in || 3600) * 1000;
      await web.kaydet(k).catch(() => { });
      return k.erisim;
    },
    async istek(method, yol, govde, tur) {
      for (let deneme = 0; deneme < 2; deneme++) {
        const tok = await web.erisim(deneme > 0);
        const h = { Authorization: "Bearer " + tok }; if (tur) h["Content-Type"] = tur;
        let r;
        try { r = await zamanAsimli(googleAyar().api + "/" + yol, { method, body: govde, headers: h }, govde ? ASIM.yukleme : ASIM.api); }
        catch (e) { throw baglantiYok(e); }
        if (r.status === 401 && deneme === 0) continue;
        return r;
      }
    },
    async yonetim(govde) {
      const a = googleAyar();
      if (!a.lisans) return { izin: true, kapali: true };
      const giris = govde.islem === "giris";
      const onbellek = async e => {
        const k = await web.kayit().catch(() => ({}));
        if (giris && k.lisans && k.lisans.izin != null) return Object.assign({}, k.lisans, { onbellek: true });
        throw e;
      };
      let son;
      for (let deneme = 0; deneme < 2; deneme++) {
        const tok = await web.erisim(deneme > 0);
        const g2 = Object.assign({}, govde, { erisim: tok }, giris ? { cihaz: "iphone", surum: O.surum || "" } : {});
        let r;
        try { r = await zamanAsimli(a.lisans, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(g2), redirect: "follow" }, ASIM.lisans); }
        catch (e) { return onbellek(cevrimdisi()); }
        son = r.ok ? await r.json().catch(() => null) : null;
        if (!son) return onbellek(hata(K.t("Erişim sunucusu yanıt vermedi."), "cevrimdisi"));
        if (son.hata === "gecersiz" && deneme === 0) continue;
        break;
      }
      if (giris && son.izin != null) {
        son.zaman = Date.now();
        const k = web._k || await web.kayit();
        if (k.yenileme) { k.lisans = son; await web.kaydet(k).catch(() => { }); }
      }
      return son;
    },
    async cikis() {
      const k = web._k || await web.kayit();
      web._k = null; web.cihazKodu = "";
      await O.api("api/anahtar", { method: "DELETE" });
      if (k.yenileme) web.form("/revoke", { token: k.yenileme }).catch(() => { });
    }
  };
  const T = () => O.ortam === "web" ? web : pc;

  /* ---------------- Drive requests ---------------- */
  async function istekOk(method, yol, govde, tur) {
    const r = await T().istek(method, yol, govde, tur);
    if (!r.ok) {
      const b = await r.text().catch(() => ""); let m = "", neden = ""; try { const j = JSON.parse(b).error; m = j.message; neden = String(((j.errors || [])[0] || {}).reason || ""); } catch (e) { }
      // the Drive box was left unticked on Google's permission screen
      if (r.status === 403 && /insufficient/i.test(m)) throw hata(K.t("Google Drive izni verilmemiş. Oturumu kapatıp yeniden açın; Google’ın izin ekranında Google Drive kutusunu da işaretleyin."), "izin", 403);
      const he = hata("Google Drive: " + (m || ("HTTP " + r.status)), "drive", r.status); he.neden = neden;   // Google's reason (storageQuotaExceeded, userRateLimitExceeded ...)
      throw he;
    }
    return r;
  }
  const gjson = async (method, yol) => (await istekOk(method, yol)).json();
  function cokParca(meta, govde, tur) {
    const s = "kj" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    return { govde: new Blob(["--" + s + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + s + "\r\nContent-Type: " + tur + "\r\n\r\n", govde, "\r\n--" + s + "--"]), tur: "multipart/related; boundary=" + s };
  }
  // the "Kasa Jurnali" folder in Drive (the oldest one, if two devices happened to create one at the same time)
  async function klasor() {
    if (S.klasorId) return S.klasorId;
    const l = (await gjson("GET", "drive/v3/files?spaces=drive&pageSize=10&orderBy=createdTime&q=" + enc("name='" + KLASOR + "' and mimeType='" + KLASOR_TUR + "' and trashed=false") + "&fields=" + enc("files(id,createdTime)"))).files || [];
    if (l.length) return (S.klasorId = l[0].id);
    const y = await (await istekOk("POST", "drive/v3/files?fields=id", JSON.stringify({ name: KLASOR, mimeType: KLASOR_TUR, description: "Yachting Jurnal kayıtları ve fiş fotoğrafları. Silmeyin ya da adını değiştirmeyin." }), "application/json")).json();
    return (S.klasorId = y.id);
  }
  const defterDosyalari = async (ad) => { const k = await klasor(); return (await gjson("GET", "drive/v3/files?spaces=drive&pageSize=20&orderBy=createdTime&q=" + enc("name='" + (ad || DOSYA) + "' and '" + k + "' in parents and trashed=false") + "&fields=" + enc("files(id,version,createdTime)"))).files || []; };
  async function defterOku(id, indeks) {
    const r = await istekOk("GET", "drive/v3/files/" + id + "?alt=media");
    const d = JSON.parse(await r.text());
    if (!d || !(indeks ? Array.isArray(d.tekneler) : Array.isArray(d.kayitlar))) throw hata(K.t("Google Drive’daki kayıt dosyası okunamadı."), "bozuk");
    return d;
  }
  async function defterYaz(id, veri, ad) {
    const govde = JSON.stringify(veri);
    if (id) return (await istekOk("PATCH", "upload/drive/v3/files/" + id + "?uploadType=media&fields=id,version", govde, "application/json")).json();
    const mp = cokParca({ name: ad || DOSYA, parents: [await klasor()], mimeType: "application/json" }, govde, "application/json");
    return (await istekOk("POST", "upload/drive/v3/files?uploadType=multipart&fields=id,version", mp.govde, mp.tur)).json();
  }

  /* ---------------- photos: each one travels once, in whichever direction it is missing ---------------- */
  async function fotolar(D) {
    const k = await klasor();
    const arsiv = Object.values(D.silinenKayitlar || {}).map(x => x && x.kayit || {});   // deleted entries can be restored, with their photos (gecmis.js)
    const gerekli = new Set([...(D.kayitlar || []), ...arsiv].map(e => e.photo).filter(x => typeof x === "string" && /^[a-f0-9]{24,40}$/.test(x)));
    for (const id of (K.korunanFotoIdler ? K.korunanFotoIdler(D.ayarlar) : [])) gerekli.add(id);   // photos of entries cleared by "reset the book": kept 400 days (para-secim.js)
    const yerel = new Set((((await O.api("api/fotolar")) || {}).ids) || []);
    const uzak = new Map();
    let sayfa = "";
    do {
      const r = await gjson("GET", "drive/v3/files?spaces=drive&pageSize=1000&q=" + enc("'" + k + "' in parents and trashed=false") + "&fields=" + enc("nextPageToken,files(id,name,createdTime)") + (sayfa ? "&pageToken=" + enc(sayfa) : ""));
      for (const f of r.files || []) { const m = /^foto-([a-f0-9]{24,40})\.jpg$/.exec(f.name || ""); if (m) uzak.set(m[1], f); }
      sayfa = r.nextPageToken || "";
    } while (sayfa);
    let gelen = 0, giden = 0;
    for (const id of gerekli) {
      if (yerel.has(id) && !uzak.has(id)) {
        const r = await O.ham(O.fotoURL(id)); if (!r.ok) continue;
        const mp = cokParca({ name: "foto-" + id + ".jpg", parents: [k] }, await r.blob(), "image/jpeg");
        const y = await (await istekOk("POST", "upload/drive/v3/files?uploadType=multipart&fields=id", mp.govde, mp.tur)).json(); giden++;
        uzak.set(id, { id: y.id, name: "foto-" + id + ".jpg", createdTime: new Date().toISOString() });
      } else if (!yerel.has(id) && uzak.has(id)) {
        const b = await (await istekOk("GET", "drive/v3/files/" + uzak.get(id).id + "?alt=media")).blob();
        const r = await O.ham("api/foto/" + id, { method: "PUT", body: b, headers: { "Content-Type": "image/jpeg" } });
        if (r.ok) gelen++;
      }
    }
    // photos no entry uses any more (deleted or replaced on a device); kept for a day in case another device still needs them
    for (const [id, f] of uzak) if (!gerekli.has(id) && Date.now() - Date.parse(f.createdTime || 0) > 864e5) await T().istek("DELETE", "drive/v3/files/" + f.id).catch(() => { });
    await O.api("api/foto-temizle", { method: "POST", json: { tut: [...gerekli] } }).catch(() => { });
    return { gelen, giden, uzak };
  }

  /* ---------------- the Drive layout: receipt copies and reports by boat and month (drive-duzen.js) ---------------- */
  let DD = null;
  const dd = () => DD || (g.KJDriveDuzen ? (DD = g.KJDriveDuzen.olustur({ gjson, istek: istekOk, cokParca })) : null);
  const tekneListesi = tumu => (S.ix.liste || []).map(t => ({ id: t.id, ad: K.tekneAdi({ tekneler: S.ix.liste }, t.id, (tumu[t.id] || {}).ayarlar || {}), defter: tumu[t.id] || {} }));
  const raporTekneAdi = o => K.tekneAdi({ tekneler: S.ix.liste || [] }, o.tid, { name: o.defterAdi || "" });
  // A finished report (PDF or Excel) for the month folder. Never throws; without a Google connection nothing is done.
  // o: { tid, defterAdi, ym, ad, tur, blob } → { durum: "yuklendi" | "kuyrukta" | "kapali", yol }
  async function raporYukle(o) {
    if (!S.bagli || !izinli() || !dd() || !o || !o.blob || !/^\d{4}-\d\d$/.test(o.ym || "")) return { durum: "kapali" };
    const yol = dd().yolMetni(raporTekneAdi(o), o.ym);
    await dd().kuyrugaAl({ tid: o.tid || ANA, defterAdi: o.defterAdi || "", ym: o.ym, ad: o.ad, tur: o.tur, blob: o.blob });
    if (S.calisiyor) return { durum: "kuyrukta", yol };   // the running synchronisation looks at the queue when it ends
    try { const kalan = await dd().kuyrugaBak(raporTekneAdi); S.rapor = kalan; if (kalan) { const t0 = dd().sonKuyrukZamani(); planla(Math.max(30000, t0 ? t0 - Date.now() : 30000)); } return { durum: kalan ? "kuyrukta" : "yuklendi", yol }; }
    catch (e) { return { durum: "kuyrukta", yol }; }
  }

  /* ---------------- one synchronisation ---------------- */
  // the copies of one file in Drive. Usually one cheap question is enough ("has the file changed?"); the full list
  // (which also finds a second copy created by two devices at the same moment) is asked at the start and every half hour.
  async function dosyalarBul(ad, st) {
    let dosyalar = null;
    if (st.dosyaId && !S.ilk && Date.now() - st.sonListe < 30 * 60000) {
      const r = await T().istek("GET", "drive/v3/files/" + enc(st.dosyaId) + "?fields=" + enc("id,version,trashed,createdTime"));
      if (r.ok) { const f = await r.json(); if (!f.trashed) dosyalar = [f]; }
      else if (r.status !== 404) await istekOk("GET", "drive/v3/files/" + enc(st.dosyaId) + "?fields=id");   // reports the error
    }
    if (!dosyalar) { dosyalar = await defterDosyalari(ad); st.sonListe = Date.now(); }
    st.dosyaId = dosyalar[0] ? dosyalar[0].id : null;
    return dosyalar;
  }
  // the list of boats: merged like a book (every boat on its own, newest change wins)
  async function indeksEsitle(sebep) {
    const st = S.ix;
    for (let deneme = 0; ; deneme++) {
      let yerel;
      try { yerel = await O.api("api/tekneler"); }
      catch (e) { if (e.status === 404) return { indeks: K.tekneIndeksi(null), degisti: false }; throw e; }   // a program without boats
      const dosyalar = await dosyalarBul(INDEKS, st), ana = dosyalar[0] || null;
      if (ana && dosyalar.length === 1 && String(ana.version) === st.sonUzakSurum && yerel.rev === st.sonYerelRev && sebep !== "elle") return { indeks: K.tekneIndeksi(yerel.indeks), degisti: false };
      let uzak = null;
      for (const f of dosyalar) { const d = await defterOku(f.id, true); uzak = uzak ? K.indeksBirlestir(uzak, d) : d; }
      const birlesik = uzak ? K.indeksBirlestir(yerel.indeks, uzak) : K.tekneIndeksi(yerel.indeks);
      let rev = yerel.rev, degisti = false;
      if (!K.ayniIndeks(birlesik, yerel.indeks)) {
        try { rev = (await O.api("api/tekneler", { method: "POST", json: { indeks: birlesik, taban: yerel.rev } })).rev; degisti = true; }
        catch (e) { if (e.status === 409 && deneme < 6) continue; throw e; }
      }
      let surum = ana ? String(ana.version) : null;
      if (uzak ? (dosyalar.length > 1 || !K.ayniIndeks(birlesik, uzak)) : !K.indeksBos(birlesik)) {   // one boat and no company name: no file needed
        const r = await defterYaz(ana && ana.id, Object.assign({ uygulama: "Kasa Jurnali", kaydedilme: new Date().toISOString(), cihaz: O.cihaz || "" }, birlesik), INDEKS);
        surum = String(r.version); if (r.id) st.dosyaId = r.id;
        for (const f of dosyalar.slice(1)) await T().istek("DELETE", "drive/v3/files/" + f.id).catch(() => { });
      }
      st.sonYerelRev = rev; st.sonUzakSurum = surum;
      return { indeks: birlesik, degisti };
    }
  }
  // one boat's book: this device's copy and the one in Drive are merged and written back to both
  async function tekneEsitle(tid, sebep) {
    const st = S.tk[tid] || (S.tk[tid] = { dosyaId: null, sonYerelRev: null, sonUzakSurum: null, sonListe: 0 });
    const H = { "X-KJ-Tekne": tid }, ad = K.tekneDosyaAdi ? K.tekneDosyaAdi(tid) : DOSYA;
    for (let deneme = 0; ; deneme++) {
      const yerel = await O.api("api/veri", { headers: H });
      const dosyalar = await dosyalarBul(ad, st), ana = dosyalar[0] || null;
      if (ana && dosyalar.length === 1 && String(ana.version) === st.sonUzakSurum && yerel.rev === st.sonYerelRev && sebep !== "elle") return { defter: yerel.defter };   // nothing changed anywhere
      let uzak = null;
      for (const f of dosyalar) { const d = await defterOku(f.id); uzak = uzak ? K.birlestir(d, uzak) : d; }   // two devices may have created the file at the same moment
      // entries with an invalid date / currency are cleaned here, before the book is stored or written to Drive (CT-30, CT-31): a book is
      // never refused for them, and the cleaned copy goes to Drive too, so the forged values do not travel on
      const tm = K.defterTemizle(K.birlestir(yerel.defter, uzak), true), birlesik = tm.defter;
      let rev = yerel.rev, degisti = false;
      if (!K.ayniMi(birlesik, yerel.defter)) {
        try { rev = (await O.api("api/islem", { method: "POST", json: { islem: "senk", defter: birlesik, taban: yerel.rev }, headers: H })).rev; degisti = true; }
        catch (e) { if (e.status === 409 && deneme < 6) continue; throw e; }   // a change was saved meanwhile: start again with it
        // warning only (the merged book is not changed): did incoming settings change the cash carried by a month closed here?
        try { const ke = K.kapaliDonemEtkisi && K.kapaliDonemEtkisi(yerel.defter, birlesik); if (ke) kdBekleyen.push({ tekne: tid, tekneAdi: tekneAdiBul(tid, birlesik), ke }); } catch (e) { }
      }
      let surum = ana ? String(ana.version) : null;
      if (!uzak || dosyalar.length > 1 || !K.ayniMi(birlesik, uzak)) {
        const r = await defterYaz(ana && ana.id, K.uzakHali(birlesik, O.cihaz), ad);
        surum = String(r.version); if (r.id) st.dosyaId = r.id;
        for (const f of dosyalar.slice(1)) await T().istek("DELETE", "drive/v3/files/" + f.id).catch(() => { });
      }
      let ozet = null;
      if (S.ilk) {
        const yIds = new Set((yerel.defter.kayitlar || []).map(e => e.id)), uIds = new Set(((uzak || {}).kayitlar || []).map(e => e.id));
        ozet = { gelen: birlesik.kayitlar.filter(e => !yIds.has(e.id)).length, giden: birlesik.kayitlar.filter(e => !uIds.has(e.id)).length, toplam: birlesik.kayitlar.length };
      }
      st.sonYerelRev = rev; st.sonUzakSurum = surum;
      if (tm.notlar.length) temizBekleyen.push({ tekne: tid, tekneAdi: tekneAdiBul(tid, birlesik), notlar: tm.notlar });
      return { defter: birlesik, degisti, uzakDegisti: surum !== (ana && String(ana.version)), ozet };
    }
  }
  function durumYaz(d) { S.durum = d; if (O.onDurum) O.onDurum(bilgi()); }
  // warnings about closed months (K.kapaliDonemEtkisi) found during one synchronisation: collected here and handed over together
  // when it ends (also when a later boat fails), so one boat's warning never overwrites another's and none is lost
  let kdBekleyen = [], temizBekleyen = [];
  const tekneAdiBul = (tid, defter) => { const t = (S.ix.liste || []).find(x => x.id === tid); return (t && t.ad) || ((defter && defter.ayarlar) || {}).name || ""; };
  function kdBildir() {
    const l = kdBekleyen, tz = temizBekleyen; kdBekleyen = []; temizBekleyen = [];
    if (l.length && O.onKapaliDonem) { try { O.onKapaliDonem(l); } catch (e) { } }
    if (tz.length && O.onTemizlenen) { try { O.onTemizlenen(tz); } catch (e) { } }
  }
  async function esitle(sebep) {
    if (!izinli()) return;
    if (!S.bagli) return;
    if (S.calisiyor) { S.tekrar = true; return; }
    S.calisiyor = true; clearTimeout(S.zaman); S.zaman = null;
    const gorunur = sebep !== "periyodik" || S.durum !== "tamam";
    if (gorunur) durumYaz("calisiyor");
    let yerelDegisti = false, ozet = null;
    try {
      if (S.ilk || Date.now() - S.klasorSon > 30 * 60000) { S.klasorId = null; S.klasorSon = Date.now(); }
      const ix = await indeksEsitle(sebep);
      S.ix.liste = ix.indeks.tekneler;
      if (ix.degisti) yerelDegisti = true;
      const tumu = {};
      let uzakDegisti = false;
      const tekneHatalari = [];   // a failing boat is reported at the end; the other boats and their photos go on (CT-31)
      for (const t of ix.indeks.tekneler) {
        let r;
        try { r = await tekneEsitle(t.id, sebep); }
        catch (e) { if (e && (e.kod === "bagli-degil" || e.kod === "baglanti-koptu" || e.kod === "izin" || e.kod === "cevrimdisi" || asimMi(e))) throw e; tekneHatalari.push(e); continue; }
        tumu[t.id] = r.defter || {};   // archived boats too: their photos stay
        if (r.degisti) yerelDegisti = true;
        if (r.uzakDegisti) uzakDegisti = true;
        if (r.ozet) { ozet = ozet || { gelen: 0, giden: 0, toplam: 0 }; for (const k in r.ozet) ozet[k] += r.ozet[k]; }
      }
      // photos are shared by the boats: one pass over every boat's entries (so no boat's photo is taken for unused).
      // Not when a boat failed: its entries are unknown now, and its photos would be taken for unused and deleted.
      if (!tekneHatalari.length && (yerelDegisti || S.ilk || uzakDegisti || Date.now() - S.sonFoto > 10 * 60000)) {
        const D = K.filoFotoKaynagi ? K.filoFotoKaynagi(tumu) : { kayitlar: Object.values(tumu).flatMap(d => d.kayitlar || []) };   // entries + archives of deleted entries (T-3)
        const f = await fotolar(D); S.sonFoto = Date.now();
        if (ozet) Object.assign(ozet, { fotoGelen: f.gelen, fotoGiden: f.giden });
        // the Drive layout "Yachting Jurnal / <boat> / <month> / Fişler" (drive-duzen.js); it never stops a synchronisation, and a failure is tried again next time
        try {
          if (dd()) {
            const fz = await dd().fisleriYaz(tekneListesi(tumu), f.uzak);
            if (fz.kalan > 0 && !fz.kota) S.sonFoto = 0;   // a large first run goes on with the next synchronisation; a failing receipt never repeats the whole list (the 10-minute interval stays)
            if (fz.kota && !S.kotaBildirildi) { S.kotaBildirildi = true; if (O.onFisUyari) O.onFisUyari("kota"); }
            if (!fz.kota) S.kotaBildirildi = false;
          }
        } catch (e) { if (e.kod === "izin" || e.kod === "cevrimdisi" || e.kod === "bagli-degil" || e.kod === "baglanti-koptu" || asimMi(e)) throw e; console.warn("fiş düzeni:", e.message); }
        if (f.gelen) yerelDegisti = true;
      }
      try { if (dd()) S.rapor = await dd().kuyrugaBak(raporTekneAdi); } catch (e) { if (e.kod === "izin") throw e; }   // reports waiting for Drive (no internet earlier)
      if (tekneHatalari.length) throw tekneHatalari[0];   // after the other boats were synchronised; the status shows the error
      S.son = new Date(); S.hata = ""; S.kod = "";
      if (S.ilk && ozet && O.onBilgi) O.onBilgi(ozet);
      S.ilk = false;
      durumYaz("tamam");
    } catch (e) {
      if (e && e.name === "AbortError") e = zamanasimi();   // cut while the answer's body was being read: the same as a cut request, never the raw "signal is aborted"
      S.kod = e.kod || ""; S.hata = e.message || String(e);
      if (S.kod === "bagli-degil" || S.kod === "baglanti-koptu") { S.bagli = false; S.hesap = ""; }
      durumYaz(S.kod === "cevrimdisi" || S.kod === "zamanasimi" ? "cevrimdisi" : "hata");
    } finally {
      S.calisiyor = false;
      kdBildir();
      if (O.onDurum) O.onDurum(bilgi());
      if (yerelDegisti && O.onYerelDegisti) O.onYerelDegisti();
      if (S.tekrar) { S.tekrar = false; planla(1200); }
      else if (S.rapor > 0 && S.durum === "tamam") { const t0 = dd() ? dd().sonKuyrukZamani() : 0; planla(Math.max(30000, t0 ? t0 - Date.now() : 30000)); }   // a report still waiting for Drive is tried again (CT-R11) when its waiting time is over (CT-R12: longer after each failure, 6 hours at most)
    }
  }
  function planla(ms) { clearTimeout(S.zaman); S.zaman = setTimeout(() => { S.zaman = null; esitle("degisiklik"); }, ms); }

  /* ---------------- connecting an account ---------------- */
  async function yenile() {
    try { const d = await T().durum(); S.hazir = !!d.hazir; S.bagli = !!d.bagli; S.hesap = d.hesap || ""; S.zorunlu = d.zorunlu !== false; S.lisansAcik = !!d.lisans; if (!S.bagli && S.durum !== "kapali") S.durum = "kapali"; }
    catch (e) { S.hazir = false; }
    if (O.onDurum) O.onDurum(bilgi());
    return bilgi();
  }
  async function baslat() { return T().baslat(); }
  async function bekle() {
    const r = await T().bekle();
    if (r.durum === "tamam") {
      Object.assign(S, { bagli: true, hesap: r.hesap || "", ilk: true, tk: {}, ix: {}, sonFoto: 0, lisans: null, lisansSon: 0 });
      await lisansDenetle();
      esitle("ilk");
    }
    return r;
  }

  /* ---------------- access: may this Google account use Yachting Jurnal? (yonetim/Kod.gs) ---------------- */
  const bugunISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  // without internet the last answer is used for 14 days, and never past its end date
  function izinli(L) {
    if (!S.lisansAcik) return true;
    L = L === undefined ? S.lisans : L;
    if (!L) return false;
    if (!L.izin) return false;
    if (L.bitis && L.bitis < bugunISO()) return false;
    if (L.onbellek && !(Date.now() - (+L.zaman || 0) < CEVRIMDISI_SURE)) return false;
    return true;
  }
  async function lisansDenetle() {
    if (!S.bagli || !S.lisansAcik) { S.lisans = S.lisansAcik ? null : { izin: true, kapali: true }; S.lisansHata = ""; if (O.onDurum) O.onDurum(bilgi()); return S.lisans; }
    try {
      const c = await T().yonetim({ islem: "giris" });
      if (c.hata) throw hata(c.hata === "gecersiz" ? K.t("Google hesabı doğrulanamadı; yeniden oturum açın.") : K.t("Erişim sunucusu yanıt vermedi."), c.hata);
      S.lisans = c; S.lisansHata = ""; S.lisansSon = c.onbellek ? 0 : Date.now();
    } catch (e) {
      if (e.kod === "bagli-degil" || e.kod === "baglanti-koptu") { S.bagli = false; S.durum = "kapali"; }
      S.lisansHata = e.message; S.lisansSon = 0;
    }
    if (O.onDurum) O.onDurum(bilgi());
    return S.lisans;
  }
  const lisansZamani = () => S.bagli && S.lisansAcik && Date.now() - S.lisansSon > (S.lisansSon ? LISANS_ARALIK : 110000);
  async function yonetim(govde) {
    const c = await T().yonetim(govde);
    if (c.hata) throw hata({ yetki: K.t("Bu işlem için yetkiniz yok."), eposta: K.t("E-posta adresini kontrol edin."), tarih: K.t("Tarihi kontrol edin (geçerli bir gün; bitiş en çok 10 yıl sonrası)."), paket: K.t("Paketi kontrol edin."), fiyat: K.t("Fiyatı kontrol edin."), para: K.t("Para birimini kontrol edin (3 harf, örn. EUR)."), kayit: K.t("Hesap kaydı bulunamadı; uygulamayı yeniden açın."), yonetici: K.t("Yönetici hesabı uygulamadan silinemez."), yogun: K.t("Erişim sunucusu şu an çok yoğun; birkaç dakika sonra yeniden deneyin."), abonelik: K.t("Abonelik bilgisi bulunamadı; kasajurnali@gmail.com adresine yazın."), islem: K.t("Bu bölüm, erişim sunucusu güncellenince açılacak."), gecersiz: K.t("Google hesabı doğrulanamadı; yeniden oturum açın.") }[c.hata] || K.t("Erişim sunucusu yanıt vermedi."), c.hata);
    return c;
  }
  async function cikis() {
    try { await T().cikis(); } finally { try { if (dd()) await dd().kuyrukTemizle(); } catch (e) { } }   // reports waiting for this account's Drive are not sent to another account, even when signing out fails
    Object.assign(S, { bagli: false, hesap: "", durum: "kapali", hata: "", kod: "", son: null, tk: {}, ix: {}, ilk: true, klasorId: null, klasorSon: 0, lisans: null, lisansSon: 0, lisansHata: "" });
    if (O.onDurum) O.onDurum(bilgi());
  }
  const bilgi = () => ({ hazir: S.hazir, zorunlu: S.zorunlu, bagli: S.bagli, hesap: S.hesap, durum: S.durum, hata: S.hata, kod: S.kod, son: S.son, calisiyor: S.calisiyor,
    lisansAcik: S.lisansAcik, lisans: S.lisans, lisansHata: S.lisansHata, izinli: izinli() });

  function kur(opts) {
    Object.assign(O, opts);
    setInterval(() => { if (!S.bagli || document.visibilityState === "hidden") return; if (lisansZamani()) lisansDenetle().then(() => esitle("periyodik")); else esitle("periyodik"); }, 120000);
    document.addEventListener("visibilitychange", () => {
      if (!S.bagli) return;
      if (document.visibilityState === "visible") { if (lisansZamani()) lisansDenetle().then(() => esitle("gorunur")); else esitle("gorunur"); }
      else if (S.zaman) esitle("arka");   // the phone may stop the app soon: send waiting changes now
    });
    window.addEventListener("online", () => { if (S.bagli) esitle("cevrimici"); });
    return yenile().then(async b => { if (b.bagli) { await lisansDenetle(); esitle("acilis"); } return bilgi(); });
  }

  g.KJSenk = { zamanAsimli, ASIM, asimMi, raporYukle, kur, esitle: () => esitle("elle"), degisti: () => { if (S.bagli && izinli()) planla(2500); }, baslat, bekle, cikis, bilgi, yenile, lisansDenetle, yonetim, izinli: () => izinli() };
})(window);
