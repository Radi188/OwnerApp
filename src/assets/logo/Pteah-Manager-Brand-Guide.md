# Pteah Manager — Logo Usage Guide

**The idea:** the gable of a traditional Khmer house, drawn with light: a sunray gable, a *chovea* finial at the peak and *naga* hooks at the eaves. *Pteah* (ផ្ទះ) means house; the gable is the most recognisable part of one.

## 1. Logo versions

| File | Use |
|---|---|
| `lockups/pteah-horizontal.svg` | Primary logo — website header, documents, email signature |
| `lockups/pteah-stacked.svg` | Square or narrow spaces — splash screen, posters, social covers |
| `symbol/pteah-symbol.svg` | Symbol alone — when the name is already visible nearby |
| `symbol/pteah-symbol-small.svg` | **Small-size cut** (4 rays, heavier lines) — anything under 32 px |
| `symbol/pteah-app-icon.svg` | App icon — white symbol on a #554ADF rounded tile |
| `lockups/pteah-wordmark.svg` | Name only — rare; e.g. a footer next to other logos |
| `*-white.svg` | Reversed — on #554ADF, dark colours or photos |
| `*-black.svg` | One colour black — fax, stamps, engraving, newspaper |
| `web/` | favicon.ico, favicon.svg, PNG icons, apple-touch-icon, webmanifest and the `<head>` snippet |

## 2. Colour

| Name | HEX | RGB | CMYK (approx.) | Use |
|---|---|---|---|---|
| **Pteah Indigo** | `#554ADF` | 85 74 223 | 62 67 0 13 | Symbol, app icon, buttons, links |
| **Night Ink** | `#17153B` | 23 21 59 | 61 64 0 77 | Wordmark text, headings, dark backgrounds |
| White | `#FFFFFF` | 255 255 255 | 0 0 0 0 | Backgrounds, reversed logo |

- Nearest Pantone: **2725 C** — check against a physical swatch before printing.
- Contrast: Indigo on white **6.1 : 1** and white on Indigo **6.1 : 1** (pass WCAG AA for normal text). Night Ink on white **17.4 : 1**.
- **Don't** put the Indigo logo on Night Ink (2.8 : 1, too weak) — use the white version there.

## 3. Typography

- **Logo lettering:** Montserrat SemiBold ("Pteah") and Montserrat Medium, tracked to the same width ("MANAGER"). Both are converted to outlines in the logo files — don't retype the logo.
- **Interface and documents:** Montserrat for headings; any clean sans (e.g. Inter) for body text. For Khmer text, use Noto Sans Khmer (or Kantumruy Pro) so the two scripts sit well together.
- Montserrat and Noto Sans Khmer are under the SIL Open Font License, so they're free to use in a logo and in the app.

## 4. Clear space and minimum size

- **Clear space:** keep empty space around the logo at least equal to the **height of the half-circle sun** (≈ 10 % of the symbol height) on every side. Nothing (text, edges, other logos) goes inside it.
- **Minimum size:**
  - Horizontal lockup: 120 px wide on screen / 30 mm in print
  - Stacked lockup: 64 px wide / 18 mm
  - Full symbol: 32 px / 8 mm
  - Below 32 px, use the **small-size cut** (`pteah-symbol-small.svg`), down to 16 px.

## 5. Backgrounds

- ✅ Indigo logo on white or very light grey
- ✅ White logo on Pteah Indigo, Night Ink or a dark, calm photo
- ✅ Black logo when only one colour is available
- ❌ Indigo logo on Night Ink, mid-tones or busy photos

## 6. Don't

- Don't redraw, stretch, rotate or add effects (shadows, gradients, outlines, glow).
- Don't change the colours, or colour the rays and sun differently from the gable.
- Don't change the spacing or size relationship between the symbol and the name.
- Don't retype "Pteah Manager" in another font next to the symbol.
- Don't use the full 6-ray symbol below 32 px — use the small-size cut.
- Don't put the symbol inside another shape (circle, shield). The app icon tile is the only container.

## 7. Notes

- **Trademark:** this guide can't confirm the mark is free to register. Run a trademark search in Cambodia (Department of Intellectual Property, Ministry of Commerce) and in any other markets before launch.
- **Website domain** in the mockups (pteahmanager.com) and the name on the business card are placeholders.
- The rays sit at a regular 180° ÷ 13 division, so their angles are deliberately not 15° steps; the audit tool flags this, and it's intended.
- Master files are SVG (all shapes, no live text). Rebuild script: `gen_final.py` (needs the fonttools/uharfbuzz venv).
