// Web worker: loads the models once and OCRs grayscale pages posted to it,
// so the page stays responsive while ONNX Runtime runs.
const post = (p) => self.postMessage({ type: "progress", name: "boot", ...p });
post({ state: "boot", v: "w49", isolated: !!self.crossOriginIsolated, cores: navigator.hardwareConcurrency || 1 });
// Los mensajes que llegan mientras el módulo aún se importa se guardan y se
// reprocesan al terminar: el arranque ("init") llega antes de que el receptor esté montado.
const tempranos = [];
self.onmessage = ({ data }) => tempranos.push(data);

let ort, IndraOCR, cachedLoader;
try {
  ort = await import("../ort/ort.wasm.min.mjs");
  post({ state: "ort" });
  ({ IndraOCR } = await import("./pipeline.js?r=49"));
  ({ cachedLoader } = await import("./models.js?r=49"));
  post({ state: "modules" });
} catch (e) {
  post({ state: "boot-error", message: String(e?.message ?? e) });
  throw e;
}

ort.env.wasm.wasmPaths = new URL("../ort/", self.location.href).href;
// Threads need a cross-origin isolated page; elsewhere ONNX Runtime runs single-threaded.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
post({ state: "config", threads: ort.env.wasm.numThreads, wasmPaths: ort.env.wasm.wasmPaths });

self.addEventListener("error", (e) => post({ state: "boot-error", message: String(e.message || e) }));
self.addEventListener("unhandledrejection", (e) => post({ state: "boot-error", message: String(e.reason?.message ?? e.reason) }));

let ready = null;

const atiende = async ({ data: msg }) => {
  try {
    if (msg.type === "init") {
      post({ state: "init" });
      const load = cachedLoader({
        base: msg.modelBase,
        onProgress: (p) => self.postMessage({ type: "progress", ...p }),
        log: (m) => post({ state: "note", message: m }),
      });
      ready ??= IndraOCR.create(ort, load, { furniture: !!msg.furniture });
      await ready;
      post({ state: "ready" });
      self.postMessage({ type: "ready", id: msg.id });
    } else if (msg.type === "page") {
      const ocr = await ready;
      const page = await ocr.page({ data: msg.data, width: msg.width, height: msg.height }, { turn: msg.turn ?? true, tables: msg.tables ?? true });
      self.postMessage({ type: "page", id: msg.id, page: { ...page, text: page.text } });
    }
  } catch (e) {
    self.postMessage({ type: "error", id: msg.id, error: String(e?.message ?? e) });
  }
};

self.onmessage = atiende;
for (const m of tempranos.splice(0)) atiende({ data: m });
