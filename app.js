/* Kasa Jurnali — window logic. On the computer everything is saved through the local program; on the iPhone
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
  const S = { items: [], set: defaultSet(), setBase: {}, silinenler: {}, senk: null, gbag: null, guncel: null, rev: -1, period: null, q: "", cat: "", tab: "list", imp: null, mode: "loading", saving: 0, lastSaved: null, saveErr: null, offline: false, klasor: "", dosya: "", ph: null, editing: null, catTouched: false, notice: "", first: false, terms: null };

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
    catch (e) { S.offline = true; updSave(); throw new Error(WEB ? t("Uygulamanın kayıtlarına ulaşılamadı. Uygulamayı kapatıp yeniden açın.") : t("Program arka planda kapanmış. Bu pencereyi kapatıp Kasa Jurnali’yi masaüstünden yeniden açın.")); }
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
    document.title = S.set.name ? "Kasa Jurnali · " + S.set.name : "Kasa Jurnali";
    const k = kasaFor(S.period || curYM());
    const first = S.period === "all";
    const isLatest = S.period === "all" || S.period >= (monthRange()[0] || curYM());
    const low = isLatest && k.kalan >= 0 && +S.set.lowLimit > 0 && k.kalan < +S.set.lowLimit;
    $("#kasa").innerHTML =
      '<div class="kc"><span class="lbl">' + esc(first ? t("Başlangıç kasası") : t("Devir kasa")) + '</span><span class="v' + (k.devir < 0 ? " neg" : "") + '">' + tl(k.devir) + '</span>' + (!first && S.set.openingDate && S.period > S.set.openingDate.slice(0, 7) ? '<span class="from">' + esc(t("{ay} kalanı", { ay: monthLabel(addMonth(S.period, -1)) })) + '</span>' : "") + '</div>' +
      '<div class="kc in"><span class="lbl">' + esc(t("Gelen para")) + '</span><span class="v">' + tl(k.in) + '</span></div>' +
      '<div class="kc"><span class="lbl">' + esc(t("Toplam harcama")) + '</span><span class="v">' + tl(k.out) + '</span>' + paySplitLine(S.period || curYM()) + '</div>' +
      '<div class="kc end' + (k.kalan < 0 ? " neg" : "") + (low ? " low" : "") + '"><span class="lbl">' + esc(k.kalan < 0 ? t("Kasa açığı") : t("Kalan kasa")) + '</span><span class="v">' + tl(k.kalan) + '</span>' + (k.kalan < 0 ? '<span class="from">' + esc(t("Gelen para önce açığı kapatır")) + '</span>' : low ? '<span class="from">' + esc(t("Uyarı sınırının altında")) + '</span>' : "") + '</div>';
    $("#formula").textContent = S.set.opening == null && S.mode === "live" && S.items.length ? t("Başlangıç kasası girilmedi; “Ayarlar ve yedek” sekmesinden ekleyin.") : t("Kalan kasa = Devir + Gelen para − Harcama. Kasa biterse eksiye düşer; gelen para önce açığı kapatır.");
  }
  function render() {
    if (S.mode === "live") { buildPeriodSel(); renderKasa(); }
    document.querySelectorAll(".tabrow button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
    $("#fab").hidden = !(S.mode === "live" && S.tab !== "io");
    let h = "";
    if (S.mode === "error") h = '<div class="note err"><span><b>' + esc(t("Kayıtlar açılamadı")) + '</b>' + esc(S.bootErr || "") + '</span></div>';
    else if (S.mode === "loading") h = '<div class="loading">' + esc(t("Jurnal açılıyor…")) + '</div>';
    else h = banners() + (S.tab === "list" ? viewList() : S.tab === "sum" ? viewSum() : viewIO());
    $("#main").innerHTML = h;
    if (S.tab === "list" && S._focusQ) { const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } S._focusQ = false; }
    if (S.tab === "io") syncMapSelects();
    renderFoot();
    updSave();
    updSenk();
  }
  function banners() {
    let h = "";
    if (WEB && S.yeniSurum) h += '<div class="note"><span><b>' + esc(t("Yeni sürüm hazır")) + '</b>' + esc(t("Kasa Jurnali’nin yeni sürümü indirildi. Kayıtlarınız olduğu gibi kalır.")) + '</span><span class="btns"><button class="btn sm pri" id="swGuncelle">' + esc(t("Şimdi güncelle")) + '</button></span></div>';
    if (!WEB && S.guncel && S.guncel.yeni && !S.guncelSonra) h += '<div class="note"><span><b>' + esc(t("Yeni sürüm: Kasa Jurnali {surum}", { surum: S.guncel.yeni.surum })) + '</b>' + esc((S.guncel.yeni.notlar && (S.guncel.yeni.notlar[K.lang] || S.guncel.yeni.notlar.tr)) || t("Kayıtlarınıza dokunulmadan güncellenir.")) + '</span><span class="btns"><button class="btn sm" id="guncelSonra">' + esc(t("Sonra")) + '</button><button class="btn sm pri" id="guncelAc">' + esc(t("Güncelle")) + '</button></span></div>';
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
          !inn && i.pay ? '<span class="chip pay">' + esc(K.payName(i.pay)) + '</span>' : "",
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
    return '<div class="empty"><h3>' + esc(t("Kasa Jurnali’ye hoş geldiniz")) + '</h3><p>' + esc(WEB ? t("Fişlerinizi buraya girin; kasa, devir ve raporlar kendiliğinden hesaplanır. Her şey bu telefona kaydedilir, internet gerekmez.") : t("Fişlerinizi buraya girin; kasa, devir ve raporlar kendiliğinden hesaplanır. Her şey bu bilgisayara kaydedilir, internet gerekmez.")) + '</p>' +
      '<div class="btns"><button class="btn pri" data-new>' + esc(t("İlk fişi ekle")) + '</button><button class="btn" data-go="io" data-focus="opName">' + esc(t("Defter adı ve başlangıç kasası")) + '</button><button class="btn" data-go="io" data-focus="drop">' + esc(t("Excel’den aktar")) + '</button></div>' + (S.senk && S.senk.hazir && !S.senk.bagli ? '<p class="small" style="margin-top:14px">' + esc(t("Defteriniz başka bir cihazda mı? Ayarlar’dan Google Drive eşitlemesini açın; kayıtlar buraya gelir.")) + ' <button class="linkbtn" data-go="io" data-focus="gBagla">' + esc(t("Eşitlemeyi aç")) + '</button></p>' : "") + '</div>';
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
  function viewIO() {
    const st = S.set;
    let h = '<div class="panel"><h3>' + esc(t("Dil · Language")) + '</h3><div class="seg langseg" role="radiogroup" aria-label="Dil / Language"><label><input type="radio" name="lang" value="tr"' + (K.lang === "tr" ? " checked" : "") + '><span>Türkçe</span></label><label><input type="radio" name="lang" value="en"' + (K.lang === "en" ? " checked" : "") + '><span>English</span></label></div>' +
      '<p class="lead" style="margin:10px 0 0;font-size:13px">' + esc(t("Ekran, PDF rapor ve Excel tablosu seçilen dilde hazırlanır. Kayıtlarınız dil değişince değişmez. Tarih kutularının görünümü program bir sonraki açılışta yeni dile uyar.")) + '</p></div>';
    h += senkPanel();
    h += '<div class="panel"><h3>' + esc(t("Defter ve kasa ayarları")) + '</h3><p class="lead">' + esc(t("Defter adı ekranın üstünde ve raporlarda görünür. Hazırlayan ve onaylayan adları PDF raporun imza alanlarına yazılır.")) + '</p>' +
      '<div class="inline"><div class="field" style="flex-basis:100%"><label for="opName">' + esc(t("Defter adı (tekne, şirket ya da ev)")) + '</label><input id="opName" maxlength="80" value="' + esc(st.name || "") + '" placeholder="' + esc(t("ör. M/Y Deniz Yıldızı")) + '"></div>' +
      '<div class="field"><label for="opPrep">' + esc(t("Hazırlayan (kaptan)")) + '</label><input id="opPrep" maxlength="80" value="' + esc(st.preparedBy || "") + '" placeholder="' + esc(t("Ad Soyad")) + '"></div>' +
      '<div class="field"><label for="opAppr">' + esc(t("Onaylayan (armatör / yetkili)")) + '</label><input id="opAppr" maxlength="80" value="' + esc(st.approvedBy || "") + '" placeholder="' + esc(t("Ad Soyad")) + '"></div></div>' +
      '<div class="inline" style="margin-top:10px"><div class="field"><label for="opAmt">' + esc(t("Başlangıç kasası (₺)")) + '</label>' + numBox("opAmt", st.opening != null ? num(st.opening) : "", 2, ' data-neg="1"') + ' placeholder="' + esc(num(0)) + '"><span class="help">' + esc(t("Defterin başladığı gün kasadaki para")) + '</span></div>' +
      '<div class="field"><label for="opDate">' + esc(t("Başlangıç tarihi")) + '</label><input id="opDate" type="date" value="' + esc(st.openingDate || "") + '"></div>' +
      '<div class="field"><label for="opLow">' + esc(t("Kasa uyarı sınırı (₺)")) + '</label>' + numBox("opLow", num(+st.lowLimit || 0), 2) + '><span class="help">' + esc(t("Kasa bunun altına inince uyarır. 0 = kapalı")) + '</span></div>' +
      '<button class="btn pri" id="saveOp">' + esc(t("Ayarları kaydet")) + '</button></div></div>';
    h += '<div class="panel" id="importPanel"><h3>' + esc(t("Excel’den içe aktar")) + '</h3>';
    if (!S.imp) h += '<label class="drop" id="drop" for="file" tabindex="0"><strong>' + esc(t("Fiş takip tablonuzu (.xlsx) seçin")) + '</strong><p>' + esc(WEB ? t("Dosyayı Dosyalar uygulamasından seçin. Aylık sayfaların hepsi birden okunur; defterde zaten olan fişler tekrar eklenmez.") : t("Dosyayı buraya sürükleyip bırakın ya da tıklayıp seçin. Aylık sayfaların hepsi birden okunur; defterde zaten olan fişler tekrar eklenmez.")) + '</p><span class="btn pri">' + esc(t("Dosya seç")) + '</span></label><input id="file" type="file" accept=".xlsx,.xlsm" hidden>';
    else h += viewImport();
    h += '</div>';
    if (WEB) h += '<div class="panel"><h3>' + esc(t("Kayıt yeri ve yedekler")) + '</h3><p class="lead">' + esc(t("Her değişiklik anında bu telefona kaydedilir ve her gün kendiliğinden bir yedek alınır. Uygulamayı ana ekrandan sildiğinizde ya da Safari’nin site verilerini temizlediğinizde telefondaki kayıtlar da silinir; Google Drive eşitlemesini açık tutun ya da ara ara yedek dosyası alın.")) + '</p>' +
      '<div class="btns" style="justify-content:flex-start"><button class="btn" id="backupNow">' + esc(t("Yedek dosyası al")) + '</button><label class="btn" for="restoreFile" style="cursor:pointer">' + esc(t("Yedekten geri yükle")) + '</label><input id="restoreFile" type="file" accept=".json,application/json" hidden></div>' +
      '<p class="lead" style="margin:8px 0 0;font-size:13px">' + esc(t("Asıl fiş ve faturaları kâğıt ya da elektronik olarak ayrıca saklayın; programa fotoğraf eklemek, mevzuattaki saklama yükümlülüğünün (ör. VUK m. 253, TTK m. 82) yerine geçmez.")) + '</p></div>';
    else h += '<div class="panel"><h3>' + esc(t("Kayıt yeri ve yedekler")) + '</h3><p class="lead">' + esc(t("Her değişiklik anında bu bilgisayara kaydedilir ve her gün kendiliğinden bir yedek alınır. Program kapanıp açıldığında kaldığı yerden devam eder.")) + '</p>' +
      '<div class="pathbox">' + esc(S.klasor || "") + '</div>' +
      '<div class="btns" style="justify-content:flex-start"><button class="btn" id="openFolder">' + esc(t("Klasörü aç")) + '</button><button class="btn" id="backupNow">' + esc(t("Şimdi yedek al")) + '</button><label class="btn" for="restoreFile" style="cursor:pointer">' + esc(t("Yedekten geri yükle")) + '</label><input id="restoreFile" type="file" accept=".json" hidden></div>' +
      '<p class="lead" style="margin:12px 0 0;font-size:13px">' + esc(t("Başka bilgisayara taşımak için bu klasörü USB belleğe kopyalayın. Yeni bilgisayarda programı kurup klasörü aynı yere (Belgeler) yapıştırın.")) + '</p>' +
      '<p class="lead" style="margin:8px 0 0;font-size:13px">' + esc(t("Asıl fiş ve faturaları kâğıt ya da elektronik olarak ayrıca saklayın; programa fotoğraf eklemek, mevzuattaki saklama yükümlülüğünün (ör. VUK m. 253, TTK m. 82) yerine geçmez.")) + '</p></div>';
    const k = st.kabul;
    h += '<div class="panel"><h3>' + esc(t("Hakkında ve yasal bilgiler")) + '</h3><p class="lead">' + esc(WEB
      ? t("Kasa Jurnali {surum} (iPhone) · Kayıtlarınız bu telefonda durur; Google Drive eşitlemesini açarsanız kendi Google hesabınıza da kopyalanır. Uygulama yeni sürümü kendiliğinden alır. Kaldırmak için ana ekrandaki simgeye basılı tutup “Uygulamayı Sil”i seçin (telefondaki kayıtlar da silinir).", { surum: SURUM })
      : t("Kasa Jurnali {surum} · Kayıtlarınız bu bilgisayarda durur; Google Drive eşitlemesini açarsanız kendi Google hesabınıza da kopyalanır. Kaldırmak için: Windows Ayarlar › Uygulamalar › Kasa Jurnali › Kaldır (kayıtlarınız silinmez).", { surum: SURUM })) + '</p>' +
      (WEB ? "" : '<label class="check" style="margin:4px 0 10px"><input type="checkbox" id="guncelDenetim"' + (S.set.guncelleme !== false ? " checked" : "") + '> <span>' + esc(t("Yeni sürümleri otomatik denetle (günde iki kez, yalnızca sürüm bilgisi indirilir)")) + '</span></label>' +
        '<div class="btns" style="justify-content:flex-start;margin-bottom:10px"><button class="btn sm" id="guncelNow">' + esc(t("Güncellemeleri şimdi denetle")) + '</button>' + (S.guncel && S.guncel.yeni ? '<button class="btn sm pri" id="guncelKur">' + esc(t("Kasa Jurnali {surum} sürümüne güncelle", { surum: S.guncel.yeni.surum })) + '</button>' : "") + '</div>') +
      '<div class="btns" style="justify-content:flex-start"><button class="btn" id="openGuide">' + esc(t("Kullanım kılavuzu")) + '</button><button class="btn" data-legal="kosullar">' + esc(t("Kullanım Koşulları")) + '</button><button class="btn" data-legal="gizlilik">' + esc(t("Gizlilik ve KVKK")) + '</button><button class="btn" data-legal="lisanslar">' + esc(t("Üçüncü taraf lisansları")) + '</button></div>' +
      (k && k.tarih ? '<p class="lead" style="margin:12px 0 0;font-size:13px">' + esc(t("Kullanım Koşulları {tarih} tarihinde kabul edildi (sürüm {surum}).", { tarih: K.dateTime(new Date(k.tarih)), surum: k.surum || "" })) + '</p>' : "") +
      '<p class="lead" style="margin:6px 0 0;font-size:13px">' + esc(t("© 2026 Kasa Jurnali geliştiricisi. Tüm hakları saklıdır.")) + '</p></div>';
    return h;
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
      const pay = type === "in" ? "" : anyRe(/kart|kredi|card|pos|banka|bank/, pr) ? "kart" : anyRe(/nakit|cash|peşin/, pr) ? "nakit" : "";
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
    const ps = quickPicks(type); if (!ps.length) return "";
    return '<div class="quick"><span class="ql">' + esc(t("Sık kullanılanlar · dokunun, bilgiler dolsun")) + '</span>' + ps.map(e => '<button type="button" class="qchip" data-quick="' + esc(e.id) + '">' + esc(e.vendor || e.desc) + (e.vendor && e.desc ? ' <small>· ' + esc(e.desc) + '</small>' : "") + ' <small>' + esc(e.cur && e.cur !== "TRY" ? fx(e.fxAmount, e.cur) : tl(e.amount)) + '</small></button>').join("") + '</div>';
  }
  function lastPay() { const s = S.items.filter(e => !isIn(e) && e.pay).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")); return s[0] ? s[0].pay : "nakit"; }
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
    const payV = it ? (it.pay || "") : (v.pay || lastPay());
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
      '<div class="field full" id="rateWrap"' + (cur === "TRY" ? " hidden" : "") + '><label for="f_rate" id="rateLbl">' + esc(t("Kur (1 {cur} = ? ₺)", { cur })) + '</label>' + numBox("f_rate", K.dec(rate), 4) + ' placeholder="' + esc(t("ör. 37,85")) + '"><div class="fxline" id="fxLine"></div></div>' +
      '<div class="field full"><label for="f_vendor">' + esc(t("Şirket / kimden")) + '</label><input id="f_vendor" list="vendlist" maxlength="120" autocomplete="off" value="' + esc(v.vendor) + '" placeholder="' + esc(t("ör. market, akaryakıt, marangoz")) + '"><datalist id="vendlist">' + vendors.map(c => '<option value="' + esc(c) + '">').join("") + '</datalist></div>' +
      '<div class="field full"><label for="f_desc">' + esc(t("Açıklama")) + '</label><input id="f_desc" maxlength="200" autocomplete="off" value="' + esc(v.desc) + '" placeholder="' + esc(t("ör. Su, yoğurt")) + '"></div>' +
      '<div class="field" id="catWrap"' + (v.type === "in" ? " hidden" : "") + '><label for="f_cat">' + esc(t("Kategori")) + '</label><input id="f_cat" list="catlist" autocomplete="off" value="' + esc(K.catLabel(v.cat)) + '" placeholder="' + esc(t("Kendiliğinden önerilir")) + '"><datalist id="catlist">' + allCats().map(c => '<option value="' + esc(K.catLabel(c)) + '">').join("") + '</datalist></div>' +
      '<div class="field" id="ltWrap"' + (showLt ? "" : " hidden") + '><label for="f_lt">' + esc(t("Yakıt (litre)")) + '</label>' + numBox("f_lt", +v.lt > 0 ? K.qty(v.lt) : "", 2) + ' placeholder="' + esc(t("ör. 900")) + '"><div class="fxline" id="ltLine"></div></div>' +
      '<div class="full" id="payWrap"' + (v.type === "in" ? " hidden" : "") + '><p class="seglbl" style="margin-bottom:4px">' + esc(t("Ödeme şekli")) + '</p><div class="seg" role="radiogroup" aria-label="' + esc(t("Ödeme şekli")) + '"><label><input type="radio" name="pay" value="nakit"' + (payV === "nakit" ? " checked" : "") + '><span>' + esc(t("Nakit")) + '</span></label><label><input type="radio" name="pay" value="kart"' + (payV === "kart" ? " checked" : "") + '><span>' + esc(t("Kart")) + '</span></label></div></div>' +
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
    if (type === "out") { const p = document.querySelector('input[name="pay"]:checked'); if (p) body.pay = p.value; const lt = toNum(g("f_lt").value); if (lt > 0 && !g("ltWrap").hidden) body.lt = lt; }
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
      try { const d = await api("api/veri"); const ad = "Kasa Jurnali yedek " + todayISO() + ".json"; dosyaHazir(t("Yedek dosyası hazır"), ad, new Blob([JSON.stringify(d.defter, null, 1)], { type: "application/json" }), "JSON"); }
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
    try { d = JSON.parse(await f.text()); } catch (e) { toast(t("Bu dosya bir Kasa Jurnali yedeği değil.")); return; }
    const ay = d.ayarlar || d.settings, ky = d.kayitlar || d.items;
    if (!Array.isArray(ky)) { toast(t("Bu dosya bir Kasa Jurnali yedeği değil.")); return; }
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
      '<div class="thead"><h3 id="sh">' + esc(acc ? t("Kasa Jurnali’ye hoş geldiniz") : t("Yasal bilgiler")) + '</h3>' + langSwitchHTML() + '</div>' +
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
    if (WEB) { document.body.innerHTML = '<div class="bye"><h1>Kasa Jurnali</h1><p>' + esc(t("Kasa Jurnali’yi kullanmak için Kullanım Koşulları’nı kabul etmeniz gerekir. Uygulamayı kapatabilirsiniz; yeniden açtığınızda metinler tekrar gösterilir.")) + '</p></div>'; return; }
    try { await api("api/kapat", { method: "POST" }); } catch (e) { }
    document.body.innerHTML = '<div class="bye"><h1>Kasa Jurnali</h1><p>' + esc(t("Program kapatıldı. Kasa Jurnali’yi kullanmak için Kullanım Koşulları’nı kabul etmeniz gerekir. Bu pencereyi kapatabilirsiniz.")) + '</p></div>';
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
        const ad = (base + "Kasa Jurnali - " + label).replace(/[\/:*?"<>|]/g, "-") + ".xlsx";
        const r = await api("api/excel", { method: "POST", raw: true, json: { dosya: ad, dil: K.lang, sayfalar: months.map(sheetSpec) } });
        dosyaHazir(t("Excel dosyası hazır"), ad, await r.blob(), "XLS");
      } catch (e) { btn.disabled = false; btn.textContent = t("Tekrar dene"); $("#xerr").textContent = e.message; }
      return;
    }
    try {
      let r;
      if (fmt === "pdf") { const wp = $("#withPhotos"); r = await api("api/pdf", { method: "POST", json: { aylar: months, fotograflar: wp ? wp.checked : false, dosya: base + t("Kasa Raporu") + " - " + label, dil: K.lang } }); }
      else r = await api("api/excel", { method: "POST", json: { dosya: base + "Kasa Jurnali - " + label, dil: K.lang, sayfalar: months.map(sheetSpec) } });
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
    put("A1", S.set.name || "Kasa Jurnali", "baslik"); put("E1", up(t("Dönem")), "etiket"); put("E2", serial(ym + "-01"), "donem");
    put("A2", t("Günlük harcama fiş takip tablosu"), "etiket");
    put("A4", up(t("Devir kasa")), "etiket"); put("C4", up(t("Gelen para")), "etiket"); put("D4", up(t("Toplam harcama")), "etiket"); put("E4", up(t("Kalan kasa")), "etiket");
    [t("Tarih"), t("Şirket"), t("Açıklama"), t("Harcama") + " (₺)", t("Gelen para") + " (₺)", t("Ödeme"), t("Kategori"), t("Not")].map(up).forEach((x, i) => put("ABCDEFGH"[i] + "7", x, i === 3 || i === 4 ? "basliksatirsag" : "basliksatir"));
    put("A8", up(t("Devir")) + " · " + t("önceki dönemden kalan kasa"), "metin"); ["B8", "C8", "D8", "F8", "G8", "H8"].forEach(c => put(c, null, "metin")); put("E8", k.devir, "para");
    its.forEach((e, ix) => {
      const r = 9 + ix, inn = isIn(e);
      put("A" + r, serial(e.date), "tarih"); put("B" + r, e.vendor || "", "metin"); put("C" + r, e.desc || "", "metin");
      put("D" + r, inn ? null : +e.amount || 0, "para"); put("E" + r, inn ? +e.amount || 0 : null, "paragelen");
      put("F" + r, inn ? "" : K.payName(e.pay), "metin"); put("G" + r, inn ? t("Gelen para") : K.catLabel(e.cat), "metin");
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
      h += '<p class="lead">' + esc(t("Kayıtlarınız ve fiş fotoğrafları, Google Drive’ınızdaki gizli uygulama klasörü üzerinden diğer cihazlarınızla kendiliğinden eşitlenir. İnternet yokken yapılan değişiklikler, bağlantı gelince gönderilir.")) + '</p>' +
        '<div class="kv senkkv"><span>' + esc(t("Bağlı hesap")) + '</span><b>' + esc(b.hesap || t("Google hesabı")) + '</b><span>' + esc(t("Durum")) + '</span><b>' + esc(senkDurumMetni(b)) + '</b></div>' +
        (b.durum === "hata" && b.hata ? '<p class="err-t" style="margin:8px 0 0">' + esc(b.hata) + '</p>' : "") +
        '<div class="btns" style="justify-content:flex-start;margin-top:12px"><button class="btn pri" id="senkNow"' + (b.calisiyor ? " disabled" : "") + '>' + esc(t("Şimdi eşitle")) + '</button><button class="btn" id="senkOff">' + esc(t("Bağlantıyı kes")) + '</button></div>';
    } else if (S.gbag) {
      const G = S.gbag;
      h += '<ol class="gsteps"><li>' + esc(t("Bu telefonda ya da herhangi bir bilgisayarda şu adresi açın:")) + ' <a href="' + esc(G.adres) + '" target="_blank" rel="noopener"><b>' + esc(G.adres.replace(/^https?:\/\/(www\.)?/, "")) + '</b></a></li>' +
        '<li>' + esc(t("Şu kodu yazın:")) + '<span class="gkod" id="gKod">' + esc(G.kod) + '</span><button type="button" class="btn sm" id="gKopya">' + esc(t("Kodu kopyala")) + '</button></li>' +
        '<li>' + esc(t("Google hesabınızı seçin ve Kasa Jurnali’ye izin verin. Bu ekran kendiliğinden devam eder.")) + '</li></ol>' +
        '<p class="small" id="gDurum"><span class="spin"></span>' + esc(G.mesaj || t("Onay bekleniyor…")) + '</p>' +
        '<div class="btns" style="justify-content:flex-start"><button class="btn" id="gVazgec">' + esc(t("Vazgeç")) + '</button></div>';
    } else {
      h += '<p class="lead">' + esc(t("Telefonda ve bilgisayarda aynı defteri kullanmak için Google hesabınızı bağlayın. Kayıtlar Google Drive’ınızda yalnızca Kasa Jurnali’nin görebildiği gizli bir klasörde tutulur; Drive’daki diğer dosyalarınıza erişilmez.")) + '</p>' +
        '<div class="btns" style="justify-content:flex-start"><button class="btn pri" id="gBagla">' + esc(t("Google hesabını bağla")) + '</button></div>' +
        '<p class="small" style="margin:10px 0 0">' + esc(t("Eşitleme isteğe bağlıdır. Bağlamazsanız kayıtlarınız yalnızca bu cihazda kalır.")) + '</p>';
    }
    return h + '</div>';
  }
  function updSenk() {
    const el = $("#senkBtn"), b = S.senk; if (!el) return;
    el.hidden = !(b && b.bagli && S.mode === "live");
    if (el.hidden) return;
    el.className = "senkb " + (b.durum === "hata" ? "err" : b.durum === "cevrimdisi" ? "off" : b.durum === "calisiyor" ? "busy" : "ok");
    $("#senkLbl").textContent = b.durum === "calisiyor" ? t("Eşitleniyor…") : b.durum === "hata" ? t("Eşitlenemedi") : b.durum === "cevrimdisi" ? t("Çevrimdışı") : t("Eşitlendi");
    el.title = senkDurumMetni(b) + (b.hesap ? " · " + b.hesap : "");
  }
  function senkPanelYenile() { const p = $("#senkPanel"); if (p && S.tab === "io") p.outerHTML = senkPanel(); }
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
    if (r && r.durum === "tamam") return bitti(t("Google Drive bağlandı. Kayıtlar eşitleniyor…"));
    if (r && r.durum === "reddedildi") return bitti(t("İzin verilmedi; eşitleme açılmadı."));
    if (r && r.durum === "suresi-doldu") return bitti(t("Kodun süresi doldu. Yeniden deneyin."));
    if (r && r.yavasla) G.aralik += 5;
    const d = $("#gDurum"); if (d) d.innerHTML = '<span class="spin"></span>' + esc(G.mesaj || t("Onay bekleniyor…"));
    G.t = setTimeout(gBekle, G.aralik * 1000);
  }
  function openSenkOff() {
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><h3 id="sh">' + esc(t("Google Drive bağlantısı kesilsin mi?")) + '</h3><div class="info"><p>' + esc(t("Bu cihazdaki kayıtlar silinmez; bundan sonra yalnızca bu cihazda kalır. Diğer cihazlarınız ve Google Drive’daki kopya etkilenmez.")) + '</p><p class="small">' + esc(t("Drive’daki kopyayı tamamen silmek için: drive.google.com › Ayarlar › Uygulamaları yönet › Kasa Jurnali › Seçenekler › Gizli uygulama verilerini sil.")) + '</p></div>' +
      '<div class="acts"><div class="r"><button type="button" class="btn" id="closeSheet">' + esc(t("Vazgeç")) + '</button><button type="button" class="btn danger" id="senkOffOk">' + esc(t("Bağlantıyı kes")) + '</button></div></div></div></div>';
  }
  // the user is typing in a box on the page (a reload would wipe what was typed)
  const yazarken = () => { if (modalOpen()) return true; const a = document.activeElement; return !!(a && a.closest && a.closest("#main") && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(radio|checkbox|file|button|submit)$/i.test(a.type)))); };
  function senkKur() {
    if (!window.KJSenk || S._senkKur) return;
    S._senkKur = true;
    KJSenk.kur({
      ortam: WEB ? "web" : "pc", api, ham, fotoURL, cihaz: WEB ? "iPhone" : "PC",
      onDurum: b => { const once = S.senk; S.senk = b; updSenk(); if (!once || once.bagli !== b.bagli || once.hazir !== b.hazir || once.durum !== b.durum || once.calisiyor !== b.calisiyor) senkPanelYenile(); },
      onYerelDegisti: () => { if (yazarken()) S._pending = true; else reload().catch(() => { }); },
      onBilgi: o => { if (o.gelen || o.giden) toast(t("Eşitleme tamam: {gelen} kayıt geldi, {giden} kayıt gönderildi.", { gelen: o.gelen, giden: o.giden })); }
    }).catch(() => { });
  }

  /* ---------------- updates ---------------- */
  async function guncelDenetle(simdi) {
    if (WEB) return;
    try { S.guncel = simdi ? await api("api/guncelleme/denetle", { method: "POST" }) : await api("api/guncelleme"); }
    catch (e) { if (simdi) toast(e.message); return; }
    if (simdi) toast(S.guncel && S.guncel.yeni ? t("Yeni sürüm var: {surum}", { surum: S.guncel.yeni.surum }) : t("Kasa Jurnali güncel ({surum}).", { surum: SURUM }));
    if (!modalOpen() && !yazarken()) render();
  }
  function openGuncelle() {
    const y = S.guncel && S.guncel.yeni; if (!y) return;
    const not = y.notlar ? (y.notlar[K.lang] || y.notlar.tr || "") : "";
    $("#sheetHost").innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh" id="gunSheet"><h3 id="sh">' + esc(t("Kasa Jurnali {surum}", { surum: y.surum })) + '</h3><div class="info">' + (not ? '<p>' + esc(not) + '</p>' : "") + '<p>' + esc(t("Yeni sürüm indirilip kurulacak. Program birkaç saniye kapanıp yeniden açılır; kayıtlarınıza ve ayarlarınıza dokunulmaz.")) + '</p></div><div class="err-t" id="gerr"></div>' +
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
    if (!("serviceWorker" in navigator)) throw new Error(t("Bu tarayıcı Kasa Jurnali’yi çalıştıramıyor. iPhone’da Safari ile açın."));
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
    $("#sheetHost").innerHTML = '<div class="scrim" id="kurScrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh"><h3 id="sh">' + esc(t("Kasa Jurnali’yi ana ekrana ekleyin")) + '</h3>' +
      '<ol class="gsteps"><li>' + esc(t("Safari’nin alt çubuğundaki Paylaş düğmesine dokunun:")) + ' ' + PAYLAS + '</li><li>' + esc(t("Listeden “Ana Ekrana Ekle”yi seçin, sonra “Ekle”ye dokunun.")) + '</li><li>' + esc(t("Kasa Jurnali’yi bundan sonra ana ekrandaki simgesinden açın. İnternet olmadan da çalışır.")) + '</li></ol>' +
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
    if (t0.closest("#senkBtn")) { S.tab = "io"; render(); const p = $("#senkPanel"); if (p) p.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    if (t0.closest("#gBagla")) { gBagla(t0.closest("#gBagla")); return; }
    if (t0.closest("#gKopya")) { const k = S.gbag && S.gbag.kod; if (k && navigator.clipboard) navigator.clipboard.writeText(k).then(() => toast(t("Kod kopyalandı."))).catch(() => { }); return; }
    if (t0.closest("#gVazgec")) { if (S.gbag) clearTimeout(S.gbag.t); S.gbag = null; senkPanelYenile(); return; }
    if (t0.closest("#senkNow")) { KJSenk.esitle(); return; }
    if (t0.closest("#senkOff")) { openSenkOff(); return; }
    if (t0.closest("#senkOffOk")) { const b = t0.closest("#senkOffOk"); b.disabled = true; KJSenk.cikis().then(() => { closeSheet(); render(); toast(t("Google Drive bağlantısı kesildi.")); }).catch(e => { b.disabled = false; toast(e.message); }); return; }
    if (t0.closest("#guncelAc") || t0.closest("#guncelKur")) { openGuncelle(); return; }
    if (t0.closest("#guncelSonra")) { S.guncelSonra = true; render(); return; }
    if (t0.closest("#guncelOk")) { guncelKur(t0.closest("#guncelOk")); return; }
    if (t0.closest("#guncelNow")) { guncelDenetle(true); return; }
    if (t0.closest("#swGuncelle")) { swGuncelle(); return; }
    const tab = t0.closest(".tabrow button"); if (tab) { S.tab = tab.dataset.tab; render(); window.scrollTo({ top: 0 }); return; }
    if (t0.closest("[data-addin]")) { openSheet(null, "in"); return; }
    if (t0.closest("[data-new]")) { openSheet(null); return; }
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
  document.addEventListener("submit", e => { if (e.target.id === "form") { e.preventDefault(); saveForm(); } });
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
    if (typing || modalOpen() || e.ctrlKey || e.metaKey || e.altKey || S.mode !== "live") return;
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
    if (tg.id === "guncelDenetim") { const prev = S.set.guncelleme; S.set.guncelleme = tg.checked; persistSettings().then(() => { toast(tg.checked ? t("Yeni sürümler otomatik denetlenecek.") : t("Otomatik sürüm denetimi kapatıldı.")); if (tg.checked) guncelDenetle(false); }).catch(e => { S.set.guncelleme = prev; tg.checked = prev !== false; toast(e.message); }); return; }
    if (tg.name === "ty") { const inn = tg.value === "in"; ["catWrap", "payWrap"].forEach(id => { const w = document.getElementById(id); if (w) w.hidden = inn; }); const lw = $("#ltWrap"); if (lw && inn) lw.hidden = true; const qb = $("#quickBox"); if (qb && !S.editing) qb.innerHTML = quickHTML(tg.value); $("#sh").textContent = sheetTitle(!!S.editing, inn, false); updFx(); return; }
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

  /* ---------------- start ---------------- */
  (async () => {
    applyLang(); render();
    try { await swHazir(); applyData(await api("api/veri")); S.mode = "live"; }
    catch (e) { S.mode = "error"; S.bootErr = e.message; }
    render();
    const basla = () => { if (S.mode === "live" && needTerms()) openTerms("accept"); else if (S.mode === "live") senkKur(); };
    if (S.mode === "live" && WEB && IOS && !kurulu() && !S.items.length) openKurulum(basla); else basla();
    setInterval(ping, 10000);
    if (S.mode === "live" && !WEB) { setTimeout(() => guncelDenetle(false), 12000); setInterval(() => guncelDenetle(false), 3600e3); }
  })();
})();
