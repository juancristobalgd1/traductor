import { Wllama } from './vendor/wllama/index.js';

// ---------- Configuración ----------
const MODEL = { repo: 'tencent/Hy-MT2-1.8B-GGUF', file: 'Hy-MT2-1.8B-Q4_K_M.gguf' };
const WASM = { default: new URL('./vendor/wllama/wllama.wasm', import.meta.url).href };
const SAMPLING = { temp: 0.7, top_p: 0.6, top_k: 20, penalty_repeat: 1.05 };
const MAX_SEG = 800;

const LANGS = [
  ['es', 'Español', 'Spanish', '西班牙语', 'es-ES'],
  ['en', 'Inglés', 'English', '英语', 'en-US'],
  ['fr', 'Francés', 'French', '法语', 'fr-FR'],
  ['pt', 'Portugués', 'Portuguese', '葡萄牙语', 'pt-PT'],
  ['it', 'Italiano', 'Italian', '意大利语', 'it-IT'],
  ['de', 'Alemán', 'German', '德语', 'de-DE'],
  ['nl', 'Neerlandés', 'Dutch', '荷兰语', 'nl-NL'],
  ['pl', 'Polaco', 'Polish', '波兰语', 'pl-PL'],
  ['cs', 'Checo', 'Czech', '捷克语', 'cs-CZ'],
  ['uk', 'Ucraniano', 'Ukrainian', '乌克兰语', 'uk-UA'],
  ['ru', 'Ruso', 'Russian', '俄语', 'ru-RU'],
  ['tr', 'Turco', 'Turkish', '土耳其语', 'tr-TR'],
  ['ar', 'Árabe', 'Arabic', '阿拉伯语', 'ar-SA'],
  ['he', 'Hebreo', 'Hebrew', '希伯来语', 'he-IL'],
  ['fa', 'Persa', 'Persian', '波斯语', 'fa-IR'],
  ['ur', 'Urdu', 'Urdu', '乌尔都语', 'ur-PK'],
  ['hi', 'Hindi', 'Hindi', '印地语', 'hi-IN'],
  ['mr', 'Maratí', 'Marathi', '马拉地语', 'mr-IN'],
  ['gu', 'Guyaratí', 'Gujarati', '古吉拉特语', 'gu-IN'],
  ['bn', 'Bengalí', 'Bengali', '孟加拉语', 'bn-IN'],
  ['ta', 'Tamil', 'Tamil', '泰米尔语', 'ta-IN'],
  ['te', 'Telugu', 'Telugu', '泰卢固语', 'te-IN'],
  ['zh', 'Chino (simplificado)', 'Chinese', '中文', 'zh-CN'],
  ['zh-Hant', 'Chino (tradicional)', 'Traditional Chinese', '繁体中文', 'zh-TW'],
  ['yue', 'Cantonés', 'Cantonese', '粤语', 'zh-HK'],
  ['ja', 'Japonés', 'Japanese', '日语', 'ja-JP'],
  ['ko', 'Coreano', 'Korean', '韩语', 'ko-KR'],
  ['th', 'Tailandés', 'Thai', '泰语', 'th-TH'],
  ['vi', 'Vietnamita', 'Vietnamese', '越南语', 'vi-VN'],
  ['id', 'Indonesio', 'Indonesian', '印尼语', 'id-ID'],
  ['ms', 'Malayo', 'Malay', '马来语', 'ms-MY'],
  ['tl', 'Filipino', 'Filipino', '菲律宾语', 'fil-PH'],
  ['km', 'Jemer', 'Khmer', '高棉语', 'km-KH'],
  ['my', 'Birmano', 'Burmese', '缅甸语', 'my-MM'],
  ['bo', 'Tibetano', 'Tibetan', '藏语', 'bo-CN'],
  ['kk', 'Kazajo', 'Kazakh', '哈萨克语', 'kk-KZ'],
  ['mn', 'Mongol', 'Mongolian', '蒙古语', 'mn-MN'],
  ['ug', 'Uigur', 'Uyghur', '维吾尔语', 'ug-CN'],
].map(([code, name, en, zh, speech]) => ({ code, name, en, zh, speech }));
const L = Object.fromEntries(LANGS.map(l => [l.code, l]));
const CHINESE = new Set(['zh', 'zh-Hant', 'yue']);

// ---------- Detección de idioma (ligera, sin modelo) ----------
const STOP = {
  es: 'el la los las de del que y en un una por con no para es se lo como más pero su sus al muy está estoy hola gracias qué porque también esto eso yo tú usted nosotros hay',
  en: 'the and to of a in is that it you for on with this are was be have not but what my your hello thanks i we they do',
  fr: 'le la les des du et est une que qui dans pour pas sur au avec il elle ce vous nous je mais bonjour merci très',
  pt: 'o os as do da dos das que e é um uma em para com não por mais na no ao como mas você eu obrigado olá muito também são',
  it: 'il lo gli di che e è una per non con del della sono mi ti ma come anche ciao grazie molto questo',
  de: 'der die das und ist nicht ich du er sie es ein eine zu den mit von auf für im dem auch wie hallo danke sehr',
  nl: 'de het een en van ik je niet dat is op te zijn met voor hallo bedankt heel ook maar',
  pl: 'i w nie na się że jest to z do jak co tak ale czy dzień dobry dziękuję',
  cs: 'a je se v na že to s do jak ale co tak jsem děkuji dobrý den',
  tr: 've bir bu da de için ne ile ben sen çok değil merhaba teşekkürler',
  id: 'yang dan di ini itu dengan untuk tidak dari ada saya akan kamu ke apa terima kasih',
  ms: 'yang dan di ini itu dengan untuk tidak dari ada saya akan awak anda ke apa boleh terima kasih',
  tl: 'ang ng mga sa na ay at ako ka siya ito hindi po salamat kumusta',
  vi: 'và của là có không tôi bạn cho với này một những được xin chào cảm ơn',
};
const STOPSETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));

function detect(text) {
  const t = text.slice(0, 600);
  if (!t.trim()) return null;
  const has = re => re.test(t);
  if (has(/[\uAC00-\uD7AF]/)) return 'ko';
  if (has(/[\u3040-\u30FF]/)) return 'ja';
  if (has(/[\u4E00-\u9FFF]/)) {
    if (has(/[嘅係唔咗冇喺嗰啲]/)) return 'yue';
    const trad = (t.match(/[這們個來說時國會為學對過還麼樣們開關書車門問題經點電話聽讀寫]/g) || []).length;
    const simp = (t.match(/[这们个来说时国会为学对过还么样开关书车门问题经点电话听读写]/g) || []).length;
    return trad > simp ? 'zh-Hant' : 'zh';
  }
  if (has(/[\u0E00-\u0E7F]/)) return 'th';
  if (has(/[\u0590-\u05FF]/)) return 'he';
  if (has(/[\u0600-\u06FF]/)) {
    if (has(/[ۆۇېۈ]/)) return 'ug';
    if (has(/[ےٹڈڑں]/)) return 'ur';
    if (has(/[پچژگ]/)) return 'fa';
    return 'ar';
  }
  if (has(/[\u0900-\u097F]/)) return has(/आहे|ळ/) ? 'mr' : 'hi';
  if (has(/[\u0980-\u09FF]/)) return 'bn';
  if (has(/[\u0A80-\u0AFF]/)) return 'gu';
  if (has(/[\u0B80-\u0BFF]/)) return 'ta';
  if (has(/[\u0C00-\u0C7F]/)) return 'te';
  if (has(/[\u1780-\u17FF]/)) return 'km';
  if (has(/[\u1000-\u109F]/)) return 'my';
  if (has(/[\u0F00-\u0FFF]/)) return 'bo';
  if (has(/[\u0400-\u04FF]/)) {
    if (has(/[әғқңұ]/i)) return 'kk';
    if (has(/[іїєґ]/i)) return 'uk';
    if (has(/[өү]/i)) return 'mn';
    return 'ru';
  }
  if (has(/[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ]/i)) return 'vi';
  const words = t.toLowerCase().match(/[\p{L}']+/gu) || [];
  if (!words.length) return null;
  const score = {};
  for (const [lang, set] of Object.entries(STOPSETS)) score[lang] = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
  if (has(/[ąęłńśźż]/i)) score.pl += 3;
  if (has(/[ěščřůť]/i)) score.cs += 3;
  if (has(/[ğış]/i)) score.tr += 3;
  if (has(/[ñ¿¡]/i)) score.es += 3;
  if (has(/[ãõç]/i)) score.pt += 2;
  if (has(/[ß]|[äöü]/i)) score.de += 2;
  if (has(/[èêàùœ]/i)) score.fr += 1;
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

// ---------- Estado ----------
const $ = id => document.getElementById(id);
const els = {
  src: $('src'), out: $('out'), count: $('count'), clear: $('clearBtn'), status: $('status'), stop: $('stopBtn'),
  srcBtn: $('srcLangBtn'), tgtBtn: $('tgtLangBtn'), srcLabel: $('srcLangLabel'), tgtLabel: $('tgtLangLabel'), swap: $('swapBtn'),
  modelCard: $('modelCard'), loadBtn: $('loadBtn'), loadingBox: $('loadingBox'), loadingText: $('loadingText'), loadingSub: $('loadingSub'), bar: $('bar'),
  copy: $('copyBtn'), share: $('shareBtn'), speakSrc: $('speakSrcBtn'), speakOut: $('speakOutBtn'), mic: $('micBtn'),
  sheet: $('sheet'), sheetTitle: $('sheetTitle'), sheetSearch: $('sheetSearch'), sheetList: $('sheetList'),
  histSheet: $('historySheet'), histList: $('historyList'), histBtn: $('historyBtn'), clearHist: $('clearHistory'),
  infoSheet: $('infoSheet'), infoBtn: $('infoBtn'), infoBackend: $('infoBackend'), deleteModel: $('deleteModel'),
  chip: $('backendChip'), memHint: $('memHint'), toast: $('toast'),
};
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('tr.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('tr.' + k, JSON.stringify(v)),
};
const browserLang = (navigator.language || 'es').slice(0, 2);
const state = {
  src: store.get('src', 'auto'),
  tgt: store.get('tgt', browserLang === 'en' ? 'es' : 'en'),
  recent: store.get('recent', ['es', 'en', 'fr']),
  detected: null,
  ready: false,
  output: '',
};
let wllama = null;
let job = null;          // { ctrl, done }
const cache = new Map(); // `${tgt}\u0000${segmento}` -> traducción

// ---------- Utilidades UI ----------
function toast(msg) {
  els.toast.textContent = msg; els.toast.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (els.toast.hidden = true), 2200);
}
function setStatus(msg) { els.status.textContent = msg || ''; }
function renderLangs() {
  els.srcBtn.classList.toggle('auto', state.src === 'auto' && !!state.detected);
  els.srcLabel.textContent = state.src === 'auto'
    ? (state.detected ? L[state.detected].name : 'Detectar idioma')
    : L[state.src].name;
  els.tgtLabel.textContent = L[state.tgt].name;
  els.src.lang = state.src !== 'auto' ? state.src : (state.detected || '');
  els.out.lang = state.tgt;
  els.out.dir = ['ar', 'he', 'fa', 'ur', 'ug'].includes(state.tgt) ? 'rtl' : 'ltr';
  els.src.dir = ['ar', 'he', 'fa', 'ur', 'ug'].includes(els.src.lang) ? 'rtl' : 'ltr';
}
function renderOutput(text, streaming) {
  state.output = text;
  els.out.classList.toggle('streaming', !!streaming);
  if (!text && !streaming) { els.out.innerHTML = '<span class="placeholder">Traducción</span>'; return; }
  els.out.textContent = text;
}
function pushRecent(code) {
  state.recent = [code, ...state.recent.filter(c => c !== code)].slice(0, 5);
  store.set('recent', state.recent);
}

// ---------- Selector de idioma ----------
let picking = 'tgt';
function openPicker(which) {
  picking = which;
  els.sheetTitle.textContent = which === 'src' ? 'Traducir del' : 'Traducir a';
  els.sheetSearch.value = '';
  fillPicker('');
  els.sheet.hidden = false;
  setTimeout(() => els.sheetSearch.focus(), 50);
}
function fillPicker(q) {
  const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const nq = norm(q);
  const current = picking === 'src' ? state.src : state.tgt;
  const opt = l => `<button class="opt ${l.code === current ? 'sel' : ''}" data-code="${l.code}"><span>${l.name}</span></button>`;
  let html = '';
  if (!nq) {
    if (picking === 'src') html += `<button class="opt ${current === 'auto' ? 'sel' : ''}" data-code="auto"><span>Detectar idioma</span></button>`;
    const rec = state.recent.filter(c => L[c]);
    if (rec.length) html += `<div class="sec">Recientes</div>` + rec.map(c => opt(L[c])).join('');
    html += `<div class="sec">Todos los idiomas</div>`;
  }
  const list = [...LANGS].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .filter(l => !nq || norm(l.name).includes(nq) || norm(l.en).includes(nq) || l.code.toLowerCase() === nq);
  html += list.map(opt).join('') || '<div class="empty">No encuentro ese idioma</div>';
  els.sheetList.innerHTML = html;
}
els.sheetSearch.addEventListener('input', e => fillPicker(e.target.value));
els.sheetSearch.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const first = els.sheetList.querySelector('[data-code]'); first && first.click(); }
});
els.sheetList.addEventListener('click', e => {
  const b = e.target.closest('[data-code]'); if (!b) return;
  const code = b.dataset.code;
  if (picking === 'src') {
    if (code === state.tgt && code !== 'auto') { state.tgt = state.src === 'auto' ? (state.detected && state.detected !== code ? state.detected : (code === 'es' ? 'en' : 'es')) : state.src; store.set('tgt', state.tgt); }
    state.src = code; store.set('src', code);
  } else {
    if (code === (state.src === 'auto' ? null : state.src)) { state.src = state.tgt; store.set('src', state.src); }
    state.tgt = code; store.set('tgt', code);
  }
  if (code !== 'auto') pushRecent(code);
  closeSheets();
  renderLangs();
  scheduleTranslate(0);
});
function closeSheets() { for (const s of [els.sheet, els.histSheet, els.infoSheet]) s.hidden = true; }
for (const s of [els.sheet, els.histSheet, els.infoSheet]) s.addEventListener('click', e => { if (e.target === s) closeSheets(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });
els.srcBtn.addEventListener('click', () => openPicker('src'));
els.tgtBtn.addEventListener('click', () => openPicker('tgt'));

els.swap.addEventListener('click', () => {
  const from = state.src === 'auto' ? (state.detected || null) : state.src;
  if (!from) { toast('Escribe algo primero para saber el idioma de origen'); return; }
  els.swap.classList.toggle('spin');
  const newSrc = state.tgt, newTgt = from;
  state.src = newSrc; state.tgt = newTgt; store.set('src', newSrc); store.set('tgt', newTgt);
  if (state.output) els.src.value = state.output;
  onInput(true);
});

// ---------- Modelo ----------
function showCard() { els.modelCard.hidden = false; els.loadingBox.hidden = true; }
function showLoading(text, sub, pct) {
  els.modelCard.hidden = true; els.loadingBox.hidden = false;
  els.loadingText.textContent = text; els.loadingSub.textContent = sub || '';
  if (pct != null) els.bar.style.width = pct + '%';
}
function hideOverlays() { els.modelCard.hidden = true; els.loadingBox.hidden = true; }
const gb = b => (b / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 2 });

// Comprueba que el motor traduce bien. Algunas GPU de móvil dan resultados corruptos con WebGPU.
async function selfTest() {
  try {
    const r = await wllama.createChatCompletion({
      messages: [{ role: 'user', content: buildPrompt('Buenos días', 'en', 'es') }],
      max_tokens: 16, temp: 0, top_k: 1,
    });
    const out = (r?.choices?.[0]?.message?.content || '').trim();
    console.log('Prueba del motor:', out);
    return /good|morning/i.test(out) && !/[^\x00-\x7F’'"]/.test(out);
  } catch (e) { console.warn('Prueba del motor falló', e); return false; }
}
function isDegenerate(text) {
  return text.length > 24 && /(.{1,12}?)\1{5,}$/su.test(text);
}

let currentGpu = false;
async function loadModel() {
  const fromCache = store.get('ready', false);
  showLoading(fromCache ? 'Preparando el traductor…' : 'Descargando modelo…', '', 0);
  const make = () => new Wllama(WASM, { parallelDownloads: 3, allowOffline: true, suppressNativeLog: true });
  let started = performance.now();
  const progressCallback = ({ loaded, total }) => {
    if (!total) return;
    const pct = Math.min(100, (loaded / total) * 100);
    const secs = (performance.now() - started) / 1000;
    const speed = loaded / Math.max(secs, 0.5);
    const eta = speed > 0 ? Math.round((total - loaded) / speed) : 0;
    if (loaded >= total) showLoading('Preparando el traductor…', 'Cargándolo en memoria', 100);
    else showLoading('Descargando modelo…', `${gb(loaded)} de ${gb(total)} GB${eta > 2 ? ` · faltan ~${eta > 90 ? Math.round(eta / 60) + ' min' : eta + ' s'}` : ''}`, pct);
  };
  const base = { n_ctx: 4096, n_batch: 512, progressCallback, useCache: true };
  const pref = store.get('engine', 'auto');          // auto | cpu | gpu
  const gpuBroken = store.get('gpuBroken', false);   // en este dispositivo la GPU traduce mal
  if (wllama) { try { await wllama.exit(); } catch {} wllama = null; }

  const loadWith = async gpu => {
    wllama = make(); started = performance.now();
    await wllama.loadModelFromHF(MODEL, gpu ? base : { ...base, n_gpu_layers: 0 });
  };
  let gpu = pref === 'gpu' || (pref === 'auto' && !gpuBroken);
  try {
    if (gpu && !(make().isSupportWebGPU?.() ?? false)) gpu = false;
    await loadWith(gpu);
    if (gpu) {
      showLoading('Comprobando el traductor…', 'Un segundo', 100);
      if (!(await selfTest())) {
        console.warn('La GPU da resultados incorrectos, cambio a CPU');
        store.set('gpuBroken', true);
        try { await wllama.exit(); } catch {}
        showLoading('Preparando el traductor…', 'Tu GPU no traduce bien, uso el procesador', 100);
        gpu = false;
        await loadWith(false);
      }
    }
  } catch (err) {
    console.warn('Fallo al cargar, reintento en CPU', err);
    try { await wllama?.exit(); } catch {}
    try { gpu = false; await loadWith(false); }
    catch (err2) {
      console.error(err2);
      wllama = null;
      showCard();
      els.loadBtn.textContent = 'Reintentar';
      toast(navigator.onLine ? 'No se pudo cargar el modelo. Inténtalo de nuevo.' : 'Sin conexión: necesitas internet para la primera descarga.');
      return;
    }
  }
  currentGpu = gpu;
  cache.clear();
  store.set('ready', true);
  state.ready = true;
  const threads = wllama.getNumThreads?.() ?? 1;
  els.chip.textContent = gpu ? 'GPU' : 'CPU'; els.chip.hidden = false;
  els.infoBackend.textContent = gpu ? 'GPU (WebGPU)' : `Procesador · ${threads} ${threads === 1 ? 'hilo' : 'hilos'}`;
  renderEngine();
  hideOverlays();
  setStatus('Listo');
  if (els.src.value.trim()) scheduleTranslate(0);
}

// Selector de motor en "Sobre el traductor"
function renderEngine() {
  const pref = store.get('engine', 'auto');
  document.querySelectorAll('#engineSeg button').forEach(b => b.classList.toggle('sel', b.dataset.engine === pref));
}
document.getElementById('engineSeg').addEventListener('click', async e => {
  const b = e.target.closest('[data-engine]'); if (!b) return;
  const v = b.dataset.engine;
  if (v === store.get('engine', 'auto')) return;
  store.set('engine', v);
  if (v === 'gpu' || v === 'auto') store.set('gpuBroken', false);
  renderEngine();
  if (state.ready || store.get('ready', false)) {
    job?.ctrl.abort(); state.ready = false; closeSheets(); await loadModel();
  }
});
renderEngine();
els.loadBtn.addEventListener('click', loadModel);

els.deleteModel.addEventListener('click', async () => {
  if (!confirm('¿Borrar el modelo de este dispositivo? Tendrás que descargarlo otra vez (1,1 GB).')) return;
  try {
    await job?.ctrl.abort();
    if (wllama) { await wllama.exit().catch(() => {}); await wllama.modelManager.clear(); }
    else await new Wllama(WASM).modelManager.clear();
  } catch (e) { console.warn(e); }
  store.set('ready', false); state.ready = false; wllama = null;
  els.chip.hidden = true; els.infoBackend.textContent = 'Sin cargar';
  closeSheets(); showCard(); toast('Modelo borrado');
});

// ---------- Traducción ----------
function buildPrompt(text, tgt, src) {
  const l = L[tgt];
  if (CHINESE.has(tgt) || CHINESE.has(src)) return `将以下文本翻译为${l.zh}，注意只需要输出翻译后的结果，不要额外解释：\n\n${text}`;
  return `Translate the following text into ${l.en}. Note that you should only output the translated result without any additional explanation:\n\n${text}`;
}

// Parte el texto en segmentos traducibles conservando saltos de línea.
function segment(text) {
  const parts = text.split(/(\n+)/);
  const out = [];
  for (const p of parts) {
    if (!p || /^\n+$/.test(p) || !p.trim()) { out.push({ sep: p }); continue; }
    if (p.length <= MAX_SEG) { out.push({ text: p }); continue; }
    const sentences = p.match(/[^.!?。！？]+[.!?。！？]+["'»”)]*\s*|[^.!?。！？]+$/g) || [p];
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > MAX_SEG && buf) { out.push({ text: buf }); buf = ''; }
      buf += s;
    }
    if (buf) out.push({ text: buf });
  }
  return out;
}

async function translateNow() {
  const text = els.src.value;
  if (!state.ready) { if (text.trim() && els.modelCard.hidden && els.loadingBox.hidden) showCard(); return; }
  // Cancela la traducción anterior y espera a que termine.
  if (job) { job.ctrl.abort(); await job.done.catch(() => {}); }
  if (!text.trim()) { renderOutput(''); setStatus('Listo'); return; }

  const ctrl = new AbortController();
  const tgt = state.tgt;
  const src = state.src === 'auto' ? state.detected : state.src;
  const segs = segment(text);
  const results = segs.map(s => ('sep' in s ? s.sep : cache.get(`${tgt}\u0000${s.text}`)));
  const compose = () => results.map(r => r ?? '').join('');
  const pending = segs.some((s, i) => !('sep' in s) && results[i] == null);
  if (!pending) { renderOutput(compose()); setStatus(''); saveHistory(text, compose()); return; }

  let resolve, reject;
  const done = new Promise((a, b) => { resolve = a; reject = b; });
  job = { ctrl, done };
  els.stop.hidden = false;
  setStatus('Traduciendo…');
  const t0 = performance.now(); let tokens = 0; let degenerate = false;
  try {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if ('sep' in s || results[i] != null) continue;
      const lead = s.text.match(/^\s*/)[0], trail = s.text.match(/\s*$/)[0];
      const core = s.text.trim();
      let acc = '';
      const stream = await wllama.createChatCompletion({
        messages: [{ role: 'user', content: buildPrompt(core, tgt, src) }],
        stream: true,
        max_tokens: Math.min(2048, core.length * 3 + 64),
        abortSignal: ctrl.signal,
        ...SAMPLING,
      });
      for await (const chunk of stream) {
        if (ctrl.signal.aborted) break;
        const d = chunk?.choices?.[0]?.delta?.content;
        if (d) { acc += d; tokens++; results[i] = lead + acc; renderOutput(compose(), true); }
        if (isDegenerate(acc)) { degenerate = true; ctrl.abort(); break; }
      }
      if (degenerate) break;
      if (ctrl.signal.aborted && !degenerate) throw new DOMException('aborted', 'AbortError');
      results[i] = lead + acc.trim() + trail;
      cache.set(`${tgt}\u0000${s.text}`, results[i]);
      renderOutput(compose(), true);
    }
    if (degenerate) {
      renderOutput('');
      if (currentGpu) {
        store.set('gpuBroken', true); toast('Tu GPU no traduce bien. Cambio al procesador…');
        resolve(); job = null; els.stop.hidden = true; state.ready = false;
        loadModel(); return;
      }
      setStatus('No salió bien, prueba a reformular'); resolve(); return;
    }
    const final = compose();
    renderOutput(final);
    const secs = (performance.now() - t0) / 1000;
    setStatus(tokens > 4 ? `${(tokens / secs).toFixed(1)} tokens/s` : '');
    saveHistory(text, final);
    resolve();
  } catch (e) {
    if (e?.name !== 'AbortError' && !ctrl.signal.aborted) {
      console.error(e); setStatus('Error al traducir'); toast('Algo falló al traducir. Prueba otra vez.');
    }
    els.out.classList.remove('streaming');
    reject(e);
  } finally {
    if (job?.ctrl === ctrl) { job = null; els.stop.hidden = true; }
  }
}

let timer;
function scheduleTranslate(delay = 650) {
  clearTimeout(timer);
  timer = setTimeout(() => translateNow().catch(() => {}), delay);
}
els.stop.addEventListener('click', () => { job?.ctrl.abort(); setStatus('Detenido'); });

function onInput(immediate) {
  const v = els.src.value;
  els.count.textContent = `${v.length.toLocaleString('es-ES')} / 5000`;
  els.clear.hidden = !v;
  state.detected = detect(v);
  // Como Google: si el idioma detectado coincide con el de destino, cambia el destino.
  if (state.src === 'auto' && state.detected && state.detected === state.tgt) {
    state.tgt = state.recent.find(c => c !== state.detected && L[c]) || (state.detected === 'es' ? 'en' : 'es');
    store.set('tgt', state.tgt);
  }
  renderLangs();
  if (!v.trim()) { job?.ctrl.abort(); renderOutput(''); setStatus(state.ready ? 'Listo' : ''); return; }
  scheduleTranslate(immediate ? 0 : 650);
}
els.src.addEventListener('input', () => onInput(false));
els.src.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); scheduleTranslate(0); } });
els.clear.addEventListener('click', () => { els.src.value = ''; onInput(); els.src.focus(); });

// ---------- Copiar, compartir, voz ----------
els.copy.addEventListener('click', async () => {
  if (!state.output) return;
  try { await navigator.clipboard.writeText(state.output); toast('Traducción copiada'); } catch { toast('No se pudo copiar'); }
});
if (navigator.share) {
  els.share.hidden = false;
  els.share.addEventListener('click', () => state.output && navigator.share({ text: state.output }).catch(() => {}));
}
function speak(text, code) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const tag = L[code]?.speech || code || '';
  u.lang = tag;
  const v = speechSynthesis.getVoices().find(v => v.lang.toLowerCase() === tag.toLowerCase())
    || speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith((code || '').slice(0, 2)));
  if (v) u.voice = v; else if (code) toast('Tu dispositivo puede no tener voz para este idioma');
  speechSynthesis.speak(u);
}
els.speakSrc.addEventListener('click', () => speak(els.src.value, state.src === 'auto' ? state.detected : state.src));
els.speakOut.addEventListener('click', () => speak(state.output, state.tgt));

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Rec) els.mic.hidden = true;
let rec = null;
els.mic.addEventListener('click', () => {
  if (rec) { rec.stop(); return; }
  rec = new Rec();
  const code = state.src === 'auto' ? (state.detected || browserLang) : state.src;
  rec.lang = L[code]?.speech || code;
  rec.interimResults = true; rec.continuous = false;
  const before = els.src.value ? els.src.value.replace(/\s*$/, ' ') : '';
  rec.onresult = e => {
    const said = Array.from(e.results).map(r => r[0].transcript).join('');
    els.src.value = before + said; onInput(false);
  };
  rec.onend = () => { els.mic.classList.remove('on'); rec = null; };
  rec.onerror = () => toast('No pude escucharte');
  els.mic.classList.add('on'); rec.start();
});

// ---------- Historial ----------
function saveHistory(src, out) {
  if (!src.trim() || !out.trim()) return;
  clearTimeout(saveHistory.t);
  saveHistory.t = setTimeout(() => {
    const h = store.get('history', []).filter(x => !(x.s === src && x.tg === state.tgt));
    h.unshift({ s: src, t: out, sl: state.src === 'auto' ? state.detected : state.src, tg: state.tgt, at: Date.now() });
    store.set('history', h.slice(0, 50));
  }, 1500);
}
function renderHistory() {
  const h = store.get('history', []);
  if (!h.length) { els.histList.innerHTML = '<div class="empty">Aquí verás tus últimas traducciones</div>'; return; }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  els.histList.innerHTML = h.map((x, i) => `<button class="hist" data-i="${i}">
    <div class="meta">${x.sl && L[x.sl] ? L[x.sl].name : 'Detectado'} → ${L[x.tg]?.name || ''} · ${new Date(x.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
    <div class="s">${esc(x.s)}</div><div class="t">${esc(x.t)}</div></button>`).join('');
}
els.histBtn.addEventListener('click', () => { renderHistory(); els.histSheet.hidden = false; });
els.histList.addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const x = store.get('history', [])[+b.dataset.i]; if (!x) return;
  state.tgt = x.tg; store.set('tgt', x.tg);
  cache.set(`${x.tg}\u0000${x.s}`, x.t);
  els.src.value = x.s; closeSheets(); onInput(true);
});
els.clearHist.addEventListener('click', () => { store.set('history', []); renderHistory(); });
els.infoBtn.addEventListener('click', () => (els.infoSheet.hidden = false));

// ---------- Arranque ----------
renderLangs();
onInput();
if ((navigator.deviceMemory || 8) < 4) els.memHint.hidden = false;
if (store.get('ready', false)) loadModel(); else showCard();
// Permite compartir texto por URL: ?q=hola&to=en
const params = new URLSearchParams(location.search);
if (params.get('to') && L[params.get('to')]) { state.tgt = params.get('to'); renderLangs(); }
if (params.get('q')) { els.src.value = params.get('q'); onInput(); }
