"""TCMB today.xml -> kur.json for the iPhone app's rate strip (the iPhone cannot read TCMB directly).

Runs in the public site's GitHub Actions on working days after TCMB publishes, and once from build.sh.
The JSON has the same shape as the Windows program's api/kur answer (app/kur.go).

usage: python3 kur.py [output.json]
"""
import datetime, json, sys, urllib.request
import xml.etree.ElementTree as ET

ADRES = "https://www.tcmb.gov.tr/kurlar/today.xml"
ECB_ADRES = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
KODLAR = ["USD", "EUR", "GBP", "CHF"]
AED_USD = 3.6725  # the dirham is pegged to the dollar and is not among the ECB reference rates


def coz(veri):
    kok = ET.fromstring(veri)
    y = {"kaynak": "TCMB", "tarih": datetime.datetime.strptime(kok.get("Date").strip(), "%m/%d/%Y").strftime("%Y-%m-%d"),
         "bulten": kok.get("Bulten_No", ""), "alindi": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "kurlar": []}
    for kod in KODLAR:
        for c in kok.findall("Currency"):
            if c.get("Kod") != kod:
                continue
            try:
                a, s = float(c.findtext("ForexBuying")), float(c.findtext("ForexSelling"))
            except (TypeError, ValueError):
                continue
            y["kurlar"].append({"kod": kod, "isim": (c.findtext("Isim") or "").strip(), "ad": (c.findtext("CurrencyName") or "").strip(),
                                "birim": int(c.findtext("Unit") or 1), "alis": a, "satis": s})
    if not y["kurlar"]:
        raise ValueError("TCMB yanıtında kur yok")
    # every currency against the lira (1 unit = ? TRY), for cross rates in the app (KJ.kurlarFor, same shape as app/kur.go)
    tablo = {}
    for c in kok.findall("Currency"):
        try:
            a, b = float(c.findtext("ForexBuying")), int(c.findtext("Unit") or 1)
        except (TypeError, ValueError):
            continue
        if a > 0 and c.get("Kod"):
            tablo[c.get("Kod")] = a / max(b, 1)
    y["tablolar"] = {"TCMB": {"baz": "TRY", "kaynak": "TCMB", "tarih": y["tarih"], "kurlar": tablo}}
    return y


def coz_ecb(veri):
    """ECB eurofxref-daily.xml -> {baz: EUR, kaynak: ECB, tarih, kurlar: {kod: 1 unit in EUR}}"""
    kok = ET.fromstring(veri)
    gun = next((c for c in kok.iter() if c.tag.endswith("Cube") and c.get("time")), None)
    if gun is None:
        raise ValueError("ECB yanıtında kur yok")
    t = {"baz": "EUR", "kaynak": "ECB", "tarih": datetime.date.fromisoformat(gun.get("time").strip()).isoformat(), "kurlar": {}}
    for c in gun:
        try:
            o = float(c.get("rate"))
        except (TypeError, ValueError):
            continue
        if o > 0 and c.get("currency"):
            t["kurlar"][c.get("currency")] = 1 / o
    if "AED" not in t["kurlar"] and "USD" in t["kurlar"]:
        t["kurlar"]["AED"] = t["kurlar"]["USD"] / AED_USD
        t["not"] = "AED: 1 USD = 3,6725 AED sabit kuru"
    if not t["kurlar"]:
        raise ValueError("ECB yanıtında kur yok")
    return t


def capraz(tablo, kaynak, hedef):
    """rate of 1 kaynak in hedef from one table (the base counts as 1), or None"""
    R = dict(tablo["kurlar"]); R[tablo["baz"]] = 1.0
    f, h = R.get(kaynak), R.get(hedef)
    if not f or not h:
        return None
    return 1.0 if kaynak == hedef else float(f"{f / h:.10g}")  # 10 significant digits, as hesap.js and kur.go


def main():
    cikti = sys.argv[1] if len(sys.argv) > 1 else "kur.json"
    istek = urllib.request.Request(ADRES, headers={"User-Agent": "YachtingJurnal-kur"})
    with urllib.request.urlopen(istek, timeout=20) as r:
        y = coz(r.read())
    try:  # the ECB is extra: without it the lira rates are still written
        istek = urllib.request.Request(ECB_ADRES, headers={"User-Agent": "YachtingJurnal-kur"})
        with urllib.request.urlopen(istek, timeout=20) as r:
            y["tablolar"]["ECB"] = coz_ecb(r.read())
    except Exception as e:  # noqa: BLE001
        print("ECB alınamadı:", e)
    with open(cikti, "w", encoding="utf-8") as f:
        json.dump(y, f, ensure_ascii=False, separators=(",", ":"))
    print("kur.json:", y["tarih"], " ".join(f'{k["kod"]} {k["alis"]}/{k["satis"]}' for k in y["kurlar"]))


if __name__ == "__main__":
    main()
