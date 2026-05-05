import { app, BrowserWindow, Menu, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc";

const isDev = !app.isPackaged;
const isMac = process.platform === "darwin";

// Force the display name before app ready. macOS reads this for the
// dock label, the About dialog, and the application menu's first
// item. Without it, both dev and packaged builds show "Electron".
// `productName` in package.json is the canonical source; this call
// is belt-and-suspenders for the dev binary which sometimes ignores
// productName until the app is rebranded at packaging time.
app.setName("Caffeine");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0b0b0e",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/**
 * Build the application menu. On macOS, the first submenu's label is
 * what shows in the menu bar — so Electron's default menu (which uses
 * the binary name "Electron") is what was bleeding through before.
 *
 * Using `app.getName()` rather than a string literal so the menu
 * stays in sync with `productName` / `app.setName()` if either ever
 * changes. The submenu uses Electron's role helpers for system
 * conventions (Cmd+Q, services, hide, etc.).
 */
function buildMenu(): Menu {
  const appName = app.getName();

  const macAppMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? ([
            { role: "pasteAndMatchStyle" },
            { role: "delete" },
            { role: "selectAll" },
          ] satisfies MenuItemConstructorOptions[])
        : ([
            { role: "delete" },
            { type: "separator" },
            { role: "selectAll" },
          ] satisfies MenuItemConstructorOptions[])),
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: isMac
      ? [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" },
        ]
      : [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [macAppMenu] : []),
    editMenu,
    viewMenu,
    windowMenu,
  ];

  return Menu.buildFromTemplate(template);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  registerIpc(() => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
