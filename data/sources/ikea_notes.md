# IKEA India product research notes (checked 2026-10-20)

All data in ikea_products.json came from ikea.com/in/en, fetched with WebFetch on 2026-10-20. 40 products, 8 per category. Price, colour, material and size come from each product's own page. Category pages were only used to find the products.

## Category pages used
- Bedspreads: https://www.ikea.com/in/en/cat/bedspreads-20527/
- Round rugs: https://www.ikea.com/in/en/cat/round-carpets-20543/
- All rugs: https://www.ikea.com/in/en/cat/rugs-10653/
- Table lamps: https://www.ikea.com/in/en/cat/table-lamps-10732/
- Blinds: https://www.ikea.com/in/en/cat/blinds-10701/, roller-blinds-700223, roman-blinds-700224, venetian-blinds-700599, pleated-cellular-blinds-700225
- Chairs: https://www.ikea.com/in/en/cat/desk-chairs-20652/, https://www.ikea.com/in/en/cat/office-chairs-20654/

Product page URLs are in the `url` field of each record. Every one of them was fetched.

## What failed or was missing
- My first bedspread URL (cat/bedspreads-20523) loaded the bath towels page. The right ID is 20527.
- cat/blinds-10658 loaded shower accessories. The right ID is 10701.
- IKEA India's round rug category has only 2 products (STOENSE and FULLMAKT, both 130 cm). The other 6 rugs are rectangular. Two are jute (LOHALS and STRÖG), one is cotton, and three are polypropylene or polyester. I found no round jute rug on IKEA India.
- IKEA India lists no bamboo blinds. The blinds cover roller, block-out roller, sheer roller, roman, venetian (aluminium), cellular and pleated.
- I found no orange or saffron bedspread. The closest warm colour is the ÅKERTISTEL comforter in yellow.

## Price uncertainty (important)
There is a festive sale on, with a site banner reading "Festive offer - Up to 40% off*". Category pages say sale prices run "Oct 08 - Nov 11 or while supply lasts". In several cases the category page and the product page showed different prices. I recorded the product page price.
- Sale prices recorded (regular price in brackets):
  - GULLSTRÅLE 1990 (2790)
  - JAKOBSLILJA 2990 (4190)
  - ÅKERTISTEL 3290 (5490)
  - FULLMAKT 2190 (3490)
  - LOHALS 2990 (3990)
  - TRETUR 100x195 2990 (4090)
  - LÅNGDANS 100x195 1290 (2090)
- Category page vs product page disagreements:
  - ÄRENDE 120x180: the category showed 2490 as a sale price (regular 2990). The product page showed 2990 with no discount. I recorded 2990.
  - ÖRFJÄLL swivel chair: the category showed 6990 as a sale price (regular 7990). The product page showed 7990. I recorded 7990.
  - GULLSTRÅLE, JAKOBSLILJA and ÅKERTISTEL had no discount on the bedspread category page but did on their product pages.
  - FULLMAKT had no discount on the round-rug page but did on its product page.
- HOPPVALS 120x155 showed 2490 (sale) on one category page and 3390 on another. I used the 100x155 size (3090 on both its category and product page).
- Prices exclude the HDFC credit card EMI offer of 7.5% off on spends of ₹10,000.
- Prices will probably change after Nov 11. Check again before any demo.

## Other caveats
- The fetch tool summarises pages. Names, prices, materials and sizes were quoted from it. Image URLs are the main product image with the `?f=` size parameter removed.
- `description`: I used the overview sentence when the page had no line under the name. For STORSEGEL, RINGSTA/SKAFTET, TÄRNABY, ÅRSTID and the FÖNSTERBLAD beige and TRETUR blinds, the line under the name is just a bulb or draw-rod note. I copied it as shown.
- These descriptions are lightly shortened or paraphrased from the page text, not exact quotes:
  - TRATTVIVA (page: "lightweight and super-soft")
  - BÄCKNATE
  - FLINTAN with armrests
  - STRÖG and LOKALTÅG (truncated)
- ÅRSTID is named "brass/white", but its materials list says "Steel, Brush finish nickel-plated, Acrylic coating". The finish field records the materials list.
- FLYGHÖJD is named "brass/beige", but its base is listed as nickel-plated with an acrylic coating.
- `pattern` is null unless the name or description states one:
  - JÄRNVÄG: "ornament pattern"
  - LOKALTÅG: "oriental"
  - RINGBLOMMA: "linen look"
  - FULLMAKT: "mélange"
- `material` is a short version of the page's materials section (main fabric or shade first, then base or frame).
- Chair `size` is overall width x depth x height from the page.
- For bedspreads, the 230x250 cm size was picked where offered, since it fits a double bed. TJÄRBLOMSTER (150x210, fits a 90 cm bed), VETEJORDFLY (160x250) and the INDIRA/GULLSTRÅLE/TRATTVIVA 150x250 sizes are smaller.
