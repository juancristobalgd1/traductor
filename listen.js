// Oído del modo conversación (Web Worker). Todo corre en el dispositivo:
//  - Whisper base (≈77 MB): pasa la voz a texto y decide cuál de los dos idiomas se habla.
//  - Laya multilingüe (≈650 MB, opcional, WebGPU): decide si la persona ha terminado de hablar.
import { env, AutoProcessor, AutoTokenizer, AutoModel, WhisperForConditionalGeneration, Tensor, LogitsProcessor, LogitsProcessorList }
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
  loadVad();
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

/* ------------------------- Silero VAD (≈2 MB) ------------------------- */
// Detector de voz neuronal: a Whisper solo le llegan los trozos donde de verdad se habla.
let vad = null;
async function loadVad() {
  if (!vad) vad = AutoModel.from_pretrained('onnx-community/silero-vad', { config: { model_type: 'custom' }, dtype: 'fp32' })
    .catch(e => { console.warn('VAD no disponible', e); return null; });
  return vad;
}
async function speechOnly(audio) {
  const m = await loadVad(); if (!m) return audio;
  const W = 512, n = Math.floor(audio.length / W); if (n < 4) return audio;
  const sr = new Tensor('int64', [16000n], []);
  let state = new Tensor('float32', new Float32Array(256), [2, 1, 128]);
  const p = new Float32Array(n); let top = 0;
  for (let i = 0; i < n; i++) {
    const r = await m({ input: new Tensor('float32', audio.slice(i * W, (i + 1) * W), [1, W]), sr, state });
    p[i] = r.output.data[0]; state = r.stateN; if (p[i] > top) top = p[i];
  }
  if (top < 0.3) return null;               // Ni rastro de voz: ruido, no se transcribe.
  if (top < 0.5) return audio;              // Dudoso: mejor pasarlo entero que perder palabras.
  // Tramos de voz con histéresis (entra a 0.5, sale tras 300 ms por debajo de 0.35).
  const segs = []; let on = -1, low = 0;
  for (let i = 0; i < n; i++) {
    if (on < 0) { if (p[i] >= 0.5) { on = i; low = 0; } }
    else if (p[i] < 0.35) { if (++low >= 10) { segs.push([on, i - low + 1]); on = -1; } }
    else low = 0;
  }
  if (on >= 0) segs.push([on, n]);
  const pad = 7, merged = [];               // ≈220 ms de margen a cada lado.
  for (const [a, b] of segs) {
    const x = Math.max(0, a - pad), y = Math.min(n, b + pad);
    if (merged.length && x <= merged.at(-1)[1] + 6) merged.at(-1)[1] = y; else merged.push([x, y]);
  }
  const keep = merged.reduce((t, [a, b]) => t + b - a, 0);
  if (keep >= n * 0.9) return audio;
  const gap = 1600, out = new Float32Array(keep * W + gap * (merged.length - 1));
  let o = 0;
  merged.forEach(([a, b], k) => { out.set(audio.subarray(a * W, b * W), o); o += (b - a) * W + (k < merged.length - 1 ? gap : 0); });
  return out;
}

/* ---------------- Calidad de la frase y reintento por temperatura ---------------- */
// Apunta la probabilidad de cada palabra que elige Whisper para saber si "dudó".
class Confidence extends LogitsProcessor {
  constructor(start) { super(); this.start = start; this.prev = null; this.lp = []; }
  take(tok) { if (this.prev) this.lp.push(this.prev.v[tok] - this.prev.lse); }
  _call(ids, logits) {
    const seq = ids[0];
    if (seq.length > this.start) this.take(Number(seq[seq.length - 1]));
    const V = logits.dims.at(-1), d = logits.data.subarray(logits.data.length - V);
    let mx = -Infinity; for (let i = 0; i < V; i++) if (d[i] > mx) mx = d[i];
    let s = 0; for (let i = 0; i < V; i++) if (d[i] > -Infinity) s += Math.exp(d[i] - mx);
    this.prev = { v: Float32Array.from(d), lse: mx + Math.log(s) };
    return logits;
  }
}
/* Detección de idioma en la misma pasada: en la posición del token de idioma solo dejo
   los dos idiomas de la conversación (con un pequeño empujón al que toca por turno),
   y después fuerzo <|transcribe|><|notimestamps|>. Sin pasada extra del codificador. */
const BIAS = 1.0;
class LangPick extends LogitsProcessor {
  constructor(at, ids, prefer, tr, nt) { super(); Object.assign(this, { at, ids, prefer, tr, nt }); }
  _call(seq, logits) {
    const n = seq[0].length, V = logits.dims.at(-1), d = logits.data.subarray(logits.data.length - V);
    const only = (keep) => { const v = keep.map(i => d[i]); d.fill(-Infinity); keep.forEach((i, k) => { d[i] = v[k]; }); };
    if (n === this.at) { only(this.ids); if (this.prefer != null) d[this.prefer] += BIAS; }
    else if (n === this.at + 1) { d.fill(-Infinity); d[this.tr] = 0; }
    else if (n === this.at + 2) { d.fill(-Infinity); d[this.nt] = 0; }
    return logits;
  }
}
async function ratio(text) {                // Compresión alta = frase repetitiva (bucle de Whisper).
  if (text.length < 24 || typeof CompressionStream === 'undefined') return 1;
  const b = new TextEncoder().encode(text);
  const z = await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return b.length / Math.max(1, z.byteLength - 18);
}

async function transcribe({ audio, langs, lang, prompt, expect, prompts }) {
  const s = await loadStt();
  let speech = audio;
  try { speech = await speechOnly(audio); } catch (e) { console.warn('VAD', e); speech = audio; }
  if (!speech) return { text: '', lang: lang || langs[0], model: s.id, gpu: s.gpu, vad: 'silence' };
  const { input_features } = await s.processor(speech);
  const secs = speech.length / 16000;
  const sot = tid(s.tok, '<|startoftranscript|>'), prev = tid(s.tok, '<|startofprev|>');
  const tr = tid(s.tok, '<|transcribe|>'), nt = tid(s.tok, '<|notimestamps|>');
  const two = !lang && langs[0] !== langs[1];
  const lids = two ? langs.map(c => langId(s.tok, c)) : [];
  const canPick = two && lids.every(x => x != null) && [sot, tr, nt].every(x => x != null);
  let use = lang || (two ? null : langs[0]);
  if (two && !canPick) use = await detect(s, input_features, langs);
  const ctxFor = l => (prompts && l in prompts ? prompts[l] : prompt);
  // pick = true: detecta entre los dos idiomas en la misma pasada en la que transcribe.
  const run = async (ctx, temperature = 0, pick = false) => {
    const want = pick ? (expect || langs[0]) : use;
    const gen = {
      inputs: input_features, language: want, task: 'transcribe',
      max_new_tokens: Math.min(220, 20 + Math.ceil(secs * 8)),
      no_repeat_ngram_size: 4,
    };
    if (temperature > 0) Object.assign(gen, { do_sample: true, temperature, top_k: 0 });
    // Contexto: lo último que se dijo en la conversación, en este mismo idioma (como el
    // "initial prompt" de Whisper). Ayuda con nombres, lugares y palabras sueltas.
    const p = ctx && prev != null ? Array.from(s.tok.encode(' ' + ctx.trim(), { add_special_tokens: false }), Number).slice(-80) : [];
    const head = p.length ? [prev, ...p, sot] : [sot];
    let skip;
    if (pick) { gen.decoder_input_ids = head; skip = head.length + 3; }
    else {
      const li = langId(s.tok, use);
      if (p.length && [sot, li, tr, nt].every(x => x != null)) gen.decoder_input_ids = [...head, li, tr, nt];
      skip = gen.decoder_input_ids?.length ?? 4;
    }
    const conf = new Confidence(skip);
    gen.logits_processor = new LogitsProcessorList();
    if (pick) gen.logits_processor.push(new LangPick(head.length, lids, langId(s.tok, want), tr, nt));
    gen.logits_processor.push(conf);
    let ids;
    try { ids = (await s.model.generate(gen)).tolist()[0].map(Number); }
    catch (e) {
      if (temperature > 0 || pick) throw e;
      delete gen.logits_processor; ids = (await s.model.generate(gen)).tolist()[0].map(Number); conf.lp = [];
    }
    conf.take(ids.at(-1));
    const got = pick ? langs[lids.indexOf(ids[head.length])] ?? want : use;
    const body = gen.decoder_input_ids ? ids.slice(skip) : ids;
    const text = (s.tok.decode(body, { skip_special_tokens: true }) || '').replace(/\s+/g, ' ').trim();
    const logp = conf.lp.length ? conf.lp.reduce((a, b) => a + b, 0) / conf.lp.length : 0;
    const cr = await ratio(text);
    return { text, logp, cr, t: temperature, lang: got, ok: cr <= 2.4 && logp >= -1 };
  };
  const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  let best;
  if (canPick) {
    try {
      best = await run(ctxFor(expect || langs[0]), 0, true);
      use = best.lang;
      // Si habló el otro idioma, el contexto que usé era del idioma equivocado: repito con el suyo.
      if (use !== (expect || langs[0]) && (ctxFor(use) || ctxFor(expect || langs[0]))) best = await run(ctxFor(use));
    } catch (e) { console.warn('detección', e); use = await detect(s, input_features, langs); best = null; }
  }
  if (!best) best = await run(ctxFor(use));
  prompt = ctxFor(use);
  // Si con contexto repite lo anterior en vez de escuchar, se repite sin contexto.
  if (prompt && best.text && norm(prompt).includes(norm(best.text))) best = await run(null);
  // Como el Whisper original: si la frase sale dudosa o en bucle, se reintenta con más
  // libertad (temperatura) y sin contexto, y se queda la versión en la que más confía.
  if (!best.ok && best.text) {
    for (const t of [0.3, 0.6]) {
      let c; try { c = await run(null, t); } catch (e) { console.warn('reintento', e); break; }
      if (c.text && (c.ok || c.logp > best.logp) && c.cr <= Math.max(2.4, best.cr)) best = c;
      if (best.ok) break;
    }
  }
  console.log('stt', JSON.stringify({ lang: use, expect: expect || null, text: best.text, logp: +best.logp.toFixed(2), cr: +best.cr.toFixed(2), t: best.t, secs: +secs.toFixed(1), raw: +(audio.length / 16000).toFixed(1) }));
  let text = best.text;
  // Alucinaciones típicas de Whisper con ruido o silencio.
  if (/^(\[.*\]|\(.*\)|♪+|\.+|subt[ií]tulos.*|thanks? (you )?for watching.*|gracias\.?)$/i.test(text) && secs < 1.2) text = '';
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
