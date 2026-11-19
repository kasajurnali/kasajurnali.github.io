/* Yachting Jurnal — değişiklik geçmişi (yerel denetim izi).
   1) Bir kayıt düzenlendiğinde, değişen alanların ÖNCEKİ değerleri, zaman ve (varsa) cihaz/kişi kaydın içindeki
      `gecmis` dizisine eklenir (en yeni 20 değişiklik tutulur):
        gecmis: [{ zaman: ISO, kim: "PC · ad@ornek.com", eski: { amount: 1200, desc: "..." } },
                 { zaman: ISO, kim, islem: "sil" }, { zaman: ISO, kim, islem: "geri" }]
   2) Silinen kayıt, defterin `silinenKayitlar` arşivinde 400 gün saklanır ve geri yüklenebilir:
        silinenKayitlar: { <id>: { zaman: ISO (silinme), kim, kayit: {...silinmeden önceki hâli} } }
   Eşitleme: K.birlestir, K.ayniMi ve K.uzakHali burada sarılır (hesap.js'e dokunmadan):
     - aynı kaydın iki sürümündeki geçmişler birleşir (zamana göre sıralı, en yeni 20),
     - arşiv kimlik kimlik birleşir (en yeni silinme kalır); yaşayan (geri yüklenmiş ya da silindikten sonra
       düzenlenmiş) kayıtların arşiv girdisi düşer; 400 günden eski girdiler ve 2000'i aşan en eskiler atılır.
   Sonuç birleştirme sırasından bağımsızdır ve iki kez birleştirmek sonucu değiştirmez. */
"use strict";
(function (g) {
  const K = g.KJ;
  if (!K || K.gecmis) return;
  const SINIR = 20, ARSIV_GUN = 400, ARSIV_SINIR = 2000;
  // izlenmeyen alanlar: kimlik, zaman damgaları, geçmişin kendisi, içe aktarma sırası/kaynağı
  const IZLENMEZ = new Set(["id", "createdAt", "updatedAt", "gecmis", "ord", "src"]);
  const nesne = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const ISO = z => { if (!z) return ""; const p = Date.parse(z); return isNaN(p) ? "" : new Date(p).toISOString(); };
  const kar = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  /* ---------------- düzenleme ---------------- */
  // değişen alanlar → önceki değerleri (önceden olmayan alan için null)
  function fark(eski, yeni) {
    eski = nesne(eski); yeni = nesne(yeni);
    const d = {};
    for (const k of new Set([...Object.keys(eski), ...Object.keys(yeni)])) {
      if (IZLENMEZ.has(k)) continue;
      if (k === "para" && (eski[k] == null || eski[k] === "")) continue;   // the book currency mark added to an older entry is not a change
      const a = eski[k] === undefined || eski[k] === "" ? null : eski[k], b = yeni[k] === undefined || yeni[k] === "" ? null : yeni[k];
      if (K.sabit(a) !== K.sabit(b)) d[k] = a;
    }
    return d;
  }
  const sinirla = l => l.length > SINIR ? l.slice(l.length - SINIR) : l;
  const gecerliGirdi = x => x && typeof x === "object" && ISO(x.zaman);
  // Kaydedilecek yeni sürüme (yeni) eski sürümün geçmişini taşır ve değişiklik varsa bir girdi ekler. yeni'yi döndürür.
  function izle(eski, yeni, kim) {
    if (!eski) return yeni;
    const once = (Array.isArray(eski.gecmis) ? eski.gecmis : []).filter(gecerliGirdi);
    const d = fark(eski, yeni);
    const l = Object.keys(d).length ? once.concat([Object.assign({ zaman: ISO(yeni.updatedAt) || new Date().toISOString() }, kim ? { kim } : {}, { eski: d })]) : once;
    if (l.length) yeni.gecmis = sinirla(l); else delete yeni.gecmis;
    return yeni;
  }
  // iki sürümün geçmişini birleştirir: aynı girdi bir kez, zamana göre, en yeni 20
  function gecmisBirlestir(...listeler) {
    const m = new Map();
    for (const l of listeler) for (const x of (Array.isArray(l) ? l : [])) if (gecerliGirdi(x)) m.set(K.sabit(x), x);
    return sinirla([...m.entries()].sort((a, b) => kar(ISO(a[1].zaman), ISO(b[1].zaman)) || kar(a[0], b[0])).map(x => x[1]));
  }

  /* ---------------- silme ve geri yükleme ---------------- */
  // silinen kaydın arşiv girdisi (kaydın geçmişine "silindi" satırı da eklenir)
  function arsivKaydi(kayit, zaman, kim) {
    const k = JSON.parse(JSON.stringify(kayit || {}));
    const z = ISO(zaman) || new Date().toISOString();
    k.gecmis = sinirla((Array.isArray(k.gecmis) ? k.gecmis : []).filter(gecerliGirdi).concat([Object.assign({ zaman: z }, kim ? { kim } : {}, { islem: "sil" })]));
    const para = K.paraKodu ? K.paraKodu() : "";   // the book's currency at deletion: a restore into another currency is refused
    return Object.assign({ zaman: z }, kim ? { kim } : {}, para ? { para } : {}, { kayit: k });
  }
  // may this archived entry be restored into a book kept in "para"? (entries from before currencies: lira)
  const paraUyar = (girdi, para) => (nesne(girdi).para || "TRY") === (para || "TRY");
  // arşivden geri yüklenecek kayıt: silinmeden sonraki bir damga alır (eşitlemede silinmenin önüne geçer)
  function geriYukle(girdi, kim) {
    const k = JSON.parse(JSON.stringify(nesne(girdi).kayit || {}));
    k.updatedAt = K.damga(ISO(girdi.zaman) || k.updatedAt);
    k.gecmis = sinirla((Array.isArray(k.gecmis) ? k.gecmis : []).filter(gecerliGirdi).concat([Object.assign({ zaman: k.updatedAt }, kim ? { kim } : {}, { islem: "geri" })]));
    return k;
  }
  const gecerliArsiv = (id, x) => x && typeof x === "object" && ISO(x.zaman) && x.kayit && typeof x.kayit === "object" && x.kayit.id === id;
  // arşivleri birleştirir; yaşayan kayıtların girdisini, 400 günden eskileri ve fazlasını atar
  function arsivBirlestir(SA, SB, yasayan, simdi) {
    const omur = new Date((simdi || Date.now()) - ARSIV_GUN * 864e5).toISOString();
    const r = {};
    for (const S of [nesne(SA), nesne(SB)]) for (const id in S) {
      const x = S[id]; if (!gecerliArsiv(id, x)) continue;
      const o = r[id];
      if (!o || ISO(x.zaman) > ISO(o.zaman) || (ISO(x.zaman) === ISO(o.zaman) && K.sabit(x) > K.sabit(o))) r[id] = x;
    }
    const canli = yasayan instanceof Set ? yasayan : new Set(yasayan || []);
    const ids = Object.keys(r).filter(id => !canli.has(id) && ISO(r[id].zaman) >= omur)
      .sort((a, b) => kar(ISO(r[b].zaman), ISO(r[a].zaman)) || kar(a, b)).slice(0, ARSIV_SINIR);
    const out = {}; ids.sort().forEach(id => { out[id] = r[id]; });
    return out;
  }
  // arşiv listesi, en son silinen en üstte
  const arsivListesi = S => Object.entries(nesne(S)).filter(([id, x]) => gecerliArsiv(id, x)).sort((a, b) => kar(ISO(b[1].zaman), ISO(a[1].zaman))).map(([id, x]) => Object.assign({ id }, x));

  /* ---------------- eşitleme birleştirmesine bağlantı ---------------- */
  const asilBirlestir = K.birlestir, asilAyni = K.ayniMi, asilUzak = K.uzakHali;
  K.birlestir = function (A, B, simdi) {
    const M = asilBirlestir(A, B, simdi);
    const surum = new Map();
    for (const D of [nesne(A), nesne(B)]) for (const e of (Array.isArray(D.kayitlar) ? D.kayitlar : [])) {
      if (!e || typeof e.id !== "string" || !Array.isArray(e.gecmis) || !e.gecmis.length) continue;
      (surum.get(e.id) || surum.set(e.id, []).get(e.id)).push(e.gecmis);
    }
    M.kayitlar = M.kayitlar.map(e => {
      const ls = surum.get(e.id); if (!ls) return e;
      const gm = gecmisBirlestir(...ls);
      return K.sabit(gm) === K.sabit(e.gecmis || null) ? e : Object.assign({}, e, { gecmis: gm });
    });
    M.silinenKayitlar = arsivBirlestir(nesne(A).silinenKayitlar, nesne(B).silinenKayitlar, new Set(M.kayitlar.map(e => e.id)), simdi);
    return M;
  };
  K.ayniMi = (X, Y) => asilAyni(X, Y) && K.sabit(nesne(nesne(X).silinenKayitlar)) === K.sabit(nesne(nesne(Y).silinenKayitlar));
  K.uzakHali = (D, cihaz) => Object.assign(asilUzak(D, cihaz), { silinenKayitlar: nesne(nesne(D).silinenKayitlar) });

  /* ---------------- gösterim ---------------- */
  const ALAN = {
    type: "Kayıt türü", date: "Tarih", amount: "Tutar", vendor: "Şirket / satıcı", desc: "Açıklama", cat: "Kategori", hesap: "Hesap",
    hedef: "Hedef hesap", pay: "Ödeme şekli", note: "Not", photo: "Fiş fotoğrafı", lt: "Yakıt (litre)", cur: "Para birimi",
    fxAmount: "Döviz tutarı", fxRate: "Kur", iadeOf: "İade edilen harcama", para: "Defter para birimi"
  };
  const TUR = { out: "Harcama", in: "Gelen para", tr: "Transfer", iade: "İade" };
  // c: { hesapAd(id) } — uygulamanın hesap adı biçimi
  function deger(k, v, c) {
    const t = K.t;
    if (v == null || v === "") return t("(boş)");
    if (k === "amount") return K.tl(v);
    if (k === "fxAmount" || k === "fxRate" || k === "lt") return K.qty(v);
    if (k === "date") return K.dmy(String(v));
    if (k === "type") return t(TUR[v] || String(v));
    if (k === "cat") return K.catLabel(v);
    if ((k === "hesap" || k === "hedef") && c && c.hesapAd) return c.hesapAd(v);
    if (k === "pay") return K.payName(v) || String(v);
    if (k === "photo") return t("fotoğraf vardı");
    if (k === "iadeOf") return t("başka bir harcama");
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  const zamanYazi = z => K.dateTime(new Date(z));
  // kayıt formundaki "Değişiklik geçmişi" bölümü (geçmiş yoksa boş)
  function formHTML(kayit, c) {
    const l = (Array.isArray(kayit && kayit.gecmis) ? kayit.gecmis : []).filter(gecerliGirdi);
    if (!l.length) return "";
    const t = K.t, esc = K.esc;
    const satir = x => {
      const bas = '<b>' + esc(zamanYazi(x.zaman)) + '</b>' + (x.kim ? ' · ' + esc(x.kim) : "");
      if (x.islem === "sil") return '<li>' + bas + ' — ' + esc(t("Kayıt silindi.")) + '</li>';
      if (x.islem === "geri") return '<li>' + bas + ' — ' + esc(t("Kayıt geri yüklendi.")) + '</li>';
      const d = nesne(x.eski);
      return '<li>' + bas + '<ul>' + Object.keys(d).map(k => '<li>' + esc(t(ALAN[k] || k)) + ': ' + esc(t("önceki değer")) + ' <i>' + esc(deger(k, d[k], c)) + '</i></li>').join("") + '</ul></li>';
    };
    return '<details class="field full gecmis"><summary>' + esc(t("Değişiklik geçmişi ({n})", { n: l.length })) + '</summary>' +
      '<ol class="gecmisl">' + l.slice().reverse().map(satir).join("") + '</ol>' +
      '<p class="hint">' + esc(t("Bu cihazda ve eşitlenen cihazlarda tutulan son {n} değişiklik. Değiştirilmiş fotoğraflar saklanmaz.", { n: SINIR })) + '</p></details>';
  }
  // silinen kayıtlar penceresinin listesi
  function arsivHTML(S, c) {
    const t = K.t, esc = K.esc, l = arsivListesi(S);
    if (!l.length) return '<p class="lead">' + esc(t("Silinen kayıt yok.")) + '</p>';
    return '<p class="lead">' + esc(t("Silinen kayıtlar {n} gün saklanır; geri yüklenen kayıt eski yerine döner.", { n: ARSIV_GUN })) + '</p><ul class="rows">' + l.map(x => {
      const k = x.kayit, ad = k.vendor || k.desc || t(TUR[k.type] || "Harcama");
      const kapali = c && c.isClosed && c.isClosed((k.date || "").slice(0, 7));
      return '<li class="silrow"><span class="t"><span class="ds">' + esc(K.dmy(k.date) + " · " + ad + " · " + K.tl(k.amount)) + '</span><span class="mt">' +
        esc(t("Silinme: {zaman}", { zaman: zamanYazi(x.zaman) }) + (x.kim ? " · " + x.kim : "") + (kapali ? " · " + t("kapanmış dönem") : "")) + '</span></span>' +
        '<button type="button" class="btn sm" data-geriyukle="' + esc(x.id) + '">' + esc(t("Geri yükle")) + '</button></li>';
    }).join("") + '</ul>';
  }

  K.gecmis = { SINIR, ARSIV_GUN, ARSIV_SINIR, fark, izle, gecmisBirlestir, arsivKaydi, paraUyar, geriYukle, arsivBirlestir, arsivListesi, formHTML, arsivHTML, deger };
})(typeof window !== "undefined" ? window : globalThis);
