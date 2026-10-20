/* The Reality Plan: which product is chosen for each slot, which slots are
   locked, which items are ticked off as bought, and saved versions.

   State is a plain object so it can be saved as JSON:
     { aesthetic, budget, items: {slot: productId}, locked: [slot], bought: [slot] }

   Every change returns a NEW state object (the old one is left untouched).
   That makes undo easy and makes "only one item changed" easy to test.

   Saving uses the browser's localStorage. Limits (also shown in the app):
   versions live in this browser on this device only; clearing site data or
   a private window loses them; nothing is uploaded anywhere. */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const KEY_CURRENT = "styleswap.current.v1";
  const KEY_VERSIONS = "styleswap.versions.v1";

  const clone = (s) => JSON.parse(JSON.stringify(s));

  function swap(state, slot, productId) {
    if (state.locked.includes(slot)) throw new Error(`${slot} is locked`);
    if (!(slot in state.items)) throw new Error(`unknown slot ${slot}`);
    const next = clone(state);
    next.items[slot] = productId;
    next.bought = next.bought.filter((s) => s !== slot); // a new product isn't bought yet
    return next;
  }

  function applyMany(state, changes) {
    // used by the budget optimiser and never touches locked slots
    let next = state;
    changes.forEach((c) => { if (!state.locked.includes(c.slot)) next = swap(next, c.slot, c.productId); });
    return next;
  }

  function toggle(state, field, slot) {
    const next = clone(state);
    const set = new Set(next[field]);
    set.has(slot) ? set.delete(slot) : set.add(slot);
    next[field] = [...set];
    return next;
  }

  /* qty: optional {slot: how many are needed}, e.g. two blinds for two windows */
  const total = (state, byId, qty) =>
    Object.entries(state.items).reduce((s, [slot, id]) => s + (byId[id] ? byId[id].price * ((qty && qty[slot]) || 1) : 0), 0);

  /* Check a stored state against the current catalogue. Anything unknown is
     replaced by the default so an old saved version can never break the app. */
  function validate(raw, defaults, byId, aesthetics) {
    if (!raw || typeof raw !== "object" || !raw.items) return null;
    const s = clone(defaults);
    Object.keys(s.items).forEach((slot) => {
      const id = raw.items[slot];
      if (byId[id] && byId[id].category === slot) s.items[slot] = id;
    });
    const slots = Object.keys(s.items);
    s.locked = (Array.isArray(raw.locked) ? raw.locked : []).filter((x) => slots.includes(x));
    s.bought = (Array.isArray(raw.bought) ? raw.bought : []).filter((x) => slots.includes(x));
    if (aesthetics[raw.aesthetic]) s.aesthetic = raw.aesthetic;
    const b = Number(raw.budget);
    if (Number.isFinite(b) && b >= 1000 && b <= 1000000) s.budget = Math.round(b);
    return s;
  }

  /* Storage wrapper: falls back to memory if localStorage is blocked. */
  function makeStore(ls) {
    let ok = false;
    const mem = {};
    try {
      ls.setItem("styleswap.probe", "1");
      ls.removeItem("styleswap.probe");
      ok = true;
    } catch (e) { ok = false; }
    const get = (k) => {
      try { return JSON.parse((ok ? ls.getItem(k) : mem[k]) || "null"); } catch (e) { return null; }
    };
    const set = (k, v) => {
      const txt = JSON.stringify(v);
      try { ok ? ls.setItem(k, txt) : (mem[k] = txt); return true; } catch (e) { return false; }
    };
    return {
      persistent: ok,
      loadCurrent: () => get(KEY_CURRENT),
      saveCurrent: (s) => set(KEY_CURRENT, s),
      listVersions: () => (Array.isArray(get(KEY_VERSIONS)) ? get(KEY_VERSIONS) : []),
      saveVersion(name, state, extra) {
        const list = this.listVersions();
        const v = Object.assign({ id: "v" + Date.now().toString(36) + list.length, name, savedAt: new Date().toISOString(), state: clone(state) }, extra || {});
        list.push(v);
        return set(KEY_VERSIONS, list) ? v : null;
      },
      deleteVersion(id) { return set(KEY_VERSIONS, this.listVersions().filter((v) => v.id !== id)); },
    };
  }

  SS.plan = { swap, applyMany, toggle, total, validate, makeStore, KEY_CURRENT, KEY_VERSIONS };
})(typeof window !== "undefined" ? window : globalThis);
