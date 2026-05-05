#!/usr/bin/env node
// Generate a macOS .icns from build/icon.png and install it over the
// dev Electron binary's bundle icon so `pnpm dev` shows the Caffeine
// icon in the dock and the application switcher.
//
// Why this is needed (parallel to brand-dev-electron.cjs): the bare
// Electron binary in node_modules ships its own electron.icns. macOS
// reads the dock icon from that file, NOT from anything we set at
// runtime. Overwriting the file in place is the cleanest path.
// `productName` + a real .icns at build/icon.icns will pick up
// automatically when the app is packaged via electron-builder/forge.
//
// macOS-only (sips and iconutil are built-in there). No-ops on
// Linux/Windows. Idempotent: re-running just regenerates from the
// current build/icon.png.

const { execFileSync } = require("node:child_process");
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} = require("node:fs");
const { resolve } = require("node:path");
const { PNG } = require("pngjs");

if (process.platform !== "darwin") process.exit(0);

const root = resolve(__dirname, "..");
const sourcePng = resolve(root, "build/icon.png");
const maskedPng = resolve(root, "build/icon-mac.png");
const iconsetDir = resolve(root, "build/icon.iconset");
const icnsPath = resolve(root, "build/icon.icns");
const electronAppPath = resolve(
  root,
  "node_modules/electron/dist/Electron.app",
);
const electronIcnsPath = resolve(
  electronAppPath,
  "Contents/Resources/electron.icns",
);

if (!existsSync(sourcePng)) {
  console.log("[generate-icns] build/icon.png not found, skipping");
  process.exit(0);
}

// Apply a rounded-rect alpha mask to build/icon.png, writing
// build/icon-mac.png. macOS expects app icon PNGs to be pre-shaped
// with transparent corners — unlike iOS, the OS does not auto-mask.
// 22.37% corner radius is the standard simple approximation of
// Apple's squircle. Pure-JS via pngjs so this works on any macOS
// without ImageMagick / sharp.
applyRoundedMask(sourcePng, maskedPng);

// Source for the iconset is the masked PNG, NOT the original.
// Original stays unmodified so future tweaks to the mask shape
// don't compound.
const iconsetSource = maskedPng;

// Generate the macOS-required iconset (10 sizes: 16/32/64/128/256/512
// at 1x and 2x). `sips -z H W src --out dst` resizes proportionally
// to the smaller dimension, which is what we want for square inputs.
mkdirSync(iconsetDir, { recursive: true });
const sizes = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

for (const { name, size } of sizes) {
  execFileSync(
    "sips",
    [
      "-z",
      String(size),
      String(size),
      iconsetSource,
      "--out",
      resolve(iconsetDir, name),
    ],
    { stdio: "ignore" },
  );
}

execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);

if (!existsSync(electronAppPath)) {
  console.log(
    "[generate-icns] icns generated, dev Electron.app not found (skipping install)",
  );
  process.exit(0);
}

copyFileSync(icnsPath, electronIcnsPath);

// Bump the bundle's mtime so macOS's icon cache invalidates on next
// launch. Without this the dock/Finder may keep showing the old
// Electron icon for a while after the file changes.
const now = new Date();
utimesSync(electronAppPath, now, now);

console.log("[generate-icns] icon installed: build/icon.icns → dev Electron.app");

/**
 * Apply a rounded-rect alpha mask to a PNG, writing to dst.
 * Corner radius is 22.37% of the smaller side — the standard simple
 * approximation of Apple's squircle (good enough for 16-1024px).
 * Anti-aliases the corner edge by sub-pixel sampling so the curves
 * don't show stair-steps at small sizes.
 */
function applyRoundedMask(srcPath, dstPath) {
  const png = PNG.sync.read(readFileSync(srcPath));
  const { width, height, data } = png;
  const r = Math.round(Math.min(width, height) * 0.2237);

  // 4-tap super-sample for anti-aliasing on the corner edges.
  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let inside = 0;
      for (const [sx, sy] of samples) {
        if (insideRoundedRect(x + sx, y + sy, width, height, r)) inside++;
      }
      const coverage = inside / samples.length; // 0..1
      const idx = (width * y + x) << 2;
      data[idx + 3] = Math.round(data[idx + 3] * coverage);
    }
  }

  writeFileSync(dstPath, PNG.sync.write(png));
}

function insideRoundedRect(x, y, w, h, r) {
  // Inside the inner rectangle (between the four corner arcs)?
  if (x >= r && x <= w - r) return true;
  if (y >= r && y <= h - r) return true;
  // Otherwise we're in a corner region — check distance to the
  // nearest corner's center.
  const cx = x < r ? r : w - r;
  const cy = y < r ? r : h - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
