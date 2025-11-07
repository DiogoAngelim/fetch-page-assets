import fs from "fs";
import path from "path";
import { decode } from "html-entities";
import mime from "mime";
import type { ExtractAssetsOptions, AssetTask } from "./types.d";

// Utility functions for testing and main logic
export const g = (t: string[]): string => path.join(...t);
export const A = (t: string): string => t.split("?")[0].split("#")[0];
export const F = (t: string, e: string): string => A(path.join(t, e));
export const P = (t: any, e: string): any => t[e] || t[e.toLowerCase()];
export const R = (headers: any, fallback: string): string => {
  let filename = P(headers, "Content-Disposition")?.match(/filename="(.+?)"/)?.[1] || fallback;
  filename = filename?.split("?")[0].split("#")[0];
  filename = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const contentType = P(headers, "Content-Type");
  const hasExt = filename.includes(".");
  if (!hasExt && contentType) {
    const ext = mime.getExtension(contentType);
    if (ext) {
      return `${filename}.${ext}`;
    }
  }
  return filename;
};
export const D = (t: { loaded?: number; total?: number }): void => {
  const { loaded: e, total: s } = t;
  const a = e && s ? Math.round((e / s) * 100) : 0;
  if (!isNaN(a)) console.log(`Download progress: ${a}%`);
};
export const h = (t: string, i?: boolean): void => {
  if (i) console.error(`[Error] ${t}`);
};
export const p = (t: string, i?: boolean): void => {
  if (i) console.log(`[Success] ${t}`);
};
export const d = (t: string): boolean => t.startsWith("//");
export const m = (t: string, r: string): string => (d(t) ? `${r}:${t}` : t);
export const u = (t: string): boolean => t.endsWith("/");
export const w = (t: string): boolean => !t.startsWith("http") && !d(t);
export const $ = (e: string): string => e.trim().replace(/^['"]|['"]$/g, "");
export const E = (relativePath: string, a: string, r: string): string => {
  try {
    if (w(relativePath)) {
      const cleanPath = $(relativePath);
      const resolved = new URL(cleanPath, a);
      return resolved.href;
    }
    return m(relativePath, r);
  } catch (err: any) {
    h(`Error resolving path: ${relativePath} — ${err.message}`);
    return relativePath;
  }
};

const extractAssets = async (t: string, e: ExtractAssetsOptions = { saveFile: true, verbose: true }): Promise<string> => {
  let {
    basePath: s,
    source: a,
    protocol: r,
    maxRetryAttempts: o,
    retryDelay: n,
    verbose: i,
    saveFile: c
  } = e;

  a = a || "";
  r = r || "https";
  n = n || 1e3;
  s = s || process.cwd();
  o = o || 3;

  let l: string = "";

  const v = (t: AssetTask): void => {
    if (c) {
      const { parsedUrl: e, destinationFilePath: a } = t;
      const { origin: rUrl } = new URL(e);
      const urlStr = e;
      let relativeLocalPath = path.relative(s, a!).split(path.sep).join("/");
      l = l.replaceAll(urlStr, relativeLocalPath);
      l = l.replaceAll(`${rUrl}${urlStr}`, relativeLocalPath);
      fs.writeFileSync(path.join(s, "index.html"), l, "utf8");
      p(`Updated HTML with local asset path for ${urlStr} -> ${relativeLocalPath}`, i);
    }
  };

  const G = async (): Promise<void> => {
    if (typeof t !== "string" || typeof s !== "string") {
      h("Invalid user input: source and basePath must be strings.", i);
      return;
    }
    l = t;
  };

  await G();
  l = l.replace(/srcset="(.*?)"/gi, "").replace(/sizes="(.*?)"/gi, "").replace(new RegExp(t, "g"), "");

  const regex = /(<link[^>]+rel=["']stylesheet["'][^>]+href=["'])([^"']+\.[^"']+)["']|<(img|script|source)[^>]+src=["']([^"']+\.[^"']+)["']/gi;

  const matches: string[] = [
    ...[...l.matchAll(regex)].map(m => m[2] || m[4] || ""),
    ...[...l.matchAll(/url\(["']?(.*?)["']?\)/gi)]
      .map(m => m[1])
      .filter(url => !/^#/.test(url))
  ].filter(m => !!m && !m.startsWith("data:"));


  return l;
};

export default extractAssets;