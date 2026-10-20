/* Colour maths.
   We compare colours with CIEDE2000 (ΔE00), the standard formula for
   "how different do two colours look to a person". 0 = identical,
   about 2 = barely noticeable, 10+ = clearly different, 40+ = unrelated.
   Works in the browser (window.SS) and in Node tests (globalThis.SS). */
(function (root) {
  const SS = (root.SS = root.SS || {});

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToLab([r, g, b]) {
    // sRGB -> linear -> XYZ (D65) -> CIELAB
    const lin = (c) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
    const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
    const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function hexToLab(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToLab(rgb) : null;
  }

  // CIEDE2000, following Sharma, Wu & Dalal (2005).
  function deltaE2000(lab1, lab2) {
    const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const hp = (a, b) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) * deg + 360) % 360);
    const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
      else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) +
      0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh));
  }

  function deltaEHex(h1, h2) {
    const a = hexToLab(h1), b = hexToLab(h2);
    return a && b ? deltaE2000(a, b) : null;
  }

  SS.color = { hexToRgb, rgbToLab, hexToLab, deltaE2000, deltaEHex };
})(typeof window !== "undefined" ? window : globalThis);
