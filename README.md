# StyleSwap: Pinterest "Inspiration to Reality"

A working prototype for the IEEE **Improve It!** task. On Pinterest you can save a room you love, but you can't turn it into a plan you can actually buy. StyleSwap lets you tap **one item** in a room image, say **what** you want to change (colour, price, brand, style, material, pattern, finish or a price limit), and see **real Indian products** with two clear numbers:

- **Item match**: how close the alternative is to your current item, in the qualities you're keeping.
- **Whole-room fit (estimate)**: how well the whole room hangs together with the chosen room style after the swap, shown as before → after.

Everything else in the room stays exactly as it was. Your Reality Plan (items, total, budget, checklist, locks, saved versions) updates immediately.

> Student concept. Not affiliated with Pinterest or any retailer. No AI is used anywhere in this prototype: every number comes from the formulas below.

## Run it

No install and no server: it's plain HTML, CSS and JavaScript.

1. Download or clone the folder.
2. Double-click `index.html` (Chrome, Edge, Firefox or Safari).

For a phone on the same Wi-Fi, or to mirror how it runs online: `python -m http.server 8000` in the folder, then open `http://<your-computer-ip>:8000`.

### Deploy (free, static)

- **GitHub Pages:** push the folder to a repository, then Settings → Pages → Deploy from branch → `main` / root. The site appears at `https://<user>.github.io/<repo>/`.
- **Netlify / Vercel:** drag the folder onto the dashboard (or import the repo). No build command; the publish directory is the root.

## How to use it

1. Tap a numbered pin on the image (or an item under it). Labels appear only for the selected item, so the image stays clear.
2. Choose what to change. The 4 most common ways are buttons; **More ways to change it** opens material, pattern, finish and "under my limit".
3. Read each card: price and difference, **item match** (green ring), **room fit before → after** (charcoal bar), what stays the same and what changes, and **Why this match?** with the exact arithmetic.
4. Optional: sort (best item match, best room fit, price, or "my priority"), filter by brand or max price, tick up to 3 cards to **Compare** side by side, or **Preview on image** to see the colour on the room.
5. **Swap in.** Only that item changes. You'll see a before/after strip (total and room fit), a Before/After image toggle and Undo.
6. **Lock** items you love. **Room style** re-scores the room and marks poor-fit unlocked items as "suggested swap", but never replaces anything by itself. **Fit my budget** finds the best combination under your target. **Save version** and reopen it any time.

## Architecture

```
index.html          page structure (header, room, item panel, plan bar, dialogs)
css/styles.css      design: ivory / sage / charcoal, responsive down to 360 px
js/color.js         CIEDE2000 colour difference (pure maths)
js/scoring.js       item match + room fit (pure functions, no page code)
js/modes.js         the 8 change modes: filter + weights, sorting
js/optimizer.js     "Fit my budget": exact search over all combinations
js/plan.js          plan state, swap/lock/checklist, saved versions (localStorage)
js/recolor.js       colour preview on the image (canvas)
js/app.js           connects data + calculations to the page
data/room.js        image, credit, 5 item slots (hotspots, outlines, quantity), room styles
data/products.js    generated catalogue (do not edit; see below)
data/sources/       the researched listings + research notes (facts from retailer pages)
tools/build_data.py builds data/products.js from data/sources + our clearly separated additions
tests/unit.test.js  unit tests of the calculations (node --test tests/unit.test.js)
tests/e2e_test.py   67 end-to-end checks in a real browser, desktop + phone sizes
```

The calculation files don't touch the page, so they're tested on their own in Node. `app.js` only reads state, calls those functions and redraws.

## Scoring (documented, consistent, estimates)

### Per-quality similarity (0 to 1)

| Quality | Rule |
|---|---|
| Colour | `max(0, 1 − ΔE00 / 40)`, where ΔE00 is the CIEDE2000 colour difference |
| Style | shared style tags ÷ all tags of both products (Jaccard) |
| Material | same 1 · same family (e.g. cotton/jute = natural fibre) 0.6 · otherwise 0 |
| Pattern | same 1 · both patterned but different 0.4 · plain vs patterned 0 |
| Finish (base/frame) | same 1 · otherwise 0 |
| Price | `max(0, 1 − |new − current| / current)` |

If either product has no data for a quality, it is **not verified**: it is left out of the score, shown as "not verified", and never guessed. If less than half of the weighted qualities can be checked, the card shows **low data**.

### Item match

`item match = Σ(weight × similarity) ÷ Σ(weight)` over the qualities the mode **keeps** that both products have data for. The quality the mode **changes** is left out (it's meant to differ).

| Mode | Shows | Weights of kept qualities |
|---|---|---|
| New colour, same price | colour ΔE00 ≥ 15 and price within ±15% (if none: ±40%, labelled as looser) | style 35, material 20, pattern 20, price 15, finish 10 |
| Cheaper, same look | price below current | style 35, colour 30, material 15, pattern 10, finish 10 |
| Other brand, same design | different brand | style 30, colour 20, pattern 20, material 15, price 10, finish 5 |
| New style, same vibe | style tag overlap below 50% | colour 55, price 25, material 20 |
| Different material | material known and different | colour 35, style 30, price 20, pattern 15 |
| Different pattern | pattern known and different | colour 35, style 30, price 20, material 15 |
| Different finish | finish known and different | colour 35, style 30, price 20, material 15 |
| Under my limit | price ≤ the slider limit | style 35, colour 30, material 15, pattern 10, finish 10 |

### Whole-room fit

For each of the 5 items: `item fit = ½ × palette fit + ½ × style fit`, where

- `palette fit = max(0, 1 − ΔE00(item colour, nearest room-style colour) / 40)`
- `style fit = share of the item's style tags that belong to the room style`

`room fit = average item fit`. It is recalculated after every swap and every room-style change, and shown before → after.

**Why "share of tags" and not Jaccard here:** a room style has 5 or 6 tags and a product has 2 to 6. With Jaccard, a product whose tags are all in the room style could still score only 30%. "Share of the item's tags that fit" answers the real question: does this item belong in this style?

Both scores are **rounded to the nearest 5%** and labelled estimates, because their inputs are approximate (see the data section). The card's "Why this match?" shows the unrounded arithmetic.

### Budget optimiser

It checks every combination of one product per item (locked items fixed). With the current catalogue that's 14 × 14 × 14 × 14 × 15 = 576,240 combinations, which takes well under a second. It keeps combinations whose total (blinds × 2) is within the target, ranks them by room fit and then by lower total, and shows the top 3 with what each saves, spends and changes. Because it checks everything, the answer is exact for this catalogue; the end-to-end test confirms this with an independent brute-force search.

## Data: sources, honesty and credits

- **Products:** 71 real listings from IKEA India, Urban Ladder, Home Centre, Obeetee, Nestasia, Pepperfry and Green Soul, by brands including IKEA, Urban Ladder, Home Centre, Obeetee, MASPAR, Deco Window, Devansh, Kapoor Lamp Shades, Nestasia and Green Soul. Name, brand, ₹ price, link, image, colour name, material and size were read on each product page on **20 Oct 2026** (`data/sources/*.json`, with notes on sale prices and page conflicts in `data/sources/*_notes.md`). **Prices are a dated snapshot, not live.** Many were festive-sale prices.
- **Our additions** (in `tools/build_data.py`, kept separate from retailer facts):
  - `hex`: an approximate colour code for the retailer's colour name. Multi-colour items use their main colour.
  - `tags`: style tags assigned by us.
  - `material`: a normalised key for the main visible material. For lamps that's the shade; for chairs, the seat or upholstery.
  - `pattern`: as stated by the retailer, or "plain (our reading)" when the retailer names one solid colour and no pattern.
  - `finish`: only when the retailer states it. For lamps, chairs and blinds that's the coating of the base, frame or rails (e.g. powder-coated, chrome), so the app labels it "Finish (base/frame)". Blind opacity (blackout, sheer) is not treated as a finish.

  The build refuses to run if any product lacks these entries.
- **The starting plan** uses the closest real product we found to each item in the image. The image's own furniture isn't for sale.
- **Room image:** [Desiree Goulden on Unsplash](https://unsplash.com/photos/a-bedroom-with-a-bed-and-a-rug-in-it-ZqStE3k8gCI), [Unsplash License](https://unsplash.com/license). It is a 3D render, not a photograph. Hotspots and outlines were placed by hand. No Pinterest images are used.
- Product images load from each retailer's own site and link back to it. If one doesn't load, the card shows the product's colour swatch instead.
- Fonts: Fraunces and Inter (Google Fonts, SIL Open Font License).

## Limitations

- The catalogue is small (14 or 15 per item), so some modes have few or no results. The app then explains why instead of inventing matches. Pattern and finish modes need the retailer to state those details.
- Colours are approximations of colour names, and style tags are our judgement, so both scores are estimates.
- The colour preview recolours a hand-drawn outline while keeping the image's light and shadow. It does not change texture, pattern or shape, and light colours on dark items look darker than in reality.
- Saved versions live in this browser on this device (localStorage). They survive refresh and restart, but not clearing site data, private windows or switching device. If storage is blocked, the app says so and keeps versions for the session only.
- Prices exclude delivery and installation. Blinds are counted as 2 (two windows); sizes are as listed and haven't been fitted to the room.
- One room image. A real product would let users pick any saved Pin and would need item detection, which is out of scope for this prototype.

## Tests

```
node --test tests/unit.test.js   # 13 unit tests: CIEDE2000 reference values, each similarity rule,
                            # item match maths, unknown data, room fit, all mode filters,
                            # sorting, single-item swap, lock, optimiser (vs brute force), saving
python tests/e2e_test.py    # 67 browser checks + screenshots in docs/screenshots/
```

The end-to-end test re-implements the formulas independently in Python and compares them with what the page shows.

### Example test cases (from the end-to-end run)

| Case | Steps | Expected | Result |
|---|---|---|---|
| Colour | Bedspread → New colour, same price → Preview on image → Swap in | Only colour-different items within ±15% price; the image changes colour; only the bedspread changes in the plan | pass |
| Price | Bedspread → Cheaper, same look | Every card is cheaper; item match on the top card equals the hand calculation | pass |
| Brand | Rug → Other brand, same design → Brand filter | Only other brands; the filter shows one brand | pass |
| Aesthetic | Room style → Minimal (rug locked) | No item replaced; room fit recalculated; locked rug never "suggested" | pass |
| Single-item swap | Swap the bedspread | Exactly 1 of 5 items differs; total and room fit update; before/after and Undo work | pass |
| Budget | Target ₹25,000 → Fit my budget → Apply | Total ≤ ₹25,000, locked rug kept, best room fit (brute-force check) | pass |
| Versions | Save "Test A" → change lamp → refresh → open "Test A" | Working plan survives refresh; version restores items, locks, style and budget | pass |
| Mobile | 390 px and 360 px wide | No sideways scrolling; tap-swap changes only the rug; plan bar shows the new total | pass |
