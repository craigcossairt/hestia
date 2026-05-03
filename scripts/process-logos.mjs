// One-shot logo processor.
//   - Wordmark: source is already a tight rectangle (~408×119 in the
//     current asset). Just downscale + optimise for serving.
//   - H-Only: trim residual whitespace, generate icons + favicon.
//   - Full Logo: downscale for serving on landing/login.
//
// Run: `node scripts/process-logos.mjs`. Re-run any time source assets change.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOGOS_SRC = path.join(ROOT, "assets", "logos");
const PUBLIC_LOGOS = path.join(ROOT, "public", "logos");
const PUBLIC = path.join(ROOT, "public");
const APP = path.join(ROOT, "app");

async function main() {
  await mkdir(PUBLIC_LOGOS, { recursive: true });

  // ─── Wordmark ─────────────────────────────────────────────────────
  // Source is already a tight rectangular crop — just trim any residual
  // pixel-level whitespace and downscale for serving.
  const wordmarkSrc = path.join(LOGOS_SRC, "Hestia Wordmark.png");
  const wordmarkMeta = await sharp(wordmarkSrc).metadata();
  const wmTrimmed = await sharp(wordmarkSrc)
    .trim({ background: "white", threshold: 10 })
    .toBuffer();
  const wmTrimmedMeta = await sharp(wmTrimmed).metadata();
  const targetWidth = Math.min(800, wmTrimmedMeta.width ?? 800);
  await sharp(wmTrimmed)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(PUBLIC_LOGOS, "wordmark.png"));
  console.log(
    `✓ wordmark.png ${wordmarkMeta.width}×${wordmarkMeta.height} → ${wmTrimmedMeta.width}×${wmTrimmedMeta.height} → public/logos`,
  );

  // ─── H-Only ───────────────────────────────────────────────────────
  const hSrc = path.join(LOGOS_SRC, "Hestia H-Only Logo.png");
  await sharp(hSrc)
    .resize({ width: 512, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC_LOGOS, "h-mark.png"));
  console.log(`✓ h-mark.png → public/logos`);

  // ─── Full Logo ────────────────────────────────────────────────────
  const fullSrc = path.join(LOGOS_SRC, "Hestia Logo.png");
  await sharp(fullSrc)
    .resize({ width: 800, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC_LOGOS, "full.png"));
  console.log(`✓ full.png → public/logos`);

  // ─── App icons + favicon (from H-Only) ───────────────────────────
  // Trim residual whitespace so the H fills the icon at fixed sizes.
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
