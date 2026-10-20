/* The two scores.

   1) ITEM MATCH  "How close is this product to the one you have now,
      in the qualities you asked to keep?"
        item match = Σ (weight × similarity) / Σ weight
      summed only over the qualities the chosen mode KEEPS and that BOTH
      products have data for. The quality the mode changes is left out
      (it is meant to be different). Missing data is "not verified",
      never guessed.

   2) ROOM FIT  "After the swap, how well does the whole room hang
      together with the chosen room style?"
        item fit  = 0.5 × palette fit + 0.5 × style fit
        palette fit = max(0, 1 − ΔE00(item colour, nearest room-palette colour) / 40)
        style fit   = share of the item's style tags that belong to the room style
        room fit  = average item fit over all items in the plan

   Both are rounded to the nearest 5% for display, because the inputs
   (colour names turned into approximate hex, hand-assigned style tags)
   are not precise enough to justify "83.7%". */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const C = SS.color;

  const DIMS = ["colour", "style", "material", "pattern", "finish", "price"];
  const DIM_LABEL = {
    colour: "Colour", style: "Style", material: "Material",
    pattern: "Pattern", finish: "Finish (base/frame)", price: "Price", brand: "Brand",
  };
  const COLOUR_RANGE = 40; // ΔE00 at which colour similarity reaches 0

  const MATERIAL_FAMILY = {
    cotton: "natural fibre", linen: "natural fibre", jute: "natural fibre", wool: "natural fibre",
    bamboo: "natural fibre", seagrass: "natural fibre", silk: "natural fibre", sisal: "natural fibre",
    polyester: "synthetic", polypropylene: "synthetic", nylon: "synthetic", acrylic: "synthetic",
    microfibre: "synthetic", velvet: "synthetic", mesh: "synthetic", leatherette: "synthetic",
    "cotton blend": "natural fibre", fabric: "upholstery", wood: "wood", metal: "metal", aluminium: "metal", steel: "metal",
    plastic: "plastic", pvc: "plastic", ceramic: "ceramic", glass: "glass", paper: "paper",
  };

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const round5 = (x) => (x == null ? null : Math.round(x * 20) / 20);
  const has = (v) => v !== null && v !== undefined && v !== "";

  function tagShare(tags, target) {
    if (!tags || !tags.length || !target || !target.length) return null;
    const t = new Set(target);
    return tags.filter((x) => t.has(x)).length / tags.length;
  }
  function jaccard(a, b) {
    if (!a || !a.length || !b || !b.length) return null;
    const A = new Set(a), B = new Set(b);
    let inter = 0;
    A.forEach((x) => B.has(x) && inter++);
    return inter / (A.size + B.size - inter);
  }

  /* Similarity of ONE quality between two products, 0..1, or null if unknown. */
  function similarity(dim, a, b) {
    switch (dim) {
      case "colour": {
        if (!has(a.hex) || !has(b.hex)) return null;
        return clamp01(1 - C.deltaEHex(a.hex, b.hex) / COLOUR_RANGE);
      }
      case "style":
        return jaccard(a.tags, b.tags);
      case "material": {
        if (!has(a.material) || !has(b.material)) return null;
        if (a.material === b.material) return 1;
        const fa = MATERIAL_FAMILY[a.material], fb = MATERIAL_FAMILY[b.material];
        return fa && fa === fb ? 0.6 : 0;
      }
      case "pattern": {
        if (!has(a.pattern) || !has(b.pattern)) return null;
        if (a.pattern === b.pattern) return 1;
        return a.pattern !== "plain" && b.pattern !== "plain" ? 0.4 : 0;
      }
      case "finish":
        if (!has(a.finish) || !has(b.finish)) return null;
        return a.finish === b.finish ? 1 : 0;
      case "price":
        if (!(a.price > 0) || !(b.price > 0)) return null;
        return clamp01(1 - Math.abs(b.price - a.price) / a.price);
      default:
        return null;
    }
  }

  /* weights: {dim: weight} for the KEPT qualities. changed: list of dims the mode changes. */
  function itemMatch(orig, cand, weights, changed) {
    const rows = [];
    let wSum = 0, wKnown = 0, acc = 0;
    Object.keys(weights).forEach((dim) => {
      const w = weights[dim];
      const s = similarity(dim, orig, cand);
      wSum += w;
      if (s === null) rows.push({ dim, weight: w, sim: null, status: "unknown" });
      else {
        wKnown += w;
        acc += w * s;
        rows.push({ dim, weight: w, sim: s, status: "kept" });
      }
    });
    (changed || []).forEach((dim) =>
      rows.push({ dim, weight: 0, sim: similarity(dim, orig, cand), status: "changed" }));
    const raw = wKnown > 0 ? acc / wKnown : null;
    const coverage = wSum > 0 ? wKnown / wSum : 0;
    return { raw, score: round5(raw), coverage, lowData: coverage < 0.5, rows };
  }

  function itemFit(item, aesthetic) {
    let palette = null;
    if (has(item.hex) && aesthetic.palette && aesthetic.palette.length) {
      const d = Math.min(...aesthetic.palette.map((p) => C.deltaEHex(item.hex, p)));
      palette = clamp01(1 - d / COLOUR_RANGE);
    }
    const style = tagShare(item.tags, aesthetic.tags);
    const parts = [palette, style].filter((v) => v !== null);
    const fit = parts.length ? parts.reduce((s, v) => s + v, 0) / parts.length : null;
    return { palette, style, fit };
  }

  /* items: array of products currently in the plan. */
  function roomFit(items, aesthetic) {
    const per = items.map((it) => Object.assign({ id: it.id, category: it.category }, itemFit(it, aesthetic)));
    const known = per.filter((p) => p.fit !== null);
    const avg = (k) => {
      const v = per.filter((p) => p[k] !== null);
      return v.length ? v.reduce((s, p) => s + p[k], 0) / v.length : null;
    };
    const raw = known.length ? known.reduce((s, p) => s + p.fit, 0) / known.length : null;
    return { raw, score: round5(raw), palette: avg("palette"), style: avg("style"), perItem: per };
  }

  const pct = (x) => (x == null ? "–" : Math.round(x * 100) + "%");

  SS.scoring = { DIMS, DIM_LABEL, MATERIAL_FAMILY, COLOUR_RANGE, similarity, itemMatch, itemFit,
    roomFit, round5, jaccard, tagShare, pct };
})(typeof window !== "undefined" ? window : globalThis);
