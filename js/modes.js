/* The 8 ways to change one item.
   Each mode says:
     - which quality it CHANGES (that quality is excluded from item match)
     - a FILTER: which catalogue products count as valid alternatives
     - WEIGHTS for the qualities it KEEPS (higher = matters more)
   Only products in the same category as the selected item are considered. */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const S = SS.scoring;
  const known = (v) => v !== null && v !== undefined && v !== "";

  const MODES = [
    {
      id: "colour", label: "New colour, same price", primary: true, changes: ["colour"],
      rule: "Colour clearly different (ΔE00 ≥ 15), price within ±15%",
      weights: { style: 35, material: 20, pattern: 20, price: 15, finish: 10 },
      filter: (o, c) => {
        const d = SS.color.deltaEHex(o.hex, c.hex);
        return d !== null && d >= 15 && Math.abs(c.price - o.price) <= 0.15 * o.price;
      },
      // used only when nothing meets the strict rule, and always labelled as looser
      relax: {
        rule: "Colour clearly different, price within ±40%",
        filter: (o, c) => {
          const d = SS.color.deltaEHex(o.hex, c.hex);
          return d !== null && d >= 15 && Math.abs(c.price - o.price) <= 0.4 * o.price;
        },
      },
    },
    {
      id: "cheaper", label: "Cheaper, same look", primary: true, changes: ["price"],
      rule: "Costs less than your current item",
      weights: { style: 35, colour: 30, material: 15, pattern: 10, finish: 10 },
      filter: (o, c) => c.price < o.price,
    },
    {
      id: "brand", label: "Other brand, same design", primary: true, changes: ["brand"],
      rule: "Made by a different brand",
      weights: { style: 30, colour: 20, pattern: 20, material: 15, price: 10, finish: 5 },
      filter: (o, c) => known(c.brand) && c.brand !== o.brand,
    },
    {
      id: "aesthetic", label: "New style, same vibe", primary: true, changes: ["style"],
      rule: "Style tags mostly different (overlap below 50%), colour mood kept",
      weights: { colour: 55, price: 25, material: 20 },
      filter: (o, c) => {
        const j = S.jaccard(o.tags, c.tags);
        return j !== null && j < 0.5;
      },
    },
    {
      id: "material", label: "Different material", primary: false, changes: ["material"],
      rule: "Main material is known and different",
      weights: { colour: 35, style: 30, price: 20, pattern: 15 },
      filter: (o, c) => known(o.material) && known(c.material) && o.material !== c.material,
    },
    {
      id: "pattern", label: "Different pattern", primary: false, changes: ["pattern"],
      rule: "Pattern is known and different",
      weights: { colour: 35, style: 30, price: 20, material: 15 },
      filter: (o, c) => known(o.pattern) && known(c.pattern) && o.pattern !== c.pattern,
    },
    {
      id: "finish", label: "Different finish", primary: false, changes: ["finish"],
      rule: "Finish is known and different",
      weights: { colour: 35, style: 30, price: 20, material: 15 },
      filter: (o, c) => known(o.finish) && known(c.finish) && o.finish !== c.finish,
    },
    {
      id: "budget", label: "Under my limit", primary: false, changes: ["price"],
      rule: "Price at or below the limit you set",
      weights: { style: 35, colour: 30, material: 15, pattern: 10, finish: 10 },
      filter: (o, c, ctx) => c.price <= ((ctx && ctx.limit) || o.price),
    },
  ];
  const byId = Object.fromEntries(MODES.map((m) => [m.id, m]));

  /* Returns scored alternatives for `orig` under `modeId`.
     ctx = { catalogue, planItems (array of current products), aesthetic, limit } */
  function alternatives(modeId, orig, ctx, relaxed) {
    const mode = byId[modeId];
    if (!mode) throw new Error("unknown mode " + modeId);
    const filter = relaxed && mode.relax ? mode.relax.filter : mode.filter;
    const before = S.roomFit(ctx.planItems, ctx.aesthetic);
    return ctx.catalogue
      .filter((c) => c.category === orig.category && c.id !== orig.id && filter(orig, c, ctx))
      .map((c) => {
        const match = S.itemMatch(orig, c, mode.weights, mode.changes);
        const after = S.roomFit(ctx.planItems.map((p) => (p.id === orig.id ? c : p)), ctx.aesthetic);
        return { product: c, match, roomBefore: before, roomAfter: after };
      });
  }

  const SORTS = {
    match: { label: "Best item match", fn: (a, b) => (b.match.raw ?? -1) - (a.match.raw ?? -1) },
    room: { label: "Best room fit", fn: (a, b) => (b.roomAfter.raw ?? -1) - (a.roomAfter.raw ?? -1) },
    priceAsc: { label: "Price: low to high", fn: (a, b) => a.product.price - b.product.price },
    priceDesc: { label: "Price: high to low", fn: (a, b) => b.product.price - a.product.price },
  };

  /* "My priority" sort: rank by similarity on one quality the user cares about. */
  function prioritySort(dim, orig) {
    return (a, b) => {
      const sa = dim === "price" ? -a.product.price : S.similarity(dim, orig, a.product);
      const sb = dim === "price" ? -b.product.price : S.similarity(dim, orig, b.product);
      return (sb ?? -Infinity) - (sa ?? -Infinity);
    };
  }

  function sortResults(results, sortId, orig) {
    const out = results.slice();
    const tiebreak = (a, b) => (b.match.raw ?? -1) - (a.match.raw ?? -1) || a.product.price - b.product.price;
    if (sortId && sortId.startsWith("priority:")) {
      const f = prioritySort(sortId.slice(9), orig);
      return out.sort((a, b) => f(a, b) || tiebreak(a, b));
    }
    const s = SORTS[sortId] || SORTS.match;
    return out.sort((a, b) => s.fn(a, b) || tiebreak(a, b));
  }

  SS.modes = { MODES, byId, alternatives, SORTS, sortResults };
})(typeof window !== "undefined" ? window : globalThis);
