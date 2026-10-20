/* Live colour preview on the room image.
   For each item outline (mask) we take the photo, replace its colour
   (hue + saturation) with the product's colour while keeping the photo's
   light and shadow (canvas "color" blend mode), and draw it back only
   inside the outline. It is a quick colour preview, not a photorealistic
   render: texture, pattern and shape do not change. */
(function (root) {
  const SS = (root.SS = root.SS || {});

  function tracePath(ctx, shape, W, H) {
    ctx.beginPath();
    if (shape.type === "ellipse") {
      ctx.ellipse(shape.cx * W / 100, shape.cy * H / 100, shape.rx * W / 100, shape.ry * H / 100, 0, 0, Math.PI * 2);
    } else {
      shape.pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x * W / 100, y * H / 100));
      ctx.closePath();
    }
  }

  function makeLayer(W, H) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    return c;
  }

  /* canvas: the overlay <canvas> sitting exactly over the <img>.
     img: the loaded room image. tints: [{mask, hex}] */
  function render(canvas, img, tints) {
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (!img.complete || !img.naturalWidth) return;
    tints.forEach(({ mask, hex }) => {
      if (!hex) return;
      // 1. the outline as a white shape (additions) minus subtractions
      const m = makeLayer(W, H), mc = m.getContext("2d");
      mc.fillStyle = "#fff";
      mask.filter((s) => s.op !== "sub").forEach((s) => { tracePath(mc, s, W, H); mc.fill(); });
      mc.globalCompositeOperation = "destination-out";
      mask.filter((s) => s.op === "sub").forEach((s) => { tracePath(mc, s, W, H); mc.fill(); });
      // 2. the recoloured photo
      const t = makeLayer(W, H), tc = t.getContext("2d");
      tc.drawImage(img, 0, 0, W, H);
      tc.globalCompositeOperation = "color";
      tc.fillStyle = hex;
      tc.fillRect(0, 0, W, H);
      // 3. keep only the part inside the outline
      tc.globalCompositeOperation = "destination-in";
      tc.drawImage(m, 0, 0);
      ctx.drawImage(t, 0, 0);
    });
  }

  SS.recolor = { render };
})(typeof window !== "undefined" ? window : globalThis);
