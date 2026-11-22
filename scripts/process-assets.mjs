#!/usr/bin/env node
/**
 * Builds isolated, transparent Sharm Pharaoh Travel brand logos + favicons
 * from the approved Sharm_Pharaoh_Handoff/brand/Brand_Identity.png,
 * and produces locally stored, EXIF-stripped, WebP + JPEG scenic travel media
 * for all 5 destinations and 16 tours.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_BRAND = path.join(ROOT, 'apps', 'web', 'public', 'brand');
const PUBLIC_MEDIA = path.join(ROOT, 'apps', 'web', 'public', 'media');
const STORAGE_PUBLIC = path.join(ROOT, '.local-storage', 'public');
const HANDOFF = path.join(ROOT, 'Sharm_Pharaoh_Handoff');
const BRAIN_MAIN = 'C:\\Users\\w.i\\.gemini\\antigravity\\brain\\8a08efda-7fb0-4afd-a09b-b97a45e1abf8';
const BRAIN_MARSA = BRAIN_MAIN;

fs.mkdirSync(PUBLIC_BRAND, { recursive: true });
fs.mkdirSync(PUBLIC_MEDIA, { recursive: true });
fs.mkdirSync(STORAGE_PUBLIC, { recursive: true });

/**
 * Removes a uniform background color smoothly using perceptual RGB distance alpha matting.
 */
async function extractTransparentRegion({
  source,
  extract,
  bgRgb,
  lowThreshold = 20,
  highThreshold = 58,
  pad = 24,
  outPng,
  outWebp,
  resizeWidth,
}) {
  const { data, info } = await sharp(source)
    .extract(extract)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  const [br, bg, bb] = bgRgb;
  for (let i = 0; i < out.length; i += 4) {
    const dr = out[i] - br;
    const dg = out[i + 1] - bg;
    const db = out[i + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= lowThreshold) {
      out[i + 3] = 0;
    } else if (dist < highThreshold) {
      const alpha = Math.round(((dist - lowThreshold) / (highThreshold - lowThreshold)) * 255);
      out[i + 3] = Math.min(out[i + 3], alpha);
    }
  }

  let pipe = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 10 })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

  if (resizeWidth) {
    pipe = pipe.resize({ width: resizeWidth, withoutEnlargement: true });
  }

  const pngBuf = await pipe.png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(outPng, pngBuf);
  if (outWebp) {
    await sharp(pngBuf).webp({ quality: 92, lossless: false }).toFile(outWebp);
  }
  return pngBuf;
}

/**
 * Wraps a 32x32 PNG buffer into a valid Windows ICO container.
 */
function createIcoFromPng(pngBuf, size = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(1, 4); // image count

  const dir = Buffer.alloc(16);
  dir.writeUInt8(size === 256 ? 0 : size, 0);
  dir.writeUInt8(size === 256 ? 0 : size, 1);
  dir.writeUInt8(0, 2); // palette
  dir.writeUInt8(0, 3); // reserved
  dir.writeUInt16LE(1, 4); // planes
  dir.writeUInt16LE(32, 6); // bpp
  dir.writeUInt32LE(pngBuf.length, 8);
  dir.writeUInt32LE(22, 12); // offset

  return Buffer.concat([header, dir, pngBuf]);
}

async function processBrandLogos() {
  const brandSrc = path.join(HANDOFF, 'brand', 'Brand_Identity.png');

  // Sample exact background colors from corners of the left light panel and top-right petrol panel
  const samplePixel = async (x, y) => {
    const { data } = await sharp(brandSrc)
      .extract({ left: x, top: y, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return [data[0], data[1], data[2]];
  };

  const lightBg = await samplePixel(20, 20);
  const darkBg = await samplePixel(980, 20);
  console.log('Brand sampled colors — lightBg:', lightBg, 'darkBg:', darkBg);

  // 1. Full normal logo (stacked mark + wordmark on transparent background)
  await extractTransparentRegion({
    source: brandSrc,
    extract: { left: 30, top: 65, width: 890, height: 760 },
    bgRgb: lightBg,
    outPng: path.join(PUBLIC_BRAND, 'logo-normal.png'),
    outWebp: path.join(PUBLIC_BRAND, 'logo-normal.webp'),
    resizeWidth: 520,
  });

  // 2. Icon-only full-color mark (pharaoh + sun + turquoise wave)
  const iconPng = await extractTransparentRegion({
    source: brandSrc,
    extract: { left: 100, top: 65, width: 740, height: 570 },
    bgRgb: lightBg,
    pad: 20,
    outPng: path.join(PUBLIC_BRAND, 'logo-icon.png'),
    outWebp: path.join(PUBLIC_BRAND, 'logo-icon.webp'),
    resizeWidth: 320,
  });

  // 3. Full inverse logo (white pharaoh + gold sun + white wave + white text for dark petrol surfaces)
  await extractTransparentRegion({
    source: brandSrc,
    extract: { left: 970, top: 30, width: 545, height: 420 },
    bgRgb: darkBg,
    lowThreshold: 24,
    highThreshold: 64,
    outPng: path.join(PUBLIC_BRAND, 'logo-inverse.png'),
    outWebp: path.join(PUBLIC_BRAND, 'logo-inverse.webp'),
    resizeWidth: 520,
  });

  // 4. Icon-only inverse mark (for dark headers/sidebars/footers)
  await extractTransparentRegion({
    source: brandSrc,
    extract: { left: 1030, top: 30, width: 420, height: 305 },
    bgRgb: darkBg,
    lowThreshold: 24,
    highThreshold: 64,
    pad: 18,
    outPng: path.join(PUBLIC_BRAND, 'logo-icon-inverse.png'),
    outWebp: path.join(PUBLIC_BRAND, 'logo-icon-inverse.webp'),
    resizeWidth: 320,
  });

  // 5. Favicons (square warm ivory rounded emblem with centered pharaoh mark)
  const makeSquareIcon = async (size) => {
    const inner = Math.round(size * 0.82);
    const resizedMark = await sharp(iconPng)
      .resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 247, g: 245, b: 239, alpha: 1 },
      },
    })
      .composite([{ input: resizedMark, gravity: 'center' }])
      .png()
      .toBuffer();
  };

  const icon192 = await makeSquareIcon(192);
  const icon180 = await makeSquareIcon(180);
  const icon32 = await makeSquareIcon(32);

  fs.writeFileSync(path.join(ROOT, 'apps', 'web', 'public', 'icon.png'), icon192);
  fs.writeFileSync(path.join(ROOT, 'apps', 'web', 'public', 'apple-touch-icon.png'), icon180);
  fs.writeFileSync(path.join(ROOT, 'apps', 'web', 'public', 'favicon.ico'), createIcoFromPng(icon32, 32));
  console.log('Brand logo variants & favicons created.');
}

async function saveMediaAsset(name, sourcePath, extractRect) {
  let pipe = sharp(sourcePath).rotate(); // auto-orient and strip EXIF on output
  if (extractRect) {
    pipe = pipe.extract(extractRect);
  }
  const resized = pipe.resize({ width: 1600, withoutEnlargement: true });
  const webpPath = path.join(PUBLIC_MEDIA, `${name}.webp`);
  const jpgPath = path.join(PUBLIC_MEDIA, `${name}.jpg`);

  await resized.clone().webp({ quality: 82 }).toFile(webpPath);
  await resized.clone().jpeg({ quality: 84, mozjpeg: true }).toFile(jpgPath);
  // Mirror into local public storage too
  fs.copyFileSync(webpPath, path.join(STORAGE_PUBLIC, `${name}.webp`));
  console.log(`Processed media: ${name}.webp & .jpg`);
}

async function processScenicMedia() {
  // 13 freshly generated bespoke photographs
  const generatedMap = [
    ['hero-red-sea-yacht', path.join(BRAIN_MAIN, 'hero_red_sea_yacht_1795044894396.jpg')],
    ['cairo-pyramids-sphinx', path.join(BRAIN_MAIN, 'cairo_pyramids_sphinx_1795044907209.jpg')],
    ['cairo-grand-egyptian-museum', path.join(BRAIN_MAIN, 'cairo_grand_egyptian_museum_1795044924252.jpg')],
    ['cairo-old-cairo-citadel', path.join(BRAIN_MAIN, 'cairo_old_cairo_citadel_1795044941798.jpg')],
    ['sharm-ras-mohamed-white-island', path.join(BRAIN_MAIN, 'sharm_ras_mohamed_white_island_1795044911107.jpg')],
    ['sharm-scuba-coral-reef', path.join(BRAIN_MAIN, 'sharm_scuba_coral_reef_1795044939401.jpg')],
    ['hurghada-desert-quad-safari', path.join(BRAIN_MAIN, 'hurghada_desert_quad_safari_1795044904155.jpg')],
    ['luxor-karnak-temples', path.join(BRAIN_MAIN, 'luxor_karnak_temples_1795044919157.jpg')],
    ['luxor-valley-of-the-kings', path.join(BRAIN_MAIN, 'luxor_valley_of_the_kings_1795044934095.jpg')],
    ['marsa-abu-dabbab-turtle', path.join(BRAIN_MARSA, 'marsa_abu_dabbab_turtle_1795044901656.jpg')],
    ['marsa-sataya-dolphin-reef', path.join(BRAIN_MARSA, 'marsa_sataya_dolphin_reef_1795044915875.jpg')],
    ['marsa-hamata-islands', path.join(BRAIN_MARSA, 'marsa_hamata_islands_1795044931860.jpg')],
    ['hurghada-orange-bay', path.join(BRAIN_MARSA, 'hurghada_orange_bay_1795044951905.jpg')],
  ];

  for (const [name, src] of generatedMap) {
    if (!fs.existsSync(src)) {
      throw new Error(`Missing generated image: ${src}`);
    }
    await saveMediaAsset(name, src);
  }

  // 7 clean, text-free photographic tiles cropped from the owner-supplied AI design handoff boards
  // (strictly individual photo plates — NEVER full boards as webpage backgrounds)
  const designDir = path.join(HANDOFF, 'design');
  const croppedMap = [
    // Cairo Nile Cruise card photo in 03_Cairo_Sharm_EN.png (1536x1024) — inset inside rounded corners
    ['cairo-nile-dinner-cruise', path.join(designDir, '03_Cairo_Sharm_EN.png'), { left: 406, top: 588, width: 324, height: 88 }],
    // Sharm Desert Safari card photo in 03_Cairo_Sharm_EN.png
    ['sharm-sinai-desert-safari', path.join(designDir, '03_Cairo_Sharm_EN.png'), { left: 804, top: 588, width: 324, height: 88 }],
    // Sharm Yacht Cruise card photo in 03_Cairo_Sharm_EN.png
    ['sharm-luxury-yacht-cruise', path.join(designDir, '03_Cairo_Sharm_EN.png'), { left: 1166, top: 588, width: 324, height: 88 }],
    // Nile Felucca sunset photo (strictly clean left photo region of CTA banner in 01_Home_EN.png 1024x1536, zero corner accent)
    ['story-nile-felucca', path.join(designDir, '01_Home_EN.png'), { left: 44, top: 1272, width: 472, height: 162 }],
    // Giftun Islands card photo in 04_Destinations_EN.png (1774x887)
    ['hurghada-giftun-islands', path.join(designDir, '04_Destinations_EN.png'), { left: 922, top: 332, width: 236, height: 96 }],
    // Philae Temple card photo in 04_Destinations_EN.png
    ['aswan-philae-temple', path.join(designDir, '04_Destinations_EN.png'), { left: 1238, top: 528, width: 232, height: 96 }],
    // Contact Hero coastal bay photo (strictly left scenic bay with zero text overlap from 02_Tours_Contact_EN.png)
    ['contact-hero-sinai', path.join(designDir, '02_Tours_Contact_EN.png'), { left: 785, top: 122, width: 345, height: 122 }],
  ];

  for (const [name, src, rect] of croppedMap) {
    await saveMediaAsset(name, src, rect);
  }
}

processBrandLogos()
  .then(processScenicMedia)
  .then(() => console.log('All brand logos and 20 scenic travel media assets processed successfully.'))
  .catch((err) => {
    console.error('Asset processing failed:', err);
    process.exitCode = 1;
  });
