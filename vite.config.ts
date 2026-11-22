import { defineConfig, type Plugin } from "vite";

const BUILD = new Date().toISOString().slice(0, 16).replace("T", " ");

function serviceWorker(): Plugin {
  return {
    name: "goosepond-sw",
    apply: "build",
    generateBundle: {
      // Runs last: the elk worker chunk and the CSS font assets come from other plugins
      order: "post",
      async handler(_options, bundle) {
        const files = Object.keys(bundle).filter((f) => !f.endsWith(".map")).map((f) => `/${f}`);
        // Asset names carry content hashes; index.html doesn't, so its text goes in too
        const page = bundle["index.html"];
        const html = page?.type === "asset" ? String(page.source) : "";
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(files.sort().join(" ") + html),
        );
        const release = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0")).join("");
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: worker(`goosepond-${release.slice(0, 16)}`, ["/", ...files]),
        });
      },
    },
  };
}

function worker(cache: string, files: string[]): string {
  return `const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files, null, 2)};

// No skipWaiting: an open tab keeps its release's cache, and the lazy elk chunk with it, until it closes
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(FILES.map((url) => new Request(url, { cache: "reload" })))
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("goosepond-") && k !== CACHE).map((k) => caches.delete(k)),
        )
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(CACHE)
          .then((cache) => cache.match("/index.html"))
          .then((hit) => hit ?? Response.error())
      ),
    );
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
`;
}

export default defineConfig(({ command }) => ({
  base: "/",
  build: { target: "es2022" },
  define: { __BUILD__: JSON.stringify(command === "build" ? BUILD : "dev") },
  plugins: [serviceWorker()],
}));
