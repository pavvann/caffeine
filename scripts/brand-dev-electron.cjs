#!/usr/bin/env node
// Patch the dev Electron binary's bundle name on macOS so the menu bar
// shows "Caffeine" instead of "Electron" during `pnpm dev`.
//
// Why this is needed: macOS reads the application menu's first-item
// label from the bundle's Info.plist (CFBundleName), NOT from the
// JavaScript `Menu.setApplicationMenu` template. `app.setName()` and
// `productName` in package.json only affect the dock title and
// packaged builds. The bare Electron binary in node_modules ships
// with CFBundleName="Electron"; this script overwrites that key in
// place.
//
// Runs on postinstall. No-ops on non-macOS and when the .app bundle
// is missing (e.g. a partial install). Re-runs are safe — `plutil
// -replace` is idempotent.

const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

if (process.platform !== "darwin") process.exit(0);

const plistPath = resolve(
  __dirname,
  "..",
  "node_modules/electron/dist/Electron.app/Contents/Info.plist",
);

if (!existsSync(plistPath)) {
  console.log("[brand-dev-electron] Electron.app not found, skipping");
  process.exit(0);
}

const NEW_NAME = "Caffeine";

try {
  // CFBundleName is what shows in the menu bar's first item.
  execFileSync("plutil", [
    "-replace",
    "CFBundleName",
    "-string",
    NEW_NAME,
    plistPath,
  ]);
  // CFBundleDisplayName is what shows in the dock and the About dialog.
  // Keep them aligned so the app's identity is consistent.
  execFileSync("plutil", [
    "-replace",
    "CFBundleDisplayName",
    "-string",
    NEW_NAME,
    plistPath,
  ]);
  console.log(`[brand-dev-electron] dev binary rebranded to ${NEW_NAME}`);
} catch (err) {
  // Non-fatal: app still works, the menu bar just shows "Electron".
  console.warn(
    "[brand-dev-electron] plutil failed:",
    err instanceof Error ? err.message : String(err),
  );
}
