// One-shot logo processor.
//   1. Trim Hestia Wordmark.png from 1:1 to its actual content (middle band)
//      so it scales nicely in the sidebar.
//   2. Generate favicon-sized PNGs from Hestia H-Only Logo.png and write
//      them to public/ (favicon.ico is a PNG-as-ico — modern browsers
//      accept that format).
//
// Run once: `node scripts/process-logos.mjs`. Re-run any time the source
// logos change.

import sharp from "sharp";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOGOS_SRC = path.join(ROOT, "assets", "logos");
const PUBLIC_LOGOS = path.join(ROOT, "public", "logos");
const PUBLIC = path.join(ROOT, "public");
const APP = path.join(ROOT, "app");

async function main() {
  await mkdir(PUBLIC_LOGOS, { recursive: true });

  // 1. Trim the wordmark to its actual content band.
  // The source is 1000x1000 with the wordmark text occupying roughly the
  // middle 40% vertically. Extract that band so the displayed image has a
  // sensible aspect ratio (≈ 1000 × 400 → 5:2).
  const wordmarkSrc = path.join(LOGOS_SRC, "Hestia Wordmark.png");
  const wordmarkMeta = await sharp(wordmarkSrc).metadata();
  const w = wordmarkMeta.width ?? 1000;
  const h = wordmarkMeta.height ?? 1000;
  const bandHeight = Math.round(h * 0.42);
  const top = Math.round((h - bandHeight) / 2);
  await sharp(wordmarkSrc)
    .extract({ left: 0, top, width: w, height: bandHeight })
    .resize({ width: 800, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(PUBLIC_LOGOS, "wordmark.png"));
  console.log(`✓ wordmark.png trimmed to ${w}×${bandHeight}`);

  // 2. Copy + downscale the full and h-only versions for serving.
  const hSrc = path.join(LOGOS_SRC, "Hestia H-Only Logo.png");
  const fullSrc = path.join(LOGOS_SRC, "Hestia Logo.png");

  await sharp(hSrc)
    .resize({ width: 512, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC_LOGOS, "h-mark.png"));
  console.log(`✓ h-mark.png 512×512`);

  await sharp(fullSrc)
    .resize({ width: 800, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC_LOGOS, "full.png"));
  console.log(`✓ full.png 800×800`);

  // 3. Generate Next.js icon.png + apple-icon.png from the H-only logo.
  // Trim the surrounding whitespace first so the H fills the icon.
  const trimmed = await sharp(hSrc)
    .trim({ background: "white", threshold: 10 })
    .toBuffer();

  await sharp(trimmed)
    .resize({ width: 256, height: 256, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(APP, "icon.png"));
  console.log(`✓ app/icon.png 256×256`);

  await sharp(trimmed)
    .resize({ width: 180, height: 180, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(APP, "apple-icon.png"));
  console.log(`✓ app/apple-icon.png 180×180`);

  // 4. Write a 32×32 favicon.png and copy as favicon.ico (PNG-as-ICO works
  // in all current browsers; spares us from needing an .ico encoder).
  const faviconBuf = await sharp(trimmed)
    .resize({ width: 32, height: 32, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(faviconBuf).toFile(path.join(PUBLIC, "favicon.ico"));
  await sharp(faviconBuf).toFile(path.join(PUBLIC, "favicon-32.png"));
  console.log(`✓ public/favicon.ico + favicon-32.png`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
