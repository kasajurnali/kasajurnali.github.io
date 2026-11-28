/* Yachting Jurnal — fiyat gösterimi (fiyat sayfası ve ödeme sayfası). Para birimi seçimi, tutar yazımı, deneme ve Paddle notu (7 dil).
   Tutarlar küçük birim (kuruş / euro sent) tamsayıdır; yazarken kayan nokta kullanılmaz.
   KJ.fiyat.birim({dil, bolge}) → "TRY" (arayüz dili Türkçe ya da tarayıcı bölgesi TR) ya da "EUR".
   KJ.fiyat.yaz(tutar, birim, dil) → "1,99 €" / "€1.99" / "99 TL". */
(function (g) {
  "use strict";
  const KJ = g.KJ = g.KJ || {};
  const DENEME_GUN = 30;
  const DILLER = ["tr", "en", "fr", "it", "es", "de", "el"];
  const NOT = {
    tr: "Ödeme sırasında Paddle yerel para birimini ve vergiyi gösterir; son fiyat ödeme ekranındadır.",
    en: "At checkout Paddle shows the local currency and tax; the final price is on the payment screen.",
    fr: "Au paiement, Paddle affiche la devise locale et la taxe ; le prix final figure sur l’écran de paiement.",
    it: "Al pagamento Paddle mostra la valuta locale e le imposte; il prezzo finale è nella schermata di pagamento.",
    es: "Al pagar, Paddle muestra la moneda local y el impuesto; el precio final está en la pantalla de pago.",
    de: "Beim Bezahlen zeigt Paddle die Landeswährung und die Steuer an; der endgültige Preis steht auf dem Zahlungsbildschirm.",
    el: "Κατά την πληρωμή το Paddle εμφανίζει το τοπικό νόμισμα και τον φόρο· η τελική τιμή βρίσκεται στην οθόνη πληρωμής."
  };
  const DENEME = {
    tr: "Ücretli paketlerde {gun} gün ücretsiz deneme.",
    en: "{gun}-day free trial on the paid plans.",
    fr: "Essai gratuit de {gun} jours sur les forfaits payants.",
    it: "Prova gratuita di {gun} giorni sui piani a pagamento.",
    es: "Prueba gratuita de {gun} días en los planes de pago.",
    de: "{gun} Tage kostenlos testen bei den kostenpflichtigen Paketen.",
    el: "Δωρεάν δοκιμή {gun} ημερών στα επί πληρωμή πακέτα."
  };
  const taban = s => String(s || "").toLowerCase().split(/[-_]/)[0];
  const dilKodu = d => { const k = taban(d); return DILLER.includes(k) ? k : "en"; };
  const bolgeKodu = b => { const m = String(b || "").toUpperCase().match(/(?:^|[-_])([A-Z]{2})$/); return m ? m[1] : String(b || "").toUpperCase(); };

  function birim(o) {
    o = o || {};
    return taban(o.dil) === "tr" || bolgeKodu(o.bolge) === "TR" ? "TRY" : "EUR";
  }
  // tamsayı küçük birimden metin; EUR: tr/fr/it/es/de/el "1,99 €", en "€1.99"; TRY: "99 TL", "1.490 TL"
  function yaz(tutar, b, dil) {
    const n = Math.round(Number(tutar) || 0), tam = Math.floor(n / 100), kus = n % 100;
    const bin = (x, ay) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ay);
    if (b === "TRY") return bin(tam, ".") + (kus ? "," + String(kus).padStart(2, "0") : "") + " TL";
    const en = taban(dil) === "en";
    const s = en ? bin(tam, ",") + "." + String(kus).padStart(2, "0") : bin(tam, ".") + "," + String(kus).padStart(2, "0");
    return en ? "€" + s : s + " €";
  }
  const paddleNotu = dil => NOT[dilKodu(dil)];
  const denemeMetni = (dil, gun) => DENEME[dilKodu(dil)].replace("{gun}", String(gun || DENEME_GUN));


  // "about 2 months saving" on the yearly price (no "free": the yearly price is 10 times the monthly one, rounded)
  const AVANTAJ = {
    tr: "yaklaşık 2 ay avantaj", en: "about 2 months saving", fr: "environ 2 mois d’économie", it: "circa 2 mesi di risparmio",
    es: "unos 2 meses de ahorro", de: "ca. 2 Monate sparen", el: "εξοικονόμηση περίπου 2 μηνών"
  };
  // tax line: with TL (Turkey) "VAT included"; with euro Paddle shows the tax on the payment screen
  const VERGI = {
    TRY: {
      tr: "Fiyatlara KDV dâhildir.", en: "Prices include VAT.", fr: "Les prix incluent la TVA.", it: "I prezzi includono l’IVA.",
      es: "Los precios incluyen el IVA.", de: "Die Preise enthalten die Mehrwertsteuer.", el: "Οι τιμές περιλαμβάνουν ΦΠΑ."
    },
    EUR: {
      tr: "Vergi, ödeme ekranında Paddle tarafından gösterilir.", en: "Tax is shown by Paddle on the payment screen.",
      fr: "La taxe est affichée par Paddle sur l’écran de paiement.", it: "Le imposte sono mostrate da Paddle nella schermata di pagamento.",
      es: "El impuesto lo muestra Paddle en la pantalla de pago.", de: "Die Steuer wird von Paddle auf dem Zahlungsbildschirm angezeigt.",
      el: "Ο φόρος εμφανίζεται από το Paddle στην οθόνη πληρωμής."
    }
  };
  // labels of the pricing and payment pages (the cards themselves are Turkish and English; other languages use these)
  const M = {
    ucretsiz: { tr: "Ücretsiz", en: "Free", fr: "Gratuit", it: "Gratuito", es: "Gratis", de: "Kostenlos", el: "Δωρεάν" },
    f1: { tr: "Tek tekne", en: "One boat", fr: "Un seul bateau", it: "Una sola barca", es: "Un solo barco", de: "Ein Boot", el: "Ένα σκάφος" },
    f2: { tr: "Kasa defteri, harcama ve gelen para (kısıtlı)", en: "Cash book, expenses and money in (limited)", fr: "Livre de caisse, dépenses et encaissements (limité)", it: "Libro cassa, spese ed entrate (limitato)", es: "Libro de caja, gastos e ingresos (limitado)", de: "Kassenbuch, Ausgaben und Einnahmen (eingeschränkt)", el: "Βιβλίο ταμείου, δαπάνες και εισπράξεις (περιορισμένο)" },
    aylik: { tr: "Aylık al", en: "Monthly", fr: "Mensuel", it: "Mensile", es: "Mensual", de: "Monatlich", el: "Μηνιαία" },
    yillik: { tr: "Yıllık al", en: "Yearly", fr: "Annuel", it: "Annuale", es: "Anual", de: "Jährlich", el: "Ετήσια" },
    yakinda: { tr: "Yakında", en: "Coming soon", fr: "Bientôt disponible", it: "Prossimamente", es: "Próximamente", de: "Demnächst", el: "Σύντομα" },
    yaz: { tr: "kasajurnali@gmail.com adresine yazın", en: "write to kasajurnali@gmail.com", fr: "écrivez à kasajurnali@gmail.com", it: "scrivete a kasajurnali@gmail.com", es: "escriba a kasajurnali@gmail.com", de: "schreiben Sie an kasajurnali@gmail.com", el: "γράψτε στο kasajurnali@gmail.com" },
    ay: { tr: "ay", en: "month", fr: "mois", it: "mese", es: "mes", de: "Monat", el: "μήνα" },
    gHesapVar: { tr: "Paket şu Google hesabına açılacak:", en: "The plan will be opened for this Google account:", fr: "Le forfait sera ouvert pour ce compte Google :", it: "Il piano sarà attivato per questo account Google:", es: "El plan se activará para esta cuenta de Google:", de: "Das Paket wird für dieses Google-Konto freigeschaltet:", el: "Το πακέτο θα ενεργοποιηθεί για αυτόν τον λογαριασμό Google:" },
    gHesapSor: { tr: "Paketin açılacağı Google hesabı (uygulamada oturum açtığınız e-posta):", en: "Google account the plan will be opened for (the e-mail you sign in with in the app):", fr: "Compte Google pour lequel le forfait sera ouvert (l’e-mail de connexion dans l’application) :", it: "Account Google per cui attivare il piano (l’e-mail con cui accedete all’app):", es: "Cuenta de Google para la que se activará el plan (el correo con el que inicia sesión en la app):", de: "Google-Konto, für das das Paket freigeschaltet wird (die E-Mail der App-Anmeldung):", el: "Λογαριασμός Google για τον οποίο θα ενεργοποιηθεί το πακέτο (το e-mail σύνδεσης στην εφαρμογή):" },
    epHata: { tr: "Google hesabınızın e-posta adresini yazın.", en: "Enter the e-mail address of your Google account.", fr: "Saisissez l’adresse e-mail de votre compte Google.", it: "Inserite l’indirizzo e-mail del vostro account Google.", es: "Escriba el correo electrónico de su cuenta de Google.", de: "Geben Sie die E-Mail-Adresse Ihres Google-Kontos ein.", el: "Γράψτε το e-mail του λογαριασμού Google σας." },
    abonelik: { tr: "abonelik", en: "subscription", fr: "abonnement", it: "abbonamento", es: "suscripción", de: "Abonnement", el: "συνδρομή" },
    donemAylik: { tr: "aylık", en: "monthly", fr: "mensuel", it: "mensile", es: "mensual", de: "monatlich", el: "μηνιαία" },
    donemYillik: { tr: "yıllık", en: "yearly", fr: "annuel", it: "annuale", es: "anual", de: "jährlich", el: "ετήσια" },
    yakindaOdeme: { tr: "Çevrimiçi ödeme çok yakında açılacak. Şimdilik kasajurnali@gmail.com adresine yazın.", en: "Online payment opens very soon. For now write to kasajurnali@gmail.com.", fr: "Le paiement en ligne ouvrira très bientôt. Pour l’instant, écrivez à kasajurnali@gmail.com.", it: "Il pagamento online aprirà a breve. Per ora scrivete a kasajurnali@gmail.com.", es: "El pago en línea se abrirá muy pronto. Por ahora escriba a kasajurnali@gmail.com.", de: "Die Online-Zahlung startet in Kürze. Schreiben Sie vorerst an kasajurnali@gmail.com.", el: "Η ηλεκτρονική πληρωμή ανοίγει πολύ σύντομα. Προς το παρόν γράψτε στο kasajurnali@gmail.com." }
  };
  // locales Paddle.js accepts for the checkout; any other language falls back to English
  const PADDLE_DILLER = ["ar", "zh-Hans", "zh-Hant", "nl", "en", "fr", "de", "id", "it", "ja", "ko", "pl", "pt", "ru", "es", "es-419", "sv", "th", "tr", "vi", "hu", "cs"];
  function paddleLocale(d) {
    const x = String(d || "").replace("_", "-"), b = taban(x);
    const tam = PADDLE_DILLER.find(k => k.toLowerCase() === x.toLowerCase());
    if (tam) return tam;
    return b !== "zh" && PADDLE_DILLER.includes(b) ? b : "en";
  }
  const metin = (anahtar, dil) => (M[anahtar] || {})[dilKodu(dil)] || (M[anahtar] || {}).en || "";
  const avantaj = dil => AVANTAJ[dilKodu(dil)];
  const vergiNotu = (b, dil) => VERGI[b === "TRY" ? "TRY" : "EUR"][dilKodu(dil)];

  KJ.fiyat = { DENEME_GUN, DILLER, birim, yaz, paddleNotu, denemeMetni, dilKodu, avantaj, vergiNotu, metin, paddleLocale };
})(typeof window !== "undefined" ? window : globalThis);
