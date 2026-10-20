"""Build data/products.js from the researched product listings.

    python tools/build_data.py

Inputs
  data/sources/ikea_products.json, data/sources/other_products.json
      Facts copied from each retailer's product page on the date in "checked":
      name, brand, retailer, price, url, image, colour name, material, size.
      Nothing in these files is edited by hand here.

Our additions (CURATION below), clearly separate from the retailer facts
  hex      an approximate colour code for the retailer's colour name
           (used for colour similarity and the colour preview)
  tags     style tags we assigned (used for style similarity and room fit)
  material a normalised key for the main visible material
           (lamps: the shade; chairs: the seat/upholstery)
  pattern  the retailer's stated pattern, or "plain" when the retailer names a
           single solid colour and no pattern (marked patternInferred)
  finish   only when the retailer states one. For lamps, chairs and blinds the
           stated finish is the coating of the base, frame or rails (e.g.
           "powder-coated"), so the app labels it "Finish (base/frame)".
           Blind opacity ("Blackout", "Sheer") is not a finish and is not scored.

The script refuses to build if any product is missing a curation entry, so
the catalogue can never silently contain made-up values.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources"

# key: (name, colour_name) exactly as in the source file
# value: (hex, tags, material_key, pattern, pattern_inferred, finish)
P, I = False, True  # pattern stated by retailer / inferred "plain"
CURATION = {
    # ---------------- IKEA bedspreads
    ("INDIRA Bedspread", "grey-green"): ("#8e9b88", ["natural", "soft", "scandi", "simple"], "cotton", "plain", I, None),
    ("INDIRA Bedspread", "natural/unbleached cotton"): ("#e6dccb", ["natural", "scandi", "light", "simple", "cosy"], "cotton", "plain", I, None),
    ("GULLSTRÅLE Bedspread", "white"): ("#f4f2ee", ["cosy", "soft", "light", "minimal"], "polyester", "plain", I, None),
    ("TRATTVIVA Bedspread", "dark grey-blue"): ("#3e4a5a", ["modern", "bold", "cosy"], "polyester", "plain", I, None),
    ("JAKOBSLILJA Bedspread", "off-white/anthracite"): ("#e9e6df", ["classic", "modern", "clean"], "cotton", None, P, None),
    ("VETEJORDFLY Bedspread", "white/beige"): ("#e8e0d2", ["soft", "cosy", "light", "neutral"], "polyester", None, P, None),
    ("TJÄRBLOMSTER Bedspread", "grey"): ("#9a9a98", ["minimal", "simple", "neutral"], "polyester", "plain", I, None),
    ("ÅKERTISTEL Comforter", "yellow"): ("#e3b23c", ["warm", "cosy", "colourful", "natural"], "cotton", "plain", I, None),
    # ---------------- IKEA rugs
    ("STOENSE Rug, low pile", "off-white"): ("#ece7dc", ["minimal", "soft", "scandi", "light"], "polypropylene", "plain", I, None),
    ("FULLMAKT Rug flatwoven, in/outdoor", "beige/mélange"): ("#c9bba3", ["natural", "neutral", "textured", "simple"], "polyester", "mélange", P, None),
    ("LOHALS Rug, flatwoven", "natural"): ("#b9955f", ["natural", "earthy", "textured", "handmade", "warm"], "jute", "plain", I, None),
    ("STRÖG Rug, flatwoven", "natural"): ("#bb9a66", ["natural", "earthy", "textured", "warm"], "jute", "plain", I, None),
    ("TIPHEDE Rug, flatwoven", "natural/black"): ("#d8cdb6", ["scandi", "natural", "simple"], "cotton", None, P, None),
    ("JÄRNVÄG Rug, low pile", "ornament pattern pink/beige"): ("#d8b3a4", ["boho", "patterned", "colourful", "classic"], "polypropylene", "ornamental", P, None),
    ("ÄRENDE Rug, high pile", "grey"): ("#8f8d8a", ["soft", "cosy", "modern", "neutral"], "polypropylene", "plain", I, None),
    ("LOKALTÅG Rug, low pile", "beige/grey"): ("#b9ab97", ["classic", "patterned", "boho"], "polyester", "oriental", P, None),
    # ---------------- IKEA lamps (material = shade)
    ("STRANDAD Table lamp", "white/black"): ("#f2efe8", ["scandi", "light", "natural", "minimal"], "paper", None, P, "powder-coated"),
    ("STORSEGEL Table lamp", "ash/white"): ("#efe9df", ["scandi", "natural", "light", "soft"], "polyester", "plain", I, None),
    ("RINGSTA / SKAFTET Table lamp", "white/nickel-plated"): ("#f5f3ef", ["classic", "clean", "minimal"], "plastic", "plain", I, "nickel-plated"),
    ("TÄRNABY Table lamp, dimmable", "beige"): ("#d8c6a8", ["modern", "soft", "warm"], "glass", "plain", I, "powder-coated"),
    ("ÅRSTID Table lamp", "brass/white"): ("#f3efe6", ["classic", "warm"], "polyester", "plain", I, "brushed nickel"),
    ("FLYGHÖJD Table lamp", "brass/beige"): ("#d9c9ad", ["classic", "warm", "modern"], "polyester", "plain", I, "nickel-plated"),
    ("BÄCKNATE Table lamp", "white"): ("#f2f2ef", ["modern", "minimal", "clean"], "plastic", "plain", I, None),
    ("NYMÅNE Table lamp", "anthracite"): ("#3a3c3f", ["modern", "sleek", "bold"], "glass", "plain", I, "powder-coated"),
    # ---------------- IKEA blinds
    ("SCHOTTIS Pleated blind", "white"): ("#f6f5f2", ["simple", "minimal", "light"], "polyester", "plain", I, None),
    ("LÅNGDANS Roller blind", "grey"): ("#b9b9b6", ["minimal", "soft", "modern"], "polyester", "plain", I, None),
    ("FÖNSTERBLAD Block-out roller blind", "white"): ("#f4f4f2", ["minimal", "clean", "simple"], "polyester", "plain", I, None),
    ("FÖNSTERBLAD Block-out roller blind", "beige"): ("#d9cbb2", ["natural", "warm", "simple"], "polyester", "plain", I, None),
    ("RINGBLOMMA Roman blind", "beige"): ("#d6c7ae", ["natural", "soft", "cosy", "classic"], "polyester", "linen look", P, None),
    ("TRETUR Block-out roller blind", "light grey"): ("#cfd0cf", ["modern", "clean", "minimal"], "polyester", "plain", I, "anodised"),
    ("HOPPVALS Cellular blind", "white"): ("#f5f4f0", ["minimal", "clean", "scandi"], "polyester", "plain", I, "powder-coated"),
    ("VECKLARFLY Venetian blind", "white"): ("#f3f3f1", ["modern", "clean", "minimal"], "aluminium", "plain", I, "painted"),
    # ---------------- IKEA chairs (material = seat/upholstery)
    ("LOBERGET / MALSKÄR Swivel chair", "white"): ("#f2f2f0", ["scandi", "minimal", "simple"], "plastic", "plain", I, "powder-coated"),
    ("BLECKBERGET Swivel chair", "Klovsta white/grey"): ("#d7d6d2", ["scandi", "simple", "soft"], "polyester", None, P, "powder-coated"),
    ("RENBERGET Swivel chair", "Bomstad black"): ("#2a2a2a", ["modern", "sleek", "simple"], "polyester", "plain", I, "powder-coated"),
    ("FLINTAN Office chair", "beige"): ("#cdbb9c", ["simple", "neutral", "modern"], "polyester", "plain", I, "powder-coated"),
    ("ÖRFJÄLL Swivel chair", "white/Vissle light grey"): ("#d9d9d6", ["scandi", "light", "soft"], "polyester", None, P, "powder-coated"),
    ("FLINTAN Office chair with armrests", "beige"): ("#cdbb9c", ["simple", "neutral", "modern"], "polyester", "plain", I, "powder-coated"),
    ("MILLBERGET Swivel chair", "Murum beige"): ("#c9b393", ["classic", "modern", "neutral"], "polyester", "plain", I, "powder-coated"),
    ("LÅNGFJÄLL Conference chair", "Gunnared beige/white"): ("#d6c9b3", ["modern", "sleek", "neutral"], "polyester", None, P, "powder-coated"),
    # ---------------- other bedspreads
    ("Repose Kaaya Cotton Quilted 3Pcs Double Bed Cover Set", "Blue"): ("#5b7fa8", ["classic", "cosy", "soft"], "cotton", None, P, None),
    ("Repose Ira 3Pcs Cotton Floral Print Double Bed Cover Set", "Green"): ("#7d9a6a", ["boho", "patterned", "colourful", "natural"], "cotton", "floral", P, None),
    ("MASPAR Charlotte Double Bed Cover", "Beige"): ("#d8c8aa", ["classic", "neutral", "soft"], "cotton blend", None, P, None),
    ("Yellow Chevron Cotton Throw", "Multicolor"): ("#e0b84a", ["boho", "patterned", "colourful", "warm", "cosy"], "cotton", "chevron", P, None),
    ("Checkered Yellow navy Throw", "Multicolor"): ("#d9b13b", ["classic", "patterned", "bold", "cosy"], "cotton", "checked", P, None),
    ("All Season Waffle Sofa Throw Blanket Beige White 220x200cm", "Beige, white"): ("#e7ddcb", ["natural", "textured", "cosy", "soft", "neutral"], "cotton", "textured weave", P, None),
    # ---------------- other rugs
    ("Classic Braided Jute Round Rug", "Beige"): ("#c4a678", ["natural", "earthy", "textured", "handmade", "warm", "cosy"], "jute", "braided", P, None),
    ("Hand Braided Jute Colorful Round Rug", "Multicolor"): ("#c58a4a", ["boho", "handmade", "colourful", "natural", "textured"], "jute", "braided", P, None),
    ("Monalisa Wavora Knitted Woven Carpet - 227cm", "Beige"): ("#d6c6a6", ["modern", "soft", "neutral", "textured"], "polyester", None, P, None),
    ("Mozart Hand Tufted Woollen And Viscose Round Rug", "Beige"): ("#cdbb9d", ["classic", "soft", "neutral"], "wool", None, P, None),
    ("Rumi Hand Tufted Woollen and Viscose Round Rug", "Soft grey"): ("#a9a8a4", ["modern", "soft", "minimal"], "wool", None, P, None),
    ("Tia Multicolour Floral Printed Cotton 6x4 Ft Dhurrie", "Multicolor"): ("#c96f4a", ["boho", "patterned", "colourful"], "cotton", "floral", P, None),
    # ---------------- other lamps (material = shade)
    ("Decade Glass and Metal Table Lamp With White Cotton Shade", "White shade"): ("#f3f1ec", ["classic", "modern", "clean"], "cotton", "plain", I, None),
    ("Devansh Yellow Cotton Table Lamp With Wood Pebble Lamp (10X10X15) Inches", "Yellow"): ("#e2b33c", ["warm", "natural", "colourful", "handmade"], "cotton", "plain", I, None),
    ("Asa white & black cotton table lamp with Natural Wood Base", "Multicolor (white & black)"): ("#efede8", ["scandi", "natural", "simple"], "cotton", None, P, None),
    ("Kyoto Metal Desk Table Lamp", "Black"): ("#2a2a2a", ["modern", "sleek", "minimal", "metal"], "metal", "plain", I, None),
    ("Riviera Dune Ceramic Table Lamp", "Beige"): ("#d8c7a8", ["warm", "natural", "soft", "classic"], "linen", "plain", I, None),
    ("Kairo Grain Wooden Table Lamp", "Brown"): ("#7a5537", ["natural", "warm", "earthy", "cosy"], "linen", None, P, None),
    # ---------------- other blinds
    ("DECO WINDOW Brown Zebra Roller Blind - 36x84", "Brown"): ("#6b4a33", ["modern", "bold", "patterned"], "polyester", "striped", P, None),
    ("DECO WINDOW Beige Jacquard Blackout Roller Blind - 42x84", "Beige"): ("#cdbb9b", ["classic", "warm", "textured"], "polyester", "jacquard", P, None),
    ("DECO WINDOW Off-White Sheer Roller Blind - 39x84", "Off-White"): ("#efeae0", ["light", "soft", "minimal"], "polyester", None, P, None),
    ("DECO WINDOW Grey Printed Roller Blind - 52x84", "Grey"): ("#8c8c8c", ["modern", "patterned"], "polyester", "printed", P, None),
    ("DECO WINDOW Yellow Solid Roller Blind - 20x84", "Yellow"): ("#e5b437", ["colourful", "bold", "warm"], "polyester", "plain", P, None),
    ("Brown Jacquard Corded Blackout 84X42 Inches Roller Blind", "Brown"): ("#6e5039", ["classic", "warm", "textured", "earthy"], "polyester", "jacquard", P, None),
    # ---------------- other chairs (material = seat/upholstery)
    ("Green Soul Atom Basic Chair", "Black"): ("#2b2b2b", ["simple", "modern"], "mesh", None, P, None),
    ("Green Soul Jupiter Superb Mid Back Mesh Office Chair", "Black"): ("#262626", ["modern", "sleek"], "mesh", None, P, None),
    ("Mika Leatherette Study Chair in Scarlet Red Colour", "Scarlet Red"): ("#b0202a", ["bold", "modern", "colourful", "sleek"], "leatherette", "plain", I, "chrome"),
    ("Dorsey Study Chair in Black Colour", "Black"): ("#222222", ["modern", "sleek", "minimal"], "mesh", None, P, None),
    ("Aurelio Solid Wood Study Chair in Macadamia Brown Hopsack Weave Colour with Mahogany Finish", "Macadamia Brown Hopsack Weave"): ("#9b7b5c", ["natural", "classic", "warm", "handmade"], "wood", "textured weave", P, "mahogany"),
    ("Zuby Maximus Faux Leather High Back Chair - Brown", "Brown"): ("#5b3a28", ["classic", "bold"], "leatherette", "plain", I, None),
    ("Quadro Aero Mesh Medium Back Office Chair - Grey", "Grey"): ("#7f8185", ["modern", "simple", "neutral"], "mesh", None, P, None),
}

# The plan starts with the closest real product we found to each item in the image.
START = {
    "bedspread": ("ÅKERTISTEL Comforter", "yellow"),
    "rug": ("Classic Braided Jute Round Rug", "Beige"),
    "lamp": ("STORSEGEL Table lamp", "ash/white"),
    "blinds": ("VECKLARFLY Venetian blind", "white"),
    "chair": ("FLINTAN Office chair", "beige"),
}


def slug(s):
    s = s.lower()
    for a, b in {"å": "a", "ä": "a", "ö": "o", "é": "e"}.items():
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def main():
    raw = []
    for f in ("ikea_products.json", "other_products.json"):
        raw += json.loads((SRC / f).read_text(encoding="utf-8"))
    out, seen, problems = [], set(), []
    for r in raw:
        key = (r["name"], r["colour_name"])
        if key not in CURATION:
            problems.append(f"no curation entry for {key}")
            continue
        hexc, tags, mat, pattern, inferred, finish = CURATION[key]
        pid = slug(f'{r["brand"].split(" (")[0]}-{r["name"]}-{r["colour_name"]}')
        if pid in seen:
            problems.append(f"duplicate id {pid}")
        seen.add(pid)
        if not (isinstance(r["price_inr"], (int, float)) and r["price_inr"] > 0 and r["url"].startswith("https://")):
            problems.append(f"bad price/url for {key}")
        out.append({
            "id": pid, "category": r["category"], "name": r["name"],
            "brand": "Home Centre" if r["brand"].startswith("Home Centre") else r["brand"],  # own collections have no brand field
            "retailer": {"homecentre.in": "Home Centre", "urbanladder.com": "Urban Ladder", "obeetee.in": "Obeetee", "nestasia.in": "Nestasia",
                         "pepperfry.com": "Pepperfry", "greensoul.online": "Green Soul"}.get(r["retailer"], r["retailer"]),
            "price": int(r["price_inr"]), "url": r["url"], "image": r.get("image_url"),
            "colourName": r["colour_name"], "hex": hexc, "tags": tags,
            "material": mat, "materialText": r.get("material"),
            "pattern": pattern, "patternInferred": bool(pattern and inferred),
            "finish": finish, "size": r.get("size"), "description": r.get("description"),
            "checked": r["checked"],
        })
    unused = set(CURATION) - {(r["name"], r["colour_name"]) for r in raw}
    problems += [f"unused curation entry {k}" for k in unused]
    start = {}
    for slot, key in START.items():
        m = [p for p in out if (p["name"], p["colourName"]) == key and p["category"] == slot]
        if len(m) != 1:
            problems.append(f"start item for {slot} not found")
        else:
            start[slot] = m[0]["id"]
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    data = {"checked": max(p["checked"] for p in out), "start": start, "products": out}
    (ROOT / "data" / "products.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "data" / "products.js").write_text(
        "/* Generated by tools/build_data.py from data/sources/*.json. Do not edit by hand. */\n"
        "(function (root) { (root.SS = root.SS || {}).DATA = " + json.dumps(data, ensure_ascii=False) + "; })"
        "(typeof window !== \"undefined\" ? window : globalThis);\n", encoding="utf-8")
    by = {}
    for p in out:
        by.setdefault(p["category"], []).append(p)
    for c, ps in by.items():
        print(f"{c:10s} {len(ps):2d} products, brands: {sorted({p['brand'] for p in ps})}")
    print("start plan:", start)


if __name__ == "__main__":
    main()
