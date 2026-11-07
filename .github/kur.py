"""TCMB today.xml -> kur.json for the iPhone app's rate strip (the iPhone cannot read TCMB directly).

Runs in the public site's GitHub Actions on working days after TCMB publishes, and once from build.sh.
The JSON has the same shape as the Windows program's api/kur answer (app/kur.go).

usage: python3 kur.py [output.json]
"""
import datetime, json, sys, urllib.request
import xml.etree.ElementTree as ET

ADRES = "https://www.tcmb.gov.tr/kurlar/today.xml"
KODLAR = ["USD", "EUR", "GBP", "CHF"]


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
    return y


def main():
    cikti = sys.argv[1] if len(sys.argv) > 1 else "kur.json"
    istek = urllib.request.Request(ADRES, headers={"User-Agent": "YachtingJurnal-kur"})
    with urllib.request.urlopen(istek, timeout=20) as r:
        y = coz(r.read())
    with open(cikti, "w", encoding="utf-8") as f:
        json.dump(y, f, ensure_ascii=False, separators=(",", ":"))
    print("kur.json:", y["tarih"], " ".join(f'{k["kod"]} {k["alis"]}/{k["satis"]}' for k in y["kurlar"]))


if __name__ == "__main__":
    main()
