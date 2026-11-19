/* Yachting Jurnal — several boats with one owner (Faz 3a).
   Every boat is a book of its own (the same Defter as always). The first boat ("ana") is the book that was always
   there: kasa-verisi.json on the computer, the "defter" key on the iPhone, "Kasa Jurnali/kasa-verisi.json" in Drive.
   Further boats: Tekneler/<id>/kasa-verisi.json, "defter:<id>", "kasa-verisi-<id>.json". The list of boats and the
   company's details are a small index (tekneler.json). The window picks a boat with the X-KJ-Tekne header.
   The first half of this file is plain rules (also used by senk.js and the node tests); the second half draws the
   "Tekneler" and "Şirket paneli" pages and the boat picker in the header. */
"use strict";
(function (g) {
  const K = g.KJ;
  const ANA = "ana", KIMLIK = /^[a-z0-9]{1,32}$/;
  const nesne = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const ISO = z => { if (!z) return ""; const p = Date.parse(z); return isNaN(p) ? "" : new Date(p).toISOString(); };

  /* ---------------- rules ---------------- */
  // the list in a fixed form: the first boat is always there, order by "sira"
  function indeks(x) {
    x = nesne(x);
    const s = nesne(x.sirket), gor = new Set(), l = [];
    for (const t of Array.isArray(x.tekneler) ? x.tekneler : []) {
      if (!t || !KIMLIK.test(t.id || "") || gor.has(t.id)) continue;
      gor.add(t.id);
      l.push({ id: t.id, ad: String(t.ad || "").trim(), sira: +t.sira || 0, durum: t.durum === "arsiv" ? "arsiv" : "aktif", zaman: ISO(t.zaman) || undefined });
    }
    if (!gor.has(ANA)) l.unshift({ id: ANA, ad: "", sira: 0, durum: "aktif" });
    l.sort((a, b) => a.sira - b.sira || (a.id === ANA ? -1 : b.id === ANA ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    l.forEach(t => { if (!t.zaman) delete t.zaman; });
    return { surum: 1, sirket: Object.assign({ ad: String(s.ad || "").trim() }, ISO(s.zaman) ? { zaman: ISO(s.zaman) } : {}), tekneler: l };
  }
  // two devices' lists: every boat on its own, the newest change wins; the company name the same way
  function indeksBirlestir(A, B) {
    A = indeks(A); B = indeks(B);
    const yeni = (a, b) => { const za = a.zaman || "", zb = b.zaman || ""; return za !== zb ? (za > zb ? a : b) : (K.sabit(a) >= K.sabit(b) ? a : b); };
    const m = new Map();
    for (const t of [...A.tekneler, ...B.tekneler]) m.set(t.id, m.has(t.id) ? yeni(m.get(t.id), t) : t);
    return indeks({ sirket: yeni(A.sirket, B.sirket), tekneler: [...m.values()] });
  }
  // true when the list says nothing more than "one boat" (then nothing needs to be written to Drive)
  const indeksBos = x => { x = indeks(x); return x.tekneler.length === 1 && !x.tekneler[0].ad && !x.tekneler[0].zaman && !x.sirket.ad; };
  const ayniIndeks = (a, b) => K.sabit(indeks(a)) === K.sabit(indeks(b));
  // the book's file in Drive: the first boat keeps the name it always had
  const dosyaAdi = id => id === ANA || !id ? "kasa-verisi.json" : "kasa-verisi-" + id + ".json";
  // merges two copies of the whole fleet ({ indeks, defterler: { id: book } }) — the same rule as one book, per boat
  function filoBirlestir(A, B) {
    A = nesne(A); B = nesne(B);
    const x = indeksBirlestir(A.indeks, B.indeks), dA = nesne(A.defterler), dB = nesne(B.defterler), defterler = {};
    for (const t of x.tekneler) defterler[t.id] = K.birlestir(dA[t.id] || {}, dB[t.id] || {});
    return { indeks: x, defterler };
  }
  const yeniId = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const aktifler = x => indeks(x).tekneler.filter(t => t.durum === "aktif");
  // a boat's name: its own, else the book's name, else "Tekne 2"
  function tekneAdi(x, id, set) {
    const l = indeks(x).tekneler, i = l.findIndex(t => t.id === id), tk = l[i];
    return (tk && tk.ad) || (set && set.name) || K.t("Tekne {n}", { n: i < 0 ? 1 : i + 1 });
  }
  // the boat's currency, only from the known list (it may come from another device through Drive)
  const paraOf = set => K.paraOfSet ? K.paraOfSet(set) : (K.CUR && K.CUR[set.para] ? set.para : "TRY");
  // photos that must stay: every boat's entries and every boat's archive of deleted entries (silinenKayitlar,
  // id → { zaman, kim, kayit }); archived boats included. defterler: [book] or { id: book }
  function fotoKaynagi(defterler) {
    const kayitlar = [], silinenKayitlar = {};
    for (const [i, df] of Object.entries(nesne(defterler))) {
      const d = nesne(df);
      if (Array.isArray(d.kayitlar)) kayitlar.push(...d.kayitlar);
      for (const [k, v] of Object.entries(nesne(d.silinenKayitlar))) silinenKayitlar[i + ":" + k] = v;
    }
    return { kayitlar, silinenKayitlar };
  }
  function fotoKimlikleri(defterler) {
    const D = fotoKaynagi(defterler), l = D.kayitlar.concat(Object.values(D.silinenKayitlar).map(x => nesne(nesne(x).kayit)));
    return [...new Set(l.map(e => e && e.photo).filter(x => typeof x === "string" && x))];
  }
  // one boat's figures for a month (amounts in the boat's own currency)
  function tekneOzeti(defter, ym) {
    const set = nesne(nesne(defter).ayarlar), items = Array.isArray(nesne(defter).kayitlar) ? defter.kayitlar : [];
    const ay = items.filter(e => (e.date || "").slice(0, 7) === ym);
    const oz = K.ozetFor(items, set, ym), sp = K.paySplit(ay, set);
    return { para: paraOf(set), kalan: K.kasaFor(items, set, "all").kalan, gelen: oz.gelir, gider: oz.gider, nakit: sp.nakit, kart: sp.kart, diger: sp.none,
      fotosuz: ay.filter(e => K.isOut(e) && !e.photo).length, kayit: items.length };
  }
  // the company's figures: every boat, and totals for each currency (amounts in different currencies are never added up)
  function sirketOzeti(tekneler, ym) {
    const satir = tekneler.map(t => Object.assign({ id: t.id, ad: t.ad, durum: t.durum || "aktif" }, tekneOzeti(t.defter, ym)));
    const toplam = {};
    for (const s of satir) {
      if (s.durum !== "aktif") continue;
      const x = toplam[s.para] || (toplam[s.para] = { para: s.para, tekne: 0, kalan: 0, gelen: 0, gider: 0, nakit: 0, kart: 0, diger: 0, fotosuz: 0 });
      x.tekne++; for (const k of ["kalan", "gelen", "gider", "nakit", "kart", "diger", "fotosuz"]) x[k] = K.r2(x[k] + s[k]);
    }
    return { satir, toplam: Object.values(toplam) };
  }
  Object.assign(K, { ANA_TEKNE: ANA, tekneIndeksi: indeks, indeksBirlestir, indeksBos, ayniIndeks, tekneDosyaAdi: dosyaAdi, filoBirlestir, yeniTekneId: yeniId, aktifTekneler: aktifler, tekneAdi, tekneOzeti, sirketOzeti, tekneParasi: paraOf, filoFotoKaynagi: fotoKaynagi, filoFotoKimlikleri: fotoKimlikleri });
  if (typeof document === "undefined") return;   // node tests: rules only

  /* ---------------- the window ---------------- */
  let C = null;                                // set by kur(): S, api, render, toast, reload, esc, t, tl
  const F = { panel: null, ay: null, yukleniyor: false };
  const sakla = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } };
  const oku = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  // an amount in the boat's own currency, escaped: it goes straight into HTML (INCELEME-TEKNE T-1)
  const para = (v, kod) => C.esc(K.fx ? K.fx(v, kod || "TRY") : K.tl(v));
  // Fleet features (paket.js); without paket.js everything is open
  const izin = (ad, baslik) => !K.ozellikIste || K.ozellikIste(ad, baslik);

  // the list from the program (an older program without boats: one boat)
  async function listeAl() {
    try { const r = await C.api("api/tekneler"); C.S.filo = indeks(r.indeks); C.S.filoRev = r.rev; }
    catch (e) { C.S.filo = C.S.filo || indeks(null); }
    const l = C.S.filo.tekneler, sec = l.find(t => t.id === C.S.tekne);
    if (!sec || (sec.durum !== "aktif" && aktifler(C.S.filo).length)) { const a = aktifler(C.S.filo)[0] || l[0]; C.S.tekne = a.id; sakla("kj-tekne", a.id === ANA ? null : a.id); }
    return C.S.filo;
  }
  // writes the list; on a clash (another window or a synchronisation) reads it again and repeats the change
  async function listeDegistir(f) {
    for (let deneme = 0; deneme < 3; deneme++) {
      const x = indeks(JSON.parse(JSON.stringify(C.S.filo)));
      f(x);
      try { const r = await C.api("api/tekneler", { method: "POST", json: { indeks: x, taban: C.S.filoRev } }); C.S.filo = indeks(r.indeks); C.S.filoRev = r.rev; if (g.KJSenk) g.KJSenk.degisti(); return; }
      catch (e) { if (e.status === 409 && deneme < 2) { await listeAl(); continue; } throw e; }
    }
  }
  const damga = t => K.damga(t && t.zaman);
  // switching boats is all or nothing (T-2): the new boat's book is read first with its own header; only when that
  // worked do the open boat, the window's data and the remembered choice change together. On an error the old boat stays.
  async function sec(id) {
    if (id === C.S.tekne) return;
    if (!C.applyData) { const eski = C.S.tekne; C.S.tekne = id; try { await C.reload(); } catch (e) { C.S.tekne = eski; throw e; } sakla("kj-tekne", id === ANA ? null : id); return; }
    const d = await C.api("api/veri", { headers: { "X-KJ-Tekne": id } });
    if (C.closeSheet) { try { C.closeSheet(); } catch (e) { } }
    const sh = g.document && g.document.getElementById && g.document.getElementById("sheetHost"); if (sh) sh.innerHTML = "";
    C.S.editing = null; C.S.ph = null;
    C.S.tekne = id; sakla("kj-tekne", id === ANA ? null : id);
    C.S.period = null; C.S.q = ""; C.S.cat = ""; F.panel = null;
    C.applyData(d);
    C.render();
  }
  // all boats' books (for the company panel and the consolidated report)
  async function defterler(hepsi) {
    const x = await listeAl(), l = [];
    for (const t of x.tekneler) {
      if (!hepsi && t.durum !== "aktif") continue;
      const d = await C.api("api/veri", { headers: { "X-KJ-Tekne": t.id } });
      const df = d.defter || {};
      l.push({ id: t.id, ad: tekneAdi(x, t.id, df.ayarlar), durum: t.durum, defter: { ayarlar: df.ayarlar || {}, kayitlar: df.kayitlar || [] } });
    }
    return l;
  }

  // the boat picker in the header: only when there is more than one active boat
  function baslik() {
    if (!C) return;
    const el = document.getElementById("tekneSec"), bn = document.getElementById("bookName"); if (!el) return;
    const x = C.S.filo, l = x ? aktifler(x) : [];
    const goster = l.length > 1 || (x && x.tekneler.some(t => t.id === C.S.tekne && t.durum !== "aktif"));
    el.hidden = !goster; if (bn) bn.hidden = !!goster;
    if (!goster) return;
    const secenek = x.tekneler.filter(t => t.durum === "aktif" || t.id === C.S.tekne);
    el.innerHTML = secenek.map(t => '<option value="' + C.esc(t.id) + '"' + (t.id === C.S.tekne ? " selected" : "") + '>' + C.esc(tekneAdi(x, t.id, t.id === C.S.tekne ? C.S.set : null) + (t.durum === "arsiv" ? " · " + C.t("arşiv") : "")) + '</option>').join("");
    el.setAttribute("aria-label", C.t("Tekne"));
  }

  function viewTekneler() {
    const { esc, t } = C, x = C.S.filo || indeks(null), son = aktifler(x).length <= 1;
    const satir = (tk, i, l) => '<li class="tkrow"><span class="tkad"><input type="text" maxlength="120" data-tkad="' + esc(tk.id) + '" value="' + esc(tk.ad) + '" placeholder="' + esc(tekneAdi(x, tk.id, tk.id === C.S.tekne ? C.S.set : null)) + '" aria-label="' + esc(t("Tekne adı")) + '">' +
      (tk.id === C.S.tekne ? '<span class="chip in">' + esc(t("Açık")) + '</span>' : "") + (tk.id === ANA ? '<span class="chip">' + esc(t("İlk tekne")) + '</span>' : "") + '</span><span class="btns">' +
      '<button type="button" class="btn sm" data-tkkaydet="' + esc(tk.id) + '">' + esc(t("Adı kaydet")) + '</button>' +
      (tk.durum === "aktif" ? (tk.id !== C.S.tekne ? '<button type="button" class="btn sm pri" data-tksec="' + esc(tk.id) + '">' + esc(t("Aç")) + '</button>' : "") +
        (i > 0 ? '<button type="button" class="btn sm" data-tkyukari="' + esc(tk.id) + '" aria-label="' + esc(t("Yukarı taşı")) + '">↑</button>' : "") +
        (i < l.length - 1 ? '<button type="button" class="btn sm" data-tkasagi="' + esc(tk.id) + '" aria-label="' + esc(t("Aşağı taşı")) + '">↓</button>' : "") +
        (son ? "" : '<button type="button" class="btn sm" data-tkarsiv="' + esc(tk.id) + '">' + esc(t("Arşivle")) + '</button>')
        : '<button type="button" class="btn sm" data-tkac="' + esc(tk.id) + '">' + esc(t("Arşivden çıkar")) + '</button>' + (tk.id !== C.S.tekne ? '<button type="button" class="btn sm" data-tksec="' + esc(tk.id) + '">' + esc(t("Kayıtlarını gör")) + '</button>' : "")) +
      '</span></li>';
    const ak = x.tekneler.filter(tk => tk.durum === "aktif"), ar = x.tekneler.filter(tk => tk.durum !== "aktif");
    return '<div class="panel"><h3>' + esc(t("Şirket")) + '</h3><p class="small">' + esc(t("Raporlarda ve şirket panelinde görünür.")) + '</p><div class="tkekle"><input type="text" id="sirketAd" maxlength="200" value="' + esc(x.sirket.ad) + '" placeholder="' + esc(t("Şirket adı")) + '" aria-label="' + esc(t("Şirket adı")) + '"><button type="button" class="btn" id="sirketKaydet">' + esc(t("Kaydet")) + '</button></div></div>' +
      '<div class="panel"><h3>' + esc(t("Tekneler")) + '</h3><p class="small">' + esc(t("Her teknenin kendi kasası, hesapları, kartları, ayarları ve dönemleri vardır. Bir teknenin kaydı başka teknenin kasasını etkilemez.")) + '</p><ul class="rows tklist">' + ak.map(satir).join("") + '</ul>' +
      '<div class="tkekle"><input type="text" id="yeniTekne" maxlength="120" placeholder="' + esc(t("Yeni teknenin adı")) + '" aria-label="' + esc(t("Yeni teknenin adı")) + '"><button type="button" class="btn pri" id="tekneEkle">' + esc(t("Tekne ekle")) + '</button></div></div>' +
      (ar.length ? '<div class="panel"><h3>' + esc(t("Arşivdeki tekneler")) + '</h3><p class="small">' + esc(t("Arşivlenen teknenin kayıtları silinmez; istediğiniz zaman geri açabilirsiniz.")) + '</p><ul class="rows tklist">' + ar.map(satir).join("") + '</ul></div>' : "");
  }

  function viewSirket() {
    const { esc, t } = C, x = C.S.filo || indeks(null);
    if (K.ozellik && !K.ozellik("sirket_paneli")) return '<div class="note"><span><b>' + esc(t("Şirket paneli")) + '</b>' + esc(t("Bu özellik paketinizde yok.")) + '</span></div>';
    if (!F.ay) F.ay = K.curYM();
    if (!F.panel || F.panel.ay !== F.ay) { panelYukle(); return '<div class="loading">' + esc(t("Tekneler yükleniyor…")) + '</div>'; }
    if (F.panel.hata) return '<div class="note err"><span><b>' + esc(t("Şirket paneli açılamadı")) + '</b>' + esc(F.panel.hata) + '</span></div>';
    const oz = F.panel.oz, aylar = []; for (let i = 0; i < 12; i++) aylar.push(K.addMonth(K.curYM(), -i));
    let h = '<div class="panel"><h3>' + esc(x.sirket.ad || t("Şirket paneli")) + '</h3><div class="filters"><select id="sirketAy" class="pill" aria-label="' + esc(t("Dönem")) + '">' + aylar.map(m => '<option value="' + m + '"' + (m === F.ay ? " selected" : "") + '>' + esc(K.monthLabel(m)) + '</option>').join("") + '</select><button type="button" class="btn sm" data-go="tekneler">' + esc(t("Tekneleri düzenle")) + '</button></div>';
    h += '<div class="tkozet"><div class="tkk"><span class="lbl">' + esc(t("Tekne sayısı")) + '</span><span class="v">' + aktifler(x).length + '</span>' + (x.tekneler.length > aktifler(x).length ? '<span class="from">' + esc(t("{n} tekne arşivde", { n: x.tekneler.length - aktifler(x).length })) + '</span>' : "") + '</div>';
    for (const tp of oz.toplam) h += '<div class="tkk"><span class="lbl">' + esc(t("Toplam kalan kasa")) + (oz.toplam.length > 1 ? " · " + esc(tp.para) : "") + '</span><span class="v' + (tp.kalan < 0 ? " neg" : "") + '">' + para(tp.kalan, tp.para) + '</span><span class="from">' + esc(t("Gelen {a} · Harcama {b}", { a: para(tp.gelen, tp.para), b: para(tp.gider, tp.para) })) + '</span></div>';
    h += '</div></div>';
    // one row per boat
    h += '<div class="panel"><h3>' + esc(t("Tekneler · {ay}", { ay: K.monthLabel(F.ay) })) + '</h3><div class="tablo"><table class="sirkett"><thead><tr><th>' + esc(t("Tekne")) + '</th><th>' + esc(t("Kalan kasa")) + '</th><th>' + esc(t("Gelen para")) + '</th><th>' + esc(t("Toplam harcama")) + '</th><th>' + esc(t("Nakit")) + '</th><th>' + esc(t("Kart")) + '</th><th>' + esc(t("Banka ve diğer")) + '</th><th>' + esc(t("Fotoğrafsız")) + '</th></tr></thead><tbody>' +
      oz.satir.map(s => '<tr><td><button type="button" class="linkbtn" data-tksec="' + esc(s.id) + '">' + esc(s.ad) + '</button></td><td class="r' + (s.kalan < 0 ? " neg" : "") + '">' + para(s.kalan, s.para) + '</td><td class="r">' + para(s.gelen, s.para) + '</td><td class="r">' + para(s.gider, s.para) + '</td><td class="r">' + para(s.nakit, s.para) + '</td><td class="r">' + para(s.kart, s.para) + '</td><td class="r">' + para(s.diger, s.para) + '</td><td class="r">' + (s.fotosuz ? '<b>' + s.fotosuz + '</b>' : "0") + '</td></tr>').join("") +
      '</tbody></table></div>' + (oz.satir.some(s => s.fotosuz) ? '<p class="small">' + esc(t("Fotoğrafsız: bu ay fişi fotoğraflanmamış harcama sayısı.")) + '</p>' : "") + '</div>';
    // comparison bars, scaled within each currency
    const cubuk = (baslik, alan) => {
      let b = '<div class="panel"><h3>' + esc(baslik) + '</h3><div class="tkbars">';
      for (const tp of oz.toplam.length ? oz.toplam : [{ para: "TRY" }]) {
        const l = oz.satir.filter(s => s.para === tp.para), en = Math.max(1, ...l.map(s => Math.abs(s[alan])));
        b += l.map(s => '<div class="tkbar"><span class="tkbad">' + esc(s.ad) + '</span><span class="tkbiz"><i style="width:' + Math.round(Math.abs(s[alan]) / en * 100) + '%"></i></span><span class="tkbv">' + para(s[alan], s.para) + '</span></div>').join("");
      }
      return b + '</div></div>';
    };
    return h + cubuk(t("Tekne karşılaştırma · harcama"), "gider") + cubuk(t("Tekne karşılaştırma · gelen para"), "gelen");
  }
  async function panelYukle() {
    if (F.yukleniyor) return; F.yukleniyor = true;
    const ay = F.ay;
    try { const l = await defterler(false); F.panel = { ay, oz: sirketOzeti(l, ay) }; }
    catch (e) { F.panel = { ay, hata: e.message }; }
    finally { F.yukleniyor = false; }
    if (C.S.tab === "sirket") C.render();
  }

  // clicks on the two pages; true when handled
  function tikla(el) {
    if (!C) return false;
    const { t } = C;
    const b = s => el.closest("[" + s + "]"), v = (n, s) => n.getAttribute(s);
    const hata = e => C.toast(e.message);
    let n;
    if (el.closest('[data-menu="sirket"],[data-go="sirket"]') && !izin("sirket_paneli", t("Şirket paneli"))) return true;
    if ((n = b("data-tksec"))) { sec(v(n, "data-tksec")).then(() => { C.S.tab = "list"; C.render(); }).catch(hata); return true; }
    if (el.closest("#tekneEkle")) {
      const i = document.getElementById("yeniTekne"), ad = (i && i.value || "").trim();
      if (!ad) { C.toast(t("Teknenin adını yazın.")); if (i) i.focus(); return true; }
      if (aktifler(C.S.filo).length >= 1 && !izin("coklu_tekne", t("Birden çok tekne"))) return true;
      const id = yeniId();
      listeDegistir(x => { x.tekneler.push({ id, ad, sira: Math.max(0, ...x.tekneler.map(k => k.sira)) + 1, durum: "aktif", zaman: K.damga() }); })
        .then(() => { F.panel = null; C.render(); C.toast(t("Tekne eklendi: {ad}", { ad })); }).catch(hata);
      return true;
    }
    if ((n = b("data-tkkaydet"))) {
      const id = v(n, "data-tkkaydet"), i = document.querySelector('[data-tkad="' + id + '"]'), ad = (i && i.value || "").trim();
      listeDegistir(x => { const k = x.tekneler.find(z => z.id === id); if (k) { k.ad = ad; k.zaman = damga(k); } }).then(() => { F.panel = null; C.render(); C.toast(t("Tekne adı kaydedildi.")); }).catch(hata);
      return true;
    }
    if ((n = b("data-tkarsiv")) || (n = b("data-tkac"))) {
      const ars = n.hasAttribute("data-tkarsiv"), id = v(n, ars ? "data-tkarsiv" : "data-tkac");
      listeDegistir(x => { const k = x.tekneler.find(z => z.id === id); if (k) { k.durum = ars ? "arsiv" : "aktif"; k.zaman = damga(k); } })
        .then(async () => { F.panel = null; if (ars && id === C.S.tekne) await sec(aktifler(C.S.filo)[0].id); C.render(); C.toast(ars ? t("Tekne arşivlendi. Kayıtları silinmedi.") : t("Tekne arşivden çıkarıldı.")); }).catch(hata);
      return true;
    }
    if ((n = b("data-tkyukari")) || (n = b("data-tkasagi"))) {
      const yukari = n.hasAttribute("data-tkyukari"), id = v(n, yukari ? "data-tkyukari" : "data-tkasagi");
      listeDegistir(x => {
        const l = x.tekneler.filter(z => z.durum === "aktif"), i = l.findIndex(z => z.id === id), j = yukari ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= l.length) return;
        [l[i], l[j]] = [l[j], l[i]];
        l.forEach((z, s) => { if (z.sira !== s) { z.sira = s; z.zaman = damga(z); } });
      }).then(() => C.render()).catch(hata);
      return true;
    }
    if (el.closest("#sirketKaydet")) {
      const i = document.getElementById("sirketAd"), ad = (i && i.value || "").trim();
      listeDegistir(x => { x.sirket = { ad, zaman: K.damga(x.sirket.zaman) }; }).then(() => { C.render(); C.toast(t("Şirket adı kaydedildi.")); }).catch(hata);
      return true;
    }
    return false;
  }
  function degisti(el) {
    if (!C) return false;
    if (el.id === "tekneSec") { sec(el.value).catch(e => C.toast(e.message)); return true; }
    if (el.id === "sirketAy") { F.ay = el.value; F.panel = null; C.render(); return true; }
    return false;
  }

  function kur(ctx) {
    C = ctx;
    C.S.tekne = oku("kj-tekne") || ANA;
    // for the consolidated report (Rapor Uzmanı) and anything else that needs every boat
    g.KJ_TEKNELER = async () => (await defterler(true)).map(d => ({ id: d.id, ad: d.ad, durum: d.durum, defter: d.defter }));
    g.KJ_SIRKET = () => ({ ad: ((C.S.filo || {}).sirket || {}).ad || "" });
  }
  g.KJ_FILO = {
    kur, listeAl, baslik, tikla, degisti, sec, defterler,
    view: tab => tab === "tekneler" ? viewTekneler() : viewSirket(),
    yenile: () => { F.panel = null; }
  };
})(typeof window !== "undefined" ? window : globalThis);
