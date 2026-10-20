# StyleSwap non-IKEA product research notes (checked 2026-10-20)

31 products in other_products.json: bedspread 6, rug 6, lamp 6, blinds 6, chair 7.
Every price was read on the product page itself via WebFetch. Listing pages were used only to find products.

## Sites that worked
- urbanladder.com: category pages (study-chair, table-lamps, rugs, bed-covers) and product pages. Price is the "Today's Deal Price" or "Total price".
- homecentre.in: category pages (livingroom-studyandwork-studyandofficechairs, decor-lighting-tablelamps, furnishing-floorcoverings-carpets, furnishing-curtains-blinds, furnishing-bedding-bedcovers) and product pages.
- greensoul.online: product pages (Atom Basic, Jupiter Superb).
- obeetee.in: /collections/round-rugs and product pages.
- nestasia.in: product pages.
- pepperfry.com: /category/roller-shades.html, /category/blinds.html and one product page.

## Sites that failed
- wakefit.co/office-chair: the page is JS-rendered and only a loader came back.
- pepperfry.com/category/study-chairs.html: fetch error. Other Pepperfry blind pages worked.
- jaipurrugs.com round rugs page: fetch error.
- fabindia.com bed covers page: fetch error.
- spaces.in bedcovers: fetch error.
- urbanladder.com/blinds: fetch error.
- amazon.in: blocked by robots.
- flipkart.com product pages (BambooAura and SN Craft bamboo roller blinds found via search): fetch errors.
- greensoul.online/products/atom-basic-chair.json (tried to get an image URL): error.
- I did not find a D'Decor blinds page or a homecentre.in rug listing with a jute or braided rug.

## Uncertain points
- Blinds: all 6 are Deco Window. It is the only blinds brand on Home Centre (all 5 pages are Deco Window) and on Pepperfry's blinds and roller-shades pages. I found no venetian or bamboo blinds with a readable price. Deco Window size names like "42x84" have no units on Home Centre. I recorded the cm dimensions the page states. Each size is a separate product with its own price.
- Repose Kaaya bed cover: the listing showed Rs 5,599 but the product page showed Rs 5,039. I recorded 5039 from the product page. Its bed cover size appears twice on the page with different widths (240x220 and 240x200 cm). Repose Ira has the same conflict. Both versions are recorded.
- Home Centre pages often show only one "MRP" price with no strike price (Kyoto, Riviera Dune, Kairo lamps, MASPAR Charlotte). I recorded that MRP as the current price. It matched the price on the listing page.
- Sale prices, current price vs MRP: Green Soul Atom 3690 (MRP 5990), Jupiter 7990 (MRP 17072). Urban Ladder Mika 14999 (25599), Dorsey 5499 (8599), Aurelio 7999 (11899). Home Centre Zuby 10999 (21998), Quadro 6999 (13998). Deco Window blinds about 25% off. Obeetee Rumi 13250 (26500). Nestasia waffle throw 1390 (2070). Urban Ladder lamps Decade 8990 (14990), Devansh 2198 (4999), Asa 1399 (2999). Monalisa rug 13499 (14999).
- Urban Ladder jute round rugs (Classic Braided, Hand Braided Colorful): the page gives dimensions of "13.00 cm" for L, W and H, which is clearly wrong, and no diameter. I set size to null. No size options are shown, so it is unclear which size the price covers.
- Obeetee Mozart rug: the title says wool and viscose and beige, but the description says wool and cotton and "grey canvas". I recorded the title values. Its URL slug says "wool-and-cotton". It comes in 3x3 ft only, priced 6200. Obeetee Rumi comes in 6x6 ft only.
- Urban Ladder Aurelio chair: the title says Macadamia Brown Hopsack Weave, but the description mentions olive and sandstorm options. It is a solid wood study chair and the page does not say it swivels.
- Urban Ladder Asa lamp: the width is listed as "6.35 m", which looks like a page error. I set size to null.
- Urban Ladder throws (Yellow Chevron 1.34 x 1.79 m, Checkered Yellow navy 1.37 x 1.79 m) are throws, not full double-bed covers. The colour field on the page says "Multicolor".
- Green Soul Atom: colour options are Black, grey, green, orange and blue. I recorded Black, which is the colour in the spec table. No image URL was in the fetched content. The Jupiter page claims "under 5000" in its copy but the price is 7990.
- The page says "Only 1000 left!" and also "Sold Out" for Nestasia Peach and Off White Textured Throw (1800) and Checks Cotton Throw (2290). I excluded both. The waffle throw had no such conflict.
- MASPAR Cotton Double Bed Cover (3599) was excluded. Its name says Double but the spec says Single Bed and 228 x 152 cm. I used MASPAR Charlotte Double Bed Cover instead.
- Brand naming: Home Centre does not show a separate brand field for its in-house lines. I recorded these as "Home Centre (collection name)".
- No beige upholstered swivel chair with a readable price turned up at these retailers. The chairs are mostly black or grey mesh, plus one red leatherette, one brown faux leather and one brown fabric wooden chair.
