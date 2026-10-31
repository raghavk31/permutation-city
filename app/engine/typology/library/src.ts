import type { Source } from "../types.js";

export const src = (title: string, url: string): Source => ({ title, url });
