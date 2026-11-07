/* Yachting Jurnal — Excel (.xlsx) writing and reading for the iPhone app (the computer program does the same in Go,
   app/excel.go; both produce the same workbook). Works in a page and in the app's service worker:
   no DOM, no outside library. Writing stores the parts uncompressed; reading also understands compressed files. */
"use strict";
(function (g) {
  /* ---------------- zip ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const utf8 = s => new TextEncoder().encode(s);
  function zipYaz(dosyalar) {          // [[name, Uint8Array]] → Uint8Array (stored, no compression)
    const parcalar = [], merkez = []; let ofs = 0;
    const d = new Date(), tarih = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), saat = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const [ad, veri] of dosyalar) {
      const a = utf8(ad), crc = crc32(veri);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, saat, true); h.setUint16(12, tarih, true); h.setUint32(14, crc, true); h.setUint32(18, veri.length, true); h.setUint32(22, veri.length, true);
      h.setUint16(26, a.length, true); h.setUint16(28, 0, true);
      parcalar.push(new Uint8Array(h.buffer), a, veri);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, saat, true); c.setUint16(14, tarih, true); c.setUint32(16, crc, true); c.setUint32(20, veri.length, true); c.setUint32(24, veri.length, true);
      c.setUint16(28, a.length, true); c.setUint32(42, ofs, true);
      merkez.push(new Uint8Array(c.buffer), a);
      ofs += 30 + a.length + veri.length;
    }
    const mBoy = merkez.reduce((s, x) => s + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, dosyalar.length, true); e.setUint16(10, dosyalar.length, true); e.setUint32(12, mBoy, true); e.setUint32(16, ofs, true);
    const hepsi = [...parcalar, ...merkez, new Uint8Array(e.buffer)];
    const out = new Uint8Array(hepsi.reduce((s, x) => s + x.length, 0)); let p = 0;
    for (const x of hepsi) { out.set(x, p); p += x.length; }
    return out;
  }

  // inflate (raw deflate), used when the browser has no DecompressionStream (older iPhones)
  function inflate(src) {
    let pos = 0, bit = 0, out = new Uint8Array(src.length * 4 + 1024), op = 0;
    const need = n => { if (op + n > out.length) { const o = new Uint8Array(Math.max(out.length * 2, op + n)); o.set(out); out = o; } };
    const bits = n => { let v = 0; for (let i = 0; i < n; i++) { if (pos >= src.length) throw new Error("bozuk"); v |= ((src[pos] >> bit) & 1) << i; if (++bit === 8) { bit = 0; pos++; } } return v; };
    function tablo(len) { const cnt = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(len.length); for (const l of len) cnt[l]++; cnt[0] = 0; for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + cnt[i - 1]; for (let i = 0; i < len.length; i++) if (len[i]) sym[offs[len[i]]++] = i; return { cnt, sym }; }
    function coz(t) { let code = 0, first = 0, index = 0; for (let l = 1; l < 16; l++) { code |= bits(1); const c = t.cnt[l]; if (code - c < first) return t.sym[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; } throw new Error("bozuk"); }
    const LB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258], LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
    const DB = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577], DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
    let sabitL = null, sabitD = null;
    for (let son = 0; !son;) {
      son = bits(1); const tur = bits(2);
      if (tur === 0) {
        if (bit) { bit = 0; pos++; }
        const n = src[pos] | (src[pos + 1] << 8); pos += 4; need(n); out.set(src.subarray(pos, pos + n), op); op += n; pos += n; continue;
      }
      let L, D;
      if (tur === 1) {
        if (!sabitL) { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); sabitL = tablo(l); sabitD = tablo(new Uint8Array(30).fill(5)); }
        L = sabitL; D = sabitD;
      } else if (tur === 2) {
        const hl = bits(5) + 257, hd = bits(5) + 1, hc = bits(4) + 4, sira = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const cl = new Uint8Array(19); for (let i = 0; i < hc; i++) cl[sira[i]] = bits(3);
        const ct = tablo(cl), uz = new Uint8Array(hl + hd);
        for (let i = 0; i < hl + hd;) { const s = coz(ct); if (s < 16) uz[i++] = s; else if (s === 16) { const p = uz[i - 1]; for (let r = 3 + bits(2); r--;) uz[i++] = p; } else if (s === 17) { i += 3 + bits(3); } else { i += 11 + bits(7); } }
        L = tablo(uz.subarray(0, hl)); D = tablo(uz.subarray(hl));
      } else throw new Error("bozuk");
      for (;;) {
        const s = coz(L);
        if (s < 256) { need(1); out[op++] = s; }
        else if (s === 256) break;
        else { const i = s - 257, n = LB[i] + bits(LE[i]), di = coz(D), dist = DB[di] + bits(DE[di]); need(n); for (let k = 0; k < n; k++, op++) out[op] = out[op - dist]; }
      }
    }
    return out.subarray(0, op);
  }
  async function ac(veri) {
    if (typeof DecompressionStream === "function") {
      try { return new Uint8Array(await new Response(new Blob([veri]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); } catch (e) { }
    }
    return inflate(veri);
  }
  async function zipOku(buf) {
    const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("zip");
    const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
    const dosyalar = {};
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error("zip");
      const yontem = v.getUint16(p + 10, true), boy = v.getUint32(p + 20, true), al = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
      const ad = new TextDecoder().decode(b.subarray(p + 46, p + 46 + al));
      dosyalar[ad.toLowerCase()] = { yontem, boy, lo };
      p += 46 + al + xl + cl;
    }
    return async ad => {
      const f = dosyalar[ad.replace(/^\//, "").toLowerCase()]; if (!f) return null;
      const s = f.lo + 30 + v.getUint16(f.lo + 26, true) + v.getUint16(f.lo + 28, true), ham = b.subarray(s, s + f.boy);
      const veri = f.yontem === 0 ? ham : f.yontem === 8 ? await ac(ham) : null;
      return veri ? new TextDecoder().decode(veri) : null;
    };
  }

  /* ---------------- writing (same layout and styles as the computer program) ---------------- */
  const STIL = { "": 0, kalin: 1, para: 2, tarih: 3, basliksatir: 4, parakalin: 5, baslik: 6, etiket: 7, metin: 8, donem: 9, kalinzemin: 10, paragelen: 11, kalan: 12, basliksatirsag: 13 };
  const kac = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  function stiller(dil) {
    const f = dil === "en"
      ? { PARA: '&quot;₺&quot;#,##0.00;[Red]\\-&quot;₺&quot;#,##0.00;&quot;&quot;', TARIH: "dd\\/mm\\/yyyy", AY: "[$-809]mmmm\\ yyyy" }
      : { PARA: '#,##0.00&quot; ₺&quot;;[Red]\\-#,##0.00&quot; ₺&quot;;&quot;&quot;', TARIH: "dd\\.mm\\.yyyy", AY: "[$-41F]mmmm\\ yyyy" };
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n' +
      '<numFmts count="3"><numFmt numFmtId="164" formatCode="' + f.PARA + '"/><numFmt numFmtId="165" formatCode="' + f.TARIH + '"/><numFmt numFmtId="166" formatCode="' + f.AY + '"/></numFmts>\n' +
      '<fonts count="7">\n<font><sz val="10"/><name val="Calibri"/><family val="2"/></font>\n<font><b/><sz val="10"/><name val="Calibri"/><family val="2"/></font>\n<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>\n<font><b/><sz val="16"/><color rgb="FF0E2740"/><name val="Calibri"/><family val="2"/></font>\n<font><sz val="9"/><color rgb="FF5A6B7A"/><name val="Calibri"/><family val="2"/></font>\n<font><sz val="10"/><color rgb="FF1E7349"/><name val="Calibri"/><family val="2"/></font>\n<font><b/><sz val="12"/><color rgb="FF0E2740"/><name val="Calibri"/><family val="2"/></font>\n</fonts>\n' +
      '<fills count="5">\n<fill><patternFill patternType="none"/></fill>\n<fill><patternFill patternType="gray125"/></fill>\n<fill><patternFill patternType="solid"><fgColor rgb="FF0E2740"/><bgColor indexed="64"/></patternFill></fill>\n<fill><patternFill patternType="solid"><fgColor rgb="FFEDF1F4"/><bgColor indexed="64"/></patternFill></fill>\n<fill><patternFill patternType="solid"><fgColor rgb="FFF3E7D1"/><bgColor indexed="64"/></patternFill></fill>\n</fills>\n' +
      '<borders count="3">\n<border><left/><right/><top/><bottom/><diagonal/></border>\n<border><left/><right/><top/><bottom style="thin"><color rgb="FFD3DCE3"/></bottom><diagonal/></border>\n<border><left/><right/><top style="medium"><color rgb="FF0E2740"/></top><bottom style="thin"><color rgb="FFD3DCE3"/></bottom><diagonal/></border>\n</borders>\n' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>\n<cellXfs count="14">\n' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>\n<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>\n<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>\n<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>\n<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>\n<xf numFmtId="164" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>\n<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>\n<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>\n<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>\n<xf numFmtId="166" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>\n<xf numFmtId="0" fontId="1" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>\n<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>\n<xf numFmtId="164" fontId="6" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>\n<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>\n' +
      '</cellXfs>\n<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>\n</styleSheet>';
  }
  function konum(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref || ""); if (!m || +m[2] < 1) throw new Error("geçersiz hücre: " + ref);
    let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
    return [c - 1, +m[2]];
  }
  const sayi = v => { if (!isFinite(v)) throw new Error("geçersiz sayı"); return String(v); };
  function sayfaXML(s) {
    const satir = new Map();
    for (const h of s.hucreler || []) { const [c, r] = konum(h.r); if (!satir.has(r)) satir.set(r, []); satir.get(r).push([c, h]); }
    let b = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">';
    if (s.dondur > 1) b += '<pane ySplit="' + (s.dondur - 1) + '" topLeftCell="A' + s.dondur + '" activePane="bottomLeft" state="frozen"/>';
    b += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if ((s.sutunlar || []).length) b += "<cols>" + s.sutunlar.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") + "</cols>";
    b += "<sheetData>";
    for (const r of [...satir.keys()].sort((x, y) => x - y)) {
      b += '<row r="' + r + '">';
      for (const [, h] of satir.get(r).sort((x, y) => x[0] - y[0])) {
        const st = STIL[h.st || ""] || 0, sa = st ? ' s="' + st + '"' : "", f = h.f ? "<f>" + kac(h.f) + "</f>" : "";
        if (typeof h.v === "number") b += '<c r="' + h.r + '"' + sa + ">" + f + "<v>" + sayi(h.v) + "</v></c>";
        else if (typeof h.v === "string") b += h.f ? '<c r="' + h.r + '"' + sa + ' t="str">' + f + "<v>" + kac(h.v) + "</v></c>" : '<c r="' + h.r + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + kac(h.v) + "</t></is></c>";
        else if (h.f) b += '<c r="' + h.r + '"' + sa + ">" + f + "</c>";
        else if (st) b += '<c r="' + h.r + '"' + sa + "/>";
      }
      b += "</row>";
    }
    b += "</sheetData>";
    if ((s.birlesik || []).length) b += '<mergeCells count="' + s.birlesik.length + '">' + s.birlesik.map(m => '<mergeCell ref="' + kac(m) + '"/>').join("") + "</mergeCells>";
    return b + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
  }
  function sayfaAdi(s, kullanilan) {
    s = String(s || "").replace(/[\[\]:*?\/\\]/g, "-"); s = [...s].slice(0, 31).join("") || "Sayfa";
    let t = s; for (let i = 2; kullanilan.has(t.toLowerCase()); i++) t = s + " (" + i + ")";
    kullanilan.add(t.toLowerCase()); return t;
  }
  function yaz(sayfalar, dil) {
    if (!sayfalar || !sayfalar.length) throw new Error("Excel sayfası yok");
    const P = [], kul = new Set();
    let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
    let wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>';
    let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    sayfalar.forEach((s, i) => {
      const n = i + 1;
      P.push(["xl/worksheets/sheet" + n + ".xml", sayfaXML(s)]);
      ct += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wb += '<sheet name="' + kac(sayfaAdi(s.ad, kul)) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      rels += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
    });
    ct += "</Types>"; wb += '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    rels += '<Relationship Id="rId' + (sayfalar.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const hepsi = [["[Content_Types].xml", ct], ...P,
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
      ["docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Yachting Jurnal</dc:title><dc:creator>Yachting Jurnal</dc:creator></cp:coreProperties>'],
      ["docProps/app.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Yachting Jurnal</Application></Properties>'],
      ["xl/workbook.xml", wb], ["xl/_rels/workbook.xml.rels", rels], ["xl/styles.xml", stiller(dil)]];
    return zipYaz(hepsi.map(([a, s]) => [a, utf8(s)]));
  }

  /* ---------------- reading: every sheet as rows of raw values (dates stay Excel serial numbers) ---------------- */
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const coz = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] != null ? ENT[e] : m));
  const ozellik = (etiket, ad) => { const m = new RegExp("(?:^|\\s)(?:\\w+:)?" + ad + '="([^"]*)"').exec(etiket); return m ? coz(m[1]) : null; };
  const metinler = x => { let s = ""; x.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "").replace(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g, (m, t) => { s += coz(t); return m; }); return s; };
  function sayfaOku(x, paylasilan) {
    const satirlar = [];
    const koy = (r, c, v) => { while (satirlar.length < r) satirlar.push([]); const row = satirlar[r - 1]; while (row.length <= c) row.push(null); row[c] = v; };
    let sonSatir = 0;
    const rowRe = /<(?:\w+:)?row\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g; let rm;
    while ((rm = rowRe.exec(x))) {
      const rr = ozellik(rm[1], "r"); sonSatir = rr ? +rr : sonSatir + 1;
      let sonKolon = -1;
      const icerik = rm[3] || "", cRe = /<(?:\w+:)?c\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g; let cm;
      while ((cm = cRe.exec(icerik))) {
        const ref = ozellik(cm[1], "r"), tur = ozellik(cm[1], "t") || "";
        let c = sonKolon + 1, r = sonSatir;
        if (ref) { try { [c, r] = konum(ref.replace(/\$/g, "")); } catch (e) { } }
        sonKolon = c;
        const ic = cm[3] || "", vm = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(ic), ham = vm ? coz(vm[1]) : "";
        let v = null;
        if (tur === "s") { const n = parseInt(ham, 10); if (n >= 0 && n < paylasilan.length) v = paylasilan[n]; }
        else if (tur === "inlineStr") { const im = /<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/.exec(ic); v = im ? metinler(im[1]) : ""; }
        else if (tur === "str" || tur === "e") v = ham;
        else if (tur === "b") v = ham === "1";
        else if (ham !== "") { const f = Number(ham.trim()); v = isNaN(f) ? ham : f; }
        if (v !== null && r > 0) koy(r, c, v);
      }
    }
    return satirlar;
  }
  async function oku(buf) {
    let al;
    try { al = await zipOku(buf); } catch (e) { throw new Error("Bu dosya bir Excel (.xlsx) dosyası değil. Eski .xls dosyalarını Excel'de açıp .xlsx olarak kaydedin."); }
    const ss = await al("xl/sharedStrings.xml"), paylasilan = [];
    if (ss) { const re = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\s*\/>/g; let m; while ((m = re.exec(ss))) paylasilan.push(m[1] ? metinler(m[1]) : ""); }
    const wb = await al("xl/workbook.xml");
    if (!wb) throw new Error("Excel dosyası okunamadı (çalışma kitabı yok).");
    const hedef = {}, rels = await al("xl/_rels/workbook.xml.rels");
    if (rels) rels.replace(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g, (m, a) => { const id = ozellik(a, "Id"), t = ozellik(a, "Target"); if (id && t) hedef[id] = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); return m; });
    const kitap = { SheetNames: [], Sheets: {} }; let i = 0;
    const shRe = /<(?:\w+:)?sheet\b([^>]*?)\/?>/g; let sm;
    while ((sm = shRe.exec(wb))) {
      i++;
      const ad = ozellik(sm[1], "name"), rid = ozellik(sm[1], "id");
      if (ad == null) continue;
      const x = await al(hedef[rid] || ("xl/worksheets/sheet" + i + ".xml")).catch(() => null);
      if (!x) continue;
      kitap.SheetNames.push(ad); kitap.Sheets[ad] = sayfaOku(x, paylasilan);
    }
    if (!kitap.SheetNames.length) throw new Error("Excel dosyasında okunabilir sayfa bulunamadı.");
    return kitap;
  }

  g.KJ_XLSX = { yaz, oku, zipYaz, crc32, inflate };
})(typeof self !== "undefined" ? self : globalThis);
