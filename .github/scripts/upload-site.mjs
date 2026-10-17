// The last step of build-site.yml: put the finished site, or the reason the build failed,
// in Vercel Blob, where the app's /api/sites finds it. Reads KEY and WORK from the
// environment and BLOB_READ_WRITE_TOKEN for the store.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { put } from "@vercel/blob";

const key = process.env.KEY ?? "";
if (!/^[0-9a-f]{24}$/.test(key)) {
  console.error("KEY must be 24 hex characters");
  process.exit(1);
}
const out = join(process.env.WORK ?? "build", "out");
const site = join(out, "site.json"), error = join(out, "error.json");

let path, file, maxAge;
if (existsSync(site)) {
  [path, file, maxAge] = [`sites/${key}/site.json`, site, 31536000]; // a key's site never changes
} else {
  // No site: say why if a step left a reason, else that the build stopped.
  [path, file, maxAge] = [`sites/${key}/error.json`, existsSync(error) ? error : null, 60];
}
const body = file ? readFileSync(file) : JSON.stringify({ error: "The build stopped before it finished. Try again." });
const blob = await put(path, body, {
  access: "public", addRandomSuffix: false, allowOverwrite: true,
  contentType: "application/json", cacheControlMaxAge: maxAge,
});
console.log(`saved ${blob.url}`);
if (!existsSync(site)) process.exit(1);
