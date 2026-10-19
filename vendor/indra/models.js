// Model files come straight from the Hugging Face repo (they are not part of
// this project; see the README for their license). The browser keeps them in
// the Cache API, so they download once.
export const HF_REPO = "datalab-to/indra-ocr";
export const HF_REVISION = "v3.1"; // the model set indra-ocr 0.3.1 was tested against
export const MODEL_FILES = [
  "meta.json", "det.onnx", "rec.onnx", "order.onnx", "orient.onnx", "script.onnx", "rec_cjk.onnx",
];

// Los modelos van vendidos en el repo (models/): nada se descarga de Hugging Face.
export const LOCAL_BASE = new URL("../../models/", import.meta.url).href;
export const modelUrl = (name, base = LOCAL_BASE) => base + name;

/** A loader for IndraOCR.create: cached fetch, bytes for .onnx, text for .json. */
export function cachedLoader({ base, cacheName = `indra-ocr-${HF_REVISION}`, onProgress } = {}) {
  return async (name) => {
    const url = modelUrl(name, base);
    onProgress?.({ name, state: "ask" });
    let res;
    const cache = typeof caches !== "undefined" ? await caches.open(cacheName).catch(() => null) : null;
    if (cache) res = await cache.match(url);
    onProgress?.({ name, state: cache && res ? "hit" : "miss" });
    if (!res) {
      onProgress?.({ name, state: "download" });
      res = await fetch(url);
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      const total = +res.headers.get("content-length") || 0;
      if (res.body && total) {
        const reader = res.body.getReader(), parts = [];
        let loaded = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); loaded += value.length;
          onProgress?.({ name, state: "progress", loaded, total });
        }
        const buf = new Uint8Array(loaded);
        let off = 0; for (const c of parts) { buf.set(c, off); off += c.length; }
        if (cache) await cache.put(url, new Response(buf, { headers: res.headers })).catch(() => {});
        onProgress?.({ name, state: "ready" });
        return name.endsWith(".json") ? new TextDecoder().decode(buf) : buf;
      }
      if (cache) await cache.put(url, res.clone()).catch(() => {});
    }
    onProgress?.({ name, state: "ready" });
    return name.endsWith(".json") ? res.text() : new Uint8Array(await res.arrayBuffer());
  };
}
