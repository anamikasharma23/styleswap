/* The room: photo, credit, the 5 items you can change, their hotspot
   positions and outlines (for the colour preview), and the room styles.
   All positions are percentages of the photo's width/height, positioned
   by hand on the 2400×1350 image. */
(function (root) {
  const SS = (root.SS = root.SS || {});
  SS.ROOM = {
    image: "assets/room.jpg",
    width: 2400,
    height: 1350,
    alt: "Golden-hour bedroom: bed with white bedding and a saffron throw, a large round braided jute rug, a desk with a small table lamp and a swivel chair, and windows with horizontal blinds.",
    credit: {
      text: "Room image: Desiree Goulden on Unsplash",
      url: "https://unsplash.com/photos/a-bedroom-with-a-bed-and-a-rug-in-it-ZqStE3k8gCI",
      licence: "Unsplash License (free to use, no permission needed)",
      licenceUrl: "https://unsplash.com/license",
      note: "This is a 3D-rendered room image, not a photograph of a real room.",
    },
    slots: [
      {
        slot: "bedspread", label: "Bedspread", inPhoto: "saffron throw over white bedding",
        pin: { x: 31, y: 58.5 }, labelSide: "left",
        mask: [{ type: "poly", pts: [[19.9, 62.2], [21.9, 57.2], [26.3, 54.2], [37.5, 53.9], [43.8, 55], [45, 60], [46.3, 66.7], [47.8, 72.2], [47.8, 76.4], [45.9, 76.4], [43.8, 72.2], [42.9, 63.9], [19.4, 63.9]] }],
      },
      {
        slot: "rug", label: "Rug", inPhoto: "large round braided jute rug",
        pin: { x: 66, y: 79 }, labelSide: "right",
        mask: [
          { type: "ellipse", cx: 51.6, cy: 83.2, rx: 23.6, ry: 20.6 },
          { type: "poly", op: "sub", pts: [[18.4, 63.3], [43.1, 63.3], [43.1, 78.9], [18.4, 78.9]] },
          { type: "poly", op: "sub", pts: [[42.9, 63.9], [47.8, 70], [48.2, 77], [42.9, 77]] },
        ],
      },
      {
        slot: "lamp", label: "Table lamp", inPhoto: "small white fabric-shade lamp on the desk",
        pin: { x: 51.1, y: 33.6 }, labelSide: "left",
        mask: [{ type: "poly", pts: [[50, 37.2], [52.1, 37.2], [52.5, 42], [49.7, 42]] }],
      },
      {
        slot: "blinds", label: "Window blinds", inPhoto: "horizontal blinds on both windows", qty: 2,
        pin: { x: 33.9, y: 16.4 }, labelSide: "right",
        mask: [
          { type: "poly", pts: [[18.4, 8.3], [24.7, 10], [24.4, 21.7], [19.1, 22.2]] },
          { type: "poly", pts: [[27.2, 10.6], [40.6, 10.6], [40.6, 22.2], [27.2, 22.2]] },
        ],
      },
      {
        slot: "chair", label: "Desk chair", inPhoto: "beige upholstered swivel chair",
        pin: { x: 55.2, y: 52.6 }, labelSide: "right",
        mask: [{ type: "poly", pts: [[52.5, 52.2], [53.8, 48.9], [56.3, 47.8], [57.6, 48.9], [57.2, 55.6], [55.6, 57.2], [52.8, 57.2]] }],
      },
    ],
    /* Room styles. The palette is what "fits" colour-wise, the tags are what
       fits style-wise. "Cosy natural" is hand-picked to match the photo:
       an automatic palette from the image is dominated by the golden light
       (dark browns), so it would wrongly penalise white or light items. */
    aesthetics: {
      cosy: { label: "Cosy natural", palette: ["#f2ebdd", "#d9c7a7", "#c8913e", "#d98c2b", "#8a5a32", "#b8925a"], tags: ["natural", "warm", "textured", "handmade", "earthy", "cosy"] },
      minimal: { label: "Minimal", palette: ["#ffffff", "#ececec", "#d6d1c8", "#9a9a9a", "#2b2b2b"], tags: ["minimal", "clean", "neutral", "simple", "modern"] },
      scandi: { label: "Scandi calm", palette: ["#fafafa", "#e8e2d6", "#c9b28f", "#a3b18a", "#7d8b91"], tags: ["scandi", "light", "minimal", "natural", "soft", "cosy"] },
      modern: { label: "Modern", palette: ["#2b2d30", "#5c6066", "#bfc3c7", "#ffffff", "#1f3a5f", "#b08d57"], tags: ["modern", "sleek", "bold", "geometric", "metal"] },
      boho: { label: "Bohemian", palette: ["#c4622d", "#e0a63a", "#2f6f6a", "#f1e4cc", "#8b3a3a", "#6b7a3c"], tags: ["boho", "patterned", "colourful", "handmade", "textured", "natural"] },
    },
    defaultAesthetic: "cosy",
    defaultBudget: 35000,
    poorFit: 0.5, // an item below this fit with the room style is "suggested for replacement"
  };
})(typeof window !== "undefined" ? window : globalThis);
