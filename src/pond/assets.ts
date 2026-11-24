import type { PondAssets } from "./pond.ts";

// Vite rewrites new URL() only for a literal path.
export const POND_ASSETS: PondAssets = {
  views: [
    {
      name: "sunset",
      land: new URL("./views/sunset/land.png", import.meta.url).href,
      depth: new URL("./views/sunset/depth.png", import.meta.url).href,
      foreground: null,
      foliage: new URL("./views/sunset/foliage.png", import.meta.url).href,
    },
    {
      name: "grassy-knoll",
      land: new URL("./views/grassy-knoll/land.png", import.meta.url).href,
      depth: new URL("./views/grassy-knoll/depth.png", import.meta.url).href,
      foreground: new URL("./views/grassy-knoll/foreground.png", import.meta.url).href,
      foliage: new URL("./views/grassy-knoll/foliage.png", import.meta.url).href,
    },
  ],
  stars: new URL("./sky/stars.bin", import.meta.url).href,
  milkyWay: new URL("./sky/milkyway.bin", import.meta.url).href,
};
