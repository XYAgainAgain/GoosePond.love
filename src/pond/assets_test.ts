import { assert } from "@std/assert";
import { POND_ASSETS } from "./assets.ts";

Deno.test("every pond asset exists", async () => {
  const urls = [POND_ASSETS.stars, POND_ASSETS.milkyWay];
  for (const view of POND_ASSETS.views) {
    urls.push(view.land);
    for (const layer of [view.depth, view.foreground, view.foliage]) if (layer) urls.push(layer);
  }
  for (const url of urls) assert((await Deno.stat(new URL(url))).isFile, url);
});
