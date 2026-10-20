// Unit tests for the calculations. Run:  node --test tests/
// They use small made-up fixtures (not the real catalogue) so each expected
// number can be worked out by hand.
const test = require("node:test");
const assert = require("node:assert/strict");
["color", "scoring", "modes", "optimizer", "plan"].forEach((m) => require(`../js/${m}.js`));
const { color, scoring: S, modes: M, optimizer: O, plan: P } = globalThis.SS;

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("CIEDE2000 matches published reference pairs (Sharma et al. 2005)", () => {
  near(color.deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]), 2.0425);
  near(color.deltaE2000([50, 0, 0], [50, -1, 2]), 2.3669);
  near(color.deltaE2000([50, 2.49, -0.001], [50, -2.49, 0.0009]), 7.1792); // hue wrap-around case
  near(color.deltaE2000([50, 2.5, 0], [73, 25, -18]), 27.1492);
  near(color.deltaE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387]), 1.2644);
  assert.equal(color.deltaEHex("#ffffff", "#ffffff"), 0);
  assert.equal(color.deltaEHex("nope", "#ffffff"), null);
});

const base = { id: "a", category: "rug", brand: "X", price: 1000, hex: "#c8a165", tags: ["natural", "warm"], material: "jute", pattern: "plain", finish: null };

test("per-quality similarity rules", () => {
  const b = { ...base, id: "b" };
  assert.equal(S.similarity("colour", base, b), 1);
  assert.equal(S.similarity("material", base, { ...b, material: "cotton" }), 0.6); // same family
  assert.equal(S.similarity("material", base, { ...b, material: "polyester" }), 0);
  assert.equal(S.similarity("material", { ...base, material: "cotton" }, { ...b, material: "cotton blend" }), 0.6);
  assert.equal(S.similarity("pattern", { ...base, pattern: "striped" }, { ...b, pattern: "geometric" }), 0.4);
  assert.equal(S.similarity("pattern", base, { ...b, pattern: "striped" }), 0);
  assert.equal(S.similarity("finish", base, b), null, "missing finish is unknown, not 0");
  assert.equal(S.similarity("price", base, { ...b, price: 800 }), 0.8);
  assert.equal(S.similarity("price", base, { ...b, price: 3000 }), 0, "floored at 0");
  assert.equal(S.similarity("style", base, { ...b, tags: ["natural", "boho"] }), 1 / 3);
});

test("item match: weighted average over kept + known qualities only", () => {
  const cand = { ...base, id: "c", price: 900, tags: ["natural", "boho"], material: "cotton" };
  const w = { style: 35, material: 20, pattern: 20, price: 15, finish: 10 };
  const r = S.itemMatch(base, cand, w, ["colour"]);
  // finish unknown -> excluded. (35*1/3 + 20*0.6 + 20*1 + 15*0.9) / 90
  const expected = (35 / 3 + 12 + 20 + 13.5) / 90;
  near(r.raw, expected);
  assert.equal(r.score, Math.round(expected * 20) / 20);
  near(r.coverage, 90 / 100);
  assert.equal(r.rows.find((x) => x.dim === "finish").status, "unknown");
  assert.equal(r.rows.find((x) => x.dim === "colour").status, "changed");
  assert.equal(r.lowData, false);
});

test("item match flags low data and never invents a score", () => {
  const bare = { id: "z", category: "rug", price: 500 };
  const r = S.itemMatch(base, bare, { style: 50, colour: 50 }, []);
  assert.equal(r.raw, null);
  assert.equal(r.score, null);
  assert.equal(r.lowData, true);
});

const aest = { palette: ["#c8a165"], tags: ["natural", "warm", "textured"] };
test("room fit: palette + style, averaged over items", () => {
  const items = [base, { ...base, id: "d", hex: "#ffffff", tags: ["modern"] }];
  const r = S.roomFit(items, aest);
  const p2 = Math.max(0, 1 - color.deltaEHex("#ffffff", "#c8a165") / 40);
  near(r.perItem[0].fit, 1);
  near(r.perItem[1].fit, (p2 + 0) / 2);
  near(r.raw, (1 + p2 / 2) / 2);
});

const cat = [
  { id: "r1", category: "rug", brand: "A", price: 1000, hex: "#c8a165", tags: ["natural", "warm"], material: "jute", pattern: "plain", finish: null },
  { id: "r2", category: "rug", brand: "A", price: 1100, hex: "#2f4f6f", tags: ["natural", "warm"], material: "jute", pattern: "plain", finish: null },
  { id: "r3", category: "rug", brand: "B", price: 600, hex: "#c39a60", tags: ["natural"], material: "cotton", pattern: "striped", finish: null },
  { id: "r4", category: "rug", brand: "B", price: 3000, hex: "#c8a165", tags: ["modern", "bold"], material: "wool", pattern: "geometric", finish: null },
  { id: "l1", category: "lamp", brand: "A", price: 2000, hex: "#ffffff", tags: ["minimal"], material: "metal", pattern: "plain", finish: "matt" },
  { id: "l2", category: "lamp", brand: "C", price: 900, hex: "#d9b77a", tags: ["natural", "warm"], material: "bamboo", pattern: "plain", finish: "natural" },
];
const byId = Object.fromEntries(cat.map((p) => [p.id, p]));
const ctx = { catalogue: cat, planItems: [byId.r1, byId.l1], aesthetic: aest, limit: 700 };
const ids = (res) => res.map((r) => r.product.id).sort();

test("mode filters", () => {
  assert.deepEqual(ids(M.alternatives("colour", byId.r1, ctx)), ["r2"]);
  assert.deepEqual(ids(M.alternatives("cheaper", byId.r1, ctx)), ["r3"]);
  assert.deepEqual(ids(M.alternatives("brand", byId.r1, ctx)), ["r3", "r4"]);
  assert.deepEqual(ids(M.alternatives("aesthetic", byId.r1, ctx)), ["r4"]);
  assert.deepEqual(ids(M.alternatives("material", byId.r1, ctx)), ["r3", "r4"]);
  assert.deepEqual(ids(M.alternatives("pattern", byId.r1, ctx)), ["r3", "r4"]);
  assert.deepEqual(ids(M.alternatives("finish", byId.r1, ctx)), [], "finish unknown -> no fake matches");
  assert.deepEqual(ids(M.alternatives("budget", byId.r1, ctx)), ["r3"]);
  assert.deepEqual(ids(M.alternatives("finish", byId.l1, ctx)), ["l2"]);
  assert.ok(M.alternatives("colour", byId.r1, ctx).every((r) => r.product.category === "rug"), "same category only");
});

test("relaxed colour rule is only a looser price window", () => {
  const far = { ...byId.r2, id: "r5", price: 1350 }; // colour differs, 35% dearer
  const c2 = { ...ctx, catalogue: [...cat, far] };
  assert.ok(!M.alternatives("colour", byId.r1, c2).some((r) => r.product.id === "r5"));
  assert.ok(M.alternatives("colour", byId.r1, c2, true).some((r) => r.product.id === "r5"));
  assert.ok(!M.alternatives("colour", byId.r1, c2, true).some((r) => r.product.id === "r3"), "similar colour still excluded");
});

test("every mode excludes the changed quality and has weights summing to 100", () => {
  M.MODES.forEach((m) => {
    assert.equal(Object.values(m.weights).reduce((a, b) => a + b, 0), 100, m.id);
    m.changes.forEach((d) => assert.ok(!(d in m.weights), `${m.id} weights include changed ${d}`));
  });
  assert.equal(M.MODES.length, 8);
});

test("room fit after a swap only changes the swapped item", () => {
  const [res] = M.alternatives("colour", byId.r1, ctx);
  assert.equal(res.roomAfter.perItem[1].fit, res.roomBefore.perItem[1].fit);
  assert.notEqual(res.roomAfter.perItem[0].fit, res.roomBefore.perItem[0].fit);
});

test("sorting", () => {
  const res = M.alternatives("brand", byId.r1, ctx);
  assert.deepEqual(M.sortResults(res, "priceAsc").map((r) => r.product.id), ["r3", "r4"]);
  assert.deepEqual(M.sortResults(res, "priceDesc").map((r) => r.product.id), ["r4", "r3"]);
  assert.deepEqual(M.sortResults(res, "priority:colour", byId.r1).map((r) => r.product.id), ["r4", "r3"]);
  const m = M.sortResults(res, "match");
  assert.ok(m[0].match.raw >= m[1].match.raw);
});

const defaults = { aesthetic: "cosy", budget: 3000, items: { rug: "r1", lamp: "l1" }, locked: [], bought: [] };
test("swap changes exactly one slot and refuses locked slots", () => {
  const s2 = P.swap(defaults, "rug", "r2");
  assert.deepEqual(s2.items, { rug: "r2", lamp: "l1" });
  assert.deepEqual(defaults.items, { rug: "r1", lamp: "l1" }, "original untouched (undo works)");
  const locked = P.toggle(defaults, "locked", "rug");
  assert.throws(() => P.swap(locked, "rug", "r2"), /locked/);
  assert.equal(P.total(s2, byId), 3100);
});

test("optimiser: exact best within budget, respects locks", () => {
  const slots = [{ slot: "rug", productId: "r1" }, { slot: "lamp", productId: "l1" }];
  const catalogueBySlot = { rug: cat.filter((p) => p.category === "rug"), lamp: cat.filter((p) => p.category === "lamp") };
  const r = O.optimise({ slots, locked: new Set(), catalogueBySlot, byId, budget: 2000, aesthetic: aest });
  // brute-force check
  let best = -1;
  for (const a of catalogueBySlot.rug) for (const b of catalogueBySlot.lamp) {
    if (a.price + b.price > 2000) continue;
    best = Math.max(best, S.roomFit([a, b], aest).raw);
  }
  near(r.plans[0].fit, best);
  assert.ok(r.plans.every((p) => p.total <= 2000));
  const rl = O.optimise({ slots, locked: new Set(["lamp"]), catalogueBySlot, byId, budget: 3100, aesthetic: aest });
  assert.ok(rl.plans.every((p) => p.items[1].id === "l1"), "locked lamp kept");
  const none = O.optimise({ slots, locked: new Set(["lamp"]), catalogueBySlot, byId, budget: 500, aesthetic: aest });
  assert.equal(none.feasible, false);
  assert.equal(none.cheapestPossible, 2600);
});

test("saved versions survive a reload; bad data is repaired", () => {
  const mem = {};
  const ls = { setItem: (k, v) => (mem[k] = String(v)), getItem: (k) => mem[k] ?? null, removeItem: (k) => delete mem[k] };
  const st = P.makeStore(ls);
  assert.equal(st.persistent, true);
  st.saveVersion("Cheaper rug", P.swap(defaults, "rug", "r3"));
  const st2 = P.makeStore(ls); // "refresh"
  const v = st2.listVersions();
  assert.equal(v.length, 1);
  assert.equal(v[0].state.items.rug, "r3");
  const fixed = P.validate({ items: { rug: "nope", lamp: "r1" }, budget: "abc", locked: ["rug", "x"] }, defaults, byId, { cosy: {} });
  assert.deepEqual(fixed.items, defaults.items, "unknown or wrong-category ids fall back");
  assert.deepEqual(fixed.locked, ["rug"]);
  assert.equal(fixed.budget, 3000);
  const blocked = P.makeStore({ setItem() { throw new Error("blocked"); }, getItem: () => null, removeItem() {} });
  assert.equal(blocked.persistent, false, "reports when saving is only in memory");
});
