/* Yachting Jurnal — the program's Google client for Drive synchronisation (filled in when the program is published).
   istemci: OAuth client ID ("TVs and Limited Input devices"); gizli: its client secret, base64-encoded.
   For this kind of client Google does not treat the secret as confidential; it only identifies the program.
   lisans: address of the access server (yonetim/Kod.gs published as a web app); empty = no access check. */
window.KJ_GOOGLE = {
  istemci: "105192108390-b5nvfj5pfhaqcvb6arv80a77eg4bmenv.apps.googleusercontent.com",
  gizli: "R09DU1BYLTdlbUN0QXF5SDEyWHJCeDdKUmdPeG1rSU5rNUw=",
  kapsam: "https://www.googleapis.com/auth/drive.file email",
  lisans: "https://script.google.com/macros/s/AKfycbyu_Cg39xjn6gd743RT-A9Sip3R0Jd2s5UfaaXyrUFhnTlnLDLpIkKyIzgE0p7QtwAA/exec"
};
