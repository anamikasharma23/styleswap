/* StyleSwap app: connects the data and calculations to the page.
   Flow: state (the plan) + ui (what's selected) -> render() redraws
   the parts of the page from scratch. Every button calls a small
   function that changes state/ui and then calls render(). */
(function () {
  "use strict";
  const { scoring: S, modes: M, optimizer: O, plan: P, recolor: R, ROOM, DATA } = window.SS;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const pct = (x) => (x == null ? "–" : Math.round(x * 100) + "%");
  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const products = DATA.products;
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const SLOTS = ROOM.slots.map((s) => s.slot);
  const slotInfo = Object.fromEntries(ROOM.slots.map((s, i) => [s.slot, Object.assign({ n: i + 1 }, s)]));
  const bySlot = Object.fromEntries(SLOTS.map((s) => [s, products.filter((p) => p.category === s)]));
  const QTY = Object.fromEntries(ROOM.slots.map((s) => [s.slot, s.qty || 1]));
  const DEFAULTS = { aesthetic: ROOM.defaultAesthetic, budget: ROOM.defaultBudget, items: Object.assign({}, DATA.start), locked: [], bought: [] };

  const store = P.makeStore(window.localStorage);
  let state = DEFAULTS;
  const ui = {
    slot: "rug", mode: "cheaper", limit: null, sort: "match", brand: "all", maxPrice: "",
    compare: new Set(), view: "photo", ba: "after", preview: null, lastSwap: null,
    versionName: null, versionId: null, versionSnap: null, openWhy: null,
  };

  /* ---------- load saved working state ---------- */
  (function restore() {
    const saved = store.loadCurrent();
    if (!saved) return;
    const s = P.validate(saved.state, DEFAULTS, byId, ROOM.aesthetics);
    if (s) state = s;
    if (saved.ui && SLOTS.includes(saved.ui.slot)) ui.slot = saved.ui.slot;
    if (saved.ui && M.byId[saved.ui.mode]) ui.mode = saved.ui.mode;
    if (saved.ui && typeof saved.ui.versionName === "string") Object.assign(ui, { versionName: saved.ui.versionName, versionId: saved.ui.versionId || null, versionSnap: saved.ui.versionSnap || null });
  })();
  const persist = () => store.saveCurrent({ state, ui: { slot: ui.slot, mode: ui.mode, versionName: ui.versionName, versionId: ui.versionId, versionSnap: ui.versionSnap } });
  const markVersion = (v) => Object.assign(ui, { versionName: v.name, versionId: v.id, versionSnap: JSON.stringify(v.state) });

  /* ---------- derived values ---------- */
  const aesthetic = () => ROOM.aesthetics[state.aesthetic];
  const planItems = (st = state) => SLOTS.map((s) => byId[st.items[s]]);
  const current = () => byId[state.items[ui.slot]];
  const isLocked = (slot) => state.locked.includes(slot);
  const roomFit = (st = state) => S.roomFit(planItems(st), ROOM.aesthetics[st.aesthetic]);

  function limitFor(orig) {
    const prices = bySlot[orig.category].map((p) => p.price), lo = Math.min(...prices), hi = Math.max(...prices);
    if (ui.limit == null || ui.limitFor !== orig.id) { ui.limit = Math.round(orig.price * 0.8 / 50) * 50; ui.limitFor = orig.id; }
    ui.limit = Math.min(hi, Math.max(lo, ui.limit)); // always a value the slider can show
    return ui.limit;
  }

  function results() {
    const orig = current();
    const ctx = { catalogue: products, planItems: planItems(), aesthetic: aesthetic(), limit: limitFor(orig) };
    let all = M.alternatives(ui.mode, orig, ctx), relaxed = false;
    if (!all.length && M.byId[ui.mode].relax) { all = M.alternatives(ui.mode, orig, ctx, true); relaxed = all.length > 0; }
    let res = all;
    if (ui.brand !== "all") res = res.filter((r) => r.product.brand === ui.brand);
    const mp = Number(ui.maxPrice);
    if (ui.maxPrice !== "" && mp > 0) res = res.filter((r) => r.product.price <= mp);
    return { list: M.sortResults(res, ui.sort, orig), total: all.length, relaxed, all, brands: [...new Set(all.map((r) => r.product.brand))].sort() };
  }

  /* ---------- small view helpers ---------- */
  function thumb(p, size) {
    const chip = `<span class="chip" style="background:${esc(p.hex)}" title="Colour used for scoring: ${esc(p.hex)} (approximate)"></span>`;
    if (p.image) return `<div class="thumb"${size ? ` style="width:${size}px;height:${size}px"` : ""}><img class="pimg" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" data-hex="${esc(p.hex)}">${chip}</div>`;
    return `<div class="thumb swatch-only" style="background:${esc(p.hex)}${size ? `;width:${size}px;height:${size}px` : ""}"><span>swatch</span></div>`;
  }
  const attrVal = (p, dim) => ({
    colour: p.colourName, style: (p.tags || []).join(", "), material: p.materialText || p.material,
    pattern: p.pattern, finish: p.finish, price: p.price ? inr(p.price) : null, brand: p.brand,
  }[dim]);
  function attrs(p) {
    const a = [["Colour", p.colourName], ["Material", p.materialText || p.material], ["Pattern", p.pattern && p.patternInferred ? p.pattern + " (our reading)" : p.pattern], ["Finish (base/frame)", p.finish], ["Size", p.size]];
    return `<div class="attrs">${a.map(([k, v]) => v ? `<span class="attr">${k}: ${esc(v)}</span>` : (k === "Size" ? "" : `<span class="attr unk">${k.split(" (")[0]}: not verified</span>`)).join("")}</div>`;
  }
  const seller = (p) => (p.retailer.startsWith(p.brand) ? esc(p.brand) : `${esc(p.brand)} · sold by ${esc(p.retailer)}`);
  function priceDelta(p, base) {
    const d = p.price - base.price;
    if (!d) return `<span class="delta">same price</span>`;
    return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${inr(Math.abs(d))} ${d > 0 ? "more" : "less"}</span>`;
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("on"), 2600);
  }

  /* ---------- room image, pins, tint ---------- */
  const img = $("#roomImg"), canvas = $("#tint");
  img.src = ROOM.image;
  img.alt = ROOM.alt;
  canvas.width = 1600; canvas.height = 900;
  img.addEventListener("load", () => renderTint());
  $("#credit").innerHTML = `<a href="${esc(ROOM.credit.url)}" target="_blank" rel="noopener">${esc(ROOM.credit.text)}</a><span class="lic"> · ${esc(ROOM.credit.licence.split(" (")[0])} · 3D render</span>`;

  function renderPins() {
    $("#pins").innerHTML = ROOM.slots.map((s) => {
      const p = byId[state.items[s.slot]];
      return `<button type="button" class="hs ${s.labelSide}" style="left:${s.pin.x}%;top:${s.pin.y}%" data-slot="${s.slot}" aria-pressed="${ui.slot === s.slot}" aria-label="${slotInfo[s.slot].n}. ${esc(s.label)}${isLocked(s.slot) ? " (locked)" : ""}: ${esc(p.name)}, ${inr(p.price)}">
        <span class="dot">${slotInfo[s.slot].n}</span>${isLocked(s.slot) ? '<span class="lock" aria-hidden="true">🔒</span>' : ""}<span class="tip">${esc(s.label)} · ${inr(p.price)}</span></button>`;
    }).join("");
  }

  function renderTint() {
    let tints = [];
    const showPlan = ui.view === "plan";
    const st = swapValid() && ui.ba === "before" && showPlan ? beforeState() : state;
    if (showPlan) tints = ROOM.slots.map((s) => ({ mask: s.mask, hex: byId[st.items[s.slot]].hex }));
    if (ui.preview) {
      const s = slotInfo[ui.preview.slot];
      tints = tints.filter((t) => t.mask !== s.mask);
      tints.push({ mask: s.mask, hex: byId[ui.preview.id].hex });
    }
    R.render(canvas, img, tints);
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === ui.view)));
    const ba = $("#baToggle");
    ba.hidden = !(swapValid() && showPlan);
    ba.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ba === ui.ba)));
    const note = $("#previewNote");
    if (ui.preview) {
      const p = byId[ui.preview.id];
      note.hidden = false;
      note.innerHTML = `Previewing <b>${esc(p.colourName || p.hex)}</b> (${esc(p.name)}) on the ${esc(slotInfo[ui.preview.slot].label.toLowerCase())}. Colour only: texture, pattern and shape are not simulated. <button type="button" class="linkbtn" data-act="clearPreview">Clear preview</button>`;
    } else if (showPlan) {
      note.hidden = false;
      note.textContent = swapValid() ? "Showing your plan's colours on the image. Use Before / After to compare the last swap. Colour preview only, not a photoreal render." : "Showing your plan's colours on the image. Colour preview only, not a photoreal render.";
    } else note.hidden = true;
  }

  function renderRail() {
    $("#rail").innerHTML = ROOM.slots.map((s) => {
      const p = byId[state.items[s.slot]];
      return `<li><button type="button" data-slot="${s.slot}" aria-current="${ui.slot === s.slot}"><span class="n">${slotInfo[s.slot].n}</span><span class="t">${esc(s.label)}${isLocked(s.slot) ? " 🔒" : ""}</span><span class="p">${inr(p.price * QTY[s.slot])}${QTY[s.slot] > 1 ? ` · ${QTY[s.slot]}×` : ""}</span></button></li>`;
    }).join("");
  }

  function renderStyleCheck() {
    const a = aesthetic(), rf = roomFit();
    const rows = rf.perItem.map((it, i) => {
      const s = ROOM.slots[i];
      let tag = "";
      if (isLocked(s.slot)) tag = `<span class="flag lock">🔒 locked, kept</span>`;
      else if (it.fit !== null && it.fit < ROOM.poorFit) tag = `<span class="flag">suggested swap</span><button type="button" class="linkbtn" data-act="suggest" data-slot="${s.slot}" aria-label="See options for ${esc(s.label)}">See options</button>`;
      return `<li><b>${slotInfo[s.slot].n}</b><span>${esc(s.label)}</span><span class="fitv">${pct(S.round5(it.fit))}</span><span class="sct">${tag}</span></li>`;
    }).join("");
    const nSug = rf.perItem.filter((it, i) => !isLocked(SLOTS[i]) && it.fit !== null && it.fit < ROOM.poorFit).length;
    $("#styleCheck").innerHTML = `
      <div class="sc-head"><h2>Room style: ${esc(a.label)}</h2>
        <span class="swatches" aria-label="Room palette">${a.palette.map((h) => `<span class="sw" style="background:${h}" title="${h}"></span>`).join("")}</span>
        <span style="margin-left:auto;font-weight:700">Room fit ${pct(rf.score)} <span class="est">estimate</span></span></div>
      <div class="mhelp" style="margin-top:6px">How well each item matches this style (palette + style tags). ${nSug ? `${nSug} unlocked item${nSug > 1 ? "s" : ""} suggested for replacement. Nothing changes until you choose a swap.` : "No item is a poor fit for this style."} Locked items are never suggested or replaced.</div>
      <ul class="sc-list">${rows}</ul>`;
  }

  /* ---------- panel ---------- */
  function describeDim(dim, a, b) {
    const va = attrVal(a, dim), vb = attrVal(b, dim);
    if (dim === "style") {
      const shared = (a.tags || []).filter((t) => (b.tags || []).includes(t));
      return shared.length ? `shared tags: ${shared.join(", ")}` : `${esc(va)} → ${esc(vb)}`;
    }
    if (va == null || vb == null) return "not verified";
    return va === vb ? esc(va) : `${esc(va)} → ${esc(vb)}`;
  }

  function staysChanges(r, orig, mode) {
    const p = r.product, stays = [], changes = [], unknown = [];
    r.match.rows.forEach((row) => {
      if (row.dim === "brand") return; // brand is described separately below
      const L = S.DIM_LABEL[row.dim];
      if (row.status === "changed") changes.push(`<li><b>${L}:</b> ${row.dim === "price" ? `${inr(orig.price)} → ${inr(p.price)}` : describeDim(row.dim, orig, p)} <em>(what you asked to change)</em></li>`);
      else if (row.status === "unknown") unknown.push(L);
      else if (row.sim >= 0.8) stays.push(`<li><b>${L}:</b> ${row.dim === "price" ? `${inr(orig.price)} → ${inr(p.price)}` : describeDim(row.dim, orig, p)}</li>`);
      else changes.push(`<li><b>${L}:</b> ${row.dim === "price" ? `${inr(orig.price)} → ${inr(p.price)}` : describeDim(row.dim, orig, p)} <em>(${pct(row.sim)} similar)</em></li>`);
    });
    if (mode.changes.includes("brand")) changes.unshift(`<li><b>Brand:</b> ${esc(orig.brand)} → ${esc(p.brand)} <em>(what you asked to change)</em></li>`);
    else if (orig.brand !== p.brand) changes.push(`<li><b>Brand:</b> ${esc(orig.brand)} → ${esc(p.brand)}</li>`);
    return `<div class="kc"><div class="stays"><h4>Stays the same or very close</h4>${stays.length ? `<ul>${stays.join("")}</ul>` : "<div>Nothing very close on the kept qualities.</div>"}</div>
      <div class="changes"><h4>Changes</h4><ul>${changes.join("")}${unknown.length ? `<li><b>Not verified:</b> ${unknown.join(", ")} (no data, left out of the score)</li>` : ""}</ul></div></div>`;
  }

  function whyBody(r, orig, mode) {
    const rows = r.match.rows.map((row) => {
      const v = row.sim == null ? null : row.sim;
      const st = row.status === "kept" ? `kept · weight ${row.weight}` : row.status === "changed" ? "changed, as you asked" : `not verified · weight ${row.weight} left out`;
      return `<div class="wrow"><span>${S.DIM_LABEL[row.dim]}</span><div class="bar"><i style="width:${row.status === "kept" ? Math.round(v * 100) : 0}%"></i></div><span class="v">${row.status === "kept" ? Math.round(v * 100) : "–"}</span><span class="st ${row.status}">${st}</span></div>`;
    }).join("");
    const kept = r.match.rows.filter((x) => x.status === "kept");
    const wk = kept.reduce((s, x) => s + x.weight, 0);
    const formula = kept.length
      ? `<b>Item match</b> = (${kept.map((x) => `${x.weight}×${x.sim.toFixed(2)}`).join(" + ")}) ÷ ${wk} = <b>${r.match.raw.toFixed(3)}</b>, shown rounded to the nearest 5%: <b>${pct(r.match.score)}</b>.`
      : "No kept quality has data on both products, so no item match is shown.";
    const i = SLOTS.indexOf(ui.slot);
    const b = r.roomBefore.perItem[i], a = r.roomAfter.perItem[i];
    const others = SLOTS.length - 1;
    return `<div class="whybody">
      <div>Mode <b>${esc(mode.label)}</b>: ${esc(mode.rule)}. Scores compare it with your current ${esc(slotInfo[ui.slot].label.toLowerCase())}, <b>${esc(orig.name)}</b>.</div>
      <div>${rows}</div>
      <div class="formula">${formula} ${r.match.lowData ? "<br><b>Low data:</b> less than half of the weighted qualities could be checked, so treat this score with caution." : ""}</div>
      <div class="formula"><b>Room fit</b> = average fit of all ${SLOTS.length} items with “${esc(aesthetic().label)}”. Each item's fit = ½ palette fit + ½ style fit.<br>
        This ${esc(slotInfo[ui.slot].label.toLowerCase())}: palette ${pct(b.palette)} → ${pct(a.palette)}, style ${pct(b.style)} → ${pct(a.style)}, item fit ${pct(b.fit)} → <b>${pct(a.fit)}</b>.<br>
        The other ${others} items don't change, so room fit goes ${pct(r.roomBefore.raw)} → ${pct(r.roomAfter.raw)} (displayed rounded: ${pct(r.roomBefore.score)} → ${pct(r.roomAfter.score)}).</div>
      <div class="mhelp">Both numbers are estimates from this prototype's catalogue data: colour hex codes approximate the retailer's colour name and style tags were assigned by us.</div></div>`;
  }

  function resultCard(r, orig, mode, idx) {
    const p = r.product, locked = isLocked(ui.slot);
    const rb = r.roomBefore.score, ra = r.roomAfter.score;
    const dir = ra > rb ? "up" : ra < rb ? "down" : "";
    const open = ui.openWhy ? ui.openWhy === p.id : idx === 0;
    return `<li class="rcard ${idx === 0 && ui.sort === "match" ? "best" : ""}" data-id="${esc(p.id)}">
      <div class="rhead">${thumb(p)}
        <div><div class="pname">${esc(p.name)}</div>
          <div class="pmeta">${seller(p)} · price checked ${fmtDate(p.checked)}</div>
          <div style="margin-top:4px"><span class="price">${inr(p.price)}</span>${QTY[ui.slot] > 1 ? '<span class="delta">each</span>' : ""}${priceDelta(p, orig)}</div>${attrs(p)}</div>
        ${idx === 0 && ui.sort === "match" ? '<span class="bestpill">Closest match</span>' : "<span></span>"}</div>
      <div class="metrics">
        <div class="metric item"><div class="ring" style="--v:${Math.round((r.match.score ?? 0) * 100)}" role="img" aria-label="Item match ${pct(r.match.score)}"><span>${pct(r.match.score)}</span></div>
          <div><div class="mlabel">Item match ${r.match.lowData ? '<span class="lowdata">low data</span>' : ""}</div><div class="mhelp">How close it is to your current ${esc(slotInfo[ui.slot].label.toLowerCase())} in the qualities you're keeping</div></div></div>
        <div class="metric room"><div style="flex:1;min-width:0"><div class="mlabel">Whole-room fit after swap <span class="est">estimate</span></div>
          <div class="fitnum"><span class="was">${pct(rb)}</span> → <span class="${dir}">${pct(ra)}</span> <span class="mhelp">${dir === "up" ? "better" : dir === "down" ? "worse" : "about the same"}</span></div>
          <div class="fitbar" aria-hidden="true"><i style="width:${Math.round((ra ?? 0) * 100)}%"></i><b style="left:${Math.round((rb ?? 0) * 100)}%"></b></div>
          <div class="mhelp">How well all ${SLOTS.length} items match “${esc(aesthetic().label)}” with this one swapped in</div></div></div>
      </div>
      ${staysChanges(r, orig, mode)}
      <div class="ractions">
        <button type="button" class="btn" data-act="swap" data-id="${esc(p.id)}" ${locked ? 'disabled title="Unlock this item to swap it"' : ""}>${locked ? "Locked" : "Swap in"}</button>
        <button type="button" class="btn ghost" data-act="preview" data-id="${esc(p.id)}" aria-pressed="${ui.preview && ui.preview.id === p.id}">Preview on image</button>
        <a class="btn ghost" href="${esc(p.url)}" target="_blank" rel="noopener">View on ${esc(p.retailer)} ↗</a>
        <label class="cmp"><input type="checkbox" data-act="compare" data-id="${esc(p.id)}" ${ui.compare.has(p.id) ? "checked" : ""}> Compare</label>
      </div>
      <details class="why" data-id="${esc(p.id)}" ${open ? "open" : ""}><summary>Why this match?</summary>${whyBody(r, orig, mode)}</details>
    </li>`;
  }

  function emptyState(orig, mode, total) {
    if (total > 0) return `<div class="empty">No alternatives left after your filters. <button type="button" class="linkbtn" data-act="clearFilters">Clear filters</button></div>`;
    const missing = mode.changes.find((d) => ["material", "pattern", "finish"].includes(d) && !orig[d]);
    if (missing) return `<div class="empty"><b>We can't do this one honestly.</b> The retailer doesn't state the ${missing} of your current item, so we can't tell which products have a different ${missing}. Try another way to change it.</div>`;
    if (mode.id === "budget") return `<div class="empty">Nothing in our catalogue for this item costs ${inr(limitFor(orig))} or less. Raise the limit with the slider.</div>`;
    return `<div class="empty">No product in our catalogue matches “${esc(mode.label)}” for this item yet (rule: ${esc(mode.rule)}). The catalogue is small: ${bySlot[ui.slot].length} real products for this item.</div>`;
  }

  /* The last swap is remembered only as "which slots changed, from what to what".
     "Before" = the CURRENT plan with just those slots put back, so locks, room
     style and budget changed since then are respected and numbers are never stale. */
  const swapValid = () => ui.lastSwap && ui.lastSwap.changes.every((c) => state.items[c.slot] === c.to);
  function beforeState() {
    const s = JSON.parse(JSON.stringify(state));
    ui.lastSwap.changes.forEach((c) => (s.items[c.slot] = c.from));
    return s;
  }
  function baStrip() {
    if (!swapValid()) return "";
    const ch = ui.lastSwap.changes, bs = beforeState();
    const tb = P.total(bs, byId, QTY), ta = P.total(state, byId, QTY), d = ta - tb;
    const c0 = ch[0];
    const others = ch.length > 1 ? `${ch.length} items changed by Fit my budget: ${ch.map((c) => esc(slotInfo[c.slot].label.toLowerCase())).join(", ")}.` : `Only the ${esc(slotInfo[c0.slot].label.toLowerCase())} changed. The other ${SLOTS.length - 1} items are exactly as before.`;
    return `<div class="ba" aria-live="polite">
      <div class="ba-pair">${thumb(byId[c0.from], 56)}<span aria-hidden="true">→</span>${thumb(byId[c0.to], 56)}</div>
      <div class="ba-text"><b>${ch.length > 1 ? "Budget plan applied" : `Swapped ${esc(slotInfo[c0.slot].label.toLowerCase())}`}</b> · total ${inr(tb)} → ${inr(ta)} (${d === 0 ? "same" : (d > 0 ? "+" : "−") + inr(Math.abs(d))})<br>
        Room fit ${pct(roomFit(bs).score)} → ${pct(roomFit().score)} with “${esc(aesthetic().label)}” · ${others}</div>
      <button type="button" class="btn ghost sm" data-act="undo">Undo</button></div>`;
  }

  function renderPanel() {
    const orig = current(), mode = M.byId[ui.mode], info = slotInfo[ui.slot], locked = isLocked(ui.slot);
    const { list, total, brands, relaxed } = results();
    const isStart = state.items[ui.slot] === DATA.start[ui.slot];
    const primary = M.MODES.filter((m) => m.primary), more = M.MODES.filter((m) => !m.primary);
    const modeBtn = (m) => `<button type="button" class="mode" data-act="mode" data-mode="${m.id}" aria-pressed="${ui.mode === m.id}">${esc(m.label)}<small>changes ${m.changes.join(", ")}</small></button>`;
    const kept = Object.entries(mode.weights).map(([d, w]) => `${S.DIM_LABEL[d].toLowerCase()} (${w})`).join(", ");
    const limit = limitFor(orig);
    const prices = bySlot[ui.slot].map((p) => p.price);
    $("#panel").innerHTML = `
      <div class="ph"><div><div class="eyebrow">Item ${info.n} of ${SLOTS.length} · only this item changes</div><h2>${esc(info.label)}</h2><div class="pmeta">In the image: ${esc(info.inPhoto)}</div></div>
        <button type="button" class="btn ${locked ? "dark" : "ghost"} sm" data-act="lock" aria-pressed="${locked}">${locked ? "🔒 Locked" : "Lock this item"}</button></div>
      ${baStrip()}
      <div class="current"><div class="current-top"><span class="eyebrow">Your current pick${isStart ? " · closest real product we found to the image" : ""}</span></div>
        <div class="prod">${thumb(orig)}<div><div class="pname">${esc(orig.name)}</div><div class="pmeta">${seller(orig)} · price checked ${fmtDate(orig.checked)} · <a href="${esc(orig.url)}" target="_blank" rel="noopener">View ↗</a></div>
          <div class="price" style="margin-top:4px">${inr(orig.price)}${QTY[ui.slot] > 1 ? ` <span class="delta">each · you need ${QTY[ui.slot]} (${inr(orig.price * QTY[ui.slot])} in plan)</span>` : ""}</div>${attrs(orig)}</div></div></div>
      ${locked ? `<div class="note"><b>Locked.</b> This item stays in your plan: it won't be swapped, suggested for replacement or changed by “Fit my budget”. You can still browse alternatives below.</div>` : ""}
      <section aria-labelledby="modesT"><div class="eyebrow" id="modesT" style="margin-bottom:8px">What do you want to change?</div>
        <div class="modes">${primary.map(modeBtn).join("")}</div>
        <details class="more" ${!mode.primary ? "open" : ""}><summary>More ways to change it</summary><div class="modes">${more.map(modeBtn).join("")}</div></details>
        ${mode.id === "budget" ? `<div class="limit"><label for="limit">My limit for this item: <b id="limitVal">${inr(limit)}</b></label><input id="limit" type="range" min="${Math.min(...prices)}" max="${Math.max(...prices)}" step="50" value="${limit}"></div>` : ""}
      </section>
      <div class="mode-rule"><b>Keeps</b> (weight): ${kept} · <b>Changes:</b> ${mode.changes.join(", ")} · <b>Shows:</b> ${esc(mode.rule)}.</div>
      <div class="toolbar" role="group" aria-label="Sort and filter">
        <span class="count" aria-live="polite">${list.length} of ${total} alternative${total === 1 ? "" : "s"}</span>
        <label>Sort <select data-act="sort">${Object.entries(M.SORTS).map(([k, v]) => `<option value="${k}" ${ui.sort === k ? "selected" : ""}>${v.label}</option>`).join("")}
          <optgroup label="My priority">${["colour", "style", "material", "price"].map((d) => `<option value="priority:${d}" ${ui.sort === "priority:" + d ? "selected" : ""}>${d === "price" ? "Lowest price first" : "Closest " + d}</option>`).join("")}</optgroup></select></label>
        <label>Brand <select data-act="brand"><option value="all">All</option>${brands.map((b) => `<option ${ui.brand === b ? "selected" : ""}>${esc(b)}</option>`).join("")}</select></label>
        <label>Max ₹ <input type="number" data-act="maxPrice" inputmode="numeric" min="0" step="100" value="${esc(ui.maxPrice)}" style="width:96px" aria-label="Maximum price in rupees"></label>
        <button type="button" class="btn ghost sm" data-act="openCompare" ${ui.compare.size ? "" : "disabled"}>Compare (${ui.compare.size})</button>
      </div>
      ${relaxed ? `<div class="note"><b>No product meets the strict rule</b> (${esc(mode.rule)}). Showing the closest options with a looser rule instead: <b>${esc(mode.relax.rule)}</b>.</div>` : ""}
      ${list.length ? `<ul class="results">${list.map((r, i) => resultCard(r, orig, mode, i)).join("")}</ul>` : emptyState(orig, mode, total)}`;
    const lim = $("#limit");
    if (lim) lim.addEventListener("input", (e) => { ui.limit = Number(e.target.value); $("#limitVal").textContent = inr(ui.limit); clearTimeout(lim.t); lim.t = setTimeout(renderPanelKeepFocus, 150); });
  }
  function renderPanelKeepFocus() {
    const id = document.activeElement && document.activeElement.id;
    renderPanel();
    if (id && document.getElementById(id)) document.getElementById(id).focus();
  }

  /* ---------- plan bar ---------- */
  function renderPlanbar() {
    const tot = P.total(state, byId, QTY), b = state.budget, left = b - tot, rf = roomFit();
    $("#planbar").innerHTML = `
      <div class="pb-total"><div class="pb-kicker">Reality plan${ui.versionName ? " · " + esc(ui.versionName) + (edited() ? " (edited, not saved)" : "") : ""}<span class="pb-fitm"> · room fit ${pct(rf.score)}</span></div>
        <div class="pb-amt" id="planTotal">${inr(tot)} <small>of ${inr(b)} · <span class="${left < 0 ? "over" : ""}">${left < 0 ? inr(-left) + " over" : inr(left) + " left"}</span></small></div>
        <div class="pb-bar"><i class="${left < 0 ? "over" : ""}" style="width:${Math.min(100, Math.round(tot / b * 100))}%"></i></div></div>
      <ul class="pb-items" aria-label="Items in your plan">${ROOM.slots.map((s) => {
        const p = byId[state.items[s.slot]];
        const changed = state.items[s.slot] !== DATA.start[s.slot];
        return `<li><button type="button" class="pb-item ${changed ? "changed" : ""}" data-slot="${s.slot}" aria-current="${ui.slot === s.slot}">${slotInfo[s.slot].n} ${esc(s.label)}${isLocked(s.slot) ? " 🔒" : ""}${state.bought.includes(s.slot) ? " ✓" : ""}<b>${inr(p.price * QTY[s.slot])}${QTY[s.slot] > 1 ? ` (${QTY[s.slot]}×)` : ""}${changed ? " · changed" : ""}</b></button></li>`;
      }).join("")}</ul>
      <div class="pb-fit"><div class="pb-kicker">Room fit</div><div class="n" id="planFit">${pct(rf.score)}</div></div>
      <div class="pb-actions"><button type="button" class="pbtn save" data-act="quickSave">Save<span class="long"> version</span></button><button type="button" class="pbtn light" data-act="openPlan">Plan<span class="long"> · ${state.bought.length}/${SLOTS.length} bought</span></button></div>`;
  }

  const edited = () => ui.versionSnap && ui.versionSnap !== JSON.stringify(state);
  function render() {
    if (ui.lastSwap && !swapValid()) ui.lastSwap = null;
    if ($("#aesthetic").value !== state.aesthetic) $("#aesthetic").value = state.aesthetic;
    if (document.activeElement !== $("#budget") && Number($("#budget").value) !== state.budget) $("#budget").value = state.budget;
    renderPins(); renderRail(); renderStyleCheck(); renderPanel(); renderPlanbar(); renderTint();
    $("#versionName").textContent = ui.versionName ? ui.versionName + (edited() ? " *" : "") : "Versions";
    persist();
  }

  /* ---------- actions ---------- */
  function select(slot) {
    if (ui.slot === slot) return;
    ui.slot = slot; ui.brand = "all"; ui.maxPrice = ""; ui.compare.clear(); ui.preview = null; ui.openWhy = null; ui.limit = null;
    render();
  }

  function doSwap(id) {
    const slot = ui.slot;
    if (isLocked(slot)) return toast("This item is locked. Unlock it to swap.");
    const from = state.items[slot];
    state = P.swap(state, slot, id);
    ui.lastSwap = { changes: [{ slot, from, to: id }] };
    ui.preview = null; ui.view = "plan"; ui.ba = "after"; ui.compare.clear(); ui.openWhy = null;
    render();
    toast(`${slotInfo[slot].label} swapped. Total ${inr(P.total(state, byId, QTY))}, room fit ${pct(roomFit().score)}.`);
    $("#panel").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function undo() {
    if (!swapValid()) return;
    const ch = ui.lastSwap.changes;
    const lockedNow = ch.filter((c) => isLocked(c.slot));
    // put back only the swapped items; locks, style, budget and checklist stay as they are now
    state = P.applyMany(state, ch.filter((c) => !isLocked(c.slot)).map((c) => ({ slot: c.slot, productId: c.from })));
    ui.lastSwap = null; ui.ba = "after";
    render();
    toast(lockedNow.length ? `Undone, except ${lockedNow.map((c) => slotInfo[c.slot].label).join(", ")} (locked since).` : "Undone. Only the swapped item went back.");
  }

  /* ---------- dialogs ---------- */
  const dlg = (id, title, body) => {
    const d = $(id);
    d.innerHTML = `<div class="dh"><h2 id="${d.getAttribute("aria-labelledby")}">${title}</h2><button type="button" class="x" data-close aria-label="Close">×</button></div><div class="db">${body}</div>`;
    if (!d.open) d.showModal();
    return d;
  };

  function openVersions() {
    const list = store.listVersions().slice().reverse();
    dlg("#dlgVersions", "Saved versions", `
      <div class="row"><input type="text" id="verName" maxlength="40" placeholder="Name this version, e.g. Cheaper rug" aria-label="Version name"><button type="button" class="btn" data-act="saveVersion">Save current plan</button></div>
      ${list.length ? `<ul class="vlist">${list.map((v) => {
        const tot = P.total(v.state, byId, QTY);
        return `<li><span class="vn">${esc(v.name)}<br><span class="pmeta">${new Date(v.savedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ${inr(tot)} · ${esc((ROOM.aesthetics[v.state.aesthetic] || {}).label || "")}</span></span>
          <button type="button" class="btn sm" data-act="openVersion" data-id="${esc(v.id)}">Open</button><button type="button" class="btn ghost sm" data-act="deleteVersion" data-id="${esc(v.id)}">Delete</button></li>`;
      }).join("")}</ul>` : `<div class="empty">No saved versions yet. Save one to compare plans or come back later.</div>`}
      <div class="note">${store.persistent ? "Versions are saved in this browser on this device (localStorage). They survive a refresh or restart, but not clearing site data, a private window, or switching device/browser. Nothing is uploaded." : "<b>Saving is blocked in this browser</b> (private mode or storage disabled), so versions only last until you close this tab."}</div>`);
  }

  function openOptimizer() {
    const locked = new Set(state.locked);
    const r = O.optimise({ slots: SLOTS.map((s) => ({ slot: s, productId: state.items[s] })), locked, catalogueBySlot: bySlot, byId, budget: state.budget, aesthetic: aesthetic(), qty: QTY });
    const lockTxt = locked.size ? `Locked and kept as is: ${[...locked].map((s) => slotInfo[s].label).join(", ")}.` : "No items locked, so every item can change.";
    let body;
    if (!r.feasible) {
      body = `<div class="empty"><b>No combination fits ${inr(state.budget)}.</b> The cheapest possible plan with your locked items is ${inr(r.cheapestPossible)}. Raise the budget or unlock an item.</div>`;
    } else {
      body = `<ol class="olist">${r.plans.map((p, i) => `<li><div class="oh"><b>Option ${i + 1}: ${inr(p.total)} · room fit ${pct(p.fitScore)}</b><button type="button" class="btn sm" data-act="applyPlan" data-i="${i}" ${p.changes.length ? "" : "disabled"}>${p.changes.length ? `Apply ${p.changes.length} change${p.changes.length > 1 ? "s" : ""}` : "Already your plan"}</button></div>
        <div class="mhelp">${esc(p.tradeoff)}</div>
        ${p.changes.length ? `<ul>${p.changes.map((c) => `<li><b>${esc(slotInfo[c.slot].label)}:</b> ${esc(c.from.name)} → ${esc(c.to.name)} (${c.priceDelta >= 0 ? "+" : "−"}${inr(Math.abs(c.priceDelta))})</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol>`;
    }
    openOptimizer.last = r;
    dlg("#dlgOptimizer", "Fit my budget", `<div class="mhelp">Checks every combination of our ${products.length} products (${r.combos.toLocaleString("en-IN")} combinations) and keeps the 3 with the best room fit for “${esc(aesthetic().label)}” within <b>${inr(state.budget)}</b>, ranked by exact room fit (shown rounded to 5%, so two options can show the same %; ties go to the cheaper one). ${lockTxt} Current plan: ${inr(P.total(state, byId, QTY))}, room fit ${pct(S.round5(r.currentFit))}.</div>${body}`);
  }

  function applyPlan(i) {
    const p = openOptimizer.last && openOptimizer.last.plans[i];
    if (!p) return;
    state = P.applyMany(state, p.changes.map((c) => ({ slot: c.slot, productId: c.to.id })));
    ui.lastSwap = { changes: p.changes.map((c) => ({ slot: c.slot, from: c.from.id, to: c.to.id })) };
    ui.view = "plan"; ui.ba = "after";
    $("#dlgOptimizer").close();
    render();
    toast(`Applied: ${p.changes.length} change${p.changes.length > 1 ? "s" : ""}. Undo is in the item panel.`);
  }

  function openCompare() {
    const orig = current(), mode = M.byId[ui.mode];
    const ctx = { catalogue: products, planItems: planItems(), aesthetic: aesthetic(), limit: limitFor(orig) };
    const res = results().all.filter((r) => ui.compare.has(r.product.id));
    const cols = [{ product: orig, cur: true, roomAfter: roomFit() }, ...res];
    const row = (label, f) => `<tr><th scope="row">${label}</th>${cols.map((c) => `<td>${f(c)}</td>`).join("")}</tr>`;
    dlg("#dlgCompare", `Compare ${esc(slotInfo[ui.slot].label.toLowerCase())} options`, `<div class="tablewrap"><table class="cmp">
      <thead><tr><th></th>${cols.map((c) => `<th>${c.cur ? "Current pick" : "Alternative"}<br>${thumb(c.product, 72)}</th>`).join("")}</tr></thead><tbody>
      ${row("Product", (c) => `<b>${esc(c.product.name)}</b>`)}
      ${row("Price", (c) => `<b>${inr(c.product.price)}</b>${c.cur ? "" : "<br>" + priceDelta(c.product, orig)}`)}
      ${row("Brand · retailer", (c) => `${esc(c.product.brand)} · ${esc(c.product.retailer)}`)}
      ${["colour", "material", "pattern", "finish"].map((d) => row(S.DIM_LABEL[d], (c) => esc(attrVal(c.product, d) ?? "not verified"))).join("")}
      ${row("Size", (c) => esc(c.product.size || "not stated"))}
      ${row("Style tags", (c) => esc((c.product.tags || []).join(", ")))}
      ${row(`Item match<br><span class="mhelp">${esc(mode.label)}</span>`, (c) => (c.cur ? "reference" : `<b>${pct(c.match.score)}</b>`))}
      ${row("Room fit after swap", (c) => `<b>${pct(c.roomAfter.score)}</b>`)}
      ${row("Store", (c) => `<a href="${esc(c.product.url)}" target="_blank" rel="noopener">View ↗</a><br><span class="mhelp">checked ${fmtDate(c.product.checked)}</span>`)}
      ${row("", (c) => (c.cur ? "" : `<button type="button" class="btn sm" data-act="swap" data-id="${esc(c.product.id)}" ${isLocked(ui.slot) ? "disabled" : ""}>Swap in</button>`))}
      </tbody></table></div>`);
  }

  function openPlan() {
    const tot = P.total(state, byId, QTY);
    dlg("#dlgPlan", "Your Reality Plan", `<div class="tablewrap"><table class="cmp plan"><thead><tr><th>Item</th><th>Product</th><th>Price</th><th>Lock</th><th>Bought</th></tr></thead><tbody>
      ${ROOM.slots.map((s) => {
        const p = byId[state.items[s.slot]];
        return `<tr><td><b>${slotInfo[s.slot].n}. ${esc(s.label)}</b></td><td><div style="display:flex;gap:10px;align-items:center">${thumb(p, 52)}<div>${esc(p.name)}<br><span class="pmeta">${esc(p.brand)} · <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.retailer)} ↗</a></span></div></div></td>
          <td><b>${inr(p.price * QTY[s.slot])}</b>${QTY[s.slot] > 1 ? `<br><span class="pmeta">${QTY[s.slot]} × ${inr(p.price)}</span>` : ""}</td>
          <td><button type="button" class="btn ${isLocked(s.slot) ? "dark" : "ghost"} sm" data-act="lockSlot" data-slot="${s.slot}" aria-pressed="${isLocked(s.slot)}">${isLocked(s.slot) ? "🔒 Locked" : "Lock"}</button></td>
          <td><label class="cmp"><input type="checkbox" data-act="bought" data-slot="${s.slot}" ${state.bought.includes(s.slot) ? "checked" : ""}> <span class="sr">Bought ${esc(s.label)}</span></label></td></tr>`;
      }).join("")}
      <tr><td colspan="2"><b>Total</b> (checklist ${state.bought.length}/${SLOTS.length} bought)</td><td colspan="3"><b>${inr(tot)}</b> of ${inr(state.budget)} · ${state.budget - tot >= 0 ? inr(state.budget - tot) + " left" : inr(tot - state.budget) + " over"}</td></tr></tbody></table></div>
      <div class="note">Prices are a snapshot from each retailer's site on the date shown and may have changed. Delivery, installation and taxes beyond the listed price are not included.</div>`);
  }

  function openGuide() {
    const modeRows = M.MODES.map((m) => `<tr><td><b>${esc(m.label)}</b></td><td>${esc(m.rule)}</td><td>${Object.entries(m.weights).map(([d, w]) => `${S.DIM_LABEL[d]} ${w}`).join(", ")}</td></tr>`).join("");
    dlg("#dlgGuide", "How StyleSwap works", `<div class="guide">
      <ol><li>Tap a numbered pin (or an item under the image).</li><li>Choose <b>what</b> you want to change: colour, price, brand, style, material, pattern, finish or a price limit.</li><li>Compare alternatives. Each shows an <b>item match</b> and the <b>whole-room fit</b> after the swap.</li><li>Swap one item. Only that item changes; the total and room fit update straight away, with before/after and Undo.</li><li>Lock items you love, save versions, and use <b>Fit my budget</b> to find the best combination under your target.</li></ol>
      <h3>Item match (how close to what you have)</h3><p>Weighted average similarity over the qualities the mode keeps. Colour: <code>1 − ΔE00/40</code> (CIEDE2000 colour difference). Style: shared tags ÷ all tags (Jaccard). Material: same 1, same family 0.6, else 0. Pattern: same 1, both patterned 0.4, plain vs patterned 0. Finish: same 1, else 0. Price: <code>1 − |new − old| / old</code>. Qualities without data on both products are marked “not verified” and left out; if less than half the weight can be checked the card says “low data”.</p>
      <div class="tablewrap"><table class="cmp"><thead><tr><th>Mode</th><th>Shows</th><th>Weights of kept qualities</th></tr></thead><tbody>${modeRows}</tbody></table></div>
      <h3>Room fit (how the whole room works)</h3><p>Average over all ${SLOTS.length} items of ½ palette fit + ½ style fit. Palette fit: <code>1 − ΔE00 to the nearest room-style colour / 40</code>. Style fit: share of the item's style tags that belong to the room style. Changing the room style changes the palette and tags; it never replaces anything by itself.</p>
      <h3>Honest limits</h3><ul><li>Scores are estimates, rounded to 5%. Colour hex codes approximate the retailer's colour name; style tags were assigned by us.</li><li>Products and prices are real listings captured on the date shown on each card. No live prices.</li><li>The colour preview only changes colour, not texture or shape. No AI is used anywhere in this prototype.</li><li>The room image is a 3D render. Its items are not for sale; we start your plan with the closest real products we found.</li></ul>
      <h3>Credits</h3><p>${esc(ROOM.credit.text)} (<a href="${esc(ROOM.credit.url)}" target="_blank" rel="noopener">source</a>, <a href="${esc(ROOM.credit.licenceUrl)}" target="_blank" rel="noopener">${esc(ROOM.credit.licence)}</a>). Product names, prices and images belong to their retailers and link back to them. StyleSwap is a student concept and is not affiliated with Pinterest or any retailer.</p></div>`);
  }

  /* ---------- events (one listener for the whole page) ---------- */
  /* Keyboard focus: re-drawing replaces buttons, which would drop focus to the
     top of the page. Remember what was used and put focus back on the same
     control (or the next sensible one) after the action. */
  const FOCUS_ATTRS = ["data-act", "data-mode", "data-id", "data-slot", "data-view", "data-ba", "data-i"];
  function focusKey(el) {
    if (!el || el === document.body) return null;
    if (el.id) return { sel: "#" + CSS.escape(el.id), dlg: el.closest("dialog") && el.closest("dialog").id, act: el.dataset.act };
    let sel = el.tagName.toLowerCase();
    FOCUS_ATTRS.forEach((a) => { if (el.hasAttribute(a)) sel += `[${a}="${CSS.escape(el.getAttribute(a))}"]`; });
    const area = el.closest("#panel, #pins, #rail, #planbar, #styleCheck, dialog");
    return { sel, area: area && (area.id ? "#" + area.id : null), dlg: el.closest("dialog") && el.closest("dialog").id, act: el.dataset.act };
  }
  function restoreFocus(k) {
    const a = document.activeElement;
    if (!k || (a && a !== document.body && document.contains(a))) return;
    const dlg = k.dlg && document.getElementById(k.dlg);
    const scope = dlg && dlg.open ? dlg : (k.area && $(k.area)) || document;
    let el = scope.querySelector(k.sel) || document.querySelector(k.sel);
    if (!el && (k.act === "swap" || k.act === "applyPlan")) el = $('[data-act="undo"]');
    if (!el && dlg && dlg.open) el = $(".x", dlg);
    if (!el) el = $("#panel");
    el.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const k = focusKey(e.target.closest("button, input, select, [data-act]"));
    onClick(e);
    restoreFocus(k);
  });
  document.addEventListener("change", (e) => {
    const k = focusKey(e.target);
    onChange(e);
    restoreFocus(k);
  });
  function onClick(e) {
    const t = e.target.closest("button, [data-act], [data-slot]");
    if (!t) return;
    if (t.matches("[data-close]")) return t.closest("dialog").close();
    if (t.dataset.view) { ui.view = t.dataset.view; if (ui.view === "photo") ui.preview = null; return renderTint(); }
    if (t.dataset.ba) { ui.ba = t.dataset.ba; return renderTint(); }
    const act = t.dataset.act;
    if (!act && t.dataset.slot && !t.matches("input")) {
      select(t.dataset.slot);
      if (t.closest(".planbar") || t.closest("#pins")) $("#panel").focus({ preventScroll: true });
      return;
    }
    switch (act) {
      case "mode": ui.mode = t.dataset.mode; ui.brand = "all"; ui.compare.clear(); ui.openWhy = null; ui.preview = null; return render();
      case "swap": { const d = t.closest("dialog"); if (d) d.close(); return doSwap(t.dataset.id); }
      case "preview":
        ui.preview = ui.preview && ui.preview.id === t.dataset.id ? null : { slot: ui.slot, id: t.dataset.id };
        renderTint(); renderPanel(); $("#room").scrollIntoView({ block: "nearest", behavior: "smooth" }); return;
      case "clearPreview": ui.preview = null; renderTint(); return renderPanel();
      case "lock": case "lockSlot": {
        const slot = t.dataset.slot || ui.slot;
        state = P.toggle(state, "locked", slot);
        render();
        if (t.closest("#dlgPlan")) openPlan();
        return toast(isLocked(slot) ? `${slotInfo[slot].label} locked. It won't be swapped or changed by Fit my budget.` : `${slotInfo[slot].label} unlocked.`);
      }
      case "undo": return undo();
      case "openCompare": return openCompare();
      case "clearFilters": ui.brand = "all"; ui.maxPrice = ""; return renderPanel();
      case "suggest": ui.slot = t.dataset.slot; ui.mode = "aesthetic"; ui.sort = "room"; ui.brand = "all"; ui.maxPrice = ""; ui.preview = null; ui.compare.clear(); render(); return $("#panel").scrollIntoView({ block: "start", behavior: "smooth" });
      case "quickSave": {
        const v = store.saveVersion(`Version ${store.listVersions().length + 1}`, state);
        if (v) { markVersion(v); render(); toast(`Saved as “${v.name}”${store.persistent ? "" : " (this tab only: storage blocked)"}.`); } else toast("Couldn't save: browser storage is full or blocked.");
        return;
      }
      case "saveVersion": {
        const name = ($("#verName").value || "").trim() || `Version ${store.listVersions().length + 1}`;
        const v = store.saveVersion(name, state);
        if (v) { markVersion(v); render(); openVersions(); toast(`Saved “${name}”.`); } else toast("Couldn't save: browser storage is full or blocked.");
        return;
      }
      case "openVersion": {
        const v = store.listVersions().find((x) => x.id === t.dataset.id);
        const s = v && P.validate(v.state, DEFAULTS, byId, ROOM.aesthetics);
        if (!s) return toast("That version couldn't be read.");
        state = s; markVersion({ name: v.name, id: v.id, state: s }); ui.lastSwap = null; ui.preview = null;
        $("#dlgVersions").close(); render(); return toast(`Opened “${v.name}”.`);
      }
      case "deleteVersion":
        store.deleteVersion(t.dataset.id);
        if (ui.versionId === t.dataset.id) Object.assign(ui, { versionName: null, versionId: null, versionSnap: null });
        render(); return openVersions();
      case "applyPlan": return applyPlan(Number(t.dataset.i));
      case "openPlan": return openPlan();
    }
  }

  function onChange(e) {
    const t = e.target, act = t.dataset.act;
    if (act === "sort") { ui.sort = t.value; return renderPanelKeepFocusSel(t); }
    if (act === "brand") { ui.brand = t.value; return renderPanelKeepFocusSel(t); }
    if (act === "compare") {
      if (t.checked && ui.compare.size >= 3) { t.checked = false; return toast("Compare up to 3 alternatives at a time."); }
      t.checked ? ui.compare.add(t.dataset.id) : ui.compare.delete(t.dataset.id);
      const b = $('[data-act="openCompare"]'); b.textContent = `Compare (${ui.compare.size})`; b.disabled = !ui.compare.size; return;
    }
    if (act === "bought") { state = P.toggle(state, "bought", t.dataset.slot); render(); return openPlan(); }
    if (act === "maxPrice") { ui.maxPrice = t.value; return renderPanelKeepFocusSel(t); }
  }
  function renderPanelKeepFocusSel(t) {
    const act = t.dataset.act;
    renderPanel();
    const el = $(`[data-act="${act}"]`, $("#panel"));
    if (el) el.focus();
  }
  // remember which "Why this match?" the user opened or closed (clicks only, not re-renders)
  document.addEventListener("click", (e) => {
    const sm = e.target.closest("details.why > summary");
    if (sm) ui.openWhy = sm.parentNode.open ? "none" : sm.parentNode.dataset.id;
  }, true);
  document.addEventListener("error", (e) => {
    const im = e.target;
    if (im.tagName === "IMG" && im.classList.contains("pimg")) {
      const box = im.parentNode;
      box.classList.add("swatch-only");
      box.style.background = im.dataset.hex;
      box.innerHTML = "<span>swatch</span>";
      box.title = "Product photo didn't load, showing its colour instead";
    }
  }, true);

  /* header controls */
  const sel = $("#aesthetic");
  sel.innerHTML = Object.entries(ROOM.aesthetics).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join("");
  sel.value = state.aesthetic;
  sel.addEventListener("change", () => {
    const before = roomFit().score;
    state = Object.assign({}, state, { aesthetic: sel.value });
    render();
    const n = roomFit().perItem.filter((it, i) => !isLocked(SLOTS[i]) && it.fit !== null && it.fit < ROOM.poorFit).length;
    toast(`Room style: ${aesthetic().label}. Room fit ${pct(before)} → ${pct(roomFit().score)}. ${n ? n + " item(s) suggested, nothing replaced." : "Nothing replaced."}`);
  });
  const bud = $("#budget");
  bud.value = state.budget;
  // wait until typing pauses, so half-typed numbers (e.g. 9,99,999 on the way to 99,99,999) are never applied
  bud.addEventListener("input", () => {
    clearTimeout(bud.t);
    bud.t = setTimeout(() => {
      const v = Number(bud.value);
      if (!Number.isFinite(v) || v < 1000 || v > 1000000) return;
      state = Object.assign({}, state, { budget: Math.round(v) });
      renderPlanbar(); renderPanel(); persist();
    }, 400);
  });
  bud.addEventListener("change", () => { if (Number(bud.value) < 1000 || Number(bud.value) > 1000000) { bud.value = state.budget; toast("Budget must be between ₹1,000 and ₹10,00,000."); } });
  $("#openOptimizer").addEventListener("click", openOptimizer);
  $("#openVersions").addEventListener("click", openVersions);
  $("#openGuide").addEventListener("click", openGuide);
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  window.__styleswap = { get state() { return state; }, ui, byId, roomFit, results };
  render();
})();
