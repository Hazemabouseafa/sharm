# Asset Sources & Provenance — Sharm Pharaoh Travel

All brand and photography assets used in the application are stored under `apps/web/public/brand/` and `apps/web/public/media/` (`1600×900` 16:9 WebP + JPEG pairs, EXIF-stripped via `sharp` in `scripts/process-assets.mjs`). Full raw design boards are **never** used as page backgrounds.

## 1. Brand Identity Assets (`apps/web/public/brand/`)

| File | Source & Processing |
| --- | --- |
| `logo-normal.png`, `logo-normal.webp` | Extracted from `Sharm_Pharaoh_Handoff/brand/Brand_Identity.png` (top-left full lockup: Pharaoh + Sun + Sea Wave + wordmark), background alpha-keyed to transparent |
| `logo-inverse.png`, `logo-inverse.webp` | Extracted from `Sharm_Pharaoh_Handoff/brand/Brand_Identity.png` and converted to crisp white/gold lockup for dark petrol headers/footers |
| `logo-icon.png`, `logo-icon.webp` | Extracted circular Pharaoh + Sun + Sea Wave emblem (`512×512` transparent) |
| `logo-icon-inverse.png` | Inverse emblem for dark petrol surfaces |
| `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `../favicon.ico` | Generated from `logo-icon.png` at `16×16`, `32×32`, `180×180`, and `.ico` |

## 2. Travel Photography Assets (`apps/web/public/media/`)

| Asset Basename (`.webp` & `.jpg`) | Provenance |
| --- | --- |
| `hero-red-sea-yacht` | Generated 16:9 editorial travel photograph via `image-generator` (`hero_red_sea_yacht_1795044894396.jpg`) |
| `cairo-pyramids-sphinx` | Generated 16:9 editorial travel photograph via `image-generator` (`cairo_pyramids_sphinx_1795044907209.jpg`) |
| `cairo-grand-egyptian-museum` | Generated 16:9 editorial travel photograph via `image-generator` (`cairo_grand_egyptian_museum_1795044924252.jpg`) |
| `cairo-old-cairo-citadel` | Generated 16:9 editorial travel photograph via `image-generator` (`cairo_old_cairo_citadel_1795044941798.jpg`) |
| `cairo-nile-dinner-cruise` | Clean scenic photo plate cropped from `Sharm_Pharaoh_Handoff/design/03_Cairo_Tours_Page.png` (Nile dinner cruise panel, verified free of UI text/chrome) |
| `sharm-ras-mohamed-white-island` | Generated 16:9 editorial travel photograph via `image-generator` (`sharm_ras_mohamed_white_island_1795044911107.jpg`) |
| `sharm-scuba-coral-reef` | Generated 16:9 editorial travel photograph via `image-generator` (`sharm_scuba_coral_reef_1795044939401.jpg`) |
| `sharm-tiran-island-snorkeling` | Clean scenic photo plate cropped from `Sharm_Pharaoh_Handoff/design/04_Sharm_El_Sheikh_Page.png` (Tiran Island reef boat panel, verified free of UI text/chrome) |
| `sharm-colored-canyon-blue-hole` | Clean scenic photo plate cropped from `Sharm_Pharaoh_Handoff/design/04_Sharm_El_Sheikh_Page.png` (Sinai canyon rock formation panel, verified free of UI text/chrome) |
| `marsa-abu-dabbab-turtle` | Generated 16:9 editorial travel photograph via `image-generator` (`marsa_abu_dabbab_turtle_1795044901656.jpg`) |
| `marsa-sataya-dolphin-reef` | Generated 16:9 editorial travel photograph via `image-generator` (`marsa_sataya_dolphin_reef_1795044915875.jpg`) |
| `marsa-hamata-islands` | Generated 16:9 editorial travel photograph via `image-generator` (`marsa_hamata_islands_1795044931860.jpg`) |
| `hurghada-desert-quad-safari` | Generated 16:9 editorial travel photograph via `image-generator` (`hurghada_desert_quad_safari_1795044904155.jpg`) |
| `hurghada-orange-bay` | Generated 16:9 editorial travel photograph via `image-generator` (`hurghada_orange_bay_1795044951905.jpg`) |
| `hurghada-giftun-snorkeling` | Clean scenic photo plate cropped from `Sharm_Pharaoh_Handoff/design/02_Tours_Listing_Page.png` (Red Sea snorkeling reef panel, verified free of UI text/chrome) |
| `luxor-karnak-temples` | Generated 16:9 editorial travel photograph via `image-generator` (`luxor_karnak_temples_1795044919157.jpg`) |
| `luxor-valley-of-the-kings` | Generated 16:9 editorial travel photograph via `image-generator` (`luxor_valley_of_the_kings_1795044934095.jpg`) |
| `luxor-hot-air-balloon` | Clean scenic photo plate cropped from `Sharm_Pharaoh_Handoff/design/02_Tours_Listing_Page.png` (Luxor temple sunrise panel, verified free of UI text/chrome) |
| `story-nile-felucca` | Clean scenic photo plate cropped from `Sharm_Pharaoh_Handoff/design/01_Home_Page_English.png` (Nile felucca sunset sailboat panel, verified free of UI text/chrome) |
| `contact-hero-sinai` | Clean scenic photo plate cropped from `Sharm_Pharaoh_Handoff/design/06_Contact_Page.png` (Sinai mountain coastline panel, verified free of UI text/chrome) |
