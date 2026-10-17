// /api/sites: build a drawn site on a GitHub runner (app/sites/build.ts). The GitHub token
// and the Blob token stay here.
import { BlobNotFoundError, head } from "@vercel/blob";
import { handle, type Deps } from "../sites/build.js";

const deps: Deps = {
  env: process.env,
  now: Date.now,
  fetch,
  github: (path, init = {}) => fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN ?? ""}`, "Content-Type": "application/json",
      "User-Agent": "permutation-city",
    },
  }),
  blobUrl: async (path) => {
    try {
      return (await head(path)).url;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return null;
      throw e;
    }
  },
};

export const GET = (request: Request) => handle(request, deps);
export const POST = (request: Request) => handle(request, deps);
