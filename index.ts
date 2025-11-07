import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import beautify from "beautify";
import { decode } from "html-entities";
import mime from "mime";

type ExtractAssetsOptions = {
  basePath?: string;
  source?: string;
  protocol?: string;
  maxRetryAttempts?: number;
  retryDelay?: number;
  verbose?: boolean;
  saveFile?: boolean;
};


export const h = (t, i = true) => { if (i) console.error(`[Error] ${t}`); };
export const p = (t, i = true) => { if (i) console.log(`[Success] ${t}`); };
export const d = (t) => t.startsWith("//");
export const m = (t, r = "https") => (d(t) ? `${r}:${t}` : t);
export const u = (t) => t.endsWith("/");
export const w = (t) => !t.startsWith("http") && !d(t);
export const $ = (e) => e.trim().replace(/^['"]|['"]$/g, "");
export const E = (relativePath, a = "", r = "https") => {
  try {
    if (w(relativePath)) {
      const cleanPath = $(relativePath);
      const resolved = new URL(cleanPath, a);
      return resolved.href;
    }
    return m(relativePath, r);
  } catch (err) {
    h(`Error resolving path: ${relativePath} — ${err.message}`);
    return relativePath;
  }
};
export const g = (t) => path.join(...t);
export const U = (t, i = true) => {
  fs.mkdirSync(t, { recursive: !0 });
  p(`Directory ensured: ${t}`, i);
};
export const v = (t, l, s, c, i = true) => {
  if (c) {
    const { parsedUrl: e, destinationFilePath: a } = t;
    const { origin: r } = new URL(e);
    const urlStr = typeof e === "string" ? e : e.toString();
    let relativeLocalPath = path.relative(s, a).split(path.sep).join("/");
    l = l.replaceAll(urlStr, relativeLocalPath);
    l = l.replaceAll(`${r}${urlStr}`, relativeLocalPath);
    fs.writeFileSync(path.join(s, "index.html"), beautify(l, { format: "html" }), "utf8");
    p(`Updated HTML with local asset path for ${urlStr} -> ${relativeLocalPath}`, i);
  }
};
export const A = (t) => t.split("?")[0].split("#")[0];
export const F = (t, e) => A(path.join(t, e));
export const x = (t) => t.split(".");
export const P = (t, e) => t[e] || t[e.toLowerCase()];
export const R = (headers, fallback) => {
  let filename = P(headers, "Content-Disposition")?.match(/filename="(.+?)"/)?.[1] || fallback;
  filename = filename?.split("?")[0].split("#")[0];
  filename = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const contentType = P(headers, "Content-Type");
  const hasExt = filename.includes(".");
  if (!hasExt && contentType) {
    const ext = mime.getExtension(contentType);
    if (ext) {
      filename = `${filename}.${ext}`;
    }
  }
  return filename;
};
export const D = (t) => {
  const { loaded: e, total: s } = t;
  const a = e && s ? Math.round((e / s) * 100) : 0;
  if (!isNaN(a)) console.log(`Download progress: ${a}%`);
};


const extractAssets = async (t: string, e: ExtractAssetsOptions = {}) => {
  let {
    basePath: s = process.cwd(),
    source: a = "",
    protocol: r = "https",
    maxRetryAttempts: o = 3,
    retryDelay: n = 1000,
    verbose: i = true,
    saveFile: c = true
  } = e;

  a = a || "";
  r = r || "https";
  n = n || 1e3;
  s = s || process.cwd();
  o = o || 3;

  let l = "";

  const h = (t) => {
    i && console.error(`[Error] ${t}`);
  };
  const p = (t) => {
    i && console.log(`[Success] ${t}`);
  };
  const d = (t) => t.startsWith("//");
  const m = (t) => (d(t) ? `${r}:${t}` : t);
  const u = () => t.endsWith("/");
  const w = (t) => !t.startsWith("http") && !d(t);

  const $ = (e) => e.trim().replace(/^['"]|['"]$/g, "");

  const E = (relativePath) => {
    try {
      if (w(relativePath)) {
        const cleanPath = $(relativePath);
        const resolved = new URL(cleanPath, a);
        return resolved.href;
      }
      return m(relativePath);
    } catch (err) {
      h(`Error resolving path: ${relativePath} — ${err.message}`);
      return relativePath;
    }
  };

  const g = (t) => path.join(...t);

  const U = (t) => {
    fs.mkdirSync(t, { recursive: !0 });
    p(`Directory ensured: ${t}`);
  };

  const v = (t) => {
    if (c) {
      const { parsedUrl: e, destinationFilePath: a } = t;
      const { origin: r } = new URL(e);
      const urlStr = typeof e === "string" ? e : e.toString();
      let relativeLocalPath = path.relative(s, a).split(path.sep).join("/");

      l = l.replaceAll(urlStr, relativeLocalPath);
      l = l.replaceAll(`${r}${urlStr}`, relativeLocalPath);

      fs.writeFileSync(path.join(s, "index.html"), beautify(l, { format: "html" }), "utf8");

      p(`Updated HTML with local asset path for ${urlStr} -> ${relativeLocalPath}`);
    }
  };


  const A = (t) => t.split("?")[0].split("#")[0];
  const F = (t, e) => A(path.join(t, e));

  const x = (t) => t.split(".");
  const P = (t, e) => t[e] || t[e.toLowerCase()];

  const R = (headers, fallback) => {
    let filename = P(headers, "Content-Disposition")?.match(/filename="(.+?)"/)?.[1] || fallback;

    filename = filename?.split("?")[0].split("#")[0];
    filename = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");

    const contentType = P(headers, "Content-Type");
    const hasExt = filename.includes(".");

    if (!hasExt && contentType) {
      const ext = mime.getExtension(contentType);
      if (ext) {
        filename = `${filename}.${ext}`;
      }
    }

    return filename;
  };


  const D = (t) => {
    const { loaded: e, total: s } = t;
    const a = e && s ? Math.round((e / s) * 100) : 0;
    if (!isNaN(a)) console.log(`Download progress: ${a}%`);
  };

  const N = async (url, e, saveFunc) => {
    const decodedUrl = decode(url);
    console.log("Starting download for:", decodedUrl);
    return new Promise((resolve, reject) => {
      const client = decodedUrl.startsWith('https') ? https : http;
      client.get(decodedUrl, (res) => {
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let loaded = 0;
        const chunks = [];
        res.on('data', (chunk) => {
          loaded += chunk.length;
          chunks.push(chunk);
          if (total) {
            const percent = Math.round((loaded / total) * 100);
            if (!isNaN(percent)) console.log(`Download progress: ${percent}%`);
          }
        });
        res.on('end', async () => {
          const data = Buffer.concat(chunks);
          try {
            await saveFunc(data, R(res.headers, e));
            resolve(data);
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', (err) => {
          console.error("Download or save failed:", err.message || err);
          reject(err);
        });
      }).on('error', (err) => {
        console.error("Request failed:", err.message || err);
        reject(err);
      });
    });
  };


  const L = async (t, e) => {
    const targetUrl = u() ? t : `${t}/`;
    const client = targetUrl.startsWith('https') ? https : http;
    await new Promise((resolve, reject) => {
      client.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*",
        }
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          l = Buffer.concat(chunks).toString('utf-8');
          console.log("Fetching content...");
          resolve(l);
        });
        res.on('error', (err) => {
          console.error("Fetch failed:", err.message || err);
          reject(err);
        });
      }).on('error', (err) => {
        console.error("Request failed:", err.message || err);
        reject(err);
      });
    });
    try {
      const dir = path.dirname(s);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        p(`Created directory: ${dir}`);
      }

      fs.writeFileSync(s, e);

      if (fs.existsSync(s)) {
        p(`Asset saved successfully to ${s}`);
      } else {
        h(`Failed to save asset (${s}).`);
      }
    } catch (err) {
      h(`Error saving asset to ${s}: ${err.message}`);
    }
  };

  const C = async (t) => {
    v(t);

    await (async (t) => {
      const { absoluteAssetUrl: e, fileName: a } = t;
      if (a.endsWith(".css")) {
        await extractAssets(e, { basePath: s, saveFile: false });
      }
    })(t);
  };

  const I = async (t) => {
    const { absoluteAssetUrl: assetUrl, fileNameGuess, destinationPath } = t;
    await (async (url, fileName, dirPath) => {
      let attempt = 0;
      for (; attempt < o;) {
        try {
          await N(url, fileName, async (data) => {

            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }

            const fullPath = path.join(dirPath, fileName);
            fs.writeFileSync(fullPath, data);
            p(`Asset saved successfully to ${fullPath}`);
          });
          break;
        } catch (err) {
          const { message, code } = err;
          h(`Error downloading asset from ${url}: ${message}`);
          await L(url, attempt);
          attempt++;
        }
      }
    })(assetUrl, fileNameGuess, destinationPath);
  };

  const W = async (t) => {
    const { absoluteAssetUrl: e, destinationPath: s } = t;
    U(s);
    const parsed = new URL(e);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const lastPart = pathParts.pop();
    const cleanName = lastPart ? decodeURIComponent(lastPart.split("?")[0]) : "asset";
    await I({ ...t, fileNameGuess: cleanName });
  };

  const k = async (t) => {
    const e = E(t);
    try {

      const urlObj = new URL(e);
      const urlPath = urlObj.pathname.replace(/^\//, "");
      const dirPath = path.join(s, path.dirname(urlPath));
      const fileName = path.basename(urlPath).split("?")[0].split("#")[0];
      await W({
        parsedUrl: t,
        absoluteAssetUrl: e,
        destinationPath: dirPath,
        fileNameGuess: fileName
      });
    } catch (t) {
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

  const O = async () => {


  };

  const j = () => {
    if (!b(t)) return !1;
    try {
      return f(t);
    } catch (t) {
      h(t);
      return !1;
    }
  };

  const f = (t) => {
    const { protocol: e, hostname: s, href: a } = new URL(A(t));
    if (!e || !["http:", "https:"].includes(e)) throw new Error("Invalid protocol in baseUrl. Only http and https are supported.");
    if (!s) throw new Error("Invalid baseUrl. Provide a valid URL with a hostname.");
    return !!a;
  };

  const b = (t) => {
    try {
      return !!new URL(m(t));
    } catch {
      return !1;
    }
  };

  const G = async () => {
    if (typeof t !== "string" || typeof s !== "string") {
      h("Invalid user input: source and basePath must be strings.");
      return;
    }
    if (j()) {
      await O();
    } else {
      l = t;
      t = a;
    }
  };

  await G();
  l = l.replace(/srcset="(.*?)"/gi, "").replace(/sizes="(.*?)"/gi, "").replace(new RegExp(t, "g"), "");

  const regex = /(<link[^>]+rel=["']stylesheet["'][^>]+href=["'])([^"']+\.[^"']+)["']|<(img|script|source)[^>]+src=["']([^"']+\.[^"']+)["']/gi;

  const matches = [
    ...[...l.matchAll(regex)].map(m => m[2] || m[4] || ""),
    ...[...l.matchAll(/url\(["']?(.*?)["']?\)/gi)]
      .map(m => m[1])
      .filter(url => !/^#/.test(url))
  ].filter(m => !!m && !m.startsWith("data:"));

  for (const asset of matches) await k(asset);

  return l;
};

export default extractAssets;