# Device profiles — screenshot dimensions → render geometry

Map a screenshot's pixel dimensions to the CSS viewport the replica route renders
at, and the device scale factor (DPR) the capture runs at. Render at CSS size,
capture at DPR so replica pixels match the reference's pixel dimensions.

| Screenshot px (W×H) | Device | CSS viewport (W×H) | DPR | Notes |
|---|---|---|---|---|
| 1170×2532 | iPhone 12/13/14 | 390×844 | 3 | Most common Mobbin iOS export |
| 1179×2556 | iPhone 14/15/16 Pro | 393×852 | 3 | Dynamic Island |
| 1284×2778 | iPhone Pro Max (older) | 428×926 | 3 | |
| 1290×2796 | iPhone 15/16 Pro Max | 430×932 | 3 | |
| 1125×2436 | iPhone X/XS/11 Pro | 375×812 | 3 | Notch |
| 750×1334 | iPhone SE/6/7/8 | 375×667 | 2 | |
| 1080×2340 | Android (common) | 360×780 | 3 | Pixel-class |
| 1080×2400 | Android (tall) | 360×800 | 3 | |
| 1440×3120 | Android (QHD) | 411×891 | 3.5 | |
| 1920×1080 | Desktop (landscape) | 1280×720 | 1.5 | Web screenshot; scale to taste |
| 2560×1440 | Desktop (QHD) | 1280×720 | 2 | |

**Fallback (dimensions not in the table):** for phone-shaped images (portrait,
aspect > 1.7) assume DPR 3 and set CSS viewport = round(W/DPR) × round(H/DPR). For
desktop (landscape, W ≥ 1440), use DPR 1–2 and render at native/DPR. Record the
chosen profile per screen in `.replica/state.json` so capture and render stay in
lockstep.

**Taller-than-viewport screens:** the CSS viewport height above is the device
frame; scrollable screens are captured full-page and diffed at full height against
the full reference image.

**OS chrome:** status bar / home indicator are cropped from references by default
(`statusBar: "crop"`). Set `"replicate"` to render static OS chrome instead — do
this only when the reference clearly includes it and the extra fidelity matters.
