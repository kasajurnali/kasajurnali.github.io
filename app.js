/* Yachting Jurnal — window logic. On the computer everything is saved through the local program; on the iPhone
   through the app's own storage (sw.js + yerel.js). Google Drive synchronisation is in senk.js. */
"use strict";
(function () {
  const K = window.KJ;
  const { tl, num, fx, esc, dmy, monthLabel, shortMon, addMonth, todayISO, curYM, isIn, r2, lower, pad, t } = K;
  const meta = n => (document.querySelector('meta[name="' + n + '"]') || {}).content || "";
  const TOKEN = meta("kj-token"), SURUM = meta("kj-surum"), META_DIL = meta("kj-dil");
  const WEB = meta("kj-ortam") === "web";       // the iPhone app (installed from the web page) instead of the Windows program
  const $ = s => document.querySelector(s);
  const toNum = v => K.toNumInput(v);            // numbers typed into the boxes follow the chosen language
  const defaultSet = () => ({ opening: null, openingDate: null, name: "", preparedBy: "", approvedBy: "", lowLimit: 10000, rates: {}, closed: [], openedThrough: null, lang: null, kabul: null });
  const S = { items: [], set: defaultSet(), setBase: {}, silinenler: {}, senk: null, gbag: null, guncel: null, rev: -1, period: null, q: "", cat: "", tab: "ana", imp: null, mode: "loading", saving: 0, lastSaved: null, saveErr: null, offline: false, klasor: "", dosya: "", ph: null, editing: null, catTouched: false, notice: "", first: false, terms: null };

  const kasaFor = p => K.kasaFor(S.items, S.set, p);
  const runningMap = () => K.runningMap(S.items, S.set);
  const monthRange = () => K.monthRange(S.items, S.set);
  const isClosed = m => K.isClosed(S.set, m);
  const periodItems = () => S.items.filter(e => S.period === "all" || (e.date || "").slice(0, 7) === S.period);
  const allCats = () => [...new Set([...K.CATS, ...S.items.map(i => i.cat).filter(Boolean)])];
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fotoURL = id => "foto/" + id + (WEB ? "" : "?t=" + encodeURIComponent(TOKEN));
  const clone = o => JSON.parse(JSON.stringify(o));
  const hm = d => d ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : "";
  const curBalance = () => kasaFor("all").kalan;
  const modalOpen = () => !!$("#sheetHost .scrim");
  const mustAccept = () => !!(S.terms && S.terms.mode === "accept");

  const ICON = {
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    fuel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>'
  };

  /* ---------------- language ---------------- */
  const dilSec = () => (S.set.lang === "tr" || S.set.lang === "en") ? S.set.lang : (META_DIL === "tr" || META_DIL === "en") ? META_DIL : (/^tr/i.test(navigator.language || "") ? "tr" : "en");
  function applyLang() {
    const l = K.setLang(dilSec());
    document.documentElement.lang = l;
    document.querySelectorAll("[data-t]").forEach(el => { if (el.dataset.src == null) el.dataset.src = el.textContent.trim(); el.textContent = t(el.dataset.src); });
    document.querySelectorAll("[data-t-title]").forEach(el => { el.title = t(el.dataset.tTitle); });
    document.querySelectorAll("[data-t-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.tAria)); });
    document.querySelectorAll(".langsw [data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
    renderFoot();
    if (S.kur) kurCiz();
    muzikDugme();
  }
  async function setLanguage(l) {
    if ((l !== "tr" && l !== "en") || (l === K.lang && S.set.lang === l)) return;
    const prev = S.set.lang;
    S.set.lang = l; applyLang(); render(); if (S.terms) renderTerms();
    if (S.mode !== "live") return;
    try { await persistSettings(); }
    catch (e) { S.set.lang = prev; applyLang(); render(); if (S.terms) renderTerms(); toast(e.message); }
  }
  const langSwitchHTML = () => '<span class="langsw" role="group" aria-label="Dil / Language"><button type="button" data-lang="tr" aria-pressed="' + (K.lang === "tr") + '">TR</button><button type="button" data-lang="en" aria-pressed="' + (K.lang === "en") + '">EN</button></span>';
  function renderFoot() {
    const fp = $("#footPath"); if (fp) fp.textContent = WEB ? t("Kayıtlar bu telefonda saklanır.") : S.klasor ? t("Kayıtlar: {yol}", { yol: S.klasor }) : t("Kayıtlar bu bilgisayarda saklanır. İnternet gerekmez.");
    const fk = $("#footKeys"); if (fk && WEB) fk.hidden = true; else if (fk) fk.innerHTML = esc(t("Kısayollar:")) + ' <kbd>Ctrl</kbd>+<kbd>S</kbd> ' + esc(t("kaydet")) + ' · <kbd>N</kbd> ' + esc(t("yeni fiş")) + ' · <kbd>' + esc(t("G")) + '</kbd> ' + esc(t("gelen para")) + ' · <kbd>Esc</kbd> ' + esc(t("kapat"));
  }

  /* ---------------- number boxes: separators appear while typing (15000 → 15.000) ---------------- */
  const SEP = () => K.lang === "en" ? { g: ",", d: "." } : { g: ".", d: "," };
  const group = (ip, g) => ip.replace(/\B(?=(\d{3})+(?!\d))/g, g);
  function fmtNumBox(el) {
    const { g, d } = SEP(), max = +(el.dataset.dec || 2);
    const v = el.value, caret = el.selectionStart == null ? v.length : el.selectionStart;
    let before = 0;                                  // digits and decimal mark typed before the caret
    for (let i = 0; i < caret && i < v.length; i++) if (/\d/.test(v[i]) || (v[i] === d && max > 0)) before++;
    const neg = el.dataset.neg === "1" && /^\s*-/.test(v);
    let s = v.split(g).join("").replace(d === "," ? /[^0-9,]/g : /[^0-9.]/g, "");
    const di = max > 0 ? s.indexOf(d) : -1;
    let ip = di < 0 ? s.split(d).join("") : s.slice(0, di), fp = di < 0 ? null : s.slice(di + 1).split(d).join("").slice(0, max);
    const z = ip.length - ip.replace(/^0+(?=\d)/, "").length; ip = ip.slice(z); before = Math.max(0, before - z);
    if (ip === "" && fp !== null) { ip = "0"; before++; }
    const out = (neg ? "-" : "") + group(ip, g) + (fp !== null ? d + fp : "");
    let pos = neg ? 1 : 0, n = 0;
    while (pos < out.length && n < before) { if (/\d/.test(out[pos]) || out[pos] === d) n++; pos++; }
    if (el.value !== out) { el.value = out; if (document.activeElement === el) { try { el.setSelectionRange(pos, pos); } catch (e) { } } }
  }
  function boxText(n, dec) {                         // a number shown inside a box: "15.000,5" / "15,000.5"
    if (n == null || n === "" || isNaN(+n)) return "";
    const { g, d } = SEP(); const v = Math.abs(+n);
    let [ip, fp] = v.toFixed(dec).split("."); fp = (fp || "").replace(/0+$/, "");
    return (+n < 0 ? "-" : "") + group(ip, g) + (fp ? d + fp : "");
  }
  const numBox = (id, value, dec, extra) => '<input id="' + id + '" class="num-in" data-dec="' + dec + '"' + (extra || "") + ' inputmode="decimal" autocomplete="off" value="' + esc(value) + '"';

  /* ---------------- local program connection ---------------- */
  // ham: a request to the program (or the iPhone app's storage) with the window's key; returns the raw answer
  const ham = (path, init = {}) => fetch(path, Object.assign({}, init, { headers: Object.assign({ "X-KJ-Token": TOKEN, "X-KJ-Dil": K.lang }, init.headers || {}) }));
  async function api(path, opt = {}) {
    const o = Object.assign({}, opt);
    if (opt.json !== undefined) { o.body = JSON.stringify(opt.json); o.headers = Object.assign({ "Content-Type": "application/json" }, opt.headers || {}); delete o.json; }
    let r;
    try { r = await ham(path, o); }
    catch (e) { S.offline = true; updSave(); throw new Error(WEB ? t("Uygulamanın kayıtlarına ulaşılamadı. Uygulamayı kapatıp yeniden açın.") : t("Program arka planda kapanmış. Bu pencereyi kapatıp Yachting Jurnal’i masaüstünden yeniden açın.")); }
    if (S.offline) { S.offline = false; updSave(); }
    if (r.status === 204) return null;
    if (opt.raw && r.ok) return r;
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? await r.json().catch(() => null) : await r.text();
    if (!r.ok) { const e = new Error((body && body.hata) || t("Hata {kod}", { kod: r.status })); e.body = body; e.status = r.status; e.kod = body && body.kod || ""; throw e; }
    return body;
  }
  async function op(o) {
    S.saving++; updSave();
    try { const r = await api("api/islem", { method: "POST", json: o }); S.rev = r.rev; S.lastSaved = new Date(); S.saveErr = null; if (window.KJSenk) KJSenk.degisti(); return r; }
    catch (e) { S.saveErr = e.message; throw e; }
    finally { S.saving--; updSave(); }
  }
  const persistEntry = k => op({ islem: "kaydet", kayit: k });
  // Only the settings that changed are sent, each with the time it changed (so another device can tell which is newer).
  async function persistSettings() {
    const f = K.ayarFarki(S.setBase, S.set);
    if (!Object.keys(f.degisen).length) return null;
    const r = await op({ islem: "ayar", degisen: f.degisen, damgalar: f.zaman });
    S.set._zaman = Object.assign({}, S.set._zaman, f.zaman); S.setBase = clone(S.set);
    return r;
  }
  const persistAll = () => op({ islem: "tumunu", defter: { ayarlar: S.set, kayitlar: S.items, silinenler: S.silinenler }, taban: S.rev });

  function toast(msg, actions) {
    const h = $("#toastHost");
    h.innerHTML = '<div class="toast" role="status"><span>' + esc(msg) + '</span>' + (actions || []).map((a, i) => '<button data-ta="' + i + '">' + esc(a.label) + '</button>').join("") + '</div>';
    (actions || []).forEach((a, i) => { const b = h.querySelector('[data-ta="' + i + '"]'); if (b) b.onclick = () => { h.innerHTML = ""; a.run(); }; });
    clearTimeout(toast.t); toast.t = setTimeout(() => { h.innerHTML = ""; }, actions && actions.length ? 7000 : 3200);
  }
  function fail(e, what) { toast((what ? what + ": " : "") + (e && e.message || t("beklenmeyen hata")), [{ label: t("Tekrar kaydet"), run: manualSave }]); render(); }

  function updSave() {
    const b = $("#saveNow"), st = $("#saveState");
    if (!b) return;
    b.classList.remove("warn", "busy");
    if (S.mode === "loading") { b.classList.add("busy"); st.textContent = t("Açılıyor…"); return; }
    if (S.offline) { b.classList.add("warn"); st.textContent = t("Bağlantı kesildi"); return; }
    if (S.saving) { b.classList.add("busy"); st.textContent = t("Kaydediliyor…"); return; }
    if (S.saveErr) { b.classList.add("warn"); st.textContent = t("Kaydedilemedi!"); return; }
    st.textContent = S.lastSaved ? t("Kaydedildi · {saat}", { saat: hm(S.lastSaved) }) : WEB ? t("Bu cihazda kayıtlı") : t("Bu bilgisayarda kayıtlı");
  }

  /* ---------------- render ---------------- */
  function buildPeriodSel() {
    if (!S.period) S.period = curYM();
    const ms = monthRange();
    const sel = $("#periodSel");
    sel.innerHTML = ms.map(m => '<option value="' + m + '">' + esc(monthLabel(m) + (isClosed(m) ? " · " + t("kapandı") : "")) + '</option>').join("") + '<option value="all">' + esc(t("Tüm dönemler")) + '</option>';
    if (S.period !== "all" && !ms.includes(S.period)) S.period = ms[0];
    sel.value = S.period;
    const ix = ms.indexOf(S.period);
    $("#prevM").disabled = S.period === "all" || ix >= ms.length - 1;
    $("#nextM").disabled = S.period === "all" || ix <= 0;
    const cl = S.period !== "all" && isClosed(S.period);
    $("#closedTag").hidden = !cl;
    $("#newPeriod").hidden = !(S.mode === "live" && S.period !== "all" && !cl);
    $("#exportBtn").hidden = S.mode !== "live";
  }
  function paySplitLine(p) {
    const sp = K.paySplit(p === "all" ? S.items : S.items.filter(e => (e.date || "").slice(0, 7) === p));
    if (!sp.nakit && !sp.kart) return "";
    return '<span class="from">' + esc(t("Nakit") + " " + tl(sp.nakit) + " · " + t("Kart") + " " + tl(sp.kart) + (sp.none ? " · " + t("Belirtilmemiş") + " " + tl(sp.none) : "")) + '</span>';
  }
  function renderKasa() {
    $("#bookName").textContent = S.set.name || t("Günlük harcama ve kasa takibi");
    document.title = S.set.name ? "Yachting Jurnal · " + S.set.name : "Yachting Jurnal";
    const k = kasaFor(S.period || curYM());
    const first = S.period === "all";
    const isLatest = S.period === "all" || S.period >= (monthRange()[0] || curYM());
    const low = isLatest && k.kalan >= 0 && +S.set.lowLimit > 0 && k.kalan < +S.set.lowLimit;
    $("#kasa").innerHTML =
      '<div class="kc"><span class="lbl">' + esc(first ? t("Başlangıç kasası") : t("Devir kasa")) + '</span><span class="v' + (k.devir < 0 ? " neg" : "") + '">' + tl(k.devir) + '</span>' + (!first && S.set.openingDate && S.period > S.set.openingDate.slice(0, 7) ? '<span class="from">' + esc(t("{ay} kalanı", { ay: monthLabel(addMonth(S.period, -1)) })) + '</span>' : "") + '</div>' +
      '<div class="kc in"><span class="lbl">' + esc(t("Gelen para")) + '</span><span class="v">' + tl(k.in) + '</span></div>' +
      '<div class="kc"><span class="lbl">' + esc(t("Toplam harcama")) + '</span><span class="v">' + tl(k.out) + '</span>' + paySplitLine(S.period || curYM()) + '</div>' +
      '<div class="kc end' + (k.kalan < 0 ? " neg" : "") + (low ? " low" : "") + '"><span class="lbl">' + esc(k.kalan < 0 ? t("Kasa açığı") : t("Kalan kasa")) + '</span><span class="v">' + tl(k.kalan) + '</span>' + (k.kalan < 0 ? '<span class="from">' + esc(t("Gelen para önce açığı kapatır")) + '</span>' : low ? '<span class="from">' + esc(t("Uyarı sınırının altında")) + '</span>' : "") + '</div>';
    $("#formula").textContent = S.set.opening == null && S.mode === "live" && S.items.length ? t("Başlangıç kasası girilmedi; “Ayarlar” bölümünden ekleyin.") : t("Kalan kasa = Devir + Gelen para − Harcama. Kasa biterse eksiye düşer; gelen para önce açığı kapatır.");
  }
  function render() {
    if (S.mode === "live") { buildPeriodSel(); renderKasa(); }
    if (S.tab === "io") S.tab = "ayar";
    document.body.classList.toggle("sade", !(S.tab === "list" || S.tab === "sum" || S.tab === "fisler"));
    const sb = $("#sayfaBas"); if (sb) sb.textContent = SAYFA_ADI()[S.tab] || "";
    const giris = kilitli();
    document.body.classList.toggle("girisli", giris);
    $("#fab").hidden = !(S.mode === "live" && !giris && (S.tab === "list" || S.tab === "sum"));
    let h = "";
    if (S.mode === "error") h = '<div class="note err"><span><b>' + esc(t("Kayıtlar açılamadı")) + '</b>' + esc(S.bootErr || "") + '</span></div>';
    else if (S.mode === "loading") h = '<div class="loading">' + esc(t("Jurnal açılıyor…")) + '</div>';
    else if (giris) h = girisGerekli() ? girisHTML() : erisimHTML();
    else if (S.mode === "live" && window.KJSenk && S._senkKur && !S.senk && !S.terms) h = '<div class="loading">' + esc(t("Jurnal açılıyor…")) + '</div>';
    else h = banners() + (S.tab === "ana" ? viewAna() : S.tab === "fisler" ? viewFisler() : S.tab === "list" ? viewList() : S.tab === "sum" ? viewSum() : S.tab === "rapor" ? viewRapor() : S.tab === "yonetim" ? viewYonetim() : viewIO(S.tab));
    $("#main").innerHTML = h;
    if (S.tab === "list" && S._focusQ) { const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } S._focusQ = false; }
    if (S.tab === "excel" || S.tab === "tum") syncMapSelects();
    renderFoot();
    updSave();
    updSenk();
  }
  function banners() {
    let h = "";
    if (WEB && S.yeniSurum) h += '<div class="note"><span><b>' + esc(t("Yeni sürüm hazır")) + '</b>' + esc(t("Yachting Jurnal’in yeni sürümü indirildi. Kayıtlarınız olduğu gibi kalır.")) + '</span><span class="btns"><button class="btn sm pri" id="swGuncelle">' + esc(t("Şimdi güncelle")) + '</button></span></div>';
    if (!WEB && S.guncel && S.guncel.yeni && !S.guncelSonra) h += '<div class="note"><span><b>' + esc(t("Yeni sürüm: Yachting Jurnal {surum}", { surum: S.guncel.yeni.surum })) + '</b>' + esc((S.guncel.yeni.notlar && (S.guncel.yeni.notlar[K.lang] || S.guncel.yeni.notlar.tr)) || t("Kayıtlarınıza dokunulmadan güncellenir.")) + '</span><span class="btns"><button class="btn sm" id="guncelSonra">' + esc(t("Sonra")) + '</button><button class="btn sm pri" id="guncelAc">' + esc(t("Güncelle")) + '</button></span></div>';
    const kg = kalanGun();
    if (kg != null && kg <= 7) h += '<div class="note warn"><span><b>' + esc(kg <= 0 ? (S.senk.lisans.deneme ? t("Deneme sürenizin son günü") : t("Kullanım sürenizin son günü")) : S.senk.lisans.deneme ? t("Deneme sürenizin bitmesine {n} gün kaldı", { n: kg }) : t("Kullanım sürenizin bitmesine {n} gün kaldı", { n: kg })) + '</b>' + esc(t("Son gün: {tarih}. Sonra da kullanmak için Yachting Jurnal ile iletişime geçin.", { tarih: dmy(S.senk.lisans.bitis) })) + '</span></div>';
    if (S.notice) h += '<div class="note warn"><span><b>' + esc(t("Bilgi")) + '</b>' + esc(S.notice) + '</span><span class="btns"><button class="btn sm" data-dismiss>' + esc(t("Tamam")) + '</button></span></div>';
    if (S.saveErr) h += '<div class="note err"><span><b>' + esc(t("Son değişiklik kaydedilemedi")) + '</b>' + esc(S.saveErr) + '</span><span class="btns"><button class="btn sm pri" id="retrySave">' + esc(t("Tekrar kaydet")) + '</button></span></div>';
    if (S.tab === "list" && S.items.length) {
      const b = curBalance();
      if (b < 0) h += '<div class="note err"><span><b>' + esc(t("Kasa eksiye düştü: {tutar}", { tutar: tl(b) })) + '</b>' + esc(t("Harcamalar kasadaki paradan fazla. Gelen para eklendiğinde önce bu açık kapanır.")) + '</span><span class="btns"><button class="btn sm ok" data-addin>' + esc(t("Gelen para ekle")) + '</button></span></div>';
      else if (+S.set.lowLimit > 0 && b < +S.set.lowLimit) h += '<div class="note warn"><span><b>' + esc(t("Kasa azaldı: {tutar} kaldı", { tutar: tl(b) })) + '</b>' + esc(t("Uyarı sınırı {sinir}. Avans isteme zamanı olabilir.", { sinir: tl(S.set.lowLimit) })) + '</span><span class="btns"><button class="btn sm ok" data-addin>' + esc(t("Gelen para ekle")) + '</button></span></div>';
    }
    return h;
  }

  /* ---------------- Jurnal (list) ---------------- */
  function viewList() {
    if (!S.items.length) return welcome();
    const q = lower(S.q);
    const flt = i => !S.cat || (S.cat === "__in" ? isIn(i) : S.cat === "__nakit" ? (!isIn(i) && i.pay === "nakit") : S.cat === "__kart" ? (!isIn(i) && i.pay === "kart") : S.cat === "__foto" ? !!i.photo : S.cat === "__doviz" ? (i.cur && i.cur !== "TRY") : i.cat === S.cat);
    const its = periodItems().filter(i => flt(i) && (!q || lower([i.desc, i.cat, K.catLabel(i.cat), i.vendor, i.note, i.amount, K.amountNote(i)].join(" ")).includes(q))).sort(K.cmpEntry);
    const run = runningMap();
    let h = '<div class="filters"><input id="q" type="search" placeholder="' + esc(t("Ara: şirket, açıklama, not, tutar…")) + '" value="' + esc(S.q) + '" aria-label="' + esc(t("Fişlerde ara")) + '"><select id="catSel" class="pill" aria-label="' + esc(t("Süzgeç")) + '"><option value="">' + esc(t("Tüm kayıtlar")) + '</option>' +
      [["__in", t("Yalnız gelen para")], ["__nakit", t("Nakit harcamalar")], ["__kart", t("Kartla harcamalar")], ["__doviz", t("Dövizli kayıtlar")], ["__foto", t("Fotoğraflı fişler")]].map(([v, l]) => '<option value="' + v + '"' + (S.cat === v ? " selected" : "") + '>' + esc(l) + '</option>').join("") +
      '<optgroup label="' + esc(t("Kategori")) + '">' + allCats().map(c => '<option value="' + esc(c) + '"' + (c === S.cat ? " selected" : "") + '>' + esc(K.catLabel(c)) + '</option>').join("") + '</optgroup></select></div>';
    const filtered = !!(q || S.cat);
    if (!its.length) {
      if (filtered) return h + '<div class="empty"><h3>' + esc(t("Bu süzgeçte kayıt yok")) + '</h3><p>' + esc(t("Aramayı ya da süzgeci temizleyin.")) + '</p></div>';
      const prev = monthRange().find(m => m < S.period && S.items.some(e => (e.date || "").startsWith(m)));
      return h + '<div class="empty"><h3>' + esc(S.period === "all" ? t("Kayıt yok") : t("{ay} için henüz fiş yok", { ay: monthLabel(S.period) })) + '</h3><p>' + (S.period !== "all" ? esc(t("Devir kasa bir önceki aydan otomatik geldi. İlk fişi ekleyince bu ayın listesi başlar.")) : "") + '</p><div class="btns"><button class="btn pri" data-new>' + esc(t("Fiş ekle")) + '</button>' + (prev ? '<button class="btn" data-month="' + prev + '">' + esc(t("{ay} fişlerine bak", { ay: monthLabel(prev) })) + '</button>' : "") + '</div></div>' + (isClosed(S.period) ? stampHTML(S.period, kasaFor(S.period).kalan) : "");
    }
    const groups = {}; its.forEach(i => { const k = (i.date || "0000-00").slice(0, 7); (groups[k] = groups[k] || []).push(i); });
    Object.keys(groups).sort().reverse().forEach(k => {
      const g = groups[k], s = K.sums(g);
      h += '<section class="month"><div class="mhead"><h2>' + esc(k === "0000-00" ? t("Tarihsiz") : monthLabel(k)) + (isClosed(k) ? '<span class="mtag">' + esc(t("Kapandı")) + '</span>' : "") + '</h2><div class="sub"><span>' + esc(t("Harcama {tutar}", { tutar: tl(s.out) })) + '</span>' + (s.in ? '<span class="g">' + esc(t("Gelen {tutar}", { tutar: tl(s.in) })) + '</span>' : "") + '</div></div><ul class="rows">';
      if (!filtered && k !== "0000-00") { const kk = kasaFor(k); h += '<li><div class="row devir"><span class="d"><b>01</b>' + esc(shortMon(k)) + '</span><span class="t"><span class="ds">' + esc(t("Devir · önceki dönemden kalan kasa")) + '</span></span><span class="amt' + (kk.devir < 0 ? " neg" : "") + '">' + tl(kk.devir) + '</span></div></li>'; }
      g.forEach(i => {
        const inn = isIn(i);
        const meta = [
          inn ? '<span class="chip in">' + esc(t("Gelen para")) + '</span>' : i.cat ? '<span class="chip">' + esc(K.catLabel(i.cat)) + '</span>' : "",
          i.pay ? '<span class="chip pay">' + esc(K.payName(i.pay)) + '</span>' : "",
          i.cur && i.cur !== "TRY" && +i.fxAmount > 0 ? '<span class="chip cur">' + esc(fx(i.fxAmount, i.cur) + " · " + t("kur") + " " + K.dec(i.fxRate)) + '</span>' : "",
          +i.lt > 0 ? '<span class="chip cur">' + ICON.fuel + esc(K.ltStr(i.lt) + " · " + K.perL(i.amount / i.lt)) + '</span>' : "",
          i.photo ? '<span class="chip cam">' + ICON.cam + esc(t("Fiş")) + '</span>' : "",
          i.note ? '<span>' + esc(i.note) + '</span>' : ""
        ].filter(Boolean).join("");
        const title = i.vendor ? esc(i.vendor) + (i.desc ? ' <small>· ' + esc(i.desc) + '</small>' : "") : esc(i.desc || "—");
        h += '<li><button class="row' + (inn ? " in" : "") + '" data-edit="' + esc(i.id) + '"><span class="d"><b>' + ((i.date || "").slice(8, 10) || "–") + '</b>' + (k !== "0000-00" ? esc(shortMon(k)) : "") + '</span><span class="t"><span class="ds">' + title + '</span>' + (meta ? '<span class="mt">' + meta + '</span>' : "") + '</span><span class="amtw"><span class="amt">' + (inn ? "+ " : "") + tl(+i.amount || 0) + '</span><span class="bal' + (run[i.id] < 0 ? " neg" : "") + '">' + esc(t("Kasa") + " " + tl(run[i.id])) + '</span></span></button></li>';
      });
      h += '</ul>';
      if (!filtered && isClosed(k)) h += stampHTML(k, kasaFor(k).kalan);
      h += '</section>';
    });
    return h;
  }
  function stampHTML(m, kalan) { return '<div class="stamp"><span class="st">' + ICON.check + esc(t("Dönem kapandı")) + '</span><span class="sx">' + esc(t("Kalan kasa")) + ' <b>' + tl(kalan) + '</b> → ' + esc(t("{ay} devrine geçti", { ay: monthLabel(addMonth(m, 1)) })) + '</span><button class="linkbtn" data-reopen="' + m + '">' + esc(t("Dönemi yeniden aç")) + '</button></div>'; }
  function welcome() {
    return '<div class="empty"><h3>' + esc(t("Yachting Jurnal’e Hoş Geldiniz")) + '</h3><p>' + esc(WEB ? t("Fişlerinizi buraya girin; kasa, devir ve raporlar kendiliğinden hesaplanır. Her şey bu telefona kaydedilir, internet gerekmez.") : t("Fişlerinizi buraya girin; kasa, devir ve raporlar kendiliğinden hesaplanır. Her şey bu bilgisayara kaydedilir, internet gerekmez.")) + '</p>' +
      '<div class="btns"><button class="btn pri" data-new>' + esc(t("İlk fişi ekle")) + '</button><button class="btn" data-go="tekne" data-focus="opName">' + esc(t("Defter adı ve başlangıç kasası")) + '</button><button class="btn" data-go="excel" data-focus="drop">' + esc(t("Excel’den aktar")) + '</button></div>' + (S.senk && S.senk.hazir && !S.senk.bagli ? '<p class="small" style="margin-top:14px">' + esc(t("Defteriniz başka bir cihazda mı? Ayarlar’dan Google Drive eşitlemesini açın; kayıtlar buraya gelir.")) + ' <button class="linkbtn" data-go="hesap" data-focus="gBagla">' + esc(t("Eşitlemeyi aç")) + '</button></p>' : "") + '</div>';
  }

  /* ---------------- home page: welcome, this month at a glance, latest entries, about the program ---------------- */
  const ANA_OZ = [
    ["kasa", "Otomatik kasa", "Devir, gelen para ve kalan kasa her fişte kendiliğinden hesaplanır."],
    ["foto", "Fiş fotoğrafı", "Fişin fotoğrafını çekin, kayıtla birlikte saklansın ve rapora eklensin."],
    ["doviz", "Döviz ve yakıt", "Euro, dolar, sterlin; kuru yazın, tutar TL’ye çevrilsin. Yakıtta litre fiyatı hazır."],
    ["rapor", "PDF ve Excel rapor", "Ay sonunda imza alanlı kasa raporu ve formüllü Excel tablosu tek tıkla."],
    ["esit", "iPhone + Windows", "Aynı defter telefonda ve bilgisayarda; Google Drive ile kendiliğinden eşitlenir."],
    ["cevrim", "İnternetsiz çalışır", "Denizde internet yokken de kayıt girin; bağlantı gelince eşitlenir."]
  ];
  const ANA_IK = {
    kasa: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
    foto: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    doviz: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5a4 4 0 1 0 0 7M7.5 11h6M7.5 13.5h6"/>',
    rapor: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h4"/>',
    esit: '<rect x="2" y="5" width="13" height="10" rx="1.5"/><path d="M6 19h5"/><rect x="16" y="8" width="6" height="12" rx="1.5"/>',
    cevrim: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.6 5.2A15 15 0 0 1 22 8.8M5 12.6a10 10 0 0 1 5.2-2.7M14.2 10a10 10 0 0 1 4.8 2.6M8.5 16.1a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M3 3l18 18"/>'
  };
  const anaIk = n => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ANA_IK[n] + '</svg>';
  // "Alper Kaptan" from the captain's name in the boat details (the first name, as captains are addressed)
  function kaptan() {
    const ad = String(S.set.preparedBy || "").split(/\s+/).filter(w => w && !/^(kpt|kap|kapt|kaptan|capt|captain|cpt)\.?$/i.test(w))[0] || "";
    if (!ad) return "";
    const Ad = ad[0].toLocaleUpperCase(K.lang === "en" ? "en" : "tr") + ad.slice(1);
    return K.lang === "en" ? "Captain " + Ad : Ad + " Kaptan";
  }
  // a 45–50 m motor yacht in profile: long raked hull, four stepped decks with tinted glass, radar mast with domes
  function anaYat() {
    const B = "#F4F7FA", G = "#132F4C", G2 = "#1E4468", C = "#D3DCE3";
    return '<g class="tekne"><g transform="scale(1.3)">' +
      '<defs><linearGradient id="cam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + G2 + '"/><stop offset="1" stop-color="' + G + '"/></linearGradient></defs>' +
      // wake behind the stern and the bow wave
      '<path d="M-92 7 q-14 -3 -30 1 M-94 11 q-20 -2 -38 3 M76 9 q9 2 18 -2" stroke="rgba(255,255,255,.5)" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
      // hull, swim platform, shading, boot stripe
      '<path d="M-86 -2 L36 -3 Q64 -4 94 -13 L76 10 L-80 10 L-88 4Z" fill="' + B + '"/>' +
      '<path d="M-92 3.5 H-82 V6.5 H-92Z" fill="' + C + '"/>' +
      '<path d="M-84 5 L80 5 L76 10 L-80 10Z" fill="' + C + '"/>' +
      '<path d="M-82 6.6 L79 6.6" stroke="#D4A040" stroke-width="1.4"/>' +
      '<path d="M-84 -1.6 L36 -2.6 Q63 -3.6 92 -12.2" stroke="#9FB1C2" stroke-width=".7" fill="none"/>' +
      // hull windows and portholes
      '<rect x="-60" y="0.6" width="24" height="2" rx="1" fill="' + G + '"/><rect x="-32" y="0.6" width="16" height="2" rx="1" fill="' + G + '"/>' +
      '<circle cx="-10" cy="1.6" r="1" fill="' + G + '"/><circle cx="-5" cy="1.6" r="1" fill="' + G + '"/><circle cx="0" cy="1.6" r="1" fill="' + G + '"/>' +
      // main deck
      '<path d="M-78 -2.4 L-74 -13 L26 -13 Q44 -12.6 60 -3.6Z" fill="' + B + '"/>' +
      '<path d="M-68 -10.4 L24 -10.4 Q37 -10 46 -5 L-70 -5Z" fill="url(#cam)"/>' +
      '<path d="M-40 -10.4 V-5 M-12 -10.4 V-5 M12 -10.4 V-5" stroke="' + B + '" stroke-width=".8"/>' +
      // upper deck
      '<path d="M-62 -13 L-58 -22.5 L10 -22.5 Q26 -22 40 -13Z" fill="' + B + '"/>' +
      '<path d="M-54 -20.2 L8 -20.2 Q20 -19.8 30 -15.4 L-56 -15.4Z" fill="url(#cam)"/>' +
      '<path d="M-30 -20.2 V-15.4 M-6 -20.2 V-15.4" stroke="' + B + '" stroke-width=".8"/>' +
      // bridge deck
      '<path d="M-48 -22.5 L-44 -30.5 L-4 -30.5 Q8 -30 20 -22.5Z" fill="' + B + '"/>' +
      '<path d="M-40 -28.4 L-6 -28.4 Q4 -28 12 -24.4 L-42 -24.4Z" fill="url(#cam)"/>' +
      // sun deck with hard top
      '<path d="M-38 -30.5 L-36 -33 L-10 -33 L-4 -30.5Z" fill="' + C + '"/>' +
      '<path d="M-44 -38.5 L-6 -38.5 L-2 -36.6 L-44 -36.6Z" fill="' + B + '"/>' +
      '<path d="M-40 -36.6 V-33 M-10 -36.6 V-33" stroke="' + B + '" stroke-width="1"/>' +
      // radar mast and domes
      '<path d="M-30 -38.5 L-27 -47 L-17 -47 L-13 -38.5Z" fill="' + B + '"/>' +
      '<circle cx="-26" cy="-49.4" r="2.6" fill="' + B + '"/><circle cx="-18" cy="-49" r="2.1" fill="' + B + '"/>' +
      '<path d="M-22 -47 V-56 M-25 -53 H-19" stroke="' + B + '" stroke-width=".9" stroke-linecap="round"/><circle cx="-22" cy="-56.6" r="1" fill="#D4A040"/>' +
      // foredeck rail and aft deck rail
      '<path d="M48 -4.4 Q70 -6 90 -12" stroke="' + B + '" stroke-width=".7" fill="none" opacity=".8"/>' +
      '<path d="M-86 -2 V-6 H-78" stroke="' + B + '" stroke-width=".7" fill="none" opacity=".8"/>' +
      teknedeAd() + '</g></g>';
  }
  // the boat's name painted on the bow of the yacht (from the boat details), small but readable
  function teknedeAd() {
    const ad = String(S.set.name || "").trim().toLocaleUpperCase(K.lang === "en" ? "en" : "tr");
    if (!ad) return "";
    const uzun = ad.length * 3.3 > 52;
    return '<text class="tad" x="64" y="2.6" text-anchor="end"' + (uzun ? ' textLength="52" lengthAdjust="spacingAndGlyphs"' : "") + '>' + esc(ad) + '</text>';
  }
  function selam() { const h = new Date().getHours(); return h < 5 ? t("İyi geceler") : h < 12 ? t("Günaydın") : h < 18 ? t("İyi günler") : t("İyi akşamlar"); }
  function anaSahne() {   // night-chart sea: compass rose, a motor yacht riding the waves, twinkling stars
    const dalga = (y, a, c) => '<path class="dl" d="M0 ' + y + ' ' + Array.from({ length: 8 }, (_, i) => 'Q' + (i * 200 + 50) + ' ' + (y - a) + ' ' + (i * 200 + 100) + ' ' + y + ' T' + (i * 200 + 200) + ' ' + y).join(" ") + ' V220 H0z" fill="' + c + '"/>';
    return '<svg class="sahne" viewBox="0 0 800 220" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">' +
      [[70, 40], [180, 22], [310, 52], [460, 30], [620, 18], [720, 58], [540, 70]].map(([x, y], i) => '<circle class="yildiz" style="--i:' + i + '" cx="' + x + '" cy="' + y + '" r="1.6"/>').join("") +
      '<g class="pusula" transform="translate(700 52)"><g class="don"><circle r="34" fill="none" stroke="currentColor" stroke-opacity=".45"/><circle r="26" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="1.5 3"/><path d="M0 -32 L5 -5 L32 0 L5 5 L0 32 L-5 5 L-32 0 L-5 -5Z" fill="currentColor" fill-opacity=".35"/><path d="M0 -32 L5 -5 L0 0 L-5 -5Z M32 0 L5 5 L0 0 L5 -5Z" fill="currentColor"/></g></g>' +
      '<g class="dalgalar">' + dalga(170, 10, "rgba(255,255,255,.06)") + '</g>' +
      anaYat() +
      '<g class="dalgalar on">' + dalga(188, 8, "rgba(255,255,255,.09)") + '</g>' +
      '<g class="dalgalar on2">' + dalga(204, 6, "rgba(14,39,64,.9)") + '</g></svg>';
  }
  function viewAna() {   // a welcome screen only: the lists and figures live in the journal
    const anim = !S._anaGoruldu; S._anaGoruldu = true;
    return '<div class="ana' + (anim ? " anim" : "") + '">' +
      '<section class="kahraman">' + anaSahne() + '<div class="kyazi"><span class="selam">' + esc(selam()) + (S.set.name ? " · " + esc(S.set.name) : "") + '</span><h1>' + esc(kaptan() ? t("{kaptan}, Hoş Geldiniz", { kaptan: kaptan() }) : t("Hoş Geldiniz")) + '</h1><p>Yachting Jurnal · ' + esc(t("Teknenin kasası, tek defterde.")) + '</p>' +
      (kaptan() ? "" : '<p class="kad"><button type="button" class="linkbtn" data-go="tekne" data-focus="opPrep">' + esc(t("Kaptan adını ekleyin")) + '</button></p>') +
      '<div class="btns"><button type="button" class="btn pri" data-go="list">' + esc(t("Jurnal’i aç")) + '</button><button type="button" class="btn acik" data-new>' + esc(t("Fiş ekle")) + '</button><button type="button" class="btn acik" data-addin>' + esc(t("Gelen para")) + '</button></div></div></section>' +
      '<section class="hakkinda"><h2>' + esc(t("Yachting Jurnal hakkında")) + '</h2><p class="lead">' + esc(t("Yachting Jurnal; yatlar, tekneler ve küçük işletmeler için hazırlanmış bir kasa defteridir. Harcamaları ve gelen parayı (donatan avansı, havale, EFT, nakit) fiş fotoğraflarıyla kaydeder, kasayı her fişte kendiliğinden hesaplar, ay sonunda imza alanlı PDF rapor ve Excel tablosu hazırlar.")) + '</p><div class="ozellikler">' +
      ANA_OZ.map(([ik, b, a], n) => '<div class="ozellik" style="--i:' + n + '"><span class="oik">' + anaIk(ik) + '</span><b>' + esc(t(b)) + '</b><span>' + esc(t(a)) + '</span></div>').join("") +
      '</div><p class="small anasurum">Yachting Jurnal ' + esc(SURUM || "") + ' · kasajurnali.github.io</p></section></div>';
  }
  /* ---------------- receipts page: the photos of the period chosen above ---------------- */
  function viewFisler() {
    const its = periodItems().filter(i => i.photo).sort(K.cmpEntry);
    const ad = S.period === "all" ? t("Tüm aylar") : monthLabel(S.period || curYM());
    let h = '<div class="panel fisbas"><div><h3>' + esc(t("{ay} fişleri", { ay: ad })) + '</h3><p class="small" style="margin:0">' +
      esc(its.length ? t("{n} fotoğraflı fiş · Dönemi yukarıdan değiştirin.", { n: its.length }) : t("Bu dönemde fotoğraflı fiş yok. Fiş eklerken fotoğrafını çekin; burada aylara göre görünür.")) + '</p></div>' +
      (S.senk && S.senk.bagli ? '<p class="small fisdrive">' + esc(t("Google Drive’da da “Fişler” klasöründe aylara göre saklanır.")) + '</p>' : "") + '</div>';
    if (!its.length) return h;
    h += '<div class="fisizgara">' + its.map(i => '<figure class="fiskart"><button type="button" class="fisfoto" data-fisgor="' + esc(i.photo) + '" aria-label="' + esc(t("Fotoğrafı büyüt")) + '"><img loading="lazy" alt="" src="' + esc(fotoURL(i.photo)) + '"></button>' +
      '<figcaption><button type="button" class="linkbtn" data-edit="' + esc(i.id) + '"><b>' + esc(i.vendor || i.desc || "—") + '</b></button><span>' + esc(i.date ? dmy(i.date) : t("Tarihsiz")) + '</span><span class="ftut' + (isIn(i) ? " in" : "") + '">' + (isIn(i) ? "+ " : "") + tl(i.amount) + '</span></figcaption></figure>').join("") + '</div>';
    return h;
  }

  /* ---------------- Özet ---------------- */
  function viewSum() {
    const pits = periodItems(), outs = pits.filter(e => !isIn(e));
    const tot = K.sums(pits).out;
    let h = '';
    if (!outs.length) h += '<div class="empty" style="margin-bottom:14px"><h3>' + esc(S.period === "all" ? t("Harcama yok") : t("{ay} için harcama yok", { ay: monthLabel(S.period) })) + '</h3><p>' + esc(t("Yukarıdan başka bir dönem seçin.")) + '</p></div>';
    else {
      const rows = K.catSplit(outs), max = rows[0][1] || 1;
      h += '<div class="grid2p"><div class="panel"><h3>' + esc(t("Kategoriye göre harcama")) + '</h3>' + rows.map(([k, v]) => '<div class="cbar"><span class="n">' + esc(K.catLabel(k)) + '</span><span class="v">' + tl(v) + ' <span class="pc">' + K.pct(tot ? Math.round(v / tot * 100) : 0) + '</span></span><div class="track"><div class="fill" style="width:' + (v / max * 100).toFixed(1) + '%"></div></div></div>').join("") + '</div>';
      const sp = K.paySplit(outs), pt = sp.nakit + sp.kart + sp.none;
      const prow = [[t("Nakit"), sp.nakit, "var(--ok)"], [t("Kart"), sp.kart, "var(--accent)"], [t("Belirtilmemiş"), sp.none, "var(--muted)"]].filter(r => r[1] > 0);
      const pm = Math.max(...prow.map(r => r[1]), 1);
      const bv = {}; outs.forEach(i => { const k = i.vendor || i.desc || "—"; bv[k] = r2((bv[k] || 0) + (+i.amount || 0)); });
      const vr = Object.entries(bv).sort((a, b) => b[1] - a[1]).slice(0, 6), vm = vr.length ? vr[0][1] : 1;
      h += '<div><div class="panel"><h3>' + esc(t("Ödeme şekline göre")) + '</h3>' + prow.map(([n, v, c]) => '<div class="cbar"><span class="n">' + esc(n) + '</span><span class="v">' + tl(v) + ' <span class="pc">' + K.pct(pt ? Math.round(v / pt * 100) : 0) + '</span></span><div class="track"><div class="fill" style="width:' + (v / pm * 100).toFixed(1) + '%;background:' + c + '"></div></div></div>').join("") + '</div>' +
        '<div class="panel"><h3>' + esc(t("En çok ödeme yapılan şirketler")) + '</h3>' + vr.map(([k, v]) => '<div class="cbar"><span class="n">' + esc(k) + '</span><span class="v">' + tl(v) + '</span><div class="track"><div class="fill" style="width:' + (v / vm * 100).toFixed(1) + '%;background:var(--brass)"></div></div></div>').join("") + '</div></div></div>';
    }
    const fs = K.fuelStats(pits);
    if (fs.fills.length) {
      h += '<div class="panel"><h3>' + esc(t("Yakıt defteri")) + '</h3><div class="kv"><div><span>' + esc(t("Toplam yakıt")) + '</span><b>' + (fs.lt ? esc(K.ltStr(fs.lt)) : "—") + '</b></div><div><span>' + esc(t("Yakıt tutarı")) + '</span><b>' + tl(fs.tot) + '</b></div><div><span>' + esc(t("Ortalama fiyat")) + '</span><b>' + (fs.avg ? esc(K.perL(fs.avg)) : "—") + '</b></div></div>' +
        '<div class="scroll"><table class="tbl"><thead><tr><th>' + esc(t("Tarih")) + '</th><th>' + esc(t("Şirket")) + '</th><th class="r">' + esc(t("Litre")) + '</th><th class="r">' + esc(t("₺/Lt")) + '</th><th class="r">' + esc(t("Tutar")) + '</th></tr></thead><tbody>' +
        fs.fills.map(e => '<tr><td>' + dmy(e.date) + '</td><td>' + esc(e.vendor || e.desc || "") + '</td><td class="r">' + (+e.lt > 0 ? esc(K.qty(e.lt)) : "—") + '</td><td class="r">' + (+e.lt > 0 ? num(e.amount / e.lt) : "—") + '</td><td class="r">' + tl(e.amount) + '</td></tr>').join("") +
        '</tbody></table></div>' + (fs.fills.some(e => !(+e.lt > 0)) ? '<p class="lead" style="margin:8px 0 0;font-size:13px">' + esc(t("Litresi girilmemiş yakıt fişleri ortalamaya katılmaz. Fişe dokunup litreyi ekleyebilirsiniz.")) + '</p>' : "") + '</div>';
    }
    const end = S.period === "all" ? curYM() : S.period; const ms = []; for (let k = 11; k >= 0; k--) ms.push(addMonth(end, -k));
    const allOut = S.items.filter(e => !isIn(e) && e.date);
    const mv = ms.map(m => r2(allOut.filter(i => i.date.slice(0, 7) === m).reduce((s, i) => s + (+i.amount || 0), 0)));
    const mmax = Math.max(...mv, 0);
    if (mmax > 0) {
      const en = K.lang === "en";
      const short = v => { const a = Math.abs(v); return a >= 1e6 ? (en ? (v / 1e6).toFixed(1) : (v / 1e6).toFixed(1).replace(".", ",")) + "M" : a >= 1e4 ? Math.round(v / 1e3) + (en ? "K" : "B") : Math.round(v).toLocaleString(en ? "en-GB" : "tr-TR"); };
      h += '<div class="panel"><h3>' + esc(t("Aylık harcama · son 12 ay")) + '</h3><div class="months">' + ms.map((m, ix) => { const v = mv[ix]; return '<div class="mcol' + (m === end ? " cur" : "") + '" title="' + esc(monthLabel(m) + ": " + tl(v)) + '">' + (v > 0 ? '<span class="bv">' + short(v) + '</span>' : "") + '<div class="b" style="height:calc(' + (v / mmax * 100).toFixed(1) + '% - 16px)"></div></div>'; }).join("") + '</div><div class="mlbl">' + ms.map(m => '<span>' + esc(shortMon(m)) + '</span>').join("") + '</div></div>';
    }
    return h;
  }

  /* ---------------- Ayarlar ve yedek ---------------- */
  const FIELDS = [["date", "Tarih"], ["vendor", "Şirket"], ["desc", "Açıklama"], ["out", "Harcama"], ["in", "Gelen para"], ["pay", "Ödeme şekli"], ["cat", "Kategori"], ["note", "Not"]];
  // one page per menu item; "tum" (all sections together) is used only by the tests
  const SAYFA_ADI = () => ({ ana: "", list: t("Jurnal"), fisler: t("Fişler"), sum: t("Özet"), rapor: t("Raporlar"), tekne: t("Tekne bilgileri"), hesap: t("Google hesabı ve eşitleme"), excel: t("Excel’den içe aktar"), yedek: t("Yedekler"), ayar: t("Ayarlar"), yonetim: t("Yönetim merkezi"), tum: t("Ayarlar") });
  function viewIO(bolum) {
    const st = S.set, tum = bolum === "tum";
    const P = {};
    let h = '<div class="panel"><h3>' + esc(t("Dil · Language")) + '</h3><div class="seg langseg" role="radiogroup" aria-label="Dil / Language"><label><input type="radio" name="lang" value="tr"' + (K.lang === "tr" ? " checked" : "") + '><span>Türkçe</span></label><label><input type="radio" name="lang" value="en"' + (K.lang === "en" ? " checked" : "") + '><span>English</span></label></div>' +
      '<p class="lead" style="margin:10px 0 0;font-size:13px">' + esc(t("Ekran, PDF rapor ve Excel tablosu seçilen dilde hazırlanır. Kayıtlarınız dil değişince değişmez. Tarih kutularının görünümü program bir sonraki açılışta yeni dile uyar.")) + '</p></div>';
    P.dil = h; h = "";
    P.hesap = senkPanel();
    h = '<div class="panel" id="tekPanel"><h3>' + esc(t("Tekne ve kasa bilgileri")) + '</h3><p class="lead">' + esc(t("Defter adı ekranın üstünde ve raporlarda görünür. Hazırlayan ve onaylayan adları PDF raporun imza alanlarına yazılır.")) + '</p>' +
      '<div class="inline"><div class="field" style="flex-basis:100%"><label for="opName">' + esc(t("Tekne adı (ya da şirket, ev)")) + '</label><input id="opName" maxlength="80" value="' + esc(st.name || "") + '" placeholder="' + esc(t("Örn. M/Y Deniz Yıldızı")) + '"></div>' +
      '<div class="field"><label for="opPrep">' + esc(t("Kaptan (raporu hazırlayan)")) + '</label><input id="opPrep" maxlength="80" value="' + esc(st.preparedBy || "") + '" placeholder="' + esc(t("Örn. Ali Yılmaz")) + '"></div>' +
      '<div class="field"><label for="opAppr">' + esc(t("Donatan / armatör (onaylayan)")) + '</label><input id="opAppr" maxlength="80" value="' + esc(st.approvedBy || "") + '" placeholder="' + esc(t("Örn. Mehmet Demir")) + '"></div></div>' +
      '<div class="inline" style="margin-top:10px"><div class="field"><label for="opAmt">' + esc(t("Başlangıç kasası (₺)")) + '</label>' + numBox("opAmt", st.opening != null ? num(st.opening) : "", 2, ' data-neg="1"') + ' placeholder="' + esc(num(0)) + '"><span class="help">' + esc(t("Defterin başladığı gün kasadaki para")) + '</span></div>' +
      '<div class="field"><label for="opDate">' + esc(t("Başlangıç tarihi")) + '</label><input id="opDate" type="date" value="' + esc(st.openingDate || "") + '"></div>' +
      '<div class="field"><label for="opLow">' + esc(t("Kasa uyarı sınırı (₺)")) + '</label>' + numBox("opLow", num(+st.lowLimit || 0), 2) + '><span class="help">' + esc(t("Kasa bunun altına inince uyarır. 0 = kapalı")) + '</span></div>' +
      '<button class="btn pri" id="saveOp">' + esc(t("Ayarları kaydet")) + '</button></div></div>';
    P.tekne = h;
    h = '<div class="panel" id="importPanel"><h3>' + esc(t("Excel’den içe aktar")) + '</h3>';
    if (!S.imp) h += '<label class="drop" id="drop" for="file" tabindex="0"><strong>' + esc(t("Fiş takip tablonuzu (.xlsx) seçin")) + '</strong><p>' + esc(WEB ? t("Dosyayı Dosyalar uygulamasından seçin. Aylık sayfaların hepsi birden okunur; defterde zaten olan fişler tekrar eklenmez.") : t("Dosyayı buraya sürükleyip bırakın ya da tıklayıp seçin. Aylık sayfaların hepsi birden okunur; defterde zaten olan fişler tekrar eklenmez.")) + '</p><span class="btn pri">' + esc(t("Dosya seç")) + '</span></label><input id="file" type="file" accept=".xlsx,.xlsm" hidden>';
    else h += viewImport();
    h += '</div>';
    P.excel = h; h = "";
    if (WEB) h += '<div class="panel" id="yedekPanel"><h3>' + esc(t("Kayıt yeri ve yedekler")) + '</h3><p class="lead">' + esc(t("Her değişiklik anında bu telefona kaydedilir ve her gün kendiliğinden bir yedek alınır. Uygulamayı ana ekrandan sildiğinizde ya da Safari’nin site verilerini temizlediğinizde telefondaki kayıtlar da silinir; Google Drive eşitlemesini açık tutun ya da ara ara yedek dosyası alın.")) + '</p>' +
      '<div class="btns" style="justify-content:flex-start"><button class="btn" id="backupNow">' + esc(t("Yedek dosyası al")) + '</button><label class="btn" for="restoreFile" style="cursor:pointer">' + esc(t("Yedekten geri yükle")) + '</label><input id="restoreFile" type="file" accept=".json,application/json" hidden></div>' +
      '<p class="lead" style="margin:8px 0 0;font-size:13px">' + esc(t("Asıl fiş ve faturaları kâğıt ya da elektronik olarak ayrıca saklayın; programa fotoğraf eklemek, mevzuattaki saklama yükümlülüğünün (ör. VUK m. 253, TTK m. 82) yerine geçmez.")) + '</p></div>';
    else h += '<div class="panel" id="yedekPanel"><h3>' + esc(t("Kayıt yeri ve yedekler")) + '</h3><p class="lead">' + esc(t("Her değişiklik anında bu bilgisayara kaydedilir ve her gün kendiliğinden bir yedek alınır. Program kapanıp açıldığında kaldığı yerden devam eder.")) + '</p>' +
      '<div class="pathbox">' + esc(S.klasor || "") + '</div>' +
      '<div class="btns" style="justify-content:flex-start"><button class="btn" id="openFolder">' + esc(t("Klasörü aç")) + '</button><button class="btn" id="backupNow">' + esc(t("Şimdi yedek al")) + '</button><label class="btn" for="restoreFile" style="cursor:pointer">' + esc(t("Yedekten geri yükle")) + '</label><input id="restoreFile" type="file" accept=".json" hidden></div>' +
      '<p class="lead" style="margin:12px 0 0;font-size:13px">' + esc(t("Başka bilgisayara taşımak için bu klasörü USB belleğe kopyalayın. Yeni bilgisayarda programı kurup klasörü aynı yere (Belgeler) yapıştırın.")) + '</p>' +
      '<p class="lead" style="margin:8px 0 0;font-size:13px">' + esc(t("Asıl fiş ve faturaları kâğıt ya da elektronik olarak ayrıca saklayın; programa fotoğraf eklemek, mevzuattaki saklama yükümlülüğünün (ör. VUK m. 253, TTK m. 82) yerine geçmez.")) + '</p></div>';
    P.yedek = h;
    const k = st.kabul;
    h = '<div class="panel" id="hakPanel"><h3>' + esc(t("Hakkında ve yasal bilgiler")) + '</h3><p class="lead">' + esc(WEB
      ? t("Yachting Jurnal {surum} (iPhone) · Kayıtlarınız bu telefonda durur; Google Drive eşitlemesini açarsanız kendi Google hesabınıza da kopyalanır. Uygulama yeni sürümü kendiliğinden alır. Kaldırmak için ana ekrandaki simgeye basılı tutup “Uygulamayı Sil”i seçin (telefondaki kayıtlar da silinir).", { surum: SURUM })
      : t("Yachting Jurnal {surum} · Kayıtlarınız bu bilgisayarda durur; Google Drive eşitlemesini açarsanız kendi Google hesabınıza da kopyalanır. Kaldırmak için: Windows Ayarlar › Uygulamalar › Yachting Jurnal › Kaldır (kayıtlarınız silinmez).", { surum: SURUM })) + '</p>' +
      (WEB ? "" : '<label class="check" style="margin:4px 0 10px"><input type="checkbox" id="guncelDenetim"' + (S.set.guncelleme !== false ? " checked" : "") + '> <span>' + esc(t("Yeni sürümleri otomatik denetle (günde iki kez, yalnızca sürüm bilgisi indirilir)")) + '</span></label>' +
        '<div class="btns" style="justify-content:flex-start;margin-bottom:10px"><button class="btn sm" id="guncelNow">' + esc(t("Güncellemeleri şimdi denetle")) + '</button>' + (S.guncel && S.guncel.yeni ? '<button class="btn sm pri" id="guncelKur">' + esc(t("Yachting Jurnal {surum} sürümüne güncelle", { surum: S.guncel.yeni.surum })) + '</button>' : "") + '</div>') +
      '<div class="btns" style="justify-content:flex-start"><button class="btn" id="openGuide">' + esc(t("Kullanım kılavuzu")) + '</button><button class="btn" data-legal="kosullar">' + esc(t("Kullanım Koşulları")) + '</button><button class="btn" data-legal="gizlilik">' + esc(t("Gizlilik ve KVKK")) + '</button><button class="btn" data-legal="lisanslar">' + esc(t("Üçüncü taraf lisansları")) + '</button></div>' +
      (k && k.tarih ? '<p class="lead" style="margin:12px 0 0;font-size:13px">' + esc(t("Kullanım Koşulları {tarih} tarihinde kabul edildi (sürüm {surum}).", { tarih: K.dateTime(new Date(k.tarih)), surum: k.surum || "" })) + '</p>' : "") +
      '<p class="lead" style="margin:6px 0 0;font-size:13px">' + esc(t("© 2026 Yachting Jurnal geliştiricisi. Tüm hakları saklıdır.")) + '</p></div>';
    P.ayar = P.dil + h;
    if (tum) return P.ayar + P.hesap + P.tekne + P.excel + P.yedek;
    return P[bolum] || P.ayar;
  }

  /* ---------------- Excel import ---------------- */
  function viewImport() {
    const I = S.imp, P = I.parsed;
    let h = '<div class="stat">' + esc(t("Dosya:")) + ' <b>' + esc(I.name) + '</b></div>';
    if (I.sheets.length > 1) h += '<div class="field" style="max-width:340px"><label for="sheetSel">' + esc(t("Sayfa")) + '</label><select id="sheetSel"><option value="__all"' + (I.sheet === "__all" ? " selected" : "") + '>' + esc(t("Tüm sayfalar ({n})", { n: I.sheets.length })) + '</option>' + I.sheets.map(s => '<option' + (s === I.sheet ? " selected" : "") + '>' + esc(s) + '</option>').join("") + '</select></div>';
    if (I.sheet !== "__all") {
      h += '<div class="field" style="max-width:340px;margin-top:10px"><label for="hdrSel">' + esc(t("Başlık satırı")) + '</label><select id="hdrSel">' + I.raw.slice(0, 25).map((r, ix) => '<option value="' + ix + '"' + (ix === I.hdr ? " selected" : "") + '>' + esc(t("{n}. satır: {ozet}", { n: ix + 1, ozet: (r || []).filter(x => x != null && x !== "").slice(0, 4).join(" · ").slice(0, 60) })) + '</option>').join("") + '</select></div>';
      const cols = I.headers.map((c, ix) => '<option value="' + ix + '">' + esc(c || t("Sütun {n}", { n: ix + 1 })) + '</option>').join("");
      h += '<p class="lead" style="margin:14px 0 0">' + esc(t("Sütunları tahmin ettim, gerekirse düzeltin.")) + '</p><div class="maps">' + FIELDS.map(([k, l]) => '<div class="field"><label for="map_' + k + '">' + esc(t(l)) + '</label><select id="map_' + k + '" data-map="' + k + '"><option value="-1">' + esc(t("— yok —")) + '</option>' + cols + '</select></div>').join("") + '</div>';
    }
    const nOut = P.ok.filter(r => r.type === "out"), nIn = P.ok.filter(r => r.type === "in");
    h += '<div class="stat">' + esc(t("Eklenecek:")) + ' <b>' + esc(t("{n} harcama", { n: nOut.length })) + '</b> (' + tl(K.sums(nOut).out) + ') · <b>' + esc(t("{n} gelen para", { n: nIn.length })) + '</b> (' + tl(K.sums(nIn).in) + ')</div>';
    if (P.dup || P.skip) h += '<div class="stat" style="color:var(--muted)">' + esc([P.dup ? t("{n} fiş zaten defterde, atlanacak.", { n: P.dup }) : "", P.skip ? t("{n} satırın tutarı okunamadı, atlanacak.", { n: P.skip }) : ""].filter(Boolean).join(" ")) + '</div>';
    if (P.devir != null) h += '<label class="check" style="margin:10px 0"><input type="checkbox" id="setOp"' + (I.setOp ? " checked" : "") + '> <span>' + esc(t("Başlangıç kasasını {tutar} ({ay} devri) olarak ayarla", { tutar: tl(P.devir), ay: monthLabel(P.devirMonth) })) + (S.set.opening != null ? esc(" · " + t("şu an {tutar}", { tutar: tl(S.set.opening) })) : "") + '</span></label>';
    if (P.ok.length) h += '<div class="scroll" style="border:1px solid var(--line);border-radius:10px"><table class="pv"><thead><tr><th>' + esc(t("Tarih")) + '</th><th>' + esc(t("Şirket")) + '</th><th>' + esc(t("Açıklama")) + '</th><th>' + esc(t("Kategori")) + '</th><th>' + esc(t("Ödeme")) + '</th><th style="text-align:right">' + esc(t("Harcama")) + '</th><th style="text-align:right">' + esc(t("Gelen")) + '</th></tr></thead><tbody>' + P.ok.slice(0, 10).map(r => '<tr><td class="mono">' + dmy(r.date) + '</td><td>' + esc(r.vendor) + '</td><td>' + esc(r.desc) + '</td><td>' + esc(K.catLabel(r.cat)) + '</td><td>' + esc(K.payName(r.pay)) + '</td><td class="r">' + (r.type === "out" ? tl(r.amount) : "") + '</td><td class="r g">' + (r.type === "in" ? tl(r.amount) : "") + '</td></tr>').join("") + '</tbody></table></div><p class="lead" style="margin:6px 0 0;font-size:13px">' + esc((P.ok.length > 10 ? t("İlk 10 satır gösteriliyor.") + " " : "") + t("Kategoriler şirket adından tahmin edildi; sonra fişe dokunup değiştirebilirsiniz.")) + '</p>';
    const can = (P.ok.length || (P.devir != null && I.setOp)) && !I.busy;
    h += '<div class="btns" style="justify-content:flex-start;margin-top:16px"><button class="btn pri" id="doImport"' + (can ? "" : " disabled") + '>' + esc(I.busy ? t("Aktarılıyor…") : P.ok.length ? t("{n} kaydı ekle", { n: P.ok.length }) : t("Kasayı ayarla")) + '</button><button class="btn" id="cancelImport"' + (I.busy ? " disabled" : "") + '>' + esc(t("Vazgeç")) + '</button></div>';
    return h;
  }
  const TRM = {
    ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  };
  function validYMD(y, m, d) { if (y < 100) y += 2000; if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null; return y + "-" + pad(m) + "-" + pad(d); }
  function toISO(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") { if (v > 30000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); } return null; }
    const s = String(v).toLocaleLowerCase("tr").trim(); let m;
    if ((m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return validYMD(+m[1], +m[2], +m[3]);
    if ((m = s.match(/(\d{1,2})\s*[-–]\s*\d{1,2}[./](\d{1,2})[./](\d{2,4})/))) return validYMD(+m[3], +m[2], +m[1]);
    if ((m = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/))) return validYMD(+m[3], +m[2], +m[1]);
    if ((m = s.match(/(\d{1,2})\s+([a-zçğıöşü]+)\.?\s+(\d{4})/))) { const mo = TRM[m[2]] || TRM[m[2].replace(/ı/g, "i")]; if (mo) return validYMD(+m[3], mo, +m[1]); }
    return null;
  }
  const GUESS = {
    date: [/tarih/, /date/],
    vendor: [/şirket|sirket|firma|tedarik|vendor|supplier|company|payee/, /mağaza|magaza|nereden|satıcı|satici|yer$|shop|store|merchant/],
    desc: [/açıklama|aciklama/, /description|detay|kalem|item|ürün|urun|hizmet|details/],
    out: [/harcama|expense/, /tutar|amount|gider|bedel|ücret|ucret|fiyat|price|cost|spent|debit/],
    in: [/gelen|cash in|money in/, /gelir|tahsilat|giriş|giris|income|received|deposit/],
    pay: [/ödeme|odeme|payment/, /nakit|kart|şekli|sekli|method/],
    cat: [/kategori|category/, /tür$|tip$|grup|type$/],
    note: [/^not\b|notlar|note|remark|comment/]
  };
  const hdrLower = x => String(x ?? "").toLocaleLowerCase("tr").trim();
  const anyRe = (re, x) => { const s = String(x ?? "").trim(); return !!s && (re.test(s.toLocaleLowerCase("tr")) || re.test(s.toLocaleLowerCase("en"))); };
  function guessMap(headers) { const used = new Set(); const map = {}; for (const [k] of FIELDS) { map[k] = -1; outer: for (const re of GUESS[k]) { for (let i = 0; i < headers.length; i++) { if (!used.has(i) && anyRe(re, headers[i])) { map[k] = i; used.add(i); break outer; } } } } return map; }
  function detectHeader(raw) { let best = 0, bs = -1; raw.slice(0, 25).forEach((r, ix) => { const cells = (r || []).filter(x => typeof x === "string" && x.trim()); const hits = cells.filter(c => Object.values(GUESS).some(a => a.some(re => anyRe(re, c)))).length; const sc = hits * 3 + (cells.length > 1 ? cells.length : 0); if (sc > bs) { bs = sc; best = ix; } }); return best; }
  function headersOf(raw, hdr) { const r = raw[hdr] || []; const w = Math.max(0, ...raw.slice(hdr, hdr + 60).map(x => (x || []).length)); return Array.from({ length: w }, (_, i) => r[i] != null ? String(r[i]).trim() : ""); }
  function sheetPeriod(raw) { for (let r = 0; r < Math.min(raw.length, 10); r++) for (const v of raw[r] || []) { if (typeof v === "number" && v > 30000 && v < 80000) { const d = toISO(v); if (d) return d.slice(0, 7); } } return null; }
  const keyOf = i => (i.type || "out") + "|" + (i.date || "") + "|" + (+i.amount || 0).toFixed(2) + "|" + hdrLower(i.vendor) + "|" + hdrLower(i.desc);
  function parseSheet(raw, hdr, M, acc) {
    let lastDate = null;
    const cell = (row, k) => M[k] > -1 ? row[M[k]] : null;
    for (let r = hdr + 1; r < raw.length; r++) {
      const row = raw[r]; if (!row || !row.some(x => x != null && x !== "")) continue;
      const firstTxt = row.find(x => typeof x === "string" && x.trim()) || "";
      const outV = K.toNum(cell(row, "out")), inV = K.toNum(cell(row, "in"));
      if (anyRe(/devir|brought forward|carried forward|opening balance/, firstTxt) && !toISO(cell(row, "date"))) { const v = !isNaN(inV) ? inV : outV; if (!isNaN(v) && acc.devirRaw == null) acc.devirRaw = v; continue; }
      if (anyRe(/^(genel )?toplam|^kalan kasa|^ara toplam|^total|^subtotal|^cash on hand|^balance|krem renkli|dönem kapandı|^period closed/, firstTxt)) continue;
      const vendor = String(cell(row, "vendor") ?? "").trim(), desc = String(cell(row, "desc") ?? "").trim();
      let type, amount;
      if (!isNaN(outV) && outV !== 0) { type = "out"; amount = outV; } else if (!isNaN(inV) && inV !== 0) { type = "in"; amount = inV; } else { if (vendor || desc) acc.skip++; continue; }
      const rawDate = cell(row, "date"); let date = toISO(rawDate);
      if (!date) date = lastDate || null; else lastDate = date;
      let note = String(cell(row, "note") ?? "").trim();
      if (typeof rawDate === "string" && /\d\s*[-–]\s*\d/.test(rawDate) && !note) note = t("Tarih: {tarih}", { tarih: rawDate.trim() });
      const cat = type === "in" ? "" : (K.catKey(String(cell(row, "cat") ?? "").trim()) || K.guessCat(vendor, desc));
      const pr = cell(row, "pay");
      const pay = type === "in" ? (anyRe(/eft/, pr) ? "eft" : anyRe(/havale|transfer|banka|bank/, pr) ? "havale" : anyRe(/nakit|cash|peşin/, pr) ? "nakit" : "") : anyRe(/kart|kredi|card|pos|banka|bank/, pr) ? "kart" : anyRe(/nakit|cash|peşin/, pr) ? "nakit" : "";
      const rec = { type, date: date || todayISO(), vendor, desc, cat, amount: r2(Math.abs(amount)), note };
      if (pay) rec.pay = pay;
      if (cat === "Yakıt") { const lt = K.parseLt(desc + " " + note); if (lt > 0) rec.lt = lt; }
      acc.rows.push(rec);
      if (date && (!acc.minDate || date < acc.minDate)) acc.minDate = date;
    }
  }
  function runParse() {
    const I = S.imp; const have = new Set(S.items.map(keyOf));
    const sheets = I.sheet === "__all" ? I.sheets : [I.sheet];
    const all = []; let skip = 0, devir = null, devirMonth = null, devirKey = null;
    sheets.forEach(name => {
      let raw, hdr, M;
      if (name === I.sheet) { raw = I.raw; hdr = I.hdr; M = I.map; } else { raw = I.wb.Sheets[name] || []; hdr = detectHeader(raw); M = guessMap(headersOf(raw, hdr)); }
      const acc = { rows: [], skip: 0, devirRaw: null, minDate: null };
      parseSheet(raw, hdr, M, acc); skip += acc.skip; all.push(...acc.rows);
      if (acc.devirRaw != null) { const pm = sheetPeriod(raw) || (acc.minDate ? acc.minDate.slice(0, 7) : null); const k = pm || "9999"; if (devirKey == null || k < devirKey) { devirKey = k; devir = acc.devirRaw; devirMonth = pm || curYM(); } }
    });
    const ok = []; let dup = 0;
    all.forEach(r => { if (have.has(keyOf(r))) { dup++; return; } ok.push(r); });
    I.parsed = { ok, skip, dup, devir, devirMonth };
    if (I.setOp == null) I.setOp = devir != null && S.set.opening == null;
  }
  function loadSingle(name) { const I = S.imp; I.raw = I.wb.Sheets[name] || []; I.hdr = detectHeader(I.raw); I.headers = headersOf(I.raw, I.hdr); I.map = guessMap(I.headers); }
  async function handleFile(f) {
    if (!f) return;
    try {
      const wb = await api("api/excel-oku", { method: "POST", body: await f.arrayBuffer(), headers: { "Content-Type": "application/octet-stream" } });
      S.imp = { name: f.name, wb, sheets: wb.SheetNames, sheet: wb.SheetNames.length > 1 ? "__all" : wb.SheetNames[0], busy: false, setOp: null };
      if (S.imp.sheet !== "__all") loadSingle(S.imp.sheet);
      if (S.tab !== "tum") S.tab = "excel";
      runParse(); render();
      const p = $("#importPanel"); if (p) p.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (e) { toast(e.message || t("Dosya okunamadı.")); }
  }
  function syncMapSelects() { if (!S.imp || !S.imp.map) return; FIELDS.forEach(([k]) => { const el = document.getElementById("map_" + k); if (el) el.value = String(S.imp.map[k]); }); }
  async function doImport() {
    const I = S.imp, rows = I.parsed.ok; if (I.busy) return;
    I.busy = true; render();
    try {
      if (I.setOp && I.parsed.devir != null) { S.set.opening = I.parsed.devir; S.set.openingDate = I.parsed.devirMonth + "-01"; await persistSettings(); }
      const stamp = new Date().toISOString();
      const recs = rows.map((r, i) => Object.assign({ id: newId() + i.toString(36), createdAt: stamp, updatedAt: stamp, ord: i, src: "excel" }, r));
      if (recs.length) { await op({ islem: "toplu", kayitlar: recs }); S.items.push(...recs); }
      const lastM = recs.map(r => r.date.slice(0, 7)).sort().pop();
      S.imp = null; S.tab = "list"; if (lastM) S.period = lastM; render();
      toast(t("{n} kayıt eklendi ve kaydedildi.", { n: recs.length }));
    } catch (e) { I.busy = false; fail(e, t("İçe aktarılamadı")); }
  }

  /* ---------------- entry form ---------------- */
  function quickPicks(type) {
    const since = addMonth(curYM(), -6) + "-01";
    const m = new Map();
    S.items.filter(e => (e.type || "out") === type && (e.date || "") >= since).sort((a, b) => (a.createdAt || a.date || "").localeCompare(b.createdAt || b.date || "")).forEach(e => {
      const key = lower(e.vendor) + "|" + lower(e.desc);
      if (!lower(e.vendor) && !lower(e.desc)) return;
      const x = m.get(key) || { n: 0, last: e }; x.n++; x.last = e; m.set(key, x);
    });
    return [...m.values()].sort((a, b) => b.n - a.n || (b.last.date || "").localeCompare(a.last.date || "")).slice(0, 8).map(x => x.last);
  }
  function quickHTML(type) {
    const ps = quickPicks(type);
    if (type === "in") {
      const adlar = [...new Set([t("Armatör"), t("Donatan"), ...ps.map(e => e.vendor).filter(Boolean)])].slice(0, 6);
      return '<div class="quick"><span class="ql">' + esc(t("Kimden geldi? Dokunun, yazılsın")) + '</span>' + adlar.map(a => '<button type="button" class="qchip" data-kimden="' + esc(a) + '">' + esc(a) + '</button>').join("") + '</div>';
    }
    if (!ps.length) return "";
    return '<div class="quick"><span class="ql">' + esc(t("Sık kullanılanlar · dokunun, bilgiler dolsun")) + '</span>' + ps.map(e => '<button type="button" class="qchip" data-quick="' + esc(e.id) + '">' + esc(e.vendor || e.desc) + (e.vendor && e.desc ? ' <small>· ' + esc(e.desc) + '</small>' : "") + ' <small>' + esc(e.cur && e.cur !== "TRY" ? fx(e.fxAmount, e.cur) : tl(e.amount)) + '</small></button>').join("") + '</div>';
  }
  function lastPay(type) { const inn = type === "in"; const s = S.items.filter(e => isIn(e) === inn && e.pay).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")); return s[0] ? s[0].pay : (inn ? "havale" : "nakit"); }
  // How the money moved: a receipt is paid in cash or by card; money coming in arrives by bank transfer, EFT or cash.
  const PAYS = type => type === "in" ? [["havale", t("Havale")], ["eft", t("EFT")], ["nakit", t("Nakit")]] : [["nakit", t("Nakit")], ["kart", t("Kart")]];
  function payHTML(type, payV) {
    const ops = PAYS(type); if (!ops.some(o => o[0] === payV)) payV = lastPay(type);
    const lbl = type === "in" ? t("Nasıl geldi?") : t("Ödeme şekli");
    return '<p class="seglbl" style="margin-bottom:4px">' + esc(lbl) + '</p><div class="seg" role="radiogroup" aria-label="' + esc(lbl) + '">' + ops.map(([v, l]) => '<label><input type="radio" name="pay" value="' + v + '"' + (payV === v ? " checked" : "") + '><span>' + esc(l) + '</span></label>').join("") + '</div>';
  }
  const formMetin = type => type === "in"
    ? { kim: t("Kimden geldi (donatan / armatör)"), kimOrn: t("Örn. Armatör"), acOrn: t("Örn. Kasa avansı") }
    : { kim: t("Şirket / satıcı"), kimOrn: t("Örn. Liman Market"), acOrn: t("Örn. Su ve yoğurt") };
  const sheetTitle = (editing, inn, copy) => editing ? (inn ? t("Gelen parayı düzenle") : t("Fişi düzenle")) : (inn ? t("Kasaya para ekle") : copy ? t("Fişi kopyala") : t("Yeni fiş"));
  function openSheet(id, presetType, copyFrom) {
    if (mustAccept()) return;
    const it = id ? S.items.find(x => x.id === id) : null; if (id && !it) return;
    const src = it || copyFrom || null;
    const ym = S.period && S.period !== "all" ? S.period : curYM();
    const defDate = ym === curYM() ? todayISO() : (ym < curYM() ? ym + "-01" : todayISO());
    const v = src ? Object.assign({}, src) : { type: presetType || "out", vendor: "", desc: "", cat: "", amount: "", note: "" };
    if (!it) v.date = copyFrom ? todayISO() : defDate;
    const cur = v.cur || "TRY";
    const amountShown = v.amount === "" ? "" : (cur !== "TRY" && +v.fxAmount > 0 ? num(v.fxAmount) : num(v.amount));
    const rate = cur !== "TRY" ? (v.fxRate || (S.set.rates || {})[cur] || "") : "";
    const payV = it ? (it.pay || "") : (v.pay || lastPay(v.type || "out"));
    const fm = formMetin(v.type || "out");
    const vendors = [...new Set(S.items.map(i => i.vendor).filter(Boolean))].slice(0, 400);
    const showLt = v.type !== "in" && (v.cat === "Yakıt" || +v.lt > 0 || K.guessCat(v.vendor, v.desc) === "Yakıt");
    S.ph = { id: it && it.photo || null, blob: null, preview: null, removed: false };
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><form class="sheet" id="form" role="dialog" aria-modal="true" aria-labelledby="sh" novalidate>' +
      '<h3 id="sh">' + esc(sheetTitle(!!it, v.type === "in", !!copyFrom)) + '</h3>' +
      '<div id="quickBox">' + (it ? "" : quickHTML(v.type || "out")) + '</div>' +
      '<div class="seg" role="radiogroup" aria-label="' + esc(t("Kayıt türü")) + '" style="margin-bottom:14px"><label><input type="radio" name="ty" value="out"' + (v.type !== "in" ? " checked" : "") + '><span>' + esc(t("Harcama")) + '</span></label><label><input type="radio" name="ty" value="in"' + (v.type === "in" ? " checked" : "") + '><span>' + esc(t("Gelen para")) + '</span></label></div>' +
      '<div class="grid2">' +
      '<div class="field"><label for="f_amount" id="amtLbl">' + esc(t("Tutar")) + '</label><div class="amtline">' + numBox("f_amount", amountShown, 2) + ' placeholder="' + esc(num(0)) + '"><select id="f_cur" class="cursel" aria-label="' + esc(t("Para birimi")) + '">' + Object.keys(K.CUR).map(c => '<option value="' + c + '"' + (c === cur ? " selected" : "") + '>' + K.CUR[c].sym + ' ' + c + '</option>').join("") + '</select></div></div>' +
      '<div class="field"><label for="f_date">' + esc(t("Tarih")) + '</label><input id="f_date" type="date" value="' + esc(v.date) + '"></div>' +
      '<div class="field full" id="rateWrap"' + (cur === "TRY" ? " hidden" : "") + '><label for="f_rate" id="rateLbl">' + esc(t("Kur (1 {cur} = ? ₺)", { cur })) + '</label>' + numBox("f_rate", K.dec(rate), 4) + ' placeholder="' + esc(t("Örn. 37,85")) + '"><div class="fxline" id="fxLine"></div></div>' +
      '<div class="field full"><label for="f_vendor" id="vendLbl">' + esc(fm.kim) + '</label><input id="f_vendor" list="vendlist" maxlength="120" autocomplete="off" value="' + esc(v.vendor) + '" placeholder="' + esc(fm.kimOrn) + '"><datalist id="vendlist">' + vendors.map(c => '<option value="' + esc(c) + '">').join("") + '</datalist></div>' +
      '<div class="field full"><label for="f_desc">' + esc(t("Açıklama")) + '</label><input id="f_desc" maxlength="200" autocomplete="off" value="' + esc(v.desc) + '" placeholder="' + esc(fm.acOrn) + '"></div>' +
      '<div class="field" id="catWrap"' + (v.type === "in" ? " hidden" : "") + '><label for="f_cat">' + esc(t("Kategori")) + '</label><input id="f_cat" list="catlist" autocomplete="off" value="' + esc(K.catLabel(v.cat)) + '" placeholder="' + esc(t("Kendiliğinden önerilir")) + '"><datalist id="catlist">' + allCats().map(c => '<option value="' + esc(K.catLabel(c)) + '">').join("") + '</datalist></div>' +
      '<div class="field" id="ltWrap"' + (showLt ? "" : " hidden") + '><label for="f_lt">' + esc(t("Yakıt (litre)")) + '</label>' + numBox("f_lt", +v.lt > 0 ? K.qty(v.lt) : "", 2) + ' placeholder="' + esc(t("Örn. 900")) + '"><div class="fxline" id="ltLine"></div></div>' +
      '<div class="full" id="payWrap">' + payHTML(v.type || "out", payV) + '</div>' +
      '<div class="field full"><label for="f_note">' + esc(t("Not")) + '</label><textarea id="f_note" maxlength="1000">' + esc(v.note) + '</textarea></div>' +
      '<div class="field full"><label>' + esc(t("Fiş fotoğrafı")) + ' <span style="font-weight:400">' + esc(t("(isteğe bağlı)")) + '</span></label><div class="ph" id="phBox">' + phBoxHTML() + '</div></div>' +
      '</div><div class="err-t" id="ferr"></div>' +
      '<div class="acts">' + (it ? '<button type="button" class="btn danger" id="delBtn" data-id="' + esc(it.id) + '">' + esc(t("Sil")) + '</button><button type="button" class="btn" id="copyBtn" data-id="' + esc(it.id) + '">' + esc(t("Bugüne kopyala")) + '</button>' : "") + '<div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><button type="submit" class="btn pri" id="saveBtn">' + esc(t("Kaydet")) + '</button></div></div>' +
      '</form></div>';
    S.editing = it ? it.id : null; S.catTouched = !!(src && src.cat);
    updFx(); updLt();
    // put the cursor in the amount box, unless the user has already moved into the form
    setTimeout(() => { const f = document.getElementById("f_amount"), a = document.activeElement; if (f && !(a && a.closest && a.closest("#form"))) { f.focus(); f.select(); } }, 30);
  }
  function fillFrom(e) {
    const g = id => document.getElementById(id);
    const cur = e.cur || "TRY";
    g("f_cur").value = cur;
    g("f_amount").value = cur !== "TRY" && +e.fxAmount > 0 ? num(e.fxAmount) : num(e.amount);
    if (cur !== "TRY") g("f_rate").value = K.dec((S.set.rates || {})[cur] || e.fxRate || "");
    g("f_vendor").value = e.vendor || ""; g("f_desc").value = e.desc || "";
    if (!isIn(e)) { g("f_cat").value = K.catLabel(e.cat); S.catTouched = !!e.cat; const p = document.querySelector('input[name="pay"][value="' + (e.pay || lastPay()) + '"]'); if (p) p.checked = true; g("f_lt").value = ""; }
    g("rateWrap").hidden = cur === "TRY";
    g("ltWrap").hidden = !(!isIn(e) && (e.cat === "Yakıt" || +e.lt > 0));
    updFx(); updLt(); g("f_amount").focus(); g("f_amount").select();
  }
  function updFx() {
    const g = id => document.getElementById(id); if (!g("f_cur")) return;
    const cur = g("f_cur").value; g("rateWrap").hidden = cur === "TRY";
    g("amtLbl").textContent = cur === "TRY" ? t("Tutar (₺)") : t("Tutar ({sym})", { sym: K.CUR[cur].sym });
    if (g("rateLbl")) g("rateLbl").textContent = t("Kur (1 {cur} = ? ₺)", { cur });
    const a = toNum(g("f_amount").value), r = toNum(g("f_rate").value);
    const ty = (document.querySelector('input[name="ty"]:checked') || {}).value;
    g("fxLine").innerHTML = cur !== "TRY" && a > 0 && r > 0 ? '= <b>' + tl(a * r) + '</b> ' + esc(ty === "in" ? t("kasaya girer") : t("kasadan düşer")) : (cur !== "TRY" ? esc(t("Kuru girin; tutar TL’ye çevrilip kasaya işlenir.")) : "");
  }
  function updLt() {
    const g = id => document.getElementById(id); if (!g("f_lt")) return;
    const lt = toNum(g("f_lt").value), cur = g("f_cur").value, a = toNum(g("f_amount").value), r = cur === "TRY" ? 1 : toNum(g("f_rate").value);
    g("ltLine").textContent = lt > 0 && a > 0 && r > 0 ? K.perL(a * r / lt) : "";
  }
  function closeSheet() { if (mustAccept()) return; $("#sheetHost").innerHTML = ""; S.editing = null; S.terms = null; if (S.ph && S.ph.preview) URL.revokeObjectURL(S.ph.preview); S.ph = null; if (S._pending) { S._pending = false; render(); } }
  async function saveForm() {
    const g = id => document.getElementById(id);
    const type = document.querySelector('input[name="ty"]:checked').value;
    const cur = g("f_cur").value;
    const typed = toNum(g("f_amount").value), rate = cur === "TRY" ? 1 : toNum(g("f_rate").value);
    const date = g("f_date").value, vendor = g("f_vendor").value.trim(), desc = g("f_desc").value.trim();
    const err = g("ferr");
    if (isNaN(typed) || typed <= 0) { err.textContent = t("Tutarı rakamla yazın, ör. {ornek}", { ornek: boxText(1250.5, 2) }); g("f_amount").focus(); return; }
    if (cur !== "TRY" && !(rate > 0)) { err.textContent = t("Kuru yazın, ör. {ornek}", { ornek: K.dec(37.85) }); g("f_rate").focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = t("Tarih seçin."); g("f_date").focus(); return; }
    if (!vendor && !desc) { err.textContent = t("Şirket ya da açıklama yazın."); g("f_vendor").focus(); return; }
    const old = S.editing ? S.items.find(x => x.id === S.editing) : null;
    const now = new Date().toISOString();
    const body = { id: old ? old.id : newId(), type, date, vendor, desc, cat: type === "in" ? "" : (K.catKey(g("f_cat").value) || K.guessCat(vendor, desc)), amount: r2(typed * rate), note: g("f_note").value.trim(), createdAt: old ? old.createdAt || now : now, updatedAt: K.damga(old && old.updatedAt) };
    if (old && old.src) body.src = old.src; if (old && old.ord != null) body.ord = old.ord;
    if (cur !== "TRY") { body.cur = cur; body.fxAmount = r2(typed); body.fxRate = rate; }
    { const p = document.querySelector('input[name="pay"]:checked'); if (p) body.pay = p.value; }
    if (type === "out") { const lt = toNum(g("f_lt").value); if (lt > 0 && !g("ltWrap").hidden) body.lt = lt; }
    const sb = g("saveBtn"); sb.disabled = true; sb.textContent = t("Kaydediliyor…");
    const before = curBalance();
    try {
      let oldPhoto = null;
      if (S.ph.blob) { sb.textContent = t("Fotoğraf kaydediliyor…"); const up = await api("api/foto", { method: "POST", body: S.ph.blob, headers: { "Content-Type": "image/jpeg" } }); body.photo = up.id; if (old && old.photo) oldPhoto = old.photo; }
      else if (S.ph.id && !S.ph.removed) body.photo = S.ph.id;
      else if (old && old.photo && S.ph.removed) oldPhoto = old.photo;
      sb.textContent = t("Kaydediliyor…");
      await persistEntry(body);
      if (old) Object.keys(old).forEach(k => delete old[k]), Object.assign(old, body); else S.items.push(body);
      if (oldPhoto) api("api/foto/" + oldPhoto, { method: "DELETE" }).catch(() => { });
      if (cur !== "TRY" && (S.set.rates || {})[cur] !== rate) { S.set.rates = Object.assign({}, S.set.rates, { [cur]: rate }); persistSettings().catch(() => { }); }
      const after = curBalance();
      const msg = [old ? t("Değişiklik kaydedildi.") : (type === "in" ? t("Gelen para kaydedildi.") : t("Fiş kaydedildi."))];
      if (!old) {
        if (type === "in" && before < 0) msg.push(after >= 0 ? t("Kasa açığı kapandı, kasada {tutar} var.", { tutar: tl(after) }) : t("Açık {tutar} kaldı.", { tutar: tl(-after) }));
        else if (type === "out" && after < 0 && before >= 0) msg.push(t("Kasa eksiye düştü: {tutar}.", { tutar: tl(after) }));
        else if (type === "out" && after >= 0 && +S.set.lowLimit > 0 && after < +S.set.lowLimit && before >= +S.set.lowLimit) msg.push(t("Kasa uyarı sınırının altına indi: {tutar}.", { tutar: tl(after) }));
      }
      const ym = date.slice(0, 7); const moved = S.period !== "all" && ym !== S.period;
      if (moved) msg.push(t("{ay} gösteriliyor.", { ay: monthLabel(ym) }));
      closeSheet(); if (moved) S.period = ym; render();
      toast(msg.join(" "));
    } catch (e) { sb.disabled = false; sb.textContent = t("Kaydet"); err.textContent = e.message || t("Kaydedilemedi."); }
  }
  async function delItem(btn) {
    if (!btn.classList.contains("arm")) { btn.classList.add("arm"); btn.textContent = t("Silmek için tekrar tıklayın"); return; }
    const id = btn.dataset.id; btn.disabled = true;
    const it = S.items.find(x => x.id === id) || {}, ph = it.photo, zaman = K.damga(it.updatedAt || it.createdAt);
    try {
      await op({ islem: "sil", id, zaman });
      S.items = S.items.filter(x => x.id !== id); S.silinenler[id] = zaman;
      if (ph) api("api/foto/" + ph, { method: "DELETE" }).catch(() => { });
      closeSheet(); render(); toast(t("Kayıt silindi."));
    } catch (e) { btn.disabled = false; $("#ferr").textContent = e.message; }
  }
  function phBoxHTML() {
    const P = S.ph || {}; const has = (P.preview || P.id) && !P.removed;
    return (has ? '<button type="button" class="thumb" id="phView" aria-label="' + esc(t("Fotoğrafı büyüt")) + '"><img alt="' + esc(t("Fiş fotoğrafı")) + '" src="' + esc(P.preview || fotoURL(P.id)) + '"></button>' : "") +
      '<label class="btn" for="f_photo" style="cursor:pointer">' + esc(has ? t("Değiştir") : t("Fotoğraf ekle")) + '</label><input id="f_photo" type="file" accept="image/*" hidden>' +
      (has ? '<button type="button" class="btn danger" id="phRemove">' + esc(t("Kaldır")) + '</button>' : '<span class="hint">' + esc(WEB ? t("Fişin fotoğrafını çekin ya da galeriden seçin") : t("Telefondan aktardığınız ya da taradığınız fiş fotoğrafı")) + '</span>');
  }
  async function shrinkImage(file) {
    const draw = (src, w, h) => { const k = Math.min(1, 1800 / Math.max(w, h)); const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k); const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height); return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("enc")), "image/jpeg", 0.85)); };
    try { const bmp = await createImageBitmap(file); return await draw(bmp, bmp.width, bmp.height); }
    catch (e) { const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("dec")); im.src = u; }); return await draw(img, img.naturalWidth, img.naturalHeight); }
  }
  async function pickPhoto(file) {
    if (!file) return; const box = $("#phBox"); if (box) box.innerHTML = '<span class="hint">' + esc(t("Fotoğraf hazırlanıyor…")) + '</span>';
    try { const b = await shrinkImage(file); if (S.ph.preview) URL.revokeObjectURL(S.ph.preview); S.ph.blob = b; S.ph.preview = URL.createObjectURL(b); S.ph.removed = false; }
    catch (e) { const f = $("#ferr"); if (f) f.textContent = t("Bu fotoğraf açılamadı. JPEG ya da PNG bir fotoğraf seçin."); }
    const bx = $("#phBox"); if (bx) bx.innerHTML = phBoxHTML();
  }

  /* ---------------- periods ---------------- */
  function openNewPeriod() {
    const last = S.period && S.period !== "all" ? S.period : monthRange()[0], next = addMonth(last, 1), k = kasaFor(last);
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><h3 id="sh">' + esc(t("{ay} kapanıyor", { ay: monthLabel(last) })) + '</h3><p style="margin:0 0 14px;color:var(--muted)">' + esc(t("Dönem kapandı olarak işaretlenecek ve {ay} açılacak. Kalan kasa yeni ayın devrine kendiliğinden geçer. Kapanan aya sonradan fiş girerseniz devir de kendiliğinden düzelir.", { ay: monthLabel(next) })) + '</p><div class="closebox"><span>' + esc(t("Devir kasa")) + '</span><span class="v">' + tl(k.devir) + '</span><span>' + esc(t("Gelen para")) + '</span><span class="v" style="color:var(--ok)">' + tl(k.in) + '</span><span>' + esc(t("Toplam harcama")) + '</span><span class="v">' + tl(k.out) + '</span><span class="tot">' + esc(t("{ay} devri", { ay: monthLabel(next) })) + '</span><span class="v tot">' + tl(k.kalan) + '</span></div><div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><button type="button" class="btn pri" id="confirmNewP" data-m="' + next + '" data-close="' + last + '">' + esc(t("Dönemi kapat ve yeni aya geç")) + '</button></div></div></div></div>';
  }
  async function confirmNewPeriod(btn) {
    const m = btn.dataset.m, c = btn.dataset.close; btn.disabled = true;
    const prev = JSON.stringify(S.set);
    S.set.closed = [...new Set([...(S.set.closed || []), c])].sort();
    if (!S.set.openedThrough || m > S.set.openedThrough) S.set.openedThrough = m;
    try { await persistSettings(); S.period = m; closeSheet(); render(); toast(t("{ay} kapandı. Kalan kasa {yeni} devrine geçti.", { ay: monthLabel(c), yeni: monthLabel(m) })); }
    catch (e) { S.set = JSON.parse(prev); btn.disabled = false; toast(e.message); }
  }

  /* ---------------- save / backups ---------------- */
  async function manualSave() {
    if (mustAccept()) return;
    try { await persistAll(); openSaveInfo(); }
    catch (e) { if (e.status === 409) { try { await reload(); openSaveInfo(); return; } catch (e2) { } } toast(e.message || t("Kaydedilemedi")); render(); }
  }
  function openSaveInfo() {
    const n = S.items.length;
    if (WEB) {
      const sb = S.senk && S.senk.bagli;
      $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><div class="done"><span class="oi x">✓</span><div><h3 id="sh" style="margin-bottom:6px">' + esc(t("Kaydedildi")) + '</h3><div class="info"><p>' + esc(t("Tüm kayıtlarınız ({n} kayıt) bu telefona kaydedildi.", { n })) + ' ' + esc(sb ? t("Google Drive eşitlemesi açık; değişiklikler diğer cihazlarınıza da gider.") : t("Telefon değişirse ya da uygulama silinirse kayıtlar kaybolmasın diye Ayarlar’dan Google Drive eşitlemesini açabilir ya da yedek dosyası alabilirsiniz.")) + '</p>' + (S.lastSaved ? '<p style="color:var(--muted);font-size:13px">' + esc(t("Son kayıt: bugün {saat}", { saat: hm(S.lastSaved) })) + '</p>' : "") + '</div></div></div>' +
        '<div class="acts"><div class="r"><button type="button" class="btn" id="backupNow">' + esc(t("Yedek dosyası al")) + '</button><button type="button" class="btn pri" id="closeSheet">' + esc(t("Tamam")) + '</button></div></div></div></div>';
      return;
    }
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><div class="done"><span class="oi x">✓</span><div><h3 id="sh" style="margin-bottom:6px">' + esc(t("Kaydedildi")) + '</h3><div class="info"><p>' + esc(t("Tüm kayıtlarınız ({n} kayıt) bu bilgisayara kaydedildi. Program kapatılıp açıldığında kaldığı yerden devam eder; her gün kendiliğinden yedek de alınır.", { n })) + '</p><div class="pathbox">' + esc(S.dosya || S.klasor) + '</div>' + (S.lastSaved ? '<p style="color:var(--muted);font-size:13px">' + esc(t("Son kayıt: bugün {saat}", { saat: hm(S.lastSaved) })) + '</p>' : "") + '</div></div></div>' +
      '<div class="acts"><div class="r"><button type="button" class="btn" id="openFolder">' + esc(t("Klasörü aç")) + '</button><button type="button" class="btn" id="backupNow">' + esc(t("Ek yedek al")) + '</button><button type="button" class="btn pri" id="closeSheet">' + esc(t("Tamam")) + '</button></div></div></div></div>';
  }
  async function backupNow() {
    if (WEB) {
      try { const d = await api("api/veri"); const ad = "Yachting Jurnal yedek " + todayISO() + ".json"; dosyaHazir(t("Yedek dosyası hazır"), ad, new Blob([JSON.stringify(d.defter, null, 1)], { type: "application/json" }), "JSON"); }
      catch (e) { toast(e.message); }
      return;
    }
    try { const r = await api("api/yedek", { method: "POST" }); toast(t("Yedek alındı: {ad}", { ad: r.yol.split(/[\\/]/).pop() }), [{ label: t("Klasörde göster"), run: () => openPath(r.yol, true) }]); }
    catch (e) { toast(e.message); }
  }
  async function openPath(yol, goster) { try { await api("api/ac", { method: "POST", json: { yol: yol || "", goster: !!goster } }); } catch (e) { toast(e.message); } }
  const BELGE = { kilavuz: { tr: "Kasa-Jurnali-Kullanim-Kilavuzu.pdf", en: "Kasa-Jurnali-User-Guide.pdf" }, yasal: { tr: "Kasa-Jurnali-Kosullar-ve-Gizlilik.pdf", en: "Kasa-Jurnali-Terms-and-Privacy.pdf" } };
  async function openDoc(ad) {
    if (WEB) { window.open("belgeler/" + (BELGE[ad] || BELGE.kilavuz)[K.lang === "en" ? "en" : "tr"], "_blank"); return; }
    try { await api("api/belge", { method: "POST", json: { ad, dil: K.lang } }); } catch (e) { toast(e.message); }
  }
  async function restoreFile(f) {
    if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch (e) { toast(t("Bu dosya bir Yachting Jurnal yedeği değil.")); return; }
    const ay = d.ayarlar || d.settings, ky = d.kayitlar || d.items;
    if (!Array.isArray(ky)) { toast(t("Bu dosya bir Yachting Jurnal yedeği değil.")); return; }
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><h3 id="sh">' + esc(t("Yedek yüklensin mi?")) + '</h3><div class="info"><p>' + esc(t("{dosya} dosyasında {n} kayıt var.", { dosya: f.name, n: ky.length }) + (d.kaydedilme ? " " + t("Kaydedilme tarihi: {tarih}.", { tarih: dmy(String(d.kaydedilme).slice(0, 10)) }) : "")) + '</p><p>' + esc(t("Şu anki {n} kayıt bu yedekle değiştirilecek. Şu anki hâli önce Yedekler klasörüne kaydedilir; gerekirse geri dönebilirsiniz.", { n: S.items.length })) + '</p></div><div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><button type="button" class="btn pri" id="confirmRestore">' + esc(t("Yedeği yükle")) + '</button></div></div></div></div>';
    $("#confirmRestore").onclick = async () => {
      try {
        const keep = { lang: S.set.lang, kabul: S.set.kabul, guncelleme: S.set.guncelleme };   // the person at this device already chose these
        const ayar = Object.assign({}, ay || {}); delete ayar._zaman; if (!ayar.lang) ayar.lang = keep.lang; ayar.kabul = keep.kabul; if (keep.guncelleme !== undefined) ayar.guncelleme = keep.guncelleme;
        // stamp everything "now" so the restored book also replaces the copies on the other devices
        const simdi = K.damga(), z = {};
        for (const k of new Set([...Object.keys(ayar), ...Object.keys(S.set)])) {
          if (K.YEREL_AYAR.includes(k) || k === "_zaman") continue;
          if (k === "closed") new Set([...(ayar.closed || []), ...(S.set.closed || [])]).forEach(m => { z["closed/" + m] = simdi; });
          else if (k === "rates") Object.keys(Object.assign({}, S.set.rates, ayar.rates)).forEach(c => { z["rates/" + c] = simdi; });
          else { z[k] = simdi; if (!(k in ayar)) ayar[k] = null; }
        }
        ayar._zaman = z;
        const kay = ky.map(e => Object.assign({}, e, { updatedAt: simdi })), yeni = new Set(kay.map(e => e.id));
        const sil = Object.assign({}, S.silinenler, (d.silinenler && typeof d.silinenler === "object") ? d.silinenler : {});
        S.items.forEach(e => { if (!yeni.has(e.id)) sil[e.id] = simdi; }); yeni.forEach(id => { delete sil[id]; });
        await op({ islem: "geriyukle", defter: { ayarlar: ayar, kayitlar: kay, silinenler: sil } }); closeSheet(); await reload(); toast(t("Yedek yüklendi: {n} kayıt.", { n: ky.length }));
      } catch (e) { toast(e.message); }
    };
  }

  // a server message as a sentence: capital first letter, full stop at the end
  const cumle = m => { m = m.trim(); return m ? m[0].toLocaleUpperCase(K.lang === "en" ? "en" : "tr") + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".") : ""; };
  /* ---------------- terms of use and privacy (first start and Settings) ---------------- */
  const YASAL = () => window.KJ_YASAL || null;
  const needTerms = () => { const Y = YASAL(); return !!Y && (!S.set.kabul || S.set.kabul.surum !== Y.surum); };
  function legalHTML(which) { const Y = YASAL(); if (!Y) return ""; const L = Y[K.lang] || Y.tr; return L[which] || ""; }
  function openTerms(mode, tab) { S.terms = { mode, tab: tab || "kosullar", c1: false, c2: false }; renderTerms(); }
  function renderTerms() {
    const T = S.terms; if (!T) return;
    const acc = T.mode === "accept", Y = YASAL(), k = S.set.kabul;
    const tabs = [["kosullar", t("Kullanım Koşulları")], ["gizlilik", t("Gizlilik ve KVKK")], ["lisanslar", t("Üçüncü taraf lisansları")]];
    $("#sheetHost").innerHTML = '<div class="scrim" id="' + (acc ? "termsScrim" : "scrim") + '"><div class="sheet wide terms" role="dialog" aria-modal="true" aria-labelledby="sh" id="termsSheet">' +
      '<div class="thead"><h3 id="sh">' + esc(acc ? t("Yachting Jurnal’e Hoş Geldiniz") : t("Yasal bilgiler")) + '</h3>' + langSwitchHTML() + '</div>' +
      (acc ? '<p class="lead">' + esc(WEB ? t("Uygulamayı kullanmaya başlamadan önce lütfen aşağıdaki metinleri okuyun. Kayıtlarınız bu telefonda saklanır; Google Drive eşitlemesini siz açmadıkça hiçbir kayıt internete gönderilmez.") : t("Programı kullanmaya başlamadan önce lütfen aşağıdaki metinleri okuyun. Kayıtlarınız bu bilgisayarda saklanır; Google Drive eşitlemesini siz açmadıkça hiçbir kayıt internete gönderilmez.")) + '</p>' : "") +
      '<div class="ttabs" role="tablist">' + tabs.map(([id, l]) => '<button type="button" role="tab" data-ttab="' + id + '" aria-selected="' + (T.tab === id) + '">' + esc(l) + '</button>').join("") + '</div>' +
      '<div class="legal" id="legalBox" tabindex="0" lang="' + K.lang + '">' + legalHTML(T.tab) + '</div>' +
      (acc ? '<div class="accept"><label class="check"><input type="checkbox" id="acc1"' + (T.c1 ? " checked" : "") + '> <span>' + esc(t("Kullanım Koşulları ve Lisans Sözleşmesi’ni okudum ve kabul ediyorum.")) + '</span></label>' +
        '<label class="check"><input type="checkbox" id="acc2"' + (T.c2 ? " checked" : "") + '> <span>' + esc(t("Gizlilik ve Kişisel Veriler Bilgilendirmesi’ni okudum ve anladım.")) + '</span></label></div>'
        : (k && k.tarih ? '<p class="small">' + esc(t("Kullanım Koşulları {tarih} tarihinde kabul edildi (sürüm {surum}).", { tarih: K.dateTime(new Date(k.tarih)), surum: k.surum || "" })) + '</p>' : "")) +
      '<div class="err-t" id="terr"></div>' +
      '<div class="acts">' + (acc
        ? '<button type="button" class="btn" id="declineTerms">' + esc(t("Kabul etmiyorum")) + '</button><div class="r"><button type="button" class="btn pri" id="acceptTerms"' + (T.c1 && T.c2 ? "" : " disabled") + '>' + esc(t("Kabul ediyorum, devam et")) + '</button></div>'
        : '<button type="button" class="btn" id="openLegalPdf">' + esc(t("PDF olarak aç")) + '</button><div class="r"><button type="button" class="btn pri" id="closeSheet">' + esc(t("Kapat")) + '</button></div>') + '</div>' +
      (Y ? '<p class="small ver">' + esc(t("Metin sürümü {surum} · Yürürlük {tarih}", { surum: Y.surum, tarih: dmy(Y.tarih) })) + '</p>' : "") +
      '</div></div>';
  }
  async function acceptTerms(btn) {
    const Y = YASAL(); if (!Y || !S.terms || !S.terms.c1 || !S.terms.c2) return;
    btn.disabled = true;
    const prev = S.set.kabul;
    S.set.kabul = { surum: Y.surum, tarih: new Date().toISOString(), dil: K.lang, kosullar: true, gizlilik: true };
    if (!S.set.lang) S.set.lang = K.lang;
    try { await persistSettings(); S.terms = null; $("#sheetHost").innerHTML = ""; render(); toast(t("Teşekkürler. İyi seyirler!")); senkKur(); }
    catch (e) { S.set.kabul = prev; btn.disabled = false; const r = $("#terr"); if (r) r.textContent = e.message; }
  }
  async function declineTerms() {
    if (WEB) { document.body.innerHTML = '<div class="bye"><h1>Yachting Jurnal</h1><p>' + esc(t("Yachting Jurnal’i kullanmak için Kullanım Koşulları’nı kabul etmeniz gerekir. Uygulamayı kapatabilirsiniz; yeniden açtığınızda metinler tekrar gösterilir.")) + '</p></div>'; return; }
    try { await api("api/kapat", { method: "POST" }); } catch (e) { }
    document.body.innerHTML = '<div class="bye"><h1>Yachting Jurnal</h1><p>' + esc(t("Program kapatıldı. Yachting Jurnal’i kullanmak için Kullanım Koşulları’nı kabul etmeniz gerekir. Bu pencereyi kapatabilirsiniz.")) + '</p></div>';
    setTimeout(() => { try { window.close(); } catch (e) { } }, 400);
  }

  /* ---------------- export (PDF report / Excel) ---------------- */
  function exportMonths(scope) { return scope === "all" || S.period === "all" ? K.monthsWithData(S.items) : [S.period]; }
  function openExport() {
    const one = S.period !== "all";
    const anyPhoto = S.items.some(e => e.photo);
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh" id="expSheet"><h3 id="sh">' + esc(t("Rapor al")) + '</h3>' +
      '<div class="opts" role="radiogroup" aria-label="' + esc(t("Dosya türü")) + '">' +
      '<label class="opt"><input type="radio" name="fmt" value="pdf" checked><span class="oi">PDF</span><span class="ot"><b>' + esc(t("PDF rapor")) + '</b><span>' + esc(WEB ? t("Kasa raporu açılır; “Yazdır / PDF” ile yazdırabilir ya da PDF olarak paylaşabilirsiniz") : t("Yazdırmaya, e-postayla göndermeye hazır kasa raporu: özet, fiş listesi, anlık kasa, kategori, yakıt ve imza alanları")) + '</span></span></label>' +
      '<label class="opt"><input type="radio" name="fmt" value="xlsx"><span class="oi x">XLS</span><span class="ot"><b>' + esc(t("Excel tablosu")) + '</b><span>' + esc(t("Aylık fiş takip tablosu düzeninde; toplamlar formüllü")) + '</span></span></label></div>' +
      '<p class="seglbl" style="margin:14px 0 4px">' + esc(t("Hangi dönem?")) + '</p><div class="seg" role="radiogroup" aria-label="' + esc(t("Kapsam")) + '">' + (one ? '<label><input type="radio" name="scope" value="period" checked><span>' + esc(monthLabel(S.period)) + '</span></label>' : "") + '<label><input type="radio" name="scope" value="all"' + (one ? "" : " checked") + '><span>' + esc(t("Tüm aylar")) + '</span></label></div>' +
      (anyPhoto ? '<label class="check" style="margin-top:12px" id="photoOpt"><input type="checkbox" id="withPhotos" checked> <span>' + esc(t("Fiş fotoğraflarını rapora ek olarak koy")) + '</span></label>' : "") +
      '<p class="small" style="margin:12px 0 0">' + esc(t("Rapor ve tablo Türkçe hazırlanır. Dili Ayarlar’dan değiştirebilirsiniz.")) + '</p>' +
      '<div class="err-t" id="xerr"></div>' +
      '<div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><button type="button" class="btn pri" id="runExport">' + esc(t("Raporu oluştur")) + '</button></div></div></div></div>';
  }
  async function runExport(btn) {
    const fmt = document.querySelector('input[name="fmt"]:checked').value, scope = document.querySelector('input[name="scope"]:checked').value;
    const months = exportMonths(scope);
    if (!months.length) { $("#xerr").textContent = t("Rapora girecek fiş yok."); return; }
    const label = months.length === 1 ? monthLabel(months[0]) : monthLabel(months[0]) + " – " + monthLabel(months[months.length - 1]);
    const base = (S.set.name ? S.set.name + " - " : "");
    btn.disabled = true; btn.textContent = fmt === "pdf" ? t("PDF hazırlanıyor…") : t("Excel hazırlanıyor…");
    if (WEB) {
      try {
        if (fmt === "pdf") { const wp = $("#withPhotos"); location.href = "rapor?ay=" + encodeURIComponent(months.join(",")) + "&foto=" + (wp && wp.checked ? "1" : "0") + "&dil=" + K.lang; return; }
        const ad = (base + "Yachting Jurnal - " + label).replace(/[\/:*?"<>|]/g, "-") + ".xlsx";
        const r = await api("api/excel", { method: "POST", raw: true, json: { dosya: ad, dil: K.lang, sayfalar: months.map(sheetSpec) } });
        dosyaHazir(t("Excel dosyası hazır"), ad, await r.blob(), "XLS");
      } catch (e) { btn.disabled = false; btn.textContent = t("Tekrar dene"); $("#xerr").textContent = e.message; }
      return;
    }
    try {
      let r;
      if (fmt === "pdf") { const wp = $("#withPhotos"); r = await api("api/pdf", { method: "POST", json: { aylar: months, fotograflar: wp ? wp.checked : false, dosya: base + t("Kasa Raporu") + " - " + label, dil: K.lang } }); }
      else r = await api("api/excel", { method: "POST", json: { dosya: base + "Yachting Jurnal - " + label, dil: K.lang, sayfalar: months.map(sheetSpec) } });
      const sh = $("#expSheet");
      sh.innerHTML = '<div class="done"><span class="oi' + (fmt === "pdf" ? "" : " x") + '">' + (fmt === "pdf" ? "PDF" : "XLS") + '</span><div><h3 style="margin-bottom:6px">' + esc(fmt === "pdf" ? t("PDF rapor hazır") : t("Excel dosyası hazır")) + '</h3><div class="info"><p><b>' + esc(r.ad) + '</b></p><div class="pathbox">' + esc(r.yol) + '</div></div></div></div><div class="acts"><div class="r"><button type="button" class="btn" id="showFile">' + esc(t("Klasörde göster")) + '</button><button type="button" class="btn pri" id="openFile">' + esc(t("Aç")) + '</button><button type="button" class="btn" id="closeSheet">' + esc(t("Kapat")) + '</button></div></div>';
      $("#openFile").onclick = () => openPath(r.yol, false);
      $("#showFile").onclick = () => openPath(r.yol, true);
    } catch (e) {
      btn.disabled = false; btn.textContent = t("Tekrar dene");
      const pv = e.body && e.body.onizleme;
      $("#xerr").innerHTML = esc(e.message) + (pv ? '<br><button type="button" class="btn sm" id="pvBtn" style="margin-top:8px">' + esc(t("Raporu pencerede aç ve yazdır")) + '</button>' : "");
      if (pv) $("#pvBtn").onclick = () => window.open(pv, "_blank");
    }
  }
  function serial(iso) { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; }
  function sheetSpec(ym) {
    const k = kasaFor(ym);
    const its = S.items.filter(e => (e.date || "").slice(0, 7) === ym).sort(K.cmpEntry);
    const H = []; const put = (r, v, st, f) => H.push({ r, v: v === undefined ? null : v, st: st || "", f: f || "" });
    const up = s => s.toLocaleUpperCase(K.lang === "en" ? "en-GB" : "tr-TR");
    put("A1", S.set.name || "Yachting Jurnal", "baslik"); put("E1", up(t("Dönem")), "etiket"); put("E2", serial(ym + "-01"), "donem");
    put("A2", t("Günlük harcama fiş takip tablosu"), "etiket");
    put("A4", up(t("Devir kasa")), "etiket"); put("C4", up(t("Gelen para")), "etiket"); put("D4", up(t("Toplam harcama")), "etiket"); put("E4", up(t("Kalan kasa")), "etiket");
    [t("Tarih"), t("Şirket"), t("Açıklama"), t("Harcama") + " (₺)", t("Gelen para") + " (₺)", t("Ödeme"), t("Kategori"), t("Not")].map(up).forEach((x, i) => put("ABCDEFGH"[i] + "7", x, i === 3 || i === 4 ? "basliksatirsag" : "basliksatir"));
    put("A8", up(t("Devir")) + " · " + t("önceki dönemden kalan kasa"), "metin"); ["B8", "C8", "D8", "F8", "G8", "H8"].forEach(c => put(c, null, "metin")); put("E8", k.devir, "para");
    its.forEach((e, ix) => {
      const r = 9 + ix, inn = isIn(e);
      put("A" + r, serial(e.date), "tarih"); put("B" + r, e.vendor || "", "metin"); put("C" + r, e.desc || "", "metin");
      put("D" + r, inn ? null : +e.amount || 0, "para"); put("E" + r, inn ? +e.amount || 0 : null, "paragelen");
      put("F" + r, K.payName(e.pay), "metin"); put("G" + r, inn ? t("Gelen para") : K.catLabel(e.cat), "metin");
      put("H" + r, [K.amountNote(e), e.note, e.photo ? t("Fiş fotoğrafı var") : ""].filter(Boolean).join(" · "), "metin");
    });
    const first = 9, last = Math.max(first, 8 + its.length), tot = last + 1, kal = last + 2;
    put("A" + tot, up(t("Toplam")), "kalinzemin"); ["B", "C", "F", "G", "H"].forEach(c => put(c + tot, null, "kalinzemin"));
    put("D" + tot, k.out, "parakalin", "SUM(D" + first + ":D" + last + ")"); put("E" + tot, r2(k.devir + k.in), "parakalin", "SUM(E8:E" + last + ")");
    put("A" + kal, up(t("Kalan kasa")) + "  (" + t("Devir + Gelen para − Harcama") + ")", "kalin"); put("E" + kal, k.kalan, "kalan", "E" + tot + "-D" + tot);
    if (isClosed(ym)) put("A" + (kal + 1), up(t("Dönem kapandı")) + " · " + t("kalan kasa {ay} devrine aktarıldı", { ay: monthLabel(addMonth(ym, 1)) }), "etiket");
    put("A5", k.devir, "para", "E8"); put("C5", k.in, "paragelen", "SUM(E" + first + ":E" + last + ")"); put("D5", k.out, "para", "D" + tot); put("E5", k.kalan, "kalan", "E" + kal);
    return { ad: K.monthName(+ym.slice(5, 7)) + "_" + ym.slice(0, 4), sutunlar: [12, 24, 30, 15, 15, 9, 20, 34], dondur: 8,
      birlesik: ["A1:C1", "A2:C2", "E1:F1", "E2:F2", "A4:B4", "A5:B5", "A8:D8", "A" + tot + ":C" + tot, "A" + kal + ":D" + kal], hucreler: H };
  }



  /* ---------------- sign-in first: the book opens after the Google account is connected (later it also works offline) ---------------- */
  const girisGerekli = () => S.mode === "live" && !S.terms && !!(S.senk && S.senk.hazir && S.senk.zorunlu && !S.senk.bagli);
  // signed in, but this Google account may not use Yachting Jurnal (closed, time over) or it is still being checked
  const erisimEngeli = () => S.mode === "live" && !S.terms && !!(S.senk && S.senk.bagli && S.senk.lisansAcik && !S.senk.izinli);
  const kilitli = () => girisGerekli() || erisimEngeli();
  const bugunISO = () => todayISO();
  function kalanGun() {
    const L = S.senk && S.senk.lisans;
    if (!L || !L.izin || !L.bitis || L.kapali) return null;
    return Math.round((new Date(L.bitis + "T12:00:00") - new Date(bugunISO() + "T12:00:00")) / 86400000);
  }
  function erisimHTML() {
    const b = S.senk, L = b.lisans;
    const kutu = (baslik, govde, dugmeler) => '<div class="giris"><img class="glogo" src="ikon.png" alt=""><h2>' + esc(baslik) + '</h2>' + govde + (dugmeler ? '<div class="gdugme">' + dugmeler + '</div>' : "") + (b.hesap ? '<p class="small">' + esc(t("Oturum açık: {hesap}", { hesap: b.hesap })) + '</p>' : "") + '</div>';
    if (!L && !b.lisansHata) return kutu(t("Erişim denetleniyor…"), '<p class="lead"><span class="spin"></span>' + esc(t("Google hesabınızın Yachting Jurnal erişimi denetleniyor.")) + '</p>', "");
    const dene = '<button type="button" class="btn pri" id="erisimDene">' + esc(t("Yeniden dene")) + '</button>';
    const cik = '<button type="button" class="btn" id="erisimCikis">' + esc(t("Başka hesapla oturum aç")) + '</button>';
    const yedek = '<button type="button" class="btn" id="erisimYedek">' + esc(t("Yedek dosyası al")) + '</button>';
    const verim = '<p class="small">' + esc(t("Kayıtlarınız silinmedi: bu cihazda ve Google Drive’ınızda duruyor. Erişim açılınca kaldığınız yerden devam edersiniz.")) + '</p>';
    if (!L) return kutu(t("Erişim denetlenemedi"), '<p class="lead">' + esc(cumle(t(String(b.lisansHata || "")))) + ' ' + esc(t("İnternet bağlantınızı kontrol edip yeniden deneyin.")) + '</p>', dene + cik);
    const mesaj = L.mesaj ? '<div class="note"><span><b>' + esc(t("Yachting Jurnal’in notu")) + '</b>' + esc(L.mesaj) + '</span></div>' : "";
    if (L.izin && L.onbellek && !(L.bitis && L.bitis < bugunISO())) return kutu(t("İnternet bağlantısı gerekiyor"), '<p class="lead">' + esc(t("Yachting Jurnal uzun süredir erişiminizi denetleyemedi. İnternete bağlanıp yeniden deneyin.")) + '</p>' + verim, dene + yedek);
    const baslik = L.durum === "kapali" ? t("Hesabınız kullanıma kapalı") : L.deneme ? t("Deneme süreniz doldu") : t("Kullanım süreniz doldu");
    const acik = L.durum === "kapali" ? t("Bu Google hesabıyla Yachting Jurnal şu an kullanılamıyor.") : t("Yachting Jurnal’i {tarih} tarihine kadar kullanabiliyordunuz.", { tarih: dmy(L.bitis) });
    return kutu(baslik, '<p class="lead">' + esc(acik) + ' ' + esc(t("Kullanmaya devam etmek için Yachting Jurnal ile iletişime geçin.")) + '</p>' + mesaj + verim, dene + yedek + cik);
  }
  const GOOGLE_G = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  function girisHTML() {
    return '<div class="giris"><img class="glogo" src="ikon.png" alt=""><h2>' + esc(t("Yachting Jurnal’e Hoş Geldiniz")) + '</h2>' +
      '<p class="lead">' + esc(t("Başlamak için Google hesabınızla oturum açın. Kayıtlarınız Google Drive’ınızdaki “Kasa Jurnali” klasöründe saklanır; telefonda ve bilgisayarda aynı defteri kullanırsınız. Yachting Jurnal Drive’daki diğer dosyalarınızı göremez.")) + '</p>' +
      (S.gbag ? '<div class="gkutu">' + gAkisHTML(S.gbag) + '</div>' : '<button type="button" class="btn gbtn" id="gBagla">' + GOOGLE_G + '<span>' + esc(t("Google ile oturum aç")) + '</span></button>') +
      '<p class="small">' + esc(t("İlk girişte internet gerekir; sonra internet olmadan da çalışır. Google parolanız Yachting Jurnal’e girilmez.")) + '</p>' +
      (S.senk && S.senk.lisansAcik ? '<p class="small">' + esc(t("Oturum açtığınızda Google hesabınızın e-posta adresi, giriş tarihleri, cihaz türü ve uygulama sürümü yalnızca erişim yönetimi (deneme süresi, kullanım hakkı) için Yachting Jurnal’e kaydedilir. Kayıtlarınız Yachting Jurnal’e gönderilmez. Ayrıntılar Gizlilik Bildirimi’nde.")) + ' <a href="#" data-yasal-ac>' + esc(t("Gizlilik Bildirimi")) + '</a></p>' : "") + langSwitchHTML() + '</div>';
  }
  // after the first sign-in: the boat's details, unless they came from another device
  function openTekne() {
    const st = S.set;
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><form class="sheet" id="tekForm" role="dialog" aria-modal="true" aria-labelledby="sh" novalidate><h3 id="sh">' + esc(t("Tekne bilgileri")) + '</h3>' +
      '<p class="lead" style="margin:0 0 12px">' + esc(t("Bu bilgiler ekranın üstünde ve raporlarda görünür. Sonra Ayarlar’dan değiştirebilirsiniz.")) + '</p><div class="grid2">' +
      '<div class="field full"><label for="tk_ad">' + esc(t("Tekne adı (ya da şirket, ev)")) + '</label><input id="tk_ad" maxlength="80" value="' + esc(st.name || "") + '" placeholder="' + esc(t("Örn. M/Y Deniz Yıldızı")) + '"></div>' +
      '<div class="field"><label for="tk_kap">' + esc(t("Kaptan (raporu hazırlayan)")) + '</label><input id="tk_kap" maxlength="80" value="' + esc(st.preparedBy || "") + '" placeholder="' + esc(t("Örn. Ali Yılmaz")) + '"></div>' +
      '<div class="field"><label for="tk_don">' + esc(t("Donatan / armatör (onaylayan)")) + '</label><input id="tk_don" maxlength="80" value="' + esc(st.approvedBy || "") + '" placeholder="' + esc(t("Örn. Mehmet Demir")) + '"></div>' +
      '<div class="field"><label for="tk_kasa">' + esc(t("Başlangıç kasası (₺)")) + '</label>' + numBox("tk_kasa", st.opening != null ? num(st.opening) : "", 2, ' data-neg="1"') + ' placeholder="' + esc(num(0)) + '"></div>' +
      '<div class="field"><label for="tk_tarih">' + esc(t("Başlangıç tarihi")) + '</label><input id="tk_tarih" type="date" value="' + esc(st.openingDate || todayISO()) + '"></div>' +
      '</div><div class="err-t" id="tkerr"></div><div class="acts"><button type="button" class="btn" id="closeSheet">' + esc(t("Sonra")) + '</button><div class="r"><button type="submit" class="btn pri" id="tkKaydet">' + esc(t("Kaydet ve başla")) + '</button></div></div></form></div>';
    setTimeout(() => { const f = $("#tk_ad"); if (f) f.focus(); }, 50);
  }
  async function tekneKaydet() {
    const ad = $("#tk_ad").value.trim(), kv = $("#tk_kasa").value.trim(), kasa = kv ? toNum(kv) : null;
    if (!ad) { $("#tkerr").textContent = t("Tekne adını yazın."); $("#tk_ad").focus(); return; }
    if (kv && isNaN(kasa)) { $("#tkerr").textContent = t("Başlangıç kasasını rakamla yazın."); return; }
    const prev = JSON.stringify(S.set);
    Object.assign(S.set, { name: ad, preparedBy: $("#tk_kap").value.trim(), approvedBy: $("#tk_don").value.trim(), opening: kasa == null ? S.set.opening : r2(kasa), openingDate: $("#tk_tarih").value || S.set.openingDate || todayISO() });
    try { await persistSettings(); closeSheet(); render(); toast(t("Tekne bilgileri kaydedildi. İlk fişi ekleyebilirsiniz.")); }
    catch (e) { S.set = JSON.parse(prev); $("#tkerr").textContent = e.message; }
  }

  /* ---------------- access line and the owner's control centre (yonetim/Kod.gs) ---------------- */
  function erisimSatiri() {
    const L = S.senk && S.senk.lisans;
    if (!L || L.kapali || !S.senk.lisansAcik) return "";
    if (L.yonetici) return t("Yönetici · süresiz");
    if (!L.izin) return "";
    const tur = L.deneme ? t("Deneme") : t("Açık");
    return L.bitis ? t("{tur} · {tarih} tarihine kadar", { tur, tarih: dmy(L.bitis) }) : t("{tur} · süresiz", { tur });
  }
  const YDURUM = { deneme: ["Deneme", "dene"], acik: ["Açık", "acik"], "suresi-doldu": ["Süresi doldu", "doldu"], kapali: ["Kapalı", "kapali"] };
  const gunFark = ymd => Math.round((new Date(ymd + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000);
  function gunEkleISO(ymd, gun, ay) { const d = new Date(ymd + "T12:00:00"); if (ay) d.setMonth(d.getMonth() + ay); d.setDate(d.getDate() + (gun || 0)); return d.toISOString().slice(0, 10); }
  async function yonYukle(zorla) {
    S.yon = S.yon || { filtre: "hepsi", ara: "" };
    if (S.yon.veri && !zorla) return;
    S.yon.yukleniyor = true; S.yon.hata = "";
    if (S.tab === "yonetim") render();
    try { S.yon.veri = await KJSenk.yonetim({ islem: "liste" }); }
    catch (e) { S.yon.hata = e.message; }
    S.yon.yukleniyor = false;
    if (S.tab === "yonetim" && !modalOpen()) render();
  }
  function viewYonetim() {
    const Y = S.yon || {}, V = Y.veri;
    let h = '<div class="panel"><h3>' + esc(t("Yönetim merkezi")) + '</h3><p class="lead">' + esc(t("Yachting Jurnal’de oturum açan Google hesapları. Birini kapatabilir, süre verebilir ya da süresiz açabilirsiniz. Değişiklik, kişi uygulamayı yeniden açınca ya da en geç 6 saat içinde geçerli olur.")) + '</p>';
    if (Y.hata) h += '<div class="note err"><span><b>' + esc(t("Liste alınamadı")) + '</b>' + esc(Y.hata) + '</span><span class="btns"><button class="btn sm" id="yYenile">' + esc(t("Yeniden dene")) + '</button></span></div>';
    if (!V) return h + (Y.hata ? "" : '<p class="small"><span class="spin"></span>' + esc(t("Liste alınıyor…")) + '</p>') + '</div>';
    const l = V.kullanicilar || [], say = k => l.filter(x => x.kod === k).length;
    const sayac = [["hepsi", t("Toplam"), l.length], ["acik", t("Açık"), say("acik")], ["deneme", t("Deneme"), say("deneme")], ["suresi-doldu", t("Süresi doldu"), say("suresi-doldu")], ["kapali", t("Kapalı"), say("kapali")]];
    h += '<div class="ysay">' + sayac.map(([k, l2, n]) => '<button type="button" class="ykutu' + (Y.filtre === k ? " on" : "") + '" data-yfiltre="' + k + '"><b>' + n + '</b><span>' + esc(l2) + '</span></button>').join("") + '</div>';
    h += '<div class="ybar"><input id="yAra" type="search" placeholder="' + esc(t("E-posta ara")) + '" value="' + esc(Y.ara || "") + '" autocomplete="off"><button type="button" class="btn pri" id="yEkle">' + esc(t("Kişi ekle")) + '</button><button type="button" class="btn" id="yYenile"' + (Y.yukleniyor ? " disabled" : "") + '>' + esc(t("Yenile")) + '</button></div>';
    const q = (Y.ara || "").trim().toLowerCase();
    const g = l.filter(x => (Y.filtre === "hepsi" || x.kod === Y.filtre) && (!q || x.eposta.includes(q) || (x.not || "").toLowerCase().includes(q)))
      .sort((a, b) => (b.son || b.ilk || "").localeCompare(a.son || a.ilk || "") || a.eposta.localeCompare(b.eposta));
    if (!g.length) h += '<p class="small" style="margin:12px 0 0">' + esc(l.length ? t("Bu süzgece uyan kişi yok.") : t("Henüz kimse oturum açmadı.")) + '</p>';
    else h += '<div class="ylist">' + g.map(x => {
      const d = YDURUM[x.kod] || YDURUM.acik, kg = x.bitis ? gunFark(x.bitis) : null;
      const bit = x.bitis ? t("Bitiş {tarih}", { tarih: dmy(x.bitis) }) + (kg >= 0 ? " · " + t("{n} gün kaldı", { n: kg }) : "") : t("Süresiz");
      const son = x.son ? t("Son giriş {zaman}", { zaman: K.dateTime(new Date(x.son)) }) : t("Henüz giriş yapmadı");
      return '<button type="button" class="yrow" data-ykisi="' + esc(x.eposta) + '"><span class="ybil"><b>' + esc(x.eposta) + '</b><span>' + esc(bit) + ' · ' + esc(son) + (x.cihaz ? ' · ' + esc(x.cihaz === "iphone" ? "iPhone" : x.cihaz === "windows" ? "Windows" : x.cihaz) : "") + (x.surum ? ' ' + esc(x.surum) : "") + '</span>' + (x.not ? '<span class="ynot">' + esc(x.not) + '</span>' : "") + '</span><span class="yrozet ' + d[1] + '">' + esc(t(d[0])) + '</span></button>';
    }).join("") + '</div>';
    h += '</div>';
    const A = V.ayar || { denemeGun: 30, yeniDurum: "Deneme" };
    h += '<div class="panel" id="yAyarPanel"><h3>' + esc(t("Yeni kullanıcılar")) + '</h3><p class="lead">' + esc(t("Biri ilk kez oturum açtığında ne olsun?")) + '</p>' +
      '<div class="yayar">' + [["Deneme", t("Deneme süresi verilsin")], ["Kapalı", t("Ben açana kadar kapalı kalsın")], ["Açık", t("Süresiz açık olsun")]].map(([v, l2]) => '<label class="check"><input type="radio" name="yYeni" value="' + v + '"' + (A.yeniDurum === v ? " checked" : "") + '> <span>' + esc(l2) + '</span></label>').join("") + '</div>' +
      '<div class="field" style="max-width:220px;margin-top:8px"><label for="yGun">' + esc(t("Deneme süresi (gün)")) + '</label><input id="yGun" type="number" min="1" max="3650" inputmode="numeric" value="' + esc(A.denemeGun) + '"></div>' +
      '<div class="btns" style="justify-content:flex-start;margin-top:10px"><button type="button" class="btn pri" id="yAyarKaydet">' + esc(t("Kaydet")) + '</button></div>' +
      '<p class="small" style="margin:12px 0 0">' + esc(t("Liste Google Drive’ınızdaki “Yachting Jurnal Yönetim” tablosunda durur; oradan da düzenleyebilirsiniz.")) + '</p></div>';
    return h;
  }
  function openYKisi(eposta) {
    const V = S.yon && S.yon.veri, x = eposta ? (V.kullanicilar || []).find(k => k.eposta === eposta) : null;
    const v = x || { eposta: "", durum: "Açık", bitis: "", mesaj: "", not: "" };
    const ilk = x ? (x.ilk ? t("İlk giriş {zaman}", { zaman: K.dateTime(new Date(x.ilk)) }) + " · " : "") + t("{n} giriş", { n: x.sayi || 0 }) : "";
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><form class="sheet" id="yForm" role="dialog" aria-modal="true" aria-labelledby="sh" novalidate><h3 id="sh">' + esc(x ? x.eposta : t("Kişi ekle")) + '</h3>' + (ilk ? '<p class="small" style="margin:-4px 0 12px">' + esc(ilk) + '</p>' : "") +
      '<div class="grid2">' +
      (x ? "" : '<div class="field full"><label for="y_eposta">' + esc(t("Google hesabı (e-posta)")) + '</label><input id="y_eposta" type="email" maxlength="254" autocomplete="off" placeholder="' + esc(t("Örn. ali.yilmaz@gmail.com")) + '"></div>') +
      '<div class="full"><p class="seglbl" style="margin-bottom:4px">' + esc(t("Durum")) + '</p><div class="seg" role="radiogroup">' + ["Açık", "Deneme", "Kapalı"].map(d => '<label><input type="radio" name="y_durum" value="' + d + '"' + (v.durum === d ? " checked" : "") + '><span>' + esc(t(d)) + '</span></label>').join("") + '</div></div>' +
      '<div class="field full"><label for="y_bitis">' + esc(t("Son kullanım günü (boş = süresiz)")) + '</label><div class="ybitis"><input id="y_bitis" type="date" value="' + esc(v.bitis || "") + '"><button type="button" class="btn sm" data-ysure="30g">' + esc(t("+30 gün")) + '</button><button type="button" class="btn sm" data-ysure="3a">' + esc(t("+3 ay")) + '</button><button type="button" class="btn sm" data-ysure="1y">' + esc(t("+1 yıl")) + '</button><button type="button" class="btn sm" data-ysure="yok">' + esc(t("Süresiz")) + '</button></div></div>' +
      '<div class="field full"><label for="y_mesaj">' + esc(t("Kişiye gösterilecek not (erişim kapalıyken)")) + '</label><input id="y_mesaj" maxlength="500" value="' + esc(v.mesaj || "") + '" placeholder="' + esc(t("Örn. Ödeme bekleniyor.")) + '"></div>' +
      '<div class="field full"><label for="y_not">' + esc(t("Kendi notunuz (yalnızca siz görürsünüz)")) + '</label><input id="y_not" maxlength="500" value="' + esc(v.not || "") + '" placeholder="' + esc(t("Örn. M/Y Deniz, aylık")) + '"></div>' +
      '</div><div class="err-t" id="yerr"></div><div class="acts">' + (x ? '<button type="button" class="btn danger" id="ySil" data-eposta="' + esc(x.eposta) + '">' + esc(t("Kaydı sil")) + '</button>' : "") + '<div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><button type="submit" class="btn pri" id="yKaydet">' + esc(t("Kaydet")) + '</button></div></div></form></div>';
    S.yKisi = x ? x.eposta : "";
  }
  function ySure(k) {
    const f = $("#y_bitis"); if (!f) return;
    if (k === "yok") { f.value = ""; return; }
    const bugun = todayISO(), taban = f.value && f.value >= bugun ? f.value : bugun;
    f.value = k === "30g" ? gunEkleISO(taban, 30) : k === "3a" ? gunEkleISO(taban, 0, 3) : gunEkleISO(taban, 0, 12);
    const acik = document.querySelector('input[name="y_durum"][value="Açık"]'), kap = document.querySelector('input[name="y_durum"]:checked');
    if (acik && kap && kap.value === "Kapalı") acik.checked = true;
  }
  async function yKaydet() {
    const eposta = S.yKisi || ($("#y_eposta").value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) { $("#yerr").textContent = t("E-posta adresini kontrol edin."); return; }
    const d = document.querySelector('input[name="y_durum"]:checked');
    const b = $("#yKaydet"); b.disabled = true;
    try {
      S.yon.veri = await KJSenk.yonetim({ islem: "kaydet", eposta, durum: d ? d.value : "Açık", bitis: $("#y_bitis").value || "", mesaj: $("#y_mesaj").value.trim(), not: $("#y_not").value.trim() });
      closeSheet(); render(); toast(t("{eposta} kaydedildi.", { eposta }));
    } catch (e) { b.disabled = false; $("#yerr").textContent = e.message; }
  }
  async function ySil(b) {
    if (!b.dataset.emin) { b.dataset.emin = "1"; b.textContent = t("Silmek için yeniden dokunun"); return; }
    b.disabled = true;
    try { S.yon.veri = await KJSenk.yonetim({ islem: "sil", eposta: b.dataset.eposta }); closeSheet(); render(); toast(t("Kayıt silindi.")); }
    catch (e) { b.disabled = false; $("#yerr").textContent = e.message; }
  }
  async function yAyarKaydet(b) {
    const y = document.querySelector('input[name="yYeni"]:checked'), gun = parseInt($("#yGun").value, 10);
    if (!(gun >= 1 && gun <= 3650)) { toast(t("Deneme süresi 1 ile 3650 gün arasında olmalı.")); return; }
    b.disabled = true;
    try { S.yon.veri = await KJSenk.yonetim({ islem: "ayar", yeniDurum: y ? y.value : "Deneme", denemeGun: gun }); render(); toast(t("Ayar kaydedildi.")); }
    catch (e) { b.disabled = false; toast(e.message); }
  }

  /* ---------------- reports page ---------------- */
  function viewRapor() {
    const ms = K.monthsWithData(S.items).slice().reverse();
    let h = '<div class="panel"><h3>' + esc(t("Raporlar")) + '</h3><p class="lead">' + esc(t("Bir ay seçip imza alanlı PDF kasa raporu ya da formüllü Excel tablosu alın.")) + '</p>';
    if (!ms.length) return h + '<p class="small" style="margin:0">' + esc(t("Rapora girecek fiş yok.")) + '</p></div>';
    h += '<div class="rlist">' + ms.map(m => { const k = kasaFor(m); return '<div class="rrow"><div class="rbil"><b>' + esc(monthLabel(m)) + (isClosed(m) ? ' <span class="mtag">' + esc(t("Kapandı")) + '</span>' : "") + '</b><span>' + esc(t("Harcama {tutar}", { tutar: tl(k.out) })) + ' · ' + esc(t("Gelen {tutar}", { tutar: tl(k.in) })) + ' · ' + esc(t("Kalan kasa")) + ' ' + tl(k.kalan) + '</span></div><div class="btns"><button type="button" class="btn sm" data-rapor="pdf" data-ay="' + m + '">PDF</button><button type="button" class="btn sm" data-rapor="xlsx" data-ay="' + m + '">Excel</button></div></div>'; }).join("") +
      (ms.length > 1 ? '<div class="rrow"><div class="rbil"><b>' + esc(t("Tüm aylar")) + '</b><span>' + esc(monthLabel(ms[ms.length - 1]) + " – " + monthLabel(ms[0])) + '</span></div><div class="btns"><button type="button" class="btn sm" data-rapor="pdf" data-ay="all">PDF</button><button type="button" class="btn sm" data-rapor="xlsx" data-ay="all">Excel</button></div></div>' : "") + '</div>';
    return h + '</div>';
  }

  /* ---------------- menu ---------------- */
  const MI = {
    ev: '<path d="M3 11l9-7 9 7v9H5z"/><path d="M9 20v-6h6v6"/>', foto: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', liste: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>', ozet: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>', rapor: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h4"/>',
    tekne: '<path d="M2 14h18l2-3-3 7H5z"/><path d="M6 14l2-4h8l3 4"/><path d="M9 10l1.5-3h4l1.5 3"/>', bulut: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z"/>',
    excel: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v16"/>', yedek: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>', ayar: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    kitap: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3"/><path d="M20 4v14h-6"/>', yasal: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', cikis: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    kisiler: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.9.2 5 2.6 5 5.8"/>'
  };
  const mik = n => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + MI[n] + '</svg>';
  function openMenu() {
    if (kilitli() || mustAccept()) return;
    const b = S.senk || {};
    const ogeler = [["ana", "ev", t("Ana sayfa")], ["list", "liste", t("Jurnal")], ["fisler", "foto", t("Fişler")], ["sum", "ozet", t("Özet")], ["rapor", "rapor", t("Raporlar")], ["tekne", "tekne", t("Tekne bilgileri")],
      ["hesap", "bulut", t("Google hesabı ve eşitleme")], ["excel", "excel", t("Excel’den içe aktar")], ["yedek", "yedek", t("Yedekler")], ["ayar", "ayar", t("Ayarlar")],
      ["#kilavuz", "kitap", t("Kullanım kılavuzu")], ["#yasal", "yasal", t("Yasal bilgiler")]];
    if (b.lisans && b.lisans.yonetici) ogeler.splice(3, 0, ["yonetim", "kisiler", t("Yönetim merkezi")]);
    if (b.bagli) ogeler.push(["#cikis", "cikis", t("Oturumu kapat")]);
    $("#sheetHost").innerHTML = '<div class="scrim cekmece" id="scrim"><nav class="drawer" aria-label="' + esc(t("Menü")) + '"><div class="dbas"><img src="ikon.png" alt=""><div><b>Yachting Jurnal</b><span>' + esc(S.set.name || "") + '</span>' + (b.bagli && b.hesap ? '<span class="dhesap">' + esc(b.hesap) + '</span>' : "") + (erisimSatiri() ? '<span class="dhesap">' + esc(erisimSatiri()) + '</span>' : "") + '</div></div>' +
      ogeler.map(([k, i, l]) => '<button type="button" class="ditem' + (k === S.tab ? " on" : "") + '" data-menu="' + k + '">' + mik(i) + '<span>' + esc(l) + '</span></button>').join("") +
      '<div class="dsurum">Yachting Jurnal ' + esc(SURUM) + '</div></nav></div>';
  }
  window.KJgit = k => menuSec(k === "io" ? "tum" : k);   // used by the tests to open a page directly
  function menuSec(k) {
    closeSheet();
    if (k === "#kilavuz") { openDoc("kilavuz"); return; }
    if (k === "#yasal") { openTerms("view"); return; }
    if (k === "#cikis") { openSenkOff(); return; }
    const [tab, yer] = k.split("#");
    S.tab = tab; if (tab === "yonetim") yonYukle(); if (tab === "ana") S._anaGoruldu = false; render();
    if (yer) setTimeout(() => { const el = document.getElementById(yer); if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); }, 30);
    else window.scrollTo({ top: 0 });
  }

  /* ---------------- Google Drive synchronisation (engine in senk.js) ---------------- */
  function senkDurumMetni(b) {
    if (b.durum === "calisiyor") return t("Eşitleniyor…");
    if (b.durum === "cevrimdisi") return t("İnternet yok; değişiklikler bekliyor");
    if (b.durum === "hata") return t("Eşitlenemedi");
    if (b.son) return t("Eşitlendi · {saat}", { saat: hm(new Date(b.son)) });
    return t("Bağlı");
  }
  function senkPanel() {
    const b = S.senk || {};
    let h = '<div class="panel" id="senkPanel"><h3>' + esc(t("Google Drive eşitleme")) + '</h3>';
    if (!b.hazir) return h + '<p class="lead" style="margin:0">' + esc(t("Bu sürümde Google Drive eşitlemesi henüz etkin değil.")) + '</p></div>';
    if (b.bagli) {
      h += '<p class="lead">' + esc(t("Kayıtlarınız ve fiş fotoğrafları, Google Drive’ınızdaki “Kasa Jurnali” klasörü üzerinden diğer cihazlarınızla kendiliğinden eşitlenir. İnternet yokken yapılan değişiklikler, bağlantı gelince gönderilir. Bu klasörü silmeyin ve adını değiştirmeyin.")) + '</p>' +
        '<div class="kv senkkv"><span>' + esc(t("Bağlı hesap")) + '</span><b>' + esc(b.hesap || (b.lisans && b.lisans.hesap) || t("Google hesabı")) + '</b><span>' + esc(t("Durum")) + '</span><b>' + esc(senkDurumMetni(b)) + '</b>' + (erisimSatiri() ? '<span>' + esc(t("Kullanım")) + '</span><b>' + esc(erisimSatiri()) + '</b>' : "") + '</div>' +
        (b.durum === "hata" && b.hata ? '<p class="err-t" style="margin:8px 0 0">' + esc(b.hata) + '</p>' : "") +
        '<div class="btns" style="justify-content:flex-start;margin-top:12px"><button class="btn pri" id="senkNow"' + (b.calisiyor ? " disabled" : "") + '>' + esc(t("Şimdi eşitle")) + '</button><button class="btn" id="senkOff">' + esc(b.zorunlu ? t("Oturumu kapat") : t("Bağlantıyı kes")) + '</button></div>';
    } else if (S.gbag) {
      h += gAkisHTML(S.gbag);
    } else {
      h += '<p class="lead">' + esc(t("Telefonda ve bilgisayarda aynı defteri kullanmak için Google hesabınızı bağlayın. Kayıtlar Google Drive’ınızdaki “Kasa Jurnali” klasöründe tutulur; Drive’daki diğer dosyalarınıza erişilmez.")) + '</p>' +
        '<div class="btns" style="justify-content:flex-start"><button class="btn pri" id="gBagla">' + esc(t("Google hesabını bağla")) + '</button></div>' +
        '<p class="small" style="margin:10px 0 0">' + esc(t("Eşitleme isteğe bağlıdır. Bağlamazsanız kayıtlarınız yalnızca bu cihazda kalır.")) + '</p>';
    }
    return h + '</div>';
  }
  function gAkisHTML(G) {
    return '<ol class="gsteps"><li>' + esc(t("Bu telefonda ya da herhangi bir bilgisayarda şu adresi açın:")) + ' <a href="' + esc(G.adres) + '" target="_blank" rel="noopener"><b>' + esc(G.adres.replace(/^https?:\/\/(www\.)?/, "")) + '</b></a></li>' +
      '<li>' + esc(t("Şu kodu yazın:")) + '<span class="gkod" id="gKod">' + esc(G.kod) + '</span><button type="button" class="btn sm" id="gKopya">' + esc(t("Kodu kopyala")) + '</button></li>' +
      '<li>' + esc(t("Google hesabınızı seçin ve Yachting Jurnal’e izin verin. Bu ekran kendiliğinden devam eder.")) + '</li></ol>' +
      '<p class="small" id="gDurum"><span class="spin"></span>' + esc(G.mesaj || t("Onay bekleniyor…")) + '</p>' +
      '<div class="btns" style="justify-content:flex-start"><button class="btn" id="gVazgec">' + esc(t("Vazgeç")) + '</button></div>';
  }
  function updSenk() {
    const el = $("#senkBtn"), b = S.senk; if (!el) return;
    el.hidden = !(b && b.bagli && S.mode === "live");
    if (el.hidden) return;
    el.className = "senkb " + (b.durum === "hata" ? "err" : b.durum === "cevrimdisi" ? "off" : b.durum === "calisiyor" ? "busy" : "ok");
    $("#senkLbl").textContent = b.durum === "calisiyor" ? t("Eşitleniyor…") : b.durum === "hata" ? t("Eşitlenemedi") : b.durum === "cevrimdisi" ? t("Çevrimdışı") : t("Eşitlendi");
    el.title = senkDurumMetni(b) + (b.hesap ? " · " + b.hesap : "");
  }
  function senkPanelYenile() { if (kilitli() || document.body.classList.contains("girisli")) { if (!modalOpen()) render(); return; } const p = $("#senkPanel"); if (p && (S.tab === "hesap" || S.tab === "tum")) p.outerHTML = senkPanel(); }
  async function gBagla(btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await KJSenk.baslat();
      S.gbag = { kod: r.kod, adres: r.adres || "https://www.google.com/device", aralik: Math.max(2, +r.aralik || 5), bitis: Date.now() + (+r.sure || 900) * 1000 };
      senkPanelYenile(); S.gbag.t = setTimeout(gBekle, S.gbag.aralik * 1000);
    } catch (e) { if (btn) btn.disabled = false; toast(e.message); }
  }
  async function gBekle() {
    const G = S.gbag; if (!G) return;
    const bitti = m => { S.gbag = null; senkPanelYenile(); if (m) toast(m); };
    if (Date.now() > G.bitis) return bitti(t("Kodun süresi doldu. Yeniden deneyin."));
    let r = null;
    try { r = await KJSenk.bekle(); G.mesaj = ""; } catch (e) { G.mesaj = e.message; }
    if (S.gbag !== G) return;                                  // cancelled meanwhile
    if (r && r.durum === "tamam") { S.kurulumBekle = true; return bitti(t("Google Drive bağlandı. Kayıtlar eşitleniyor…")); }
    if (r && r.durum === "reddedildi") return bitti(t("İzin verilmedi; eşitleme açılmadı."));
    if (r && r.durum === "suresi-doldu") return bitti(t("Kodun süresi doldu. Yeniden deneyin."));
    if (r && r.yavasla) G.aralik += 5;
    const d = $("#gDurum"); if (d) d.innerHTML = '<span class="spin"></span>' + esc(G.mesaj || t("Onay bekleniyor…"));
    G.t = setTimeout(gBekle, G.aralik * 1000);
  }
  function openSenkOff() {
    const zor = S.senk && S.senk.zorunlu;
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><h3 id="sh">' + esc(zor ? t("Oturum kapatılsın mı?") : t("Google Drive bağlantısı kesilsin mi?")) + '</h3><div class="info"><p>' + esc(zor ? t("Bu cihazdaki kayıtlar silinmez. Yeniden oturum açtığınızda kaldığınız yerden devam edersiniz. Diğer cihazlarınız ve Google Drive’daki kopya etkilenmez.") : t("Bu cihazdaki kayıtlar silinmez; bundan sonra yalnızca bu cihazda kalır. Diğer cihazlarınız ve Google Drive’daki kopya etkilenmez.")) + '</p><p class="small">' + esc(t("Drive’daki kopyayı tamamen silmek için oturumu kapattıktan sonra Google Drive’daki “Kasa Jurnali” klasörünü silin.")) + '</p></div>' +
      '<div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><button type="button" class="btn danger" id="senkOffOk">' + esc(zor ? t("Oturumu kapat") : t("Bağlantıyı kes")) + '</button></div></div></div></div>';
  }
  // the user is typing in a box on the page (a reload would wipe what was typed)
  const yazarken = () => { if (modalOpen()) return true; const a = document.activeElement; return !!(a && a.closest && a.closest("#main") && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(radio|checkbox|file|button|submit)$/i.test(a.type)))); };
  function senkKur() {
    if (!window.KJSenk || S._senkKur) return;
    S._senkKur = true;
    KJSenk.kur({
      ortam: WEB ? "web" : "pc", api, ham, fotoURL, cihaz: WEB ? "iPhone" : "PC", surum: SURUM,
      onDurum: b => {
        const once = S.senk; S.senk = b; updSenk();
        if (!once || once.bagli !== b.bagli || once.hazir !== b.hazir || once.durum !== b.durum || once.calisiyor !== b.calisiyor || once.izinli !== b.izinli || once.lisansHata !== b.lisansHata || JSON.stringify(once.lisans) !== JSON.stringify(b.lisans)) senkPanelYenile();
        if (S.kurulumBekle && b.bagli && b.izinli && !b.calisiyor && b.durum !== "calisiyor") {
          S.kurulumBekle = false;
          setTimeout(async () => { try { await reload(); } catch (e) { } if (!S.set.name && !modalOpen()) openTekne(); }, 300);
        }
      },
      onYerelDegisti: () => { if (yazarken()) S._pending = true; else reload().catch(() => { }); },
      onBilgi: o => { if (o.gelen || o.giden) toast(t("Eşitleme tamam: {gelen} kayıt geldi, {giden} kayıt gönderildi.", { gelen: o.gelen, giden: o.giden })); }
    }).catch(() => { S.senk = { hazir: false, bagli: false }; render(); });
  }

  /* ---------------- updates ---------------- */
  async function guncelDenetle(simdi) {
    if (WEB) return;
    try { S.guncel = simdi ? await api("api/guncelleme/denetle", { method: "POST" }) : await api("api/guncelleme"); }
    catch (e) { if (simdi) toast(e.message); return; }
    if (simdi) toast(S.guncel && S.guncel.yeni ? t("Yeni sürüm var: {surum}", { surum: S.guncel.yeni.surum }) : t("Yachting Jurnal güncel ({surum}).", { surum: SURUM }));
    if (!modalOpen() && !yazarken()) render();
  }
  function openGuncelle() {
    const y = S.guncel && S.guncel.yeni; if (!y) return;
    const not = y.notlar ? (y.notlar[K.lang] || y.notlar.tr || "") : "";
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh" id="gunSheet"><h3 id="sh">' + esc(t("Yachting Jurnal {surum}", { surum: y.surum })) + '</h3><div class="info">' + (not ? '<p>' + esc(not) + '</p>' : "") + '<p>' + esc(t("Yeni sürüm indirilip kurulacak. Program birkaç saniye kapanıp yeniden açılır; kayıtlarınıza ve ayarlarınıza dokunulmaz.")) + '</p></div><div class="err-t" id="gerr"></div>' +
      '<div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Sonra")) + '</button><button type="button" class="btn pri" id="guncelOk">' + esc(t("Şimdi güncelle")) + '</button></div></div></div></div>';
  }
  async function guncelKur(btn) {
    btn.disabled = true; btn.textContent = t("İndiriliyor…");
    try {
      await api("api/guncelle", { method: "POST" });
      $("#gunSheet").innerHTML = '<div class="done"><span class="oi x">↻</span><div><h3 style="margin-bottom:6px">' + esc(t("Güncelleniyor…")) + '</h3><div class="info"><p>' + esc(t("Program kapanıp yeni sürümle yeniden açılacak. Bu pencere kendiliğinden kapanır.")) + '</p></div></div></div>';
      setTimeout(() => { try { window.close(); } catch (e) { } }, 2500);
    } catch (e) { btn.disabled = false; btn.textContent = t("Tekrar dene"); const r = $("#gerr"); if (r) r.textContent = e.message; }
  }

  /* ---------------- iPhone: app start, updates, files ---------------- */
  async function swHazir() {
    if (!WEB) return;
    if (!("serviceWorker" in navigator)) throw new Error(t("Bu tarayıcı Yachting Jurnal’i çalıştıramıyor. iPhone’da Safari ile açın."));
    const reg = await navigator.serviceWorker.register("sw.js");
    if (!navigator.serviceWorker.controller) {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(res => { navigator.serviceWorker.addEventListener("controllerchange", res, { once: true }); setTimeout(res, 4000); });
      if (!navigator.serviceWorker.controller) { location.reload(); await new Promise(() => { }); }
    }
    const izle = w => w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) { S.yeniSurum = true; if (S.mode === "live" && !modalOpen()) render(); } });
    if (reg.waiting && navigator.serviceWorker.controller) { swGuncelle(); await new Promise(() => { }); }   // a new version arrived while the app was closed: take it now
    reg.addEventListener("updatefound", () => izle(reg.installing));
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (S._yenile) location.reload(); });
    setInterval(() => reg.update().catch(() => { }), 3600e3);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => { }); });
    S.swReg = reg;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  }
  // On the iPhone the app must be added to the Home Screen first: Safari keeps a separate storage for a page opened in a tab.
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const kurulu = () => navigator.standalone === true || !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  const PAYLAS = '<svg class="ik" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M7 10H5v11h14V10h-2"/></svg>';
  function openKurulum(sonra) {
    $("#sheetHost").innerHTML = '<div class="scrim" id="kurScrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><h3 id="sh">' + esc(t("Yachting Jurnal’i ana ekrana ekleyin")) + '</h3>' +
      '<ol class="gsteps"><li>' + esc(t("Safari’nin alt çubuğundaki Paylaş düğmesine dokunun:")) + ' ' + PAYLAS + '</li><li>' + esc(t("Listeden “Ana Ekrana Ekle”yi seçin, sonra “Ekle”ye dokunun.")) + '</li><li>' + esc(t("Yachting Jurnal’i bundan sonra ana ekrandaki simgesinden açın. İnternet olmadan da çalışır.")) + '</li></ol>' +
      '<p class="small">' + esc(t("Kayıtlar, ana ekrana eklenen uygulamanın kendi deposunda saklanır. Bu Safari sekmesinde girilen kayıtlar oraya geçmez; bu yüzden önce uygulamayı ekleyin.")) + '</p>' +
      '<div class="acts"><button type="button" class="btn" id="kurGec">' + esc(t("Safari’de devam et")) + '</button></div></div></div>';
    $("#kurGec").onclick = () => { $("#sheetHost").innerHTML = ""; sonra(); };
  }
  function swGuncelle() { S._yenile = true; const w = S.swReg && S.swReg.waiting; if (w) w.postMessage("guncelle"); else location.reload(); }
  // A file made on the phone: offered to share (Mail, WhatsApp, Save to Files…) or downloaded.
  async function dosyaVer(blob, ad) {
    const f = new File([blob], ad, { type: blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: ad }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ad; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }
  function dosyaHazir(baslik, ad, blob, tur) {
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><div class="done"><span class="oi' + (tur === "PDF" ? "" : " x") + '">' + esc(tur) + '</span><div><h3 id="sh" style="margin-bottom:6px">' + esc(baslik) + '</h3><div class="info"><p><b>' + esc(ad) + '</b></p><p class="small">' + esc(t("Paylaş’a dokunun: e-postayla ya da mesajla gönderebilir, “Dosyalar’a Kaydet” ile telefona kaydedebilirsiniz.")) + '</p></div></div></div>' +
      '<div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Kapat")) + '</button><button type="button" class="btn pri" id="shareFile">' + esc(t("Paylaş / Kaydet")) + '</button></div></div></div></div>';
    $("#shareFile").onclick = () => dosyaVer(blob, ad);
  }

  /* ---------------- data loading & sync ---------------- */
  function applyData(d) {
    const df = d.defter || {};
    S.items = Array.isArray(df.kayitlar) ? df.kayitlar : [];
    S.silinenler = df.silinenler && typeof df.silinenler === "object" ? df.silinenler : {};
    S.set = Object.assign(defaultSet(), df.ayarlar || {});
    if (!S.set.rates || typeof S.set.rates !== "object") S.set.rates = {};
    if (!Array.isArray(S.set.closed)) S.set.closed = [];
    S.setBase = clone(S.set);
    S.rev = d.rev; S.klasor = d.klasor || ""; S.dosya = d.dosya || "";
    if (d.uyari) S.notice = d.uyari;
    if (!S.period) S.period = curYM();
    applyLang();
  }
  async function reload() { const d = await api("api/veri"); applyData(d); render(); if (S.terms) renderTerms(); }
  async function ping() {
    try { const r = await api("api/ping"); if (r && (r.rev !== S.rev || S._pending) && !S.saving) { if (yazarken()) S._pending = true; else { S._pending = false; await reload(); } } } catch (e) { render(); }
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", e => {
    const t0 = e.target;
    const lg = t0.closest("[data-lang]"); if (lg && lg.closest(".langsw")) { setLanguage(lg.dataset.lang); return; }
    const tt = t0.closest("[data-ttab]"); if (tt && S.terms) { S.terms.tab = tt.dataset.ttab; renderTerms(); const b = $("#legalBox"); if (b) b.scrollTop = 0; return; }
    if (t0.closest("#acceptTerms")) { acceptTerms(t0.closest("#acceptTerms")); return; }
    if (t0.closest("#declineTerms")) { declineTerms(); return; }
    if (mustAccept()) return;
    if (t0.closest("#menuBtn")) { openMenu(); return; }
    if (t0.closest("#muzikBtn")) { muzikAcKapa(); return; }
    const mo2 = t0.closest("[data-menu]"); if (mo2) { menuSec(mo2.dataset.menu); return; }
    if (t0.closest("#erisimDene")) { const b = t0.closest("#erisimDene"); b.disabled = true; KJSenk.lisansDenetle().then(() => { render(); const k = S.senk && S.senk.izinli; if (k) KJSenk.esitle(); else toast(t("Erişim hâlâ kapalı.")); }); return; }
    if (t0.closest("#erisimYedek")) { backupNow(); return; }
    if (t0.closest("[data-yasal-ac]")) { e.preventDefault(); openTerms("view"); return; }
    if (t0.closest("#erisimCikis")) { openSenkOff(); return; }
    const yf = t0.closest("[data-yfiltre]"); if (yf) { S.yon.filtre = yf.dataset.yfiltre; render(); return; }
    const yk = t0.closest("[data-ykisi]"); if (yk) { openYKisi(yk.dataset.ykisi); return; }
    const ys = t0.closest("[data-ysure]"); if (ys) { ySure(ys.dataset.ysure); return; }
    if (t0.closest("#yEkle")) { openYKisi(null); return; }
    if (t0.closest("#yYenile")) { yonYukle(true); return; }
    if (t0.closest("#ySil")) { ySil(t0.closest("#ySil")); return; }
    if (t0.closest("#yAyarKaydet")) { yAyarKaydet(t0.closest("#yAyarKaydet")); return; }
    const rp = t0.closest("[data-rapor]"); if (rp) { S.period = rp.dataset.ay; render(); openExport(); const r = document.querySelector('input[name="fmt"][value="' + rp.dataset.rapor + '"]'); if (r) r.checked = true; return; }
    if (t0.closest("#senkBtn")) { S.tab = "hesap"; render(); window.scrollTo({ top: 0 }); return; }
    if (t0.closest("#gBagla")) { gBagla(t0.closest("#gBagla")); return; }
    if (t0.closest("#gKopya")) { const k = S.gbag && S.gbag.kod; if (k && navigator.clipboard) navigator.clipboard.writeText(k).then(() => toast(t("Kod kopyalandı."))).catch(() => { }); return; }
    if (t0.closest("#gVazgec")) { if (S.gbag) clearTimeout(S.gbag.t); S.gbag = null; senkPanelYenile(); return; }
    if (t0.closest("#senkNow")) { KJSenk.esitle(); return; }
    if (t0.closest("#senkOff")) { openSenkOff(); return; }
    if (t0.closest("#senkOffOk")) { const b = t0.closest("#senkOffOk"); b.disabled = true; KJSenk.cikis().then(() => { closeSheet(); S.tab = "list"; render(); toast(S.senk && S.senk.zorunlu ? t("Oturum kapatıldı.") : t("Google Drive bağlantısı kesildi.")); }).catch(e => { b.disabled = false; toast(e.message); }); return; }
    if (t0.closest("#guncelAc") || t0.closest("#guncelKur")) { openGuncelle(); return; }
    if (t0.closest("#guncelSonra")) { S.guncelSonra = true; render(); return; }
    if (t0.closest("#guncelOk")) { guncelKur(t0.closest("#guncelOk")); return; }
    if (t0.closest("#guncelNow")) { guncelDenetle(true); return; }
    if (t0.closest("#swGuncelle")) { swGuncelle(); return; }
    if (t0.closest("[data-addin]")) { openSheet(null, "in"); return; }
    if (t0.closest("[data-new]")) { openSheet(null); return; }
    const km = t0.closest("[data-kimden]"); if (km) { const fv = $("#f_vendor"); if (fv) { fv.value = km.dataset.kimden; const fd = $("#f_desc"); if (fd && !fd.value) fd.focus(); } return; }
    const qk = t0.closest("[data-quick]"); if (qk) { const src = S.items.find(x => x.id === qk.dataset.quick); if (src) fillFrom(src); return; }
    const go = t0.closest("[data-go]"); if (go) { S.tab = go.dataset.go; render(); const f = go.dataset.focus; if (f) setTimeout(() => { const el = document.getElementById(f); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } }, 50); return; }
    const mo = t0.closest("[data-month]"); if (mo) { S.period = mo.dataset.month; render(); return; }
    const ed = t0.closest("[data-edit]"); if (ed) { openSheet(ed.dataset.edit); return; }
    const lgl = t0.closest("[data-legal]"); if (lgl) { openTerms("view", lgl.dataset.legal); return; }
    if (t0.closest("#openLegalPdf")) { openDoc("yasal"); return; }
    if (t0.closest("#openGuide")) { openDoc("kilavuz"); return; }
    if (t0.closest("[data-dismiss]")) { S.notice = ""; render(); return; }
    if (t0.closest("#prevM") || t0.closest("#nextM")) { const ms = monthRange(), ix = ms.indexOf(S.period); const n = t0.closest("#prevM") ? ix + 1 : ix - 1; if (ms[n]) { S.period = ms[n]; render(); } return; }
    if (t0.closest("#newPeriod")) { openNewPeriod(); return; }
    if (t0.closest("#confirmNewP")) { confirmNewPeriod(t0.closest("#confirmNewP")); return; }
    if (t0.closest("#exportBtn")) { openExport(); return; }
    if (t0.closest("#runExport")) { runExport(t0.closest("#runExport")); return; }
    if (t0.closest("#saveNow") || t0.closest("#retrySave")) { manualSave(); return; }
    if (t0.closest("#openFolder")) { openPath("", false); return; }
    if (t0.closest("#backupNow")) { backupNow(); return; }
    const ro = t0.closest("[data-reopen]"); if (ro) { const m = ro.dataset.reopen; const prev = S.set.closed; S.set.closed = (S.set.closed || []).filter(x => x !== m); persistSettings().then(() => { S.period = m; render(); toast(t("{ay} yeniden açıldı.", { ay: monthLabel(m) })); }).catch(err => { S.set.closed = prev; toast(err.message); }); return; }
    if (t0.closest("#phView")) { const src = S.ph && S.ph.preview ? S.ph.preview : fotoURL(S.ph.id); const v = document.createElement("div"); v.className = "viewer"; v.id = "viewer"; v.innerHTML = '<img alt="' + esc(t("Fiş fotoğrafı")) + '" src="' + esc(src) + '"><button type="button" id="closeViewer">' + esc(t("Kapat")) + '</button>'; document.body.appendChild(v); return; }
    const fg = t0.closest("[data-fisgor]"); if (fg) { const v = document.createElement("div"); v.className = "viewer"; v.id = "viewer"; v.innerHTML = '<img alt="' + esc(t("Fiş fotoğrafı")) + '" src="' + esc(fotoURL(fg.dataset.fisgor)) + '"><button type="button" id="closeViewer">' + esc(t("Kapat")) + '</button>'; document.body.appendChild(v); return; }
    if (t0.closest("#closeViewer") || t0.id === "viewer") { const v = $("#viewer"); if (v) v.remove(); return; }
    if (t0.closest("#phRemove")) { S.ph.removed = true; S.ph.blob = null; if (S.ph.preview) URL.revokeObjectURL(S.ph.preview); S.ph.preview = null; $("#phBox").innerHTML = phBoxHTML(); return; }
    if (t0.id === "scrim" || t0.closest("#closeSheet")) { closeSheet(); return; }
    if (t0.closest("#delBtn")) { delItem(t0.closest("#delBtn")); return; }
    if (t0.closest("#copyBtn")) { const src = S.items.find(x => x.id === t0.closest("#copyBtn").dataset.id); closeSheet(); const c = Object.assign({}, src); delete c.id; delete c.photo; delete c.createdAt; delete c.updatedAt; delete c.ord; delete c.src; openSheet(null, null, c); return; }
    if (t0.closest("#doImport")) { doImport(); return; }
    if (t0.closest("#cancelImport")) { S.imp = null; render(); return; }
    if (t0.closest("#saveOp")) {
      const av = $("#opAmt").value.trim(), a = av ? toNum(av) : null, low = toNum($("#opLow").value || "0");
      if (av && isNaN(a)) { toast(t("Başlangıç kasasını rakamla yazın.")); return; }
      if (isNaN(low) || low < 0) { toast(t("Uyarı sınırını rakamla yazın (0 = kapalı).")); return; }
      const prev = JSON.stringify(S.set);
      Object.assign(S.set, { name: $("#opName").value.trim(), preparedBy: $("#opPrep").value.trim(), approvedBy: $("#opAppr").value.trim(), opening: a == null ? null : r2(a), openingDate: $("#opDate").value || S.set.openingDate || (a == null ? null : todayISO()), lowLimit: r2(low) });
      persistSettings().then(() => { render(); toast(t("Ayarlar kaydedildi.")); }).catch(err => { S.set = JSON.parse(prev); toast(err.message); });
      return;
    }
  });
  document.addEventListener("submit", e => { if (e.target.id === "form") { e.preventDefault(); saveForm(); } else if (e.target.id === "tekForm") { e.preventDefault(); tekneKaydet(); } else if (e.target.id === "yForm") { e.preventDefault(); yKaydet(); } });
  document.addEventListener("keydown", e => {
    const el = e.target;
    if (el && el.classList && el.classList.contains("num-in") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const { g, d } = SEP();
      if (e.code === "NumpadDecimal" && e.key !== d) {        // the keypad's decimal key always gives the decimal mark
        e.preventDefault();
        if (!el.value.includes(d) && +(el.dataset.dec || 2) > 0) { const p = el.selectionStart; el.value = el.value.slice(0, p) + d + el.value.slice(el.selectionEnd); el.setSelectionRange(p + 1, p + 1); fmtNumBox(el); el.dispatchEvent(new Event("input", { bubbles: true })); }
        return;
      }
      const p = el.selectionStart;
      if (p === el.selectionEnd) {                            // step over a separator so Backspace/Delete remove a digit
        if (e.key === "Backspace" && p > 0 && el.value[p - 1] === g) el.setSelectionRange(p - 1, p - 1);
        else if (e.key === "Delete" && el.value[p] === g) el.setSelectionRange(p + 1, p + 1);
      }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); manualSave(); return; }
    if (e.key === "Escape") { const v = $("#viewer"); if (v) { v.remove(); return; } if ($("#scrim")) closeSheet(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((el || {}).tagName || "");
    if (typing || modalOpen() || e.ctrlKey || e.metaKey || e.altKey || S.mode !== "live" || kilitli()) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); openSheet(null); }
    else if (e.key === "g" || e.key === "G" || e.key === "i" || e.key === "I" || e.key === "İ") { e.preventDefault(); openSheet(null, "in"); }
  });
  document.addEventListener("paste", e => {
    const el = e.target;
    if (!(el && el.classList && el.classList.contains("num-in"))) return;
    const txt = (e.clipboardData || window.clipboardData).getData("text");
    const n = K.toNum(txt);                                  // pasted text may come in either format
    if (!txt || isNaN(n)) return;
    e.preventDefault();
    el.value = boxText(el.dataset.neg === "1" ? n : Math.abs(n), +(el.dataset.dec || 2));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("input", e => {
    const tg = e.target;
    if (tg.classList && tg.classList.contains("num-in")) fmtNumBox(tg);
    if (tg.id === "yAra") { S.yon.ara = tg.value; clearTimeout(S._yt); S._yt = setTimeout(() => { render(); const q = $("#yAra"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 160); return; }
    if (tg.id === "q") { S.q = tg.value; S._focusQ = true; clearTimeout(S._qt); S._qt = setTimeout(render, 160); return; }
    if (tg.id === "f_cat") { S.catTouched = true; const lw = $("#ltWrap"); if (lw) lw.hidden = K.catKey(tg.value) !== "Yakıt" && !(toNum($("#f_lt").value) > 0); }
    if ((tg.id === "f_vendor" || tg.id === "f_desc") && !S.catTouched) { const c = K.guessCat($("#f_vendor").value, $("#f_desc").value); const fc = $("#f_cat"); if (fc) fc.value = K.catLabel(c); const lw = $("#ltWrap"); if (lw) { lw.hidden = c !== "Yakıt" && !(toNum($("#f_lt").value) > 0); if (c === "Yakıt" && !$("#f_lt").value) { const lt = K.parseLt($("#f_desc").value); if (lt > 0) { $("#f_lt").value = boxText(lt, 2); updLt(); } } } }
    if (tg.id === "f_amount" || tg.id === "f_rate") { updFx(); updLt(); }
    if (tg.id === "f_lt") updLt();
  });
  document.addEventListener("change", e => {
    const tg = e.target;
    if (tg.id === "acc1" || tg.id === "acc2") { if (S.terms) { S.terms[tg.id === "acc1" ? "c1" : "c2"] = tg.checked; const b = $("#acceptTerms"); if (b) b.disabled = !(S.terms.c1 && S.terms.c2); } return; }
    if (tg.name === "lang") { setLanguage(tg.value); return; }
    if (tg.name === "fmt") { const po = $("#photoOpt"); if (po) po.hidden = tg.value !== "pdf"; return; }   // photos go only into the PDF report
    if (tg.id === "guncelDenetim") { const prev = S.set.guncelleme; S.set.guncelleme = tg.checked; persistSettings().then(() => { toast(tg.checked ? t("Yeni sürümler otomatik denetlenecek.") : t("Otomatik sürüm denetimi kapatıldı.")); if (tg.checked) guncelDenetle(false); }).catch(e => { S.set.guncelleme = prev; tg.checked = prev !== false; toast(e.message); }); return; }
    if (tg.name === "ty") { const inn = tg.value === "in"; const cw = $("#catWrap"); if (cw) cw.hidden = inn; const pw = $("#payWrap"); if (pw) pw.innerHTML = payHTML(tg.value, ""); const fm = formMetin(tg.value), vl = $("#vendLbl"); if (vl) vl.textContent = fm.kim; const fv = $("#f_vendor"); if (fv) fv.placeholder = fm.kimOrn; const fd = $("#f_desc"); if (fd) fd.placeholder = fm.acOrn; const lw = $("#ltWrap"); if (lw && inn) lw.hidden = true; const qb = $("#quickBox"); if (qb && !S.editing) qb.innerHTML = quickHTML(tg.value); $("#sh").textContent = sheetTitle(!!S.editing, inn, false); updFx(); return; }
    if (tg.id === "f_cur") { const cur = tg.value; const r = (S.set.rates || {})[cur]; const fr = $("#f_rate"); if (fr && cur !== "TRY" && !fr.value && r) fr.value = K.dec(r); updFx(); updLt(); if (cur !== "TRY" && fr && !fr.value) fr.focus(); return; }
    if (tg.id === "periodSel") { S.period = tg.value; render(); return; }
    if (tg.id === "catSel") { S.cat = tg.value; render(); return; }
    if (tg.id === "file") { handleFile(tg.files[0]); tg.value = ""; return; }
    if (tg.id === "restoreFile") { restoreFile(tg.files[0]); tg.value = ""; return; }
    if (tg.id === "f_photo") { pickPhoto(tg.files[0]); return; }
    if (tg.id === "sheetSel") { S.imp.sheet = tg.value; if (tg.value !== "__all") loadSingle(tg.value); S.imp.setOp = null; runParse(); render(); return; }
    if (tg.id === "hdrSel") { const I = S.imp; I.hdr = +tg.value; I.headers = headersOf(I.raw, I.hdr); I.map = guessMap(I.headers); runParse(); render(); return; }
    if (tg.dataset && tg.dataset.map) { S.imp.map[tg.dataset.map] = +tg.value; runParse(); render(); return; }
    if (tg.id === "setOp") { S.imp.setOp = tg.checked; render(); return; }
  });
  ["dragover", "dragenter"].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } }));
  document.addEventListener("dragleave", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
  document.addEventListener("drop", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); handleFile(e.dataTransfer.files[0]); } else if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });
  document.addEventListener("dragover", e => { if (!(e.target.closest && e.target.closest("#drop"))) e.preventDefault(); });
  window.addEventListener("pagehide", () => { if (WEB) return; try { navigator.sendBeacon("api/veda?t=" + encodeURIComponent(TOKEN)); } catch (e) { } });

  /* ---------------- strip at the top: UTC and local time, TCMB exchange rates scrolling by ---------------- */
  const iki = n => String(n).padStart(2, "0");
  function saatYaz() {
    const d = new Date(), u = $("#saatUtc"), y = $("#saatYerel"), f = $("#saatFark");
    if (u) u.textContent = iki(d.getUTCHours()) + ":" + iki(d.getUTCMinutes()) + ":" + iki(d.getUTCSeconds());
    if (y) y.textContent = iki(d.getHours()) + ":" + iki(d.getMinutes()) + ":" + iki(d.getSeconds());
    const tr = $("#saatTarih"); if (tr) { const v = d.toLocaleDateString(K.lang === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "short" }); if (tr.textContent !== v) tr.textContent = v; }
    if (f) { const m = -d.getTimezoneOffset(), h = Math.trunc(Math.abs(m) / 60), dk = Math.abs(m) % 60; f.textContent = "UTC" + (m < 0 ? "−" : "+") + h + (dk ? ":" + iki(dk) : ""); }
  }
  // live free-market rates and gold from Trunçgil Finans (free, no key, updated every few minutes);
  // if it cannot be reached, the TCMB daily rates from api/kur (the program, or kur.json on the site for the iPhone)
  const CANLI = "https://finans.truncgil.com/v4/today.json";
  const CANLI_KALEM = [["USD"], ["EUR"], ["GBP"], ["CHF"], ["GRA", "Gram altın"], ["CEYREKALTIN", "Çeyrek altın"], ["ONS", "Ons ($)"]];
  async function canliKurlar() {
    const ks = new AbortController(), zaman = setTimeout(() => ks.abort(), 8000);
    try {
      const r = await fetch(CANLI, { cache: "no-store", signal: ks.signal });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json(), kurlar = [];
      CANLI_KALEM.forEach(([k, ad]) => { const v = d[k]; if (v && +v.Buying > 0 && +v.Selling > 0) kurlar.push({ kod: k, ad: ad || "", alis: +v.Buying, satis: +v.Selling, degisim: isFinite(+v.Change) ? +v.Change : null, altin: v.Type === "Gold" }); });
      if (!kurlar.length) throw new Error("boş");
      const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d)/.exec(d.Update_Date || "");
      return { kaynak: "Trunçgil Finans", canli: true, saat: m ? m[2] : "", tarih: m ? m[1] : "", kurlar };
    } finally { clearTimeout(zaman); }
  }
  const kurSayi = (v, ondalik) => new Intl.NumberFormat(K.lang === "en" ? "en-GB" : "tr-TR", { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik }).format(v);
  function kurCiz() {
    const kap = $("#kurKay"), don = $("#kurDon"), y = S.kur;
    if (!kap || !don) return;
    if (!y || !Array.isArray(y.kurlar) || !y.kurlar.length) { kap.hidden = true; return; }
    const bas = y.canli ? t("Serbest piyasa · {saat} · alış / satış", { saat: y.saat }) + " · " + y.kaynak
      : t("TCMB {tarih} · alış / satış", { tarih: y.tarih ? dmy(y.tarih) : "" }) + (y.eski ? " · " + t("son alınan") : "");
    const parca = '<span class="kbas">' + esc(bas) + '</span>' + y.kurlar.map(k => {
      const ad = k.ad ? t(k.ad) : (k.birim > 1 ? k.birim + " " : "") + k.kod, n = k.altin ? 2 : 4;
      const dg = k.degisim == null ? "" : '<em class="' + (k.degisim > 0 ? "yuk" : k.degisim < 0 ? "dus" : "") + '">' + (k.degisim > 0 ? "▲" : k.degisim < 0 ? "▼" : "•") + " %" + kurSayi(Math.abs(k.degisim), 2) + '</em>';
      return '<span class="kur"><b>' + esc(ad) + '</b> ' + kurSayi(k.alis, n) + ' <i>/</i> ' + kurSayi(k.satis, n) + (dg ? " " + dg : "") + '</span>';
    }).join("");
    don.innerHTML = '<span class="kparca">' + parca + '</span><span class="kparca" aria-hidden="true">' + parca + '</span>';
    kap.hidden = false;
    const w = don.firstElementChild.getBoundingClientRect().width;
    don.style.setProperty("--kursure", Math.max(24, Math.round(w / 45)) + "s");
  }
  async function kurYukle() {
    if (document.visibilityState === "hidden" && S.kur) return;   // nobody is looking: wait
    try { S.kur = await canliKurlar(); }
    catch (e) {
      if (!S.kur || !S.kur.canli || !S._tcmbDenendi) { try { S.kur = await api("api/kur"); S._tcmbDenendi = true; } catch (e2) { /* no rates: only the clocks */ } }
    }
    kurCiz();
  }

  /* ---------------- headings: every word starts with a capital ("Hakkında Ve Yasal Bilgiler"), with Turkish i → İ ---------------- */
  const BASLIK = ".sayfabas, .ditem span, .panel h3, .sheet h3, .empty h3, .hakkinda h2, .ozellik b, .kahraman h1, .dbas b";
  // words such as "iPhone" (a capital inside) are left as they are
  // (in English, short joining words stay small: "Terms of Use and Privacy")
  const EN_KUCUK = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"]);
  const basHarfli = m => m.replace(/(^|[\s(“"/–-])(\p{Ll})([^\s]*)/gu, (x, on, h, kalan, yer) => /\p{Lu}/u.test(kalan) || (K.lang === "en" && yer > 0 && EN_KUCUK.has(h + kalan.replace(/[^\p{L}]/gu, ""))) ? x : on + h.toLocaleUpperCase(K.lang === "en" ? "en" : "tr") + kalan);
  function basliklar(kok) {
    const els = kok.matches && kok.matches(BASLIK) ? [kok] : [];
    if (kok.querySelectorAll) els.push(...kok.querySelectorAll(BASLIK));
    for (const el of els) {
      const yuru = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = yuru.nextNode(); n; n = yuru.nextNode()) { const v = basHarfli(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    }
  }
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) basliklar(n); else if (n.nodeType === 3 && n.parentElement && n.parentElement.closest(BASLIK)) { const v = basHarfli(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } })
    .observe(document.body, { childList: true, subtree: true });

  /* ---------------- background music: quiet, one 96 s period looped without a seam; on/off remembered on this device ----------------
     Played through Web Audio (the volume of an <audio> element cannot be lowered on the iPhone). The file holds the loop plus its
     first 3 s, and exactly one period (1 s – 97 s) is looped, so the MP3's own padding never falls inside the loop. */
  const MUZIK_SES = 0.14;
  const MUZIK = { ctx: null, tampon: null, kaynak: null, kazanc: null, yukleniyor: null, acik: (() => { try { return localStorage.getItem("kj-muzik") !== "0"; } catch (e) { return true; } })() };
  function muzikHazirla() {
    if (MUZIK.tampon || MUZIK.yukleniyor) return MUZIK.yukleniyor || Promise.resolve();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    MUZIK.ctx = MUZIK.ctx || new AC();
    MUZIK.yukleniyor = fetch("fon.mp3").then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then(b => new Promise((ok, red) => MUZIK.ctx.decodeAudioData(b, ok, red))).then(t => { MUZIK.tampon = t; })
      .catch(e => { console.warn("fon müziği:", e && e.message); }).finally(() => { MUZIK.yukleniyor = null; });
    return MUZIK.yukleniyor;
  }
  function muzikBaslat() {
    if (!MUZIK.acik || !MUZIK.tampon || MUZIK.kaynak) return;
    const c = MUZIK.ctx, k = c.createBufferSource(), g = c.createGain();
    k.buffer = MUZIK.tampon; k.loop = true; k.loopStart = 1; k.loopEnd = Math.min(97, MUZIK.tampon.duration);
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(MUZIK_SES, c.currentTime + 4);
    k.connect(g); g.connect(c.destination); k.start(0, 1);
    MUZIK.kaynak = k; MUZIK.kazanc = g;
  }
  function muzikDurdur() {
    const k = MUZIK.kaynak, g = MUZIK.kazanc, c = MUZIK.ctx;
    if (!k) return;
    MUZIK.kaynak = null;
    const s = c.currentTime;
    g.gain.cancelScheduledValues(s); g.gain.setValueAtTime(g.gain.value, s); g.gain.linearRampToValueAtTime(0, s + 0.8);
    k.stop(s + 0.85);
  }
  function muzikDugme() {
    const b = $("#muzikBtn"); if (!b) return;
    b.setAttribute("aria-pressed", String(MUZIK.acik)); b.classList.toggle("kapali", !MUZIK.acik);
    b.title = MUZIK.acik ? t("Fon müziğini kapat") : t("Fon müziğini aç");
  }
  async function muzikAcKapa() {
    MUZIK.acik = !MUZIK.acik;
    try { localStorage.setItem("kj-muzik", MUZIK.acik ? "1" : "0"); } catch (e) { }
    muzikDugme();
    if (!MUZIK.acik) { muzikDurdur(); return; }
    await muzikHazirla();
    if (MUZIK.ctx && MUZIK.ctx.state === "suspended") await MUZIK.ctx.resume().catch(() => { });
    muzikBaslat();
  }
  function muzikKur() {
    muzikDugme();
    if (MUZIK.acik) muzikHazirla().then(muzikBaslat);
    // the iPhone (and a browser without the program's window) lets sound start only after a touch or a key
    const ilk = e => {
      if (e.target && e.target.closest && e.target.closest("#muzikBtn")) return;   // the button decides by itself
      document.removeEventListener("pointerdown", ilk, true); document.removeEventListener("keydown", ilk, true);
      if (MUZIK.acik && MUZIK.ctx && MUZIK.ctx.state === "suspended") MUZIK.ctx.resume().then(muzikBaslat).catch(() => { });
    };
    document.addEventListener("pointerdown", ilk, true); document.addEventListener("keydown", ilk, true);
    // quiet while the program is in the background, back when it returns
    document.addEventListener("visibilitychange", () => {
      if (!MUZIK.ctx) return;
      if (document.visibilityState === "hidden") MUZIK.ctx.suspend().catch(() => { });
      else if (MUZIK.acik) MUZIK.ctx.resume().catch(() => { });
    });
  }
  window.KJmuzik = () => ({ acik: MUZIK.acik, yuklendi: !!MUZIK.tampon, caliyor: !!MUZIK.kaynak, durum: MUZIK.ctx ? MUZIK.ctx.state : "" });   // for the tests

  /* ---------------- start ---------------- */
  (async () => {
    saatYaz(); setInterval(saatYaz, 1000);
    applyLang(); render();
    try { await swHazir(); applyData(await api("api/veri")); S.mode = "live"; }
    catch (e) { S.mode = "error"; S.bootErr = e.message; }
    render();
    const basla = () => { if (S.mode === "live" && needTerms()) openTerms("accept"); else if (S.mode === "live") senkKur(); };
    if (S.mode === "live" && WEB && IOS && !kurulu() && !S.items.length) openKurulum(basla); else basla();
    setInterval(ping, 10000);
    if (S.mode === "live") muzikKur();
    if (S.mode === "live") { kurYukle(); setInterval(kurYukle, 60e3); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kurYukle(); }); }
    if (S.mode === "live" && !WEB) { setTimeout(() => guncelDenetle(false), 12000); setInterval(() => guncelDenetle(false), 3600e3); }
  })();
})();
