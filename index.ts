


import axios from "axios";
import fs from "fs";
import path from "path";
import { decode } from "html-entities";
import mime from "mime";
import type { ExtractAssetsOptions, AssetTask } from "./types.d";

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


  // Type helpers
  const h = (t: string): void => {
    if (i) console.error(`[Error] ${t}`);
  };
  const p = (t: string): void => {
    if (i) console.log(`[Success] ${t}`);
  };
  const d = (t: string): boolean => t.startsWith("//");
  const m = (t: string): string => (d(t) ? `${r}:${t}` : t);
  const u = (): boolean => t.endsWith("/");
  const w = (t: string): boolean => !t.startsWith("http") && !d(t);

  const $ = (e: string): string => e.trim().replace(/^['"]|['"]$/g, "");

  const E = (relativePath: string): string => {
    try {
      if (w(relativePath)) {
        const cleanPath = $(relativePath);
        const resolved = new URL(cleanPath, a);
        return resolved.href;
      }
      return m(relativePath);
    } catch (err: any) {
      h(`Error resolving path: ${relativePath} — ${err.message}`);
      return relativePath;
    }
  };

  const g = (t: string[]): string => path.join(...t);

  const U = (t: string): void => {
    fs.mkdirSync(t, { recursive: true });
    p(`Directory ensured: ${t}`);
  };

  const v = (t: AssetTask): void => {
    if (c) {
      const { parsedUrl: e, destinationFilePath: a } = t;
      const { origin: r } = new URL(e);
      const urlStr = e;
      let relativeLocalPath = path.relative(s, a!).split(path.sep).join("/");

      l = l.replaceAll(urlStr, relativeLocalPath);
      l = l.replaceAll(`${r}${urlStr}`, relativeLocalPath);

      fs.writeFileSync(path.join(s, "index.html"), l, "utf8");

      p(`Updated HTML with local asset path for ${urlStr} -> ${relativeLocalPath}`);
    }
  };

  const A = (t: string): string => t.split("?")[0].split("#")[0];
  const F = (t: string, e: string): string => A(path.join(t, e));
  const P = (t: any, e: string): any => t[e] || t[e.toLowerCase()];

  const R = (headers: any, fallback: string): string => {
    let filename = P(headers, "Content-Disposition")?.match(/filename="(.+?)"/)?.[1] || fallback;

    filename = filename?.split("?")[0].split("#")[0]; // Remove query/hash
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

  const D = (t: { loaded?: number; total?: number }): void => {
    const { loaded: e, total: s } = t;
    const a = e && s ? Math.round((e / s) * 100) : 0;
    if (!isNaN(a)) console.log(`Download progress: ${a}%`);
  };

  const N = async (url: string, e: string, saveFunc: (data: Buffer, meta: string) => Promise<void>): Promise<Buffer> => {
    try {
      const decodedUrl = decode(url);
      console.log("Starting download for:", decodedUrl);

      const { headers, data } = await axios.get(decodedUrl, {
        responseType: "arraybuffer",
        onDownloadProgress: D,
      });

      await saveFunc(data, R(headers, e));

      return data;

    } catch (error: any) {
      console.error("Download or save failed:", error.message || error);
      throw error;
    }
  };

  const L = async (t: string, e: number): Promise<void> => {
    console.log(`Retrying asset download for ${t} (Attempt ${e + 1}/${o})...`);
    await new Promise((resolve) => {
      setTimeout(resolve, n);
    });
  };

  const S = (t: string, e: number): boolean => ["ERR_BAD_REQUEST", "ENOTFOUND"].includes(t) && e >= o - 1;

  const T = (t: AssetTask): void => {
    const { responseData: e, destinationFilePath: s } = t;
    try {
      const dir = path.dirname(s!);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        p(`Created directory: ${dir}`);
      }
      fs.writeFileSync(s!, e! as Uint8Array);
      if (fs.existsSync(s!)) {
        p(`Asset saved successfully to ${s}`);
      } else {
        h(`Failed to save asset (${s}).`);
      }
    } catch (err: any) {
      h(`Error saving asset to ${s}: ${err.message}`);
    }
  };

  const C = async (t: AssetTask): Promise<void> => {
    v(t);
    T(t);
    await (async (t: AssetTask) => {
      const { absoluteAssetUrl: e, fileName: a } = t;
      if (a && a.endsWith(".css")) {
        await extractAssets(e, { basePath: s, saveFile: false });
      }
    })(t);
  };

  const I = async (t: AssetTask): Promise<void> => {
    const { absoluteAssetUrl: e, fileNameGuess: s, destinationPath: a } = t;
    await (async (t: string, e: string, s: (data: Buffer, meta: string) => Promise<void>) => {
      let a = 0;
      for (; a < o;) {
        try {
          await N(t, e, async (data, meta) => {
            if (data) {
              await s(data, meta);
            }
          });
          break;
        } catch (e: any) {
          const { message: s, code: r } = e;
          h(`Error downloading asset from ${t}: ${s}`);
          if (S(r, a)) break;
          await L(t, a);
          a++;
        }
      }
    })(e, s!, async (e, s) => {
      await C({ ...t, fileName: s, responseData: e, destinationFilePath: F(a, s) });
    });
  };

  const W = async (t: AssetTask): Promise<void> => {
    const { absoluteAssetUrl: e, destinationPath: s } = t;
    U(s);
    const parsed = new URL(e);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const lastPart = pathParts.pop();
    const cleanName = lastPart ? decodeURIComponent(lastPart.split("?")[0]) : "asset";
    await I({ ...t, fileNameGuess: cleanName });
  };

  const k = async (t: string): Promise<void> => {
    const e = E(t);
    try {
      await W({ parsedUrl: t, absoluteAssetUrl: e, destinationPath: path.join(s, "assets") });
    } catch (t: any) {
      const { message: s, code: a } = t;
      if (["ECONNRESET", "ETIMEDOUT"].includes(a)) {
        h(`Network error occurred while downloading asset from ${e}: ${s}.`);
      } else if (["EACCES", "EISDIR"].includes(a)) {
        h("Error saving asset. Permission denied or target path is a directory.");
      } else {
        h(`Error downloading asset from ${e}: ${s}.`);
      }
    }
  };

  const O = async (): Promise<void> => {
    const { data: e } = await axios.get(u() ? t : `${t}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
      },
      responseType: "arraybuffer"
    });
    l = e.toString("utf-8");
    console.log("Fetching content...");
  };

  const j = (): boolean => {
    if (!b(t)) return false;
    try {
      return f(t);
    } catch (t: any) {
      h(t);
      return false;
    }
  };

  const f = (t: string): boolean => {
    const { protocol: e, hostname: s, href: a } = new URL(A(t));
    if (!e || !["http:", "https:"].includes(e)) throw new Error("Invalid protocol in baseUrl. Only http and https are supported.");
    if (!s) throw new Error("Invalid baseUrl. Provide a valid URL with a hostname.");
    return !!a;
  };

  const b = (t: string): boolean => {
    try {
      return !!new URL(m(t));
    } catch {
      return false;
    }
  };

  const G = async (): Promise<void> => {
    if (typeof t !== "string" || typeof s !== "string") {
      h("Invalid user input: source and basePath must be strings.");
      return;
    }
    if (j()) {
      await O();
    } else {
      l = t;
      t = a!;
    }
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

  for (const asset of matches) await k(asset);

  return l;
};

export default extractAssets;