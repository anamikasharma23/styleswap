"""End-to-end test: drives the real app in Chromium and checks what's on screen.

    pip install playwright && python -m playwright install chromium
    python tests/e2e_test.py

The numbers shown in the app are checked against an INDEPENDENT Python
re-implementation of the formulas below (not the app's own JavaScript), so a
wiring mistake (wrong product compared, wrong quantity, stale total) is caught.
"""
import json
import math
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "docs" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
DATA = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))
BY = {p["id"]: p for p in DATA["products"]}
QTY = {"bedspread": 1, "rug": 1, "lamp": 1, "blinds": 2, "chair": 1}
SLOTS = ["bedspread", "rug", "lamp", "blinds", "chair"]
AEST = {
    "cosy": (["#f2ebdd", "#d9c7a7", "#c8913e", "#d98c2b", "#8a5a32", "#b8925a"], ["natural", "warm", "textured", "handmade", "earthy", "cosy"]),
    "minimal": (["#ffffff", "#ececec", "#d6d1c8", "#9a9a9a", "#2b2b2b"], ["minimal", "clean", "neutral", "simple", "modern"]),
}
FAMILY = {"cotton": "n", "linen": "n", "jute": "n", "wool": "n", "cotton blend": "n", "polyester": "s", "polypropylene": "s", "mesh": "s", "leatherette": "s"}


# ---------- independent formulas ----------
def lab(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    R, G, B = lin(r), lin(g), lin(b)
    X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
    Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
    Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    return 116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))


def de2000(h1, h2):
    (L1, a1, b1), (L2, a2, b2) = lab(h1), lab(h2)
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h = lambda a, b: 0 if a == 0 and b == 0 else math.degrees(math.atan2(b, a)) % 360
    h1p, h2p = h(a1p, b1), h(a2p, b2)
    dL, dC = L2 - L1, C2p - C1p
    dh = 0
    if C1p * C2p:
        dh = h2p - h1p
        dh = dh - 360 if dh > 180 else dh + 360 if dh < -180 else dh
    dH = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lb, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hb = h1p + h2p
    if C1p * C2p:
        hb = (h1p + h2p) / 2 if abs(h1p - h2p) <= 180 else ((h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2)
    T = 1 - 0.17 * math.cos(math.radians(hb - 30)) + 0.24 * math.cos(math.radians(2 * hb)) + 0.32 * math.cos(math.radians(3 * hb + 6)) - 0.2 * math.cos(math.radians(4 * hb - 63))
    dT = 30 * math.exp(-(((hb - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lb - 50) ** 2 / math.sqrt(20 + (Lb - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dT)) * Rc
    return math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))


def sim(dim, a, b):
    if dim == "colour":
        return max(0, 1 - de2000(a["hex"], b["hex"]) / 40)
    if dim == "style":
        A, B = set(a["tags"]), set(b["tags"])
        return len(A & B) / len(A | B)
    if dim == "price":
        return max(0, 1 - abs(b["price"] - a["price"]) / a["price"])
    if not a.get(dim) or not b.get(dim):
        return None
    if a[dim] == b[dim]:
        return 1
    if dim == "material":
        return 0.6 if FAMILY.get(a[dim]) and FAMILY.get(a[dim]) == FAMILY.get(b[dim]) else 0
    if dim == "pattern":
        return 0.4 if a[dim] != "plain" and b[dim] != "plain" else 0
    return 0


def item_match(a, b, weights):
    num = den = 0
    for d, w in weights.items():
        s = sim(d, a, b)
        if s is not None:
            num += w * s
            den += w
    return num / den


def room_fit(items, aest):
    pal, tags = AEST[aest]
    fits = []
    for p in items:
        pf = max(0, 1 - min(de2000(p["hex"], c) for c in pal) / 40)
        sf = len([t for t in p["tags"] if t in tags]) / len(p["tags"])
        fits.append((pf + sf) / 2)
    return sum(fits) / len(fits)


r5 = lambda x: round(x * 20) / 20
pct = lambda x: f"{round(r5(x) * 100)}%"
inr = lambda n: "₹" + f"{n:,}" if n < 100000 else "₹" + format_inr(n)


def format_inr(n):
    s = str(n)
    head, tail = s[:-3], s[-3:]
    head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
    return f"{head},{tail}"


# ---------- test runner ----------
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))


def plan_total(items):
    return sum(BY[i]["price"] * QTY[s] for s, i in items.items())


def state(pg):
    return pg.evaluate("JSON.parse(JSON.stringify(window.__styleswap.state))")


def num(text):
    return int(re.sub(r"[^\d]", "", text))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL)
    pg.evaluate("localStorage.clear()")
    pg.reload()
    pg.wait_for_timeout(600)

    # 1. open room
    check("room image + 5 hotspots + 5 item buttons", pg.locator("#pins .hs").count() == 5 and pg.locator("#rail button").count() == 5)
    st = state(pg)
    check("starts with the closest real products", st["items"] == DATA["start"])
    shown_total = num(pg.locator("#planTotal").inner_text().split("of")[0])
    check("plan total = sum of prices × quantity (2 blinds)", shown_total == plan_total(st["items"]), f"{shown_total} vs {plan_total(st['items'])}")
    fit0 = room_fit([BY[st["items"][s]] for s in SLOTS], "cosy")
    check("room fit shown matches independent formula", pg.locator("#planFit").inner_text() == pct(fit0), f"{pg.locator('#planFit').inner_text()} vs {pct(fit0)}")
    pg.screenshot(path=str(SHOTS / "01-desktop-start.png"))

    # 2. select item by hotspot (keyboard)
    pg.locator('#pins [data-slot="rug"]').focus()
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(150)
    check("keyboard: Enter on hotspot selects the rug", pg.locator("#panel h2").inner_text() == "Rug")
    check("selected hotspot shows its label, others hidden", pg.locator('#pins [data-slot="rug"]').get_attribute("aria-pressed") == "true"
          and pg.locator('#pins [data-slot="lamp"] .tip').evaluate("e => getComputedStyle(e).opacity") == "0")

    # 3. every mode works on every item (results or an explained empty state)
    modes = ["colour", "cheaper", "brand", "aesthetic", "material", "pattern", "finish", "budget"]
    ok, counts = True, {}
    for slot in SLOTS:
        pg.click(f'#rail [data-slot="{slot}"]')
        for m in modes:
            if pg.locator(f'[data-mode="{m}"]').is_hidden():
                pg.click(".more summary")
            pg.click(f'[data-mode="{m}"]')
            n = pg.locator(".rcard").count()
            empty = pg.locator(".empty").count()
            counts[(slot, m)] = n
            ok &= (n > 0) != (empty > 0)
    check("all 8 modes × 5 items render results or an explanation", ok and not errors, str(errors[:2]))
    print("     results per item/mode:", {k: v for k, v in counts.items()})

    # 4. item match number = independent formula (bedspread, cheaper)
    pg.click('#rail [data-slot="bedspread"]')
    pg.click('[data-mode="cheaper"]')
    card = pg.locator(".rcard").first
    cid = card.get_attribute("data-id")
    orig = BY[st["items"]["bedspread"]]
    w = {"style": 35, "colour": 30, "material": 15, "pattern": 10, "finish": 10}
    exp = pct(item_match(orig, BY[cid], w))
    check("item match on card = independent calculation", card.locator(".ring span").inner_text() == exp, f"{card.locator('.ring span').inner_text()} vs {exp}")
    check("cheaper mode only shows cheaper products", all(BY[c.get_attribute("data-id")]["price"] < orig["price"] for c in pg.locator(".rcard").all()))
    after = dict(st["items"], bedspread=cid)
    exp_room = pct(room_fit([BY[after[s]] for s in SLOTS], "cosy"))
    got_room = card.locator(".fitnum").inner_text()
    check("room fit after swap on card = independent calculation", f"→ {exp_room}" in got_room, f"{got_room} vs {exp_room}")
    check("Why this match? open on top card with formula", card.locator("details.why[open] .formula").count() >= 2)
    check("stays/changes lists shown", card.locator(".kc .stays").count() == 1 and card.locator(".kc .changes").count() == 1)

    # 5. sorting + filters
    pg.select_option('[data-act="sort"]', "priceAsc")
    prices = [BY[c.get_attribute("data-id")]["price"] for c in pg.locator(".rcard").all()]
    check("sort price low→high", prices == sorted(prices) and len(prices) > 1, str(prices))
    pg.select_option('[data-act="sort"]', "room")
    pg.select_option('[data-act="sort"]', "priority:colour")
    ids = [c.get_attribute("data-id") for c in pg.locator(".rcard").all()]
    cs = [sim("colour", orig, BY[i]) for i in ids]
    check("sort by my priority (closest colour)", all(cs[i] >= cs[i + 1] - 1e-9 for i in range(len(cs) - 1)))
    brands = pg.locator('[data-act="brand"] option').all_inner_texts()[1:]
    pg.select_option('[data-act="brand"]', brands[0])
    check(f"brand filter ({brands[0]})", all(BY[c.get_attribute("data-id")]["brand"] == brands[0] for c in pg.locator(".rcard").all()))
    pg.select_option('[data-act="brand"]', "all")
    pg.fill('[data-act="maxPrice"]', "1500")
    pg.locator('[data-act="maxPrice"]').dispatch_event("change")
    check("max price filter", all(BY[c.get_attribute("data-id")]["price"] <= 1500 for c in pg.locator(".rcard").all()))
    pg.fill('[data-act="maxPrice"]', "")
    pg.locator('[data-act="maxPrice"]').dispatch_event("change")
    pg.select_option('[data-act="sort"]', "match")

    # 6. side-by-side comparison
    boxes = pg.locator('input[data-act="compare"]')
    boxes.nth(0).check()
    boxes.nth(1).check()
    pg.click('[data-act="openCompare"]')
    check("compare table: current + 2 alternatives", pg.locator("#dlgCompare table thead th").count() == 4)
    pg.screenshot(path=str(SHOTS / "05-compare.png"))
    pg.click("#dlgCompare [data-close]")

    # 7. live colour preview changes the image
    pg.click('[data-mode="colour"]')
    room = pg.locator("#room")
    before_png = room.screenshot()
    pg.locator('.rcard [data-act="preview"]').first.click()
    pg.wait_for_timeout(200)
    after_png = room.screenshot()
    check("colour preview changes the room image", before_png != after_png)
    pg.screenshot(path=str(SHOTS / "03-colour-preview.png"))

    # 8. swap exactly one item
    st0 = state(pg)
    sid = pg.locator(".rcard").first.get_attribute("data-id")
    pg.locator('.rcard [data-act="swap"]').first.click()
    pg.wait_for_timeout(250)
    st1 = state(pg)
    diff = [s for s in SLOTS if st0["items"][s] != st1["items"][s]]
    check("swap changes exactly one item (bedspread)", diff == ["bedspread"] and st1["items"]["bedspread"] == sid, str(diff))
    t1 = num(pg.locator("#planTotal").inner_text().split("of")[0])
    check("total recalculated immediately", t1 == plan_total(st1["items"]), f"{t1}")
    check("room fit recalculated immediately", pg.locator("#planFit").inner_text() == pct(room_fit([BY[st1["items"][s]] for s in SLOTS], "cosy")))
    ba = pg.locator(".ba").inner_text()
    check("before/after strip with totals", inr(plan_total(st0["items"])) in ba and inr(t1) in ba and "other 4 items are exactly as before" in ba, ba)
    check("before/after image toggle visible", pg.locator("#baToggle").is_visible())
    pg.screenshot(path=str(SHOTS / "02-desktop-after-swap.png"))
    pg.click('[data-ba="before"]')
    pg.click('[data-ba="after"]')
    pg.click('[data-act="undo"]')
    check("undo restores previous plan", state(pg)["items"] == st0["items"])
    pg.locator('.rcard [data-act="swap"]').first.click()
    st1 = state(pg)

    # 9. lock
    pg.click('#rail [data-slot="rug"]')
    pg.click('[data-act="lock"]')
    check("lock: rug locked, swap buttons disabled", "rug" in state(pg)["locked"] and pg.locator('.rcard [data-act="swap"][disabled]').count() == pg.locator(".rcard").count())

    # 10. room style selector never replaces items
    pg.select_option("#aesthetic", "minimal")
    st2 = state(pg)
    check("room style change replaces nothing", st2["items"] == st1["items"])
    check("room fit recalculated for Minimal", pg.locator("#planFit").inner_text() == pct(room_fit([BY[st2["items"][s]] for s in SLOTS], "minimal")))
    sc = pg.locator("#styleCheck").inner_text()
    check("locked rug is never suggested for replacement", "locked" in pg.locator("#styleCheck li").nth(1).inner_text() and "suggested" not in pg.locator("#styleCheck li").nth(1).inner_text())
    pg.screenshot(path=str(SHOTS / "04-style-minimal.png"))

    # 11. budget + optimiser
    pg.fill("#budget", "25000")
    pg.locator("#budget").dispatch_event("input")
    pg.wait_for_timeout(600)  # budget applies when typing pauses
    over = plan_total(st2["items"]) - 25000
    txt = pg.locator("#planTotal").inner_text()
    check("budget recalculates left/over", (f"{inr(over)} over" in txt) if over > 0 else (f"{inr(-over)} left" in txt), txt)
    pg.click("#openOptimizer")
    opts = pg.locator("#dlgOptimizer .olist > li")
    check("optimiser offers up to 3 options with trade-offs", 1 <= opts.count() <= 3 and "budget" in opts.first.inner_text())
    pg.screenshot(path=str(SHOTS / "06-optimiser.png"))
    pg.locator('#dlgOptimizer [data-act="applyPlan"]').first.click()
    st3 = state(pg)
    check("optimised plan is within budget", plan_total(st3["items"]) <= 25000, str(plan_total(st3["items"])))
    check("optimiser kept the locked rug", st3["items"]["rug"] == st2["items"]["rug"])
    # brute-force verify optimality (independent)
    best = -1
    import itertools
    opts_by = {s: ([BY[st2["items"][s]]] if s == "rug" else [q for q in DATA["products"] if q["category"] == s]) for s in SLOTS}
    for combo in itertools.product(*[opts_by[s] for s in SLOTS]):
        if sum(c["price"] * QTY[s] for c, s in zip(combo, SLOTS)) <= 25000:
            best = max(best, room_fit(combo, "minimal"))
    check("optimiser found the best room fit within budget (brute force)", abs(room_fit([BY[st3["items"][s]] for s in SLOTS], "minimal") - best) < 1e-9)
    pg.click('[data-act="undo"]')
    check("undo after optimiser", state(pg)["items"] == st2["items"])

    # 12. checklist
    pg.click('[data-act="openPlan"]')
    pg.locator('#dlgPlan input[data-act="bought"]').first.check()
    check("checklist tick counts", "1/5" in pg.locator('[data-act="openPlan"]').inner_text())
    pg.click("#dlgPlan [data-close]")

    # 13. save + reopen version, refresh
    pg.click("#openVersions")
    pg.fill("#verName", "Test A")
    pg.click('[data-act="saveVersion"]')
    saved = state(pg)
    pg.click("#dlgVersions [data-close]")
    pg.click('#rail [data-slot="lamp"]')
    pg.click('[data-mode="cheaper"]')
    pg.locator('.rcard [data-act="swap"]').first.click()
    check("plan changed after saving", state(pg)["items"] != saved["items"])
    pg.reload()
    pg.wait_for_timeout(500)
    check("refresh keeps the working plan", state(pg)["items"]["lamp"] != saved["items"]["lamp"] and state(pg)["locked"] == ["rug"])
    pg.click("#openVersions")
    check("version list survives refresh", "Test A" in pg.locator("#dlgVersions").inner_text())
    pg.locator('#dlgVersions [data-act="openVersion"]').first.click()
    check("reopened version restores items, locks, style, budget", state(pg) == saved, json.dumps(state(pg)))

    # 13b. regressions found by the independent review
    pg.click('#rail [data-slot="chair"]')
    pg.click('[data-mode="cheaper"]')
    pg.locator('.rcard [data-act="swap"]').first.focus()
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(200)
    check("focus after swap lands on Undo (not page top)", pg.evaluate("document.activeElement.dataset.act") == "undo")
    swapped = state(pg)
    pg.select_option("#aesthetic", "cosy")
    ba = pg.locator(".ba").inner_text()
    check("before/after strip recalculates after a style change", f"→ {pg.locator('#planFit').inner_text()}" in ba, ba)
    pg.click('[data-act="lock"]')  # lock the chair too
    pg.fill("#budget", "40000"); pg.locator("#budget").dispatch_event("input"); pg.wait_for_timeout(600)
    pg.click('[data-act="undo"]')
    st_u = state(pg)
    check("undo after later changes: swap stays (chair locked since) and nothing else reverts",
          st_u["items"] == swapped["items"] and "chair" in st_u["locked"] and st_u["aesthetic"] == "cosy" and st_u["budget"] == 40000, json.dumps(st_u))
    pg.click('[data-act="lock"]')  # unlock chair
    pg.locator('.rcard [data-act="swap"]').first.click()
    pg.select_option("#aesthetic", "minimal")
    pg.click('[data-act="undo"]')
    st_u2 = state(pg)
    check("undo puts back only the swapped item and keeps the new style",
          st_u2["items"]["chair"] == st_u["items"]["chair"] and st_u2["aesthetic"] == "minimal" and pg.locator("#aesthetic").input_value() == "minimal" and pg.locator("#budget").input_value() == "40000")
    pg.click('#rail [data-slot="rug"]')
    pg.click('[data-mode="brand"]')
    check("other-brand mode has no 'undefined' text", "undefined" not in pg.locator("#panel").inner_text())
    pg.locator('[data-mode="colour"]').focus()
    pg.keyboard.press("Enter")
    check("focus stays on the mode button after choosing it", pg.evaluate("document.activeElement.dataset.mode") == "colour")
    first = pg.locator("details.why").first
    if first.count():
        first.locator("summary").click()
        pg.select_option('[data-act="sort"]', "priceDesc")
        check("a closed 'Why this match?' stays closed after re-sorting", pg.locator("details.why[open]").count() == 0)
        pg.select_option('[data-act="sort"]', "match")
    check("plan bar items are real buttons inside a list", pg.locator("#planbar ul > li > button.pb-item").count() == 5)
    pg.click('[data-act="openPlan"]')
    pg.locator('#dlgPlan [data-act="lockSlot"][data-slot="lamp"]').focus()
    pg.keyboard.press("Enter")
    check("locking from the plan dialog keeps focus in the dialog", pg.evaluate("!!document.activeElement.closest('#dlgPlan')"))
    pg.locator('#dlgPlan [data-act="lockSlot"][data-slot="lamp"]').click()
    pg.keyboard.press("Escape")
    pg.click('#rail [data-slot="lamp"]')
    cheapest = min((q for q in DATA["products"] if q["category"] == "lamp"), key=lambda q: q["price"])
    if state(pg)["items"]["lamp"] != cheapest["id"]:
        pg.evaluate(f"window.__styleswap.ui.mode='cheaper'")
        pg.click('[data-mode="cheaper"]')
        pg.locator(f'.rcard[data-id="{cheapest["id"]}"] [data-act="swap"]').click()
    if pg.locator('[data-mode="budget"]').is_hidden():
        pg.click(".more summary")
    pg.click('[data-mode="budget"]')
    lim_label = num(pg.locator("#limitVal").inner_text())
    check("'Under my limit' label matches the slider", lim_label == int(pg.locator("#limit").input_value()), f"{lim_label} vs {pg.locator('#limit').input_value()}")
    pg.click("#openVersions")
    pg.locator('#dlgVersions [data-act="deleteVersion"]').first.click()
    pg.keyboard.press("Escape")
    check("deleting the open version clears its name from the plan bar", "Test A" not in pg.locator("#planbar").inner_text())

    # 14. no inert buttons
    inert = pg.evaluate("""() => [...document.querySelectorAll('button')].filter(b => !(b.dataset.act || b.dataset.slot || b.dataset.view || b.dataset.ba || b.hasAttribute('data-close') || ['openOptimizer','openVersions','openGuide'].includes(b.id))).map(b => b.outerHTML.slice(0, 80))""")
    check("every visible button has an action", not inert, str(inert))
    pg.click("#openGuide")
    check("guide explains formulas and credits", "1 − ΔE00/40" in pg.locator("#dlgGuide").inner_text() and "Desiree Goulden" in pg.locator("#dlgGuide").inner_text())
    pg.click("#dlgGuide [data-close]")
    check("no JavaScript errors on desktop", not errors, str(errors[:3]))
    ctx.close()

    # 15. other screen sizes
    for name, vp, mobile in [("laptop-1366", (1366, 768), False), ("tablet-1024", (1024, 768), False), ("phone-390", (390, 844), True), ("phone-360", (360, 740), True)]:
        c = b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        m = c.new_page()
        merr = []
        m.on("pageerror", lambda e: merr.append(str(e)))
        m.goto(URL)
        m.evaluate("localStorage.clear()")
        m.reload()
        m.wait_for_timeout(500)
        sw = m.evaluate("document.documentElement.scrollWidth")
        check(f"{name}: no horizontal scrolling", sw <= vp[0], f"scrollWidth {sw}")
        m.screenshot(path=str(SHOTS / f"07-{name}.png"))
        if mobile:
            m.locator('#rail [data-slot="rug"]').tap()
            m.locator('[data-mode="cheaper"]').tap()
            s0 = m.evaluate("JSON.parse(JSON.stringify(window.__styleswap.state))")
            m.locator('.rcard [data-act="swap"]').first.tap()
            m.wait_for_timeout(300)
            s1 = m.evaluate("JSON.parse(JSON.stringify(window.__styleswap.state))")
            check(f"{name}: tap-swap changes only the rug", [s for s in SLOTS if s0["items"][s] != s1["items"][s]] == ["rug"])
            check(f"{name}: plan bar visible with new total", m.locator("#planbar").is_visible() and num(m.locator("#planTotal").inner_text().split("of")[0]) == plan_total(s1["items"]))
            small = m.evaluate("""() => [...document.querySelectorAll('.panel button, .rail button, .planbar button, #pins button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 36).length""")
            check(f"{name}: touch targets at least 36px tall", small == 0, f"{small} small")
            m.evaluate("window.scrollTo(0, 0)")
            m.screenshot(path=str(SHOTS / f"08-{name}-after-swap.png"), full_page=False)
        check(f"{name}: no JavaScript errors", not merr, str(merr[:2]))
        c.close()
    b.close()

passed = sum(ok for _, ok in results)
print(f"\n{passed}/{len(results)} end-to-end checks passed")
sys.exit(0 if passed == len(results) else 1)
