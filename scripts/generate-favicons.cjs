const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = (require('png-to-ico').default || require('png-to-ico'));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SOURCE_IMAGE = path.join(PUBLIC_DIR, 'favicon.png');
const BACKUP_IMAGE = path.join(PUBLIC_DIR, 'favicon-original-backup.png');

async function processFavicon() {
  console.log('--- Step 1: Backup Source Logo ---');
  if (!fs.existsSync(BACKUP_IMAGE)) {
    fs.copyFileSync(SOURCE_IMAGE, BACKUP_IMAGE);
    console.log(`Saved original source backup to: ${BACKUP_IMAGE}`);
  } else {
    console.log(`Original source backup already exists at: ${BACKUP_IMAGE}`);
  }

  console.log('\n--- Step 2: Remove Background with Sub-pixel Anti-aliasing ---');
  // Load original backup to ensure idempotent processing
  const srcBuffer = fs.readFileSync(BACKUP_IMAGE);
  const { data, info } = await sharp(srcBuffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Analytically determined circular logo center and radius
  const cx = 511.5;
  const cy = 511.5;
  const R = 384.2;
  const feather = 1.2; // Feather transition width in pixels

  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * channels;
      const outIdx = (y * width + x) * 4;

      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      let alpha = 0;
      if (d <= R - feather / 2) {
        alpha = 1;
      } else if (d < R + feather / 2) {
        alpha = (R + feather / 2 - d) / feather;
      }

      if (alpha <= 0) {
        // Fully transparent
        out[outIdx] = 0;
        out[outIdx + 1] = 0;
        out[outIdx + 2] = 0;
        out[outIdx + 3] = 0;
      } else if (alpha >= 1) {
        // Fully opaque interior
        out[outIdx] = data[srcIdx];
        out[outIdx + 1] = data[srcIdx + 1];
        out[outIdx + 2] = data[srcIdx + 2];
        out[outIdx + 3] = 255;
      } else {
        // Anti-aliased edge: defringe against white canvas
        const rObs = data[srcIdx];
        const gObs = data[srcIdx + 1];
        const bObs = data[srcIdx + 2];

        const rTrue = Math.max(0, Math.min(255, Math.round((rObs - (1 - alpha) * 255) / alpha)));
        const gTrue = Math.max(0, Math.min(255, Math.round((gObs - (1 - alpha) * 255) / alpha)));
        const bTrue = Math.max(0, Math.min(255, Math.round((bObs - (1 - alpha) * 255) / alpha)));

        out[outIdx] = rTrue;
        out[outIdx + 1] = gTrue;
        out[outIdx + 2] = bTrue;
        out[outIdx + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
      }
    }
  }

  // Crop around logo with balanced ~6% optical breathing room
  const logoDiameter = 2 * R;
  const cropSize = Math.round(logoDiameter / 0.88); // ~873px square
  const left = Math.max(0, Math.round(cx - cropSize / 2));
  const top = Math.max(0, Math.round(cy - cropSize / 2));

  const masterTransparentSharp = sharp(out, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropSize, height: cropSize });

  const masterBuffer = await masterSharpToPngBuffer(masterTransparentSharp);

  console.log('\n--- Step 3: Generate All Required Favicon Assets ---');

  const targets = [
    { file: 'favicon.png', size: 512 },
    { file: 'favicon-32x32.png', size: 32 },
    { file: 'favicon-16x16.png', size: 16 },
    { file: 'apple-touch-icon.png', size: 180 },
    { file: 'android-chrome-192x192.png', size: 192 },
    { file: 'android-chrome-512x512.png', size: 512 },
    { file: 'pwa-192x192.png', size: 192 },
    { file: 'pwa-512x512.png', size: 512 }
  ];

  for (const t of targets) {
    const dest = path.join(PUBLIC_DIR, t.file);
    await sharp(masterBuffer)
      .resize(t.size, t.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3
      })
      .png({ compressionLevel: 9 })
      .toFile(dest);
    console.log(`Generated: ${t.file} (${t.size}x${t.size} PNG, Alpha Transparent)`);
  }

  console.log('\n--- Step 4: Generate Multi-Resolution favicon.ico ---');
  const icoDest = path.join(PUBLIC_DIR, 'favicon.ico');
  const icoSizes = [16, 32, 48];
  const icoPngBuffers = [];
  for (const s of icoSizes) {
    const buf = await sharp(masterBuffer)
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    icoPngBuffers.push(buf);
  }
  const icoBuffer = await pngToIco(icoPngBuffers);
  fs.writeFileSync(icoDest, icoBuffer);
  console.log(`Generated: favicon.ico (${icoBuffer.length} bytes, multi-resolution 16/32/48)`);

  console.log('\n--- Step 5: Transparency and Channel Verification ---');
  for (const t of targets) {
    const dest = path.join(PUBLIC_DIR, t.file);
    const meta = await sharp(dest).metadata();
    const { data: rawData } = await sharp(dest).raw().toBuffer({ resolveWithObject: true });
    // Check corner pixel (0,0) alpha
    const cornerAlpha = rawData[3];
    console.log(`Verified ${t.file}: format=${meta.format}, size=${meta.width}x${meta.height}, channels=${meta.channels}, hasAlpha=${meta.hasAlpha}, cornerAlpha=${cornerAlpha}`);
    if (!meta.hasAlpha || cornerAlpha !== 0) {
      throw new Error(`Transparency verification failed for ${t.file}`);
    }
  }

  console.log('\nAll favicons successfully generated, defringed, and verified!');
}

async function masterSharpToPngBuffer(sharpInstance) {
  return await sharpInstance.png({ compressionLevel: 9 }).toBuffer();
}

processFavicon().catch(err => {
  console.error('Fatal favicon generation error:', err);
  process.exit(1);
});

