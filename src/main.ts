import { COPY } from "./copy.ts";
import { startApp } from "./ui/app.ts";
import { hasPass, showDoor } from "./ui/door.ts";
import { labelText, restoreLook } from "./ui/settings.ts";

restoreLook();
const root = document.getElementById("app")!;
document.title = COPY.page.title;
const boot = root.querySelector(".boot");
if (boot) boot.textContent = COPY.page.boot;
// Map labels cache once drawn: wait for the faces, not a stalled download; a late face restyles
await Promise.race([
  Promise.all([
    document.fonts.load(`11px "${labelText().family}"`),
    document.fonts.load('700 16px "Gaegu"'),
    document.fonts.load('400 16px "Gaegu"'),
  ]).catch(() => {}),
  new Promise((done) => setTimeout(done, 3000)),
]);
if (!hasPass()) await showDoor(root);
await startApp(root);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
