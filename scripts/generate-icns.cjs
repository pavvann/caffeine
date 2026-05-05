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
  utimesSync,
} = require("node:fs");
const { resolve } = require("node:path");

if (process.platform !== "darwin") process.exit(0);

const root = resolve(__dirname, "..");
const sourcePng = resolve(root, "build/icon.png");
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
    ["-z", String(size), String(size), sourcePng, "--out", resolve(iconsetDir, name)],
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
