/* Yachting Jurnal — paketler ve özellik kilidi (Free / Starter / Pro / Advanced; iç kodlar ucretsiz / basic / pro / fleet).
   KJ.ozellik(ad) → bu özellik şu an kullanılabilir mi? Bilgi, erişim sunucusunun (yonetim/Kod.gs) "giris" yanıtındaki
   abonelik.haklar listesinden gelir (KJSenk.bilgi().lisans). Her şey açık olan durumlar: erişim sunucusu kapalı ya da
   tanımsız (Windows programı, testler), lisans henüz bilinmiyor, deneme süresi, sahip/yönetici.
   KJ.ozellikIste(ad) → açıksa true; kilitliyse kibar bir "Pro ile açılır" penceresi gösterir, false döner.
   Özellik adları (app.js ve diğer dosyalardaki giriş noktaları bunları kullanır):
     Starter (basic): tek_tekne, kasa, gelir_gider, pdf_rapor
     Pro   : + coklu_hesap (ikinci kart/hesap), excel (Excel'e dışa aktarma), fis_arsivi (Fişler sayfası),
             gelismis_filtre, ekstre_eslestirme, fis_okuma
     Advanced (fleet): + coklu_tekne (ikinci tekne), sirket_paneli, konsolide_rapor, personel, onay
   HAKLAR, yonetim/Kod.gs'teki HAKLAR ile aynı tutulur (sunucu eski bir sürümse liste buradan tamamlanır). */
(function (g) {
  "use strict";
  const KJ = g.KJ = g.KJ || {};
  const PAKETLER = ["ucretsiz", "basic", "pro", "fleet"];
  const ESKI = { standart: "basic", premium: "pro" };   // 3.0 paket kodları
  const u = ["tek_tekne", "kasa", "gelir_gider"], b = u.concat(["pdf_rapor"]);
  const p = b.concat(["coklu_hesap", "excel", "fis_arsivi", "gelismis_filtre", "ekstre_eslestirme", "fis_okuma"]);
  const f = p.concat(["coklu_tekne", "sirket_paneli", "konsolide_rapor", "personel", "onay"]);
  const HAKLAR = { ucretsiz: u, basic: b, pro: p, fleet: f };
  // görünen paket adları (marka adları, çevrilmez); iç kodlar ucretsiz/basic/pro/fleet değişmez
  const AD = { ucretsiz: "Free", basic: "Starter", pro: "Pro", fleet: "Advanced" };
  const ADLAR = Object.assign({ standart: AD.basic, premium: AD.pro }, AD);   // standart/premium: 3.0 kodları
  const t = (s, v) => (KJ.t ? KJ.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));

  const paketKodu = x => { const k = String(x || "").trim().toLowerCase(); return ESKI[k] || k; };
  // özelliği açan en düşük paket ("pro", "fleet"); bilinmeyen ad için ""
  const ozellikPaketi = ad => PAKETLER.find(k => k !== "ucretsiz" && HAKLAR[k].includes(ad)) || "";

  // şu anki lisans; erişim denetimi yoksa null (= her şey açık)
  function lisans() {
    const S = g.KJSenk && g.KJSenk.bilgi ? g.KJSenk.bilgi() : null;
    if (!S || !S.lisansAcik || !S.bagli) return null;
    const L = S.lisans;
    if (!L || L.kapali) return null;
    return L;
  }
  // kullanıcının paketi ve hakları; null = sınırsız
  function haklar() {
    const L = lisans();
    if (!L || L.yonetici || L.deneme || L.durum === "deneme") return null;
    const a = L.abonelik || {}, pk = paketKodu(a.paket);
    if (Array.isArray(a.haklar) && a.haklar.length) return a.haklar.slice();
    return (HAKLAR[pk] || (a.paket ? [] : HAKLAR.pro)).slice();   // 3.0 sunucusu: paketsiz açık kayıt = Pro
  }
  function ozellik(ad) {
    const h = haklar();
    return !h || h.includes(ad);
  }
  function paket() {
    const L = lisans();
    if (!L) return "";
    return L.yonetici || L.deneme ? "fleet" : paketKodu((L.abonelik || {}).paket);
  }

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // kilitli özellik penceresi: Kapat (#closeSheet) ve Hesabım (data-menu) düğmelerini app.js zaten tanır
  function kilitPenceresi(ad, baslik) {
    const host = g.document && g.document.getElementById("sheetHost");
    if (!host) return;
    const pk = ozellikPaketi(ad) || "pro", pAd = AD[pk];
    const h = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh" id="kilitSheet" data-ozellik="' + esc(ad) + '">' +
      '<h3 id="sh">' + esc(t("{paket} ile açılır", { paket: pAd })) + '</h3>' +
      '<p class="lead">' + esc(baslik ? t("“{ozellik}” {paket} paketinde var.", { ozellik: baslik, paket: pAd }) : t("Bu özellik {paket} paketinde var.", { paket: pAd })) + ' ' +
      esc(t("Kayıtlarınız olduğu gibi kalır; paketi yükselttiğinizde hemen açılır.")) + '</p>' +
      '<div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Kapat")) + '</button>' +
      '<button type="button" class="btn pri" data-menu="hesabim">' + esc(t("Paketleri gör")) + '</button></div></div></div></div>';
    host.innerHTML = h;
  }
  // giriş noktalarında: if (!KJ.ozellikIste("excel", t("Excel tablosu"))) return;
  function ozellikIste(ad, baslik) {
    if (ozellik(ad)) return true;
    kilitPenceresi(ad, baslik);
    return false;
  }

  Object.assign(KJ, { PAKETLER, PAKET_AD: ADLAR, paketAdi: x => ADLAR[paketKodu(x)] || String(x || ""), PAKET_HAKLARI: HAKLAR, paketKodu, ozellikPaketi, ozellik, ozellikIste, paket, paketHaklari: haklar });
})(typeof window !== "undefined" ? window : globalThis);
