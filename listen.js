// Oído del modo conversación (Web Worker). Todo corre en el dispositivo:
//  - Whisper base (≈77 MB): pasa la voz a texto y decide cuál de los dos idiomas se habla.
//  - Laya multilingüe (≈650 MB, opcional, WebGPU): decide si la persona ha terminado de hablar.
import { env, AutoProcessor, AutoTokenizer, AutoModel, WhisperForConditionalGeneration, Tensor }
  from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';

env.allowLocalModels = false;
// Con GPU (WebGPU): Whisper small, bastante más preciso. Sin GPU: Whisper base, ligero para la CPU.
const STT_SMALL = 'onnx-community/whisper-small';
const STT_BASE = 'onnx-community/whisper-base';
const LAYA_ID = 'onnx-community/laya-multilingual-ONNX';

const post = (m) => self.postMessage(m);
let lastEvt = Date.now();
const progress = (kind) => {
  const files = {};
  return (p) => {
    lastEvt = Date.now();
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let a = 0, b = 0; for (const [l, t] of Object.values(files)) { a += l; b += t; }
      post({ type: 'progress', kind, pct: Math.min(99, Math.round(a / b * 100)) });
    }
  };
};

/* ------------------------------ Whisper ------------------------------ */
let stt = null;
// Si la GPU se queda colgada (sin novedades durante un rato), salta a la CPU.
function stall(ms) {
  let t; const p = new Promise((_, ko) => { t = setInterval(() => { if (Date.now() - lastEvt > ms) ko(new Error('gpu-timeout')); }, 1000); });
  return { p, stop: () => clearInterval(t) };
}
async function warm(processor, model) {
  const { input_features } = await processor(new Float32Array(16000));
  await model.generate({ inputs: input_features, language: 'en', task: 'transcribe', max_new_tokens: 2 });
}
async function loadGpu(onp) {
  const ad = navigator.gpu && await navigator.gpu.requestAdapter();
  if (!ad) return null;
  const f16 = ad.features.has('shader-f16');
  const model = await WhisperForConditionalGeneration.from_pretrained(STT_SMALL, {
    dtype: { encoder_model: f16 ? 'fp16' : 'q4', decoder_model_merged: 'q4' }, device: 'webgpu', progress_callback: onp,
  });
  post({ type: 'progress', kind: 'stt', phase: 'init' });
  const processor = await AutoProcessor.from_pretrained(STT_SMALL, { progress_callback: onp });
  lastEvt = Date.now();
  await warm(processor, model);
  return { model, processor };
}
async function loadStt(cpuOnly) {
  if (stt) return stt;
  stt = (async () => {
    const onp = progress('stt');
    let got = null, id = STT_BASE, gpu = false;
    if (!cpuOnly) {
      lastEvt = Date.now();
      const w = stall(40000);
      try { got = await Promise.race([loadGpu(onp), w.p]); if (got) { id = STT_SMALL; gpu = true; } }
      catch (e) { console.warn('Whisper con GPU falló, uso la CPU', e); got = null; post({ type: 'progress', kind: 'stt', phase: 'cpu' }); }
      finally { w.stop(); }
    }
    if (!got) {
      const model = await WhisperForConditionalGeneration.from_pretrained(STT_BASE, {
        dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, device: 'wasm', progress_callback: onp,
      });
      post({ type: 'progress', kind: 'stt', phase: 'init' });
      const processor = await AutoProcessor.from_pretrained(STT_BASE, { progress_callback: onp });
      try { await warm(processor, model); } catch (e) { console.warn('warmup', e); }
      got = { model, processor };
    }
    const { model, processor } = got;
    const tok = processor.tokenizer;
    const sot = tid(tok, '<|startoftranscript|>');
    if (sot == null) throw new Error('sot');
    return { processor, model, tok, sot, id, gpu };
  })();
  try { return await stt; } catch (e) { stt = null; throw e; }
}

// Id de un token especial, sea cual sea la versión del tokenizador.
function tid(tok, t) {
  try { const r = tok.convert_tokens_to_ids([t]); const v = Array.isArray(r) ? r[0] : r; if (v != null && v !== tok.unk_token_id) return Number(v); } catch {}
  try { const v = tok.get_vocab(); const x = v instanceof Map ? v.get(t) : v[t]; if (x != null) return Number(x); } catch {}
  try { const x = tok.model?.tokens_to_ids?.get(t); if (x != null) return Number(x); } catch {}
  try { const r = tok.encode(t, { add_special_tokens: false }); if (r.length === 1) return Number(r[0]); } catch {}
  return undefined;
}
function langId(tok, code) { return tid(tok, `<|${code}|>`); }

// Elige entre los dos idiomas de la conversación mirando la primera predicción de Whisper.
async function detect(s, features, langs) {
  const ids = langs.map(c => langId(s.tok, c));
  try {
    const out = await s.model({
      input_features: features,
      decoder_input_ids: new Tensor('int64', BigInt64Array.from([BigInt(s.sot)]), [1, 1]),
    });
    const l = out.logits, V = l.dims.at(-1), off = l.data.length - V;
    const sc = ids.map(i => i == null ? -Infinity : Number(l.data[off + i]));
    return sc[0] >= sc[1] ? langs[0] : langs[1];
  } catch (e) {
    // Plan B: que Whisper detecte libremente y quedarnos con lo que diga.
    const g = await s.model.generate({ inputs: features, max_new_tokens: 1, task: 'transcribe' });
    const t = s.tok.decode(g[0] ?? g.sequences?.[0], { skip_special_tokens: false });
    return langs.find(c => t.includes(`<|${c}|>`)) || langs[0];
  }
}

async function transcribe({ audio, langs, lang, prompt }) {
  const s = await loadStt();
  const { input_features } = await s.processor(audio);
  const use = lang || (langs[0] === langs[1] ? langs[0] : await detect(s, input_features, langs));
  const run = async (ctx) => {
    const gen = {
      inputs: input_features, language: use, task: 'transcribe',
      max_new_tokens: Math.min(220, 20 + Math.ceil(audio.length / 16000 * 8)),
      no_repeat_ngram_size: 4,
    };
    // Contexto: lo último que se dijo en la conversación, en este mismo idioma (como el
    // "initial prompt" de Whisper). Ayuda con nombres, lugares y palabras sueltas.
    const sot = tid(s.tok, '<|startoftranscript|>');
    if (ctx) {
      const prev = tid(s.tok, '<|startofprev|>'), li = langId(s.tok, use);
      const tr = tid(s.tok, '<|transcribe|>'), nt = tid(s.tok, '<|notimestamps|>');
      const p = Array.from(s.tok.encode(' ' + ctx.trim(), { add_special_tokens: false }), Number).slice(-80);
      if ([prev, sot, li, tr, nt].every(x => x != null) && p.length) gen.decoder_input_ids = [prev, ...p, sot, li, tr, nt];
    }
    const out = await s.model.generate(gen);
    let ids = out.tolist()[0].map(Number);
    if (gen.decoder_input_ids) ids = ids.slice(gen.decoder_input_ids.length);
    return (s.tok.decode(ids, { skip_special_tokens: true }) || '').replace(/\s+/g, ' ').trim();
  };
  let text = await run(prompt);
  // Si con contexto repite lo anterior en vez de escuchar, se repite sin contexto.
  const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  if (prompt && text && norm(prompt).includes(norm(text))) text = await run(null);
  // Alucinaciones típicas de Whisper con ruido o silencio.
  if (/^(\[.*\]|\(.*\)|♪+|\.+|subt[ií]tulos.*|thanks? (you )?for watching.*|gracias\.?)$/i.test(text) && audio.length < 16000 * 1.2) text = '';
  return { text, lang: use, model: s.id, gpu: s.gpu };
}

/* ------------------------------- Laya -------------------------------- */
let laya = null;
async function loadLaya() {
  if (laya) return laya;
  laya = (async () => {
    if (!navigator.gpu) throw new Error('nogpu');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('nogpu');
    const fp16 = adapter.features.has('shader-f16');
    const onp = progress('laya');
    const tokenizer = await AutoTokenizer.from_pretrained(LAYA_ID, { progress_callback: onp });
    const model = await AutoModel.from_pretrained(LAYA_ID, { dtype: fp16 ? 'fp16' : 'fp32', device: 'webgpu', progress_callback: onp });
    const cfg = model.config.laya || {};
    const raw = (t) => Array.from(tokenizer(t, { add_special_tokens: false }).input_ids.data, Number);
    const one = (t) => { const r = raw(t); if (r.length !== 1) throw new Error('token ' + t); return r[0]; };
    const tc = tokenizer.config || {};
    const maskText = tc.mask_token || '[MASK]';
    const sp = { cls: one(tc.cls_token || '[CLS]'), sep: one(tc.sep_token || '[SEP]'), mask: one(maskText), pad: one(tc.pad_token || '[PAD]'), space: raw(' ')[0] };
    // mmBERT (Metaspace): se codifica palabra a palabra, como el original en Rust.
    const encode = (input) => {
      const text = input.split(maskText).join(' ');
      if (!text) return [];
      if (!cfg.split_words) return raw(text);
      const spaced = text.startsWith(' ') ? text : ' ' + text, ids = [];
      for (const piece of spaced.split(/(?= )/)) { const w = piece.slice(1); if (w) ids.push(...raw(w)); else ids.push(sp.space); }
      return ids;
    };
    return { tokenizer, model, cfg, sp, encode, fp16 };
  })();
  try { return await laya; } catch (e) { laya = null; throw e; }
}

// Una secuencia por pregunta: [CLS] noul question: … [SEP] [MASK] false… [MASK] true… [SEP] estado [SEP]
function layaSeq(L, question, stateIds) {
  const head = Number(L.cfg.head_max_len) || 256, maxLen = Number(L.cfg.max_len) || 1024;
  let opts = [`false: ${question.f}`, `true: ${question.t}`].map(o => [L.sp.mask, ...L.encode(' ' + o).slice(0, 48)]);
  const size = () => opts.reduce((s, o) => s + o.length, 0);
  let budget = head - size();
  if (budget < 16) { const per = Math.max(4, Math.floor((head - 16) / opts.length)); opts = opts.map(o => o.slice(0, per)); budget = head - size(); }
  const q = L.encode(`noul question: ${question.q}`).slice(0, Math.max(8, budget));
  const ids = [L.sp.cls, ...q, L.sp.sep], markers = [];
  for (const o of opts) { markers.push(ids.length); ids.push(...o); }
  ids.push(L.sp.sep);
  const room = Math.max(0, maxLen - ids.length - 1);
  return { ids: [...ids, ...stateIds.slice(-room), L.sp.sep], markers };
}

const QUESTIONS = [
  { key: 'complete', q: 'Has the speaker finished their turn, so their words can be translated now?',
    f: 'no, they are still mid-sentence or about to continue', t: 'yes, the thought is complete and they are waiting' },
  { key: 'holding', q: 'Do the last words trail off or ask for time to keep talking (a filler, a connector like "and", "but", "porque", or "let me think")?',
    f: 'no, nothing signals they want to keep talking', t: 'yes, they are holding the floor to continue' },
];

async function judge({ text, before, quietMs }) {
  const L = await loadLaya();
  const state = [
    'Live two-person conversation through a voice translator. Each person speaks their own language and pauses when done so the app can translate.',
    before ? `Previous turn (other person, translated): ${before}` : '',
    `Current speaker so far: ${text}`,
    `Silence since their last word: ${(quietMs / 1000).toFixed(1)} s`,
  ].filter(Boolean).join('\n');
  const stateIds = L.encode(state);
  const items = QUESTIONS.map(q => layaSeq(L, q, stateIds));
  const B = items.length, len = Math.max(...items.map(i => i.ids.length)), K = 2;
  const ids = new BigInt64Array(B * len).fill(BigInt(L.sp.pad)), att = new BigInt64Array(B * len);
  const pos = new BigInt64Array(B * K), mm = new Uint8Array(B * K), qt = new BigInt64Array(B).fill(2n);
  items.forEach((it, r) => {
    it.ids.forEach((id, c) => { ids[r * len + c] = BigInt(id); att[r * len + c] = 1n; });
    it.markers.forEach((p, c) => { pos[r * K + c] = BigInt(p); mm[r * K + c] = 1; });
  });
  const { logits } = await L.model({
    input_ids: new Tensor('int64', ids, [B, len]), attention_mask: new Tensor('int64', att, [B, len]),
    marker_pos: new Tensor('int64', pos, [B, K]), marker_mask: new Tensor('bool', mm, [B, K]), qtype: new Tensor('int64', qt, [B]),
  });
  const v = Array.from(logits.to ? logits.to('float32').data : logits.data, Number);
  const temp = (L.cfg.temperature && L.cfg.temperature[2]) || 1;
  const pTrue = (r) => { const a = v[r * K] / temp, b = v[r * K + 1] / temp; const m = Math.max(a, b); const eb = Math.exp(b - m); return eb / (Math.exp(a - m) + eb); };
  return { complete: pTrue(0), holding: pTrue(1) };
}

/* ----------------------------- mensajes ------------------------------ */
self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load-stt') { const s = await loadStt(m.cpu); post({ type: 'ready', id: m.id, kind: 'stt', gpu: s.gpu }); }
    else if (m.type === 'load-laya') { const L = await loadLaya(); post({ type: 'ready', id: m.id, kind: 'laya', fp16: L.fp16 }); }
    else if (m.type === 'stt') post({ type: 'stt', id: m.id, ...(await transcribe(m)) });
    else if (m.type === 'judge') post({ type: 'judge', id: m.id, ...(await judge(m)) });
  } catch (e) {
    post({ type: 'error', id: m.id, kind: m.type, message: String(e?.message || e) });
  }
};
