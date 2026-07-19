const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

// Register custom "app" scheme as standard and secure to support fetch and ES modules
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false, // Disables CORS checking so the offline app can sync with the server API
    },
  });

  // Load the app via the custom protocol
  win.loadURL("app://localhost/index.html");
}

app.whenReady().then(() => {
  // Set up the custom "app" protocol to serve files from the www directory
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const relativePath = url.pathname;
    const wwwDir = path.resolve(__dirname, "../www");
    const filePath = path.join(wwwDir, relativePath);

    // Safety check: ensure the resolved path stays within the www directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(wwwDir)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Convert file path to a valid file:// URL using pathToFileURL
    const fileUrl = pathToFileURL(resolvedPath).href;
    return net.fetch(fileUrl);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
