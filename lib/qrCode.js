import QRCode from "qrcode";

// A small solid-white-background QR so it drops cleanly onto either the
// SVG/PNG export (via <image>) or the PDF export (via embedPng) without
// worrying about alpha compositing against whatever sits behind it.
export function qrPngBuffer(text, size = 200) {
  return QRCode.toBuffer(text, {
    width: size,
    margin: 1,
    color: { dark: "#171512", light: "#FFFFFFFF" },
  });
}
