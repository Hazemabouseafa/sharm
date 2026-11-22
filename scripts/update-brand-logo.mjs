import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const brandDir = path.join(rootDir, 'apps', 'web', 'public', 'brand');
const publicDir = path.join(rootDir, 'apps', 'web', 'public');

const sourceLogoPath =
  process.argv[2] ||
  'C:/Users/w.i/.gemini/antigravity/brain/8a08efda-7fb0-4afd-a09b-b97a45e1abf8/.user_uploaded/media_1795083681865_656a602d.jpg';

/**
 * Removes only the exterior border-connected white background via BFS flood-fill
 * with soft anti-aliased edge feathering, preserving all interior white artwork
 * (yacht hull, Pharaoh tunic, and "Travel" lettering).
 */
function removeExteriorWhiteBackground(rgba, width, height) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isNearWhite = (idx) => {
    const p = idx * 4;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const minC = Math.min(r, g, b);
    const maxC = Math.max(r, g, b);
    return minC >= 232 && maxC - minC <= 22;
  };

  const enqueue = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    if (isNearWhite(idx)) {
      isBg[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    if (x > 0) enqueue(x - 1, y);
    if (x < width - 1) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y < height - 1) enqueue(x, y + 1);
  }

  // Soften 1px fringe pixels directly adjacent to exterior background
  for (let idx = 0; idx < total; idx++) {
    const p = idx * 4;
    if (isBg[idx]) {
      rgba[p + 3] = 0;
    } else {
      const x = idx % width;
      const y = (idx - x) / width;
      let touchesBg = false;
      if (x > 0 && isBg[idx - 1]) touchesBg = true;
      else if (x < width - 1 && isBg[idx + 1]) touchesBg = true;
      else if (y > 0 && isBg[idx - width]) touchesBg = true;
      else if (y < height - 1 && isBg[idx + width]) touchesBg = true;

      if (touchesBg) {
        const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
        if (lum > 215) {
          const factor = Math.max(0, Math.min(1, (248 - lum) / 33));
          rgba[p + 3] = Math.round(rgba[p + 3] * factor);
        }
      }
    }
  }
  return rgba;
}

function buildIcoFromPngBuffers(png32, png16) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(2, 4); // 2 images

  const dir1 = Buffer.alloc(16);
  dir1[0] = 32;
  dir1[1] = 32;
  dir1[2] = 0;
  dir1[3] = 0;
  dir1.writeUInt16LE(1, 4);
  dir1.writeUInt16LE(32, 6);
  dir1.writeUInt32LE(png32.length, 8);
  dir1.writeUInt32LE(6 + 32, 12);

  const dir2 = Buffer.alloc(16);
  dir2[0] = 16;
  dir2[1] = 16;
  dir2[2] = 0;
  dir2[3] = 0;
  dir2.writeUInt16LE(1, 4);
  dir2.writeUInt16LE(32, 6);
  dir2.writeUInt32LE(png16.length, 8);
  dir2.writeUInt32LE(6 + 32 + png32.length, 12);

  return Buffer.concat([header, dir1, dir2, png32, png16]);
}

async function main() {
  if (!fs.existsSync(sourceLogoPath)) {
    throw new Error(`Logo source not found at ${sourceLogoPath}`);
  }
  fs.mkdirSync(brandDir, { recursive: true });

  const { data, info } = await sharp(sourceLogoPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cleaned = removeExteriorWhiteBackground(Buffer.from(data), info.width, info.height);

  // Trim exterior transparent borders and resize to crisp high-res PNG/WebP
  const trimmedNormal = await sharp(cleaned, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 10 })
    .resize({ width: 960, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const meta = await sharp(trimmedNormal).metadata();

  // Save normal transparent logo (for light ivory/white surfaces)
  fs.writeFileSync(path.join(brandDir, 'logo-normal.png'), trimmedNormal);
  await sharp(trimmedNormal).webp({ quality: 92 }).toFile(path.join(brandDir, 'logo-normal.webp'));

  // For dark petrol backgrounds (#103D45), the vibrant gold/blue logo also reads super cleanly
  // with subtle brightening so every dark detail pops clearly on dark headers/sidebars
  const inversePng = await sharp(trimmedNormal)
    .modulate({ brightness: 1.04, saturation: 1.05 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(path.join(brandDir, 'logo-inverse.png'), inversePng);
  await sharp(inversePng).webp({ quality: 92 }).toFile(path.join(brandDir, 'logo-inverse.webp'));

  // Square 512x512 icon variant centered cleanly with transparent padding
  const iconPng = await sharp(trimmedNormal)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(path.join(brandDir, 'logo-icon.png'), iconPng);
  fs.writeFileSync(path.join(brandDir, 'logo-icon-inverse.png'), iconPng);
  await sharp(iconPng).webp({ quality: 92 }).toFile(path.join(brandDir, 'logo-icon.webp'));

  // Favicons & Apple Touch Icon
  const fav16 = await sharp(iconPng).resize(16, 16).png().toBuffer();
  const fav32 = await sharp(iconPng).resize(32, 32).png().toBuffer();
  const apple180 = await sharp(trimmedNormal)
    .resize(164, 164, { fit: 'contain', background: { r: 16, g: 61, b: 69, alpha: 1 } })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 16, g: 61, b: 69, alpha: 1 } })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(brandDir, 'favicon-16.png'), fav16);
  fs.writeFileSync(path.join(brandDir, 'favicon-32.png'), fav32);
  fs.writeFileSync(path.join(brandDir, 'apple-touch-icon.png'), apple180);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), apple180);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buildIcoFromPngBuffers(fav32, fav16));

  console.log(
    JSON.stringify({
      status: 'OK',
      sourceWidth: info.width,
      sourceHeight: info.height,
      trimmedWidth: meta.width,
      trimmedHeight: meta.height,
      outputs: [
        'apps/web/public/brand/logo-normal.png',
        'apps/web/public/brand/logo-normal.webp',
        'apps/web/public/brand/logo-inverse.png',
        'apps/web/public/brand/logo-inverse.webp',
        'apps/web/public/brand/logo-icon.png',
        'apps/web/public/brand/logo-icon-inverse.png',
        'apps/web/public/favicon.ico',
        'apps/web/public/apple-touch-icon.png',
      ],
    }),
  );
}

main().catch((err) => {
  console.error('Logo processing failed:', err);
  process.exit(1);
});
