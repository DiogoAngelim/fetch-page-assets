import fs from "fs";
import path from "path";
import mime from "mime";
// Utility functions for testing and main logic
export const g = (t) => path.join(...t);
export const A = (t) => t.split("?")[0].split("#")[0];
export const F = (t, e) => A(path.join(t, e));
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
            return `${filename}.${ext}`;
        }
    }
    return filename;
};
export const D = (t) => {
    const { loaded: e, total: s } = t;
    const a = e && s ? Math.round((e / s) * 100) : 0;
    if (!isNaN(a))
        console.log(`Download progress: ${a}%`);
};
export const h = (t, i) => {
    if (i)
        console.error(`[Error] ${t}`);
};
export const p = (t, i) => {
    if (i)
        console.log(`[Success] ${t}`);
};
export const d = (t) => t.startsWith("//");
export const m = (t, r) => (d(t) ? `${r}:${t}` : t);
export const u = (t) => t.endsWith("/");
export const w = (t) => !t.startsWith("http") && !d(t);
export const $ = (e) => e.trim().replace(/^['"]|['"]$/g, "");
export const E = (relativePath, a, r) => {
    try {
        if (w(relativePath)) {
            const cleanPath = $(relativePath);
            const resolved = new URL(cleanPath, a);
            return resolved.href;
        }
        return m(relativePath, r);
    }
    catch (err) {
        h(`Error resolving path: ${relativePath} — ${err.message}`);
        return relativePath;
    }
};
const extractAssets = async (t, e = { saveFile: true, verbose: true }) => {
    let { basePath: s, source: a, protocol: r, maxRetryAttempts: o, retryDelay: n, verbose: i, saveFile: c } = e;
    a = a || "";
    r = r || "https";
    n = n || 1e3;
    s = s || process.cwd();
    o = o || 3;
    let l = "";
    const v = (t) => {
        if (c) {
            const { parsedUrl: e, destinationFilePath: a } = t;
            const { origin: rUrl } = new URL(e);
            const urlStr = e;
            let relativeLocalPath = path.relative(s, a).split(path.sep).join("/");
            l = l.replaceAll(urlStr, relativeLocalPath);
            l = l.replaceAll(`${rUrl}${urlStr}`, relativeLocalPath);
            fs.writeFileSync(path.join(s, "index.html"), l, "utf8");
            p(`Updated HTML with local asset path for ${urlStr} -> ${relativeLocalPath}`, i);
        }
    };
    const G = async () => {
        if (typeof t !== "string" || typeof s !== "string") {
            h("Invalid user input: source and basePath must be strings.", i);
            return;
        }
        l = t;
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
    return l;
};
export default extractAssets;
