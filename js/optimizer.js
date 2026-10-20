/* Budget optimiser ("Fit my budget").
   Tries EVERY combination of one product per item slot (locked slots stay
   fixed), keeps the ones whose total is within the target budget, and ranks
   them by room fit (then by lower total). With 14-15 products in 5 slots this
   is 576,240 combinations, about 0.2 s, so we don't need a clever shortcut and
   the answer is exact for our catalogue. */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const S = SS.scoring;

  /* slots: [{slot, productId}] current plan; locked: Set of slot names;
     catalogueBySlot: {slot: [products]}; byId: {id: product} */
  function optimise({ slots, locked, catalogueBySlot, byId, budget, aesthetic, top = 3, qty = {} }) {
    const q = slots.map((s) => qty[s.slot] || 1);
    const options = slots.map((s) =>
      locked.has(s.slot) ? [byId[s.productId]] : catalogueBySlot[s.slot] || [byId[s.productId]]);
    // item fit is independent per item, so precompute it once
    const fitOf = new Map();
    options.flat().forEach((p) => fitOf.set(p.id, S.itemFit(p, aesthetic).fit ?? 0));
    const n = options.length;
    const idx = new Array(n).fill(0);
    let best = [], combos = 0, cheapest = Infinity;
    const keep = (combo, total, fit) => {
      best.push({ combo: combo.slice(), total, fit });
      best.sort((a, b) => b.fit - a.fit || a.total - b.total);
      if (best.length > top) best.pop();
    };
    for (;;) {
      combos++;
      let total = 0, fit = 0;
      const combo = idx.map((k, i) => options[i][k]);
      combo.forEach((p, i) => { total += p.price * q[i]; fit += fitOf.get(p.id); });
      cheapest = Math.min(cheapest, total);
      fit /= n;
      if (total <= budget && (best.length < top || fit > best[best.length - 1].fit ||
          (fit === best[best.length - 1].fit && total < best[best.length - 1].total))) keep(combo, total, fit);
      let i = n - 1;
      while (i >= 0 && ++idx[i] >= options[i].length) idx[i--] = 0;
      if (i < 0) break;
    }
    const current = slots.map((s) => byId[s.productId]);
    const currentFit = S.roomFit(current, aesthetic).raw;
    const plans = best.map((b) => {
      const changes = [];
      b.combo.forEach((p, i) => {
        const was = current[i];
        if (p.id !== was.id) changes.push({ slot: slots[i].slot, from: was, to: p, qty: q[i], priceDelta: (p.price - was.price) * q[i] });
      });
      return {
        items: b.combo, total: b.total, fit: b.fit, fitScore: S.round5(b.fit), changes,
        fitDelta: b.fit - currentFit,
        tradeoff: describe(changes, b.total, budget, b.fit - currentFit),
      };
    });
    return { plans, combos, cheapestPossible: cheapest, feasible: plans.length > 0, currentFit };
  }

  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  function describe(changes, total, budget, fitDelta) {
    if (!changes.length) return "Your current plan already fits: no changes needed.";
    const saved = changes.filter((c) => c.priceDelta < 0).map((c) => c.slot);
    const spent = changes.filter((c) => c.priceDelta > 0).map((c) => c.slot);
    const parts = [];
    if (saved.length) parts.push("saves on " + saved.join(", "));
    if (spent.length) parts.push("spends more on " + spent.join(", "));
    const fitTxt = Math.abs(fitDelta) < 0.025 ? "room fit about the same"
      : (fitDelta > 0 ? "room fit up " : "room fit down ") + Math.round(Math.abs(fitDelta) * 100) + " pts";
    return `${parts.join("; ")}. ${fitTxt}. ${inr(budget - total)} left of your budget.`;
  }

  SS.optimizer = { optimise };
})(typeof window !== "undefined" ? window : globalThis);
