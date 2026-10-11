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
let docBusy = false;     // hay un documento traduciéndose
class Lru extends Map { // guarda como mucho 500 traducciones; borra la más antigua
  set(k, v) { super.delete(k); super.set(k, v); if (this.size > 500) super.delete(this.keys().next().value); return this; }
}
const cache = new Lru(); // `${tgt}\u0000${segmento}` -> traducción

// ---------- Utilidades UI ----------
const haptic = (ms = 8) => { if (matchMedia('(pointer:coarse)').matches) navigator.vibrate?.(ms); };
function toast(msg) {
  const t = els.toast;
  t.textContent = msg; t.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  clearTimeout(toast.t); clearTimeout(toast.h);
  toast.t = setTimeout(() => { t.classList.remove('show'); toast.h = setTimeout(() => (t.hidden = true), 260); }, Math.min(4200, 1600 + msg.length * 40));
}
function flashDone(btn) {
  btn.classList.add('done'); haptic(10);
  clearTimeout(btn._d); btn._d = setTimeout(() => btn.classList.remove('done'), 1400);
}
function flashLabel(btn, text) {
  if (!btn._label) btn._label = btn.textContent;
  btn.textContent = text; haptic(10);
  clearTimeout(btn._d); btn._d = setTimeout(() => { btn.textContent = btn._label; btn._label = null; }, 1400);
}
// ---------- Hojas con animación, arrastre para cerrar y foco ----------
let sheetOpener = null;
function openSheet(bd, opener) {
  sheetOpener = opener || document.activeElement;
  bd.hidden = false; document.body.classList.add('lock');
  opener?.setAttribute?.('aria-expanded', 'true');
  requestAnimationFrame(() => requestAnimationFrame(() => bd.classList.add('open')));
}
function closeSheets() {
  for (const bd of [els.sheet, els.histSheet, els.infoSheet]) {
    if (bd.hidden) continue;
    bd.classList.remove('open');
    const sh = bd.querySelector('.sheet'); sh.style.transform = '';
    setTimeout(() => { if (!bd.classList.contains('open')) bd.hidden = true; }, 300);
  }
  document.body.classList.remove('lock');
  els.srcBtn.setAttribute('aria-expanded', 'false'); els.tgtBtn.setAttribute('aria-expanded', 'false');
  if (sheetOpener && document.contains(sheetOpener) && matchMedia('(pointer:fine)').matches) sheetOpener.focus({ preventScroll: true });
  sheetOpener = null;
}
for (const bd of [document.getElementById('sheet'), document.getElementById('historySheet'), document.getElementById('infoSheet')]) {
  const sh = bd.querySelector('.sheet'), head = bd.querySelector('.sheet-head');
  let y0 = null, dy = 0, t0 = 0;
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('input,button') || matchMedia('(min-width:700px)').matches) return;
    y0 = e.clientY; dy = 0; t0 = performance.now(); sh.classList.add('dragging'); head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    y0 = null; sh.classList.remove('dragging');
    const fast = dy / (performance.now() - t0) > .6;
    if (dy > 110 || (fast && dy > 30)) closeSheets(); else sh.style.transform = '';
  };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
}
function setStatus(msg) { els.status.textContent = msg || ''; }
function renderLangs() {
  els.srcBtn.classList.toggle('auto', state.src === 'auto' && !!state.detected);
  els.srcLabel.textContent = state.src === 'auto'
    ? (state.detected ? L[state.detected].name : 'Detectar idioma')
    : L[state.src].name;
  els.tgtLabel.textContent = L[state.tgt].name;
  for (const sp of [els.srcLabel, els.tgtLabel]) {
    if (sp._last !== undefined && sp._last !== sp.textContent && !els.swap.parentElement.classList.contains('swapping')) {
      sp.classList.remove('chg'); void sp.offsetWidth; sp.classList.add('chg');
    }
    sp._last = sp.textContent;
  }
  els.src.lang = state.src !== 'auto' ? state.src : (state.detected || '');
  els.out.lang = state.tgt;
  els.out.dir = ['ar', 'he', 'fa', 'ur', 'ug'].includes(state.tgt) ? 'rtl' : 'ltr';
  els.src.dir = ['ar', 'he', 'fa', 'ur', 'ug'].includes(els.src.lang) ? 'rtl' : 'ltr';
}
function renderOutput(text, streaming) {
  const prev = state.output || '', wasStreaming = els.out.classList.contains('streaming');
  state.output = text;
  els.out.classList.toggle('streaming', !!streaming);
  const has = !!text && !streaming;
  const hadTools = !els.copy.disabled;
  els.copy.disabled = els.speakOut.disabled = els.share.disabled = !has;
  if (has && !hadTools) { const t = els.copy.closest('.tools'); t?.classList.remove('appear'); void t?.offsetWidth; t?.classList.add('appear'); }
  if (!text && streaming) { els.out.innerHTML = '<span class="skel"></span><span class="skel"></span><span class="skel"></span>'; return; }
  if (!text) { els.out.innerHTML = '<span class="placeholder">Traducción</span>'; return; }
  // Mientras se genera: solo se añade lo nuevo, que entra fundiéndose.
  if (streaming && wasStreaming && prev && text.startsWith(prev) && els.out.querySelector('.skel') == null) {
    const d = text.slice(prev.length);
    if (d) { const s = document.createElement('span'); s.className = 'tk'; s.textContent = d; els.out.appendChild(s); }
    return;
  }
  // Al terminar de generar: se consolida el texto y se asienta el color.
  if (!streaming && wasStreaming && text === prev) {
    els.out.textContent = text; els.out.classList.remove('settle'); void els.out.offsetWidth; els.out.classList.add('settle');
    return;
  }
  // Resultado instantáneo (caché, historial, traducción rápida): las palabras aparecen en cascada.
  if (!streaming && text !== prev && text.length <= 700 && !reduceMotion()) {
    els.out.textContent = '';
    const parts = text.split(/(\s+)/); let i = 0;
    const frag = document.createDocumentFragment();
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); continue; }
      const s = document.createElement('span'); s.className = 'rv'; s.style.setProperty('--d', Math.min(i++ * 0.018, 0.4) + 's'); s.textContent = p; frag.appendChild(s);
    }
    els.out.appendChild(frag);
    clearTimeout(renderOutput.t); renderOutput.t = setTimeout(() => { if (state.output === text && !els.out.classList.contains('streaming')) els.out.textContent = text; }, 1000);
    return;
  }
  els.out.textContent = text;
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
function pushRecent(code) {
  state.recent = [code, ...state.recent.filter(c => c !== code)].slice(0, 5);
  store.set('recent', state.recent);
}

// ---------- Selector de idioma ----------
let picking = 'tgt';
function openPicker(which) {
  picking = which;
  els.sheetTitle.textContent = which === 'src' ? 'Traducir del' : which === 'tgt' ? 'Traducir a' : 'Idioma de esta persona';
  els.sheetSearch.value = '';
  els.sheetList.classList.remove('filtering');
  fillPicker('');
  openSheet(els.sheet, which === 'src' ? els.srcBtn : which === 'tgt' ? els.tgtBtn : document.getElementById(which === 'ta' ? 'talkLangA' : 'talkLangB'));
  els.sheetList.scrollTop = 0;
  // En móvil no abrimos el teclado de golpe: tapa media lista.
  if (matchMedia('(pointer:fine)').matches) setTimeout(() => els.sheetSearch.focus({ preventScroll: true }), 60);
}
function fillPicker(q) {
  const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const nq = norm(q);
  const current = picking === 'src' ? state.src : picking === 'tgt' ? state.tgt : talk[picking === 'ta' ? 'a' : 'b'];
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
els.sheetSearch.addEventListener('input', e => { els.sheetList.classList.add('filtering'); fillPicker(e.target.value); });
els.sheetSearch.addEventListener('keydown', e => {
  const opts = [...els.sheetList.querySelectorAll('[data-code]')];
  let i = opts.findIndex(o => o.classList.contains('kb'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    i = e.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1);
    opts.forEach((o, j) => o.classList.toggle('kb', j === i));
    opts[i]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') { (opts[i] || opts[0])?.click(); }
});
els.sheetList.addEventListener('click', e => {
  const b = e.target.closest('[data-code]'); if (!b) return;
  const code = b.dataset.code;
  if (picking === 'ta' || picking === 'tb') {
    const me = picking === 'ta' ? 'a' : 'b', other = me === 'a' ? 'b' : 'a';
    if (talk[other] === code) talk[other] = talk[me];
    talk[me] = code; store.set('talk', { a: talk.a, b: talk.b }); pushRecent(code);
    haptic(); closeSheets(); talkRender(); return;
  }
  if (picking === 'src') {
    if (code === state.tgt && code !== 'auto') { state.tgt = state.src === 'auto' ? (state.detected && state.detected !== code ? state.detected : (code === 'es' ? 'en' : 'es')) : state.src; store.set('tgt', state.tgt); }
    state.src = code; store.set('src', code);
  } else {
    if (code === (state.src === 'auto' ? null : state.src)) { state.src = state.tgt; store.set('src', state.src); }
    state.tgt = code; store.set('tgt', code);
  }
  if (code !== 'auto') pushRecent(code);
  haptic(); closeSheets();
  renderLangs();
  scheduleTranslate(0);
});
for (const s of [els.sheet, els.histSheet, els.infoSheet]) s.addEventListener('click', e => { if (e.target === s) closeSheets(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });
els.srcBtn.addEventListener('click', () => openPicker('src'));
els.tgtBtn.addEventListener('click', () => openPicker('tgt'));

els.swap.addEventListener('click', () => {
  const from = state.src === 'auto' ? (state.detected || null) : state.src;
  if (!from) { toast('Escribe algo primero para saber el idioma de origen'); return; }
  els.swap._r = (els.swap._r || 0) + 180; els.swap.style.setProperty('--r', els.swap._r + 'deg'); haptic();
  els.swap.classList.remove('spin'); void els.swap.offsetWidth; els.swap.classList.add('spin');
  const bar = els.swap.parentElement; bar.classList.remove('swapping'); void bar.offsetWidth; bar.classList.add('swapping');
  clearTimeout(bar._t); bar._t = setTimeout(() => bar.classList.remove('swapping'), 400);
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
    const r = await withLlm(() => wllama.createChatCompletion({
      messages: [{ role: 'user', content: buildPrompt('Buenos días', 'en', 'es') }],
      max_tokens: 16, temp: 0, top_k: 1,
    }));
    const out = (r?.choices?.[0]?.message?.content || '').trim();
    console.log('Prueba del motor:', out);
    return /good|morning/i.test(out) && !/[^\x00-\x7F’'"]/.test(out);
  } catch (e) { console.warn('Prueba del motor falló', e); return false; }
}
function isDegenerate(text) {
  return text.length > 24 && /(.{1,12}?)\1{5,}$/su.test(text);
}

let currentGpu = false;
// ---------- Modelo guardado en el dispositivo ----------
// La librería guarda el archivo en el almacenamiento privado del navegador (OPFS).
// Aquí comprobamos que sigue ahí y pedimos que el navegador no lo borre nunca.
async function cachedModel() {
  try {
    const list = await new Wllama(WASM).cacheManager.list();
    const f = list.find(x => x.name.includes(MODEL.file.replace('.gguf', '')) && x.name.endsWith('.gguf'));
    if (!f) return null;
    const full = !f.metadata?.originalSize || f.size >= f.metadata.originalSize;
    return full ? f : null;
  } catch { return null; }
}
async function protectStorage() {
  if (!navigator.storage?.persist) return false;
  try { return (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch { return false; }
}
async function renderStorage() {
  const dd = document.getElementById('infoStorage'); if (!dd) return;
  const f = await cachedModel();
  if (!f) { dd.textContent = 'Sin descargar'; return; }
  const kept = await navigator.storage?.persisted?.().catch(() => false);
  dd.textContent = `${gb(f.size)} GB en este dispositivo${kept ? ' · protegido' : ''}`;
  dd.title = kept ? 'El navegador no lo borrará aunque falte espacio' : 'Si el navegador se queda sin espacio podría borrarlo. Instalar la app ayuda a protegerlo.';
}
async function loadModel() {
  const saved = await cachedModel();
  const fromCache = !!saved;
  state.loading = true;
  // Ya guardado: la app se puede usar al momento; el modelo se abre de fondo.
  const show = (text, sub, pct) => fromCache ? (setStatus(text), document.body.classList.add('opening')) : showLoading(text, sub, pct);
  if (fromCache) { hideOverlays(); show('Abriendo el traductor…'); }
  else showLoading('Descargando modelo…', '', 0);
  const make = () => new Wllama(WASM, { parallelDownloads: 3, allowOffline: true, suppressNativeLog: true });
  let started = performance.now();
  const progressCallback = ({ loaded, total }) => {
    if (!total) return;
    const pct = Math.min(100, (loaded / total) * 100);
    const secs = (performance.now() - started) / 1000;
    const speed = loaded / Math.max(secs, 0.5);
    const eta = speed > 0 ? Math.round((total - loaded) / speed) : 0;
    if (fromCache || loaded >= total) show(fromCache ? 'Abriendo el traductor…' : 'Preparando el traductor…', fromCache ? 'Ya está guardado en tu dispositivo' : 'Guardándolo y cargándolo en memoria', 100);
    else show('Descargando modelo…', `${gb(loaded)} de ${gb(total)} GB${eta > 2 ? ` · faltan ~${eta > 90 ? Math.round(eta / 60) + ' min' : eta + ' s'}` : ''}`, pct);
  };
  const base = { n_ctx: 4096, n_batch: 512, progressCallback, useCache: true };
  const pref = store.get('engine', 'auto');          // auto | cpu | gpu
  const gpuBroken = store.get('gpuBroken', false);   // en este dispositivo la GPU traduce mal
  if (wllama) { try { await wllama.exit(); } catch {} wllama = null; }

  const loadWith = async gpu => {
    wllama = make(); started = performance.now();
    const opts = gpu ? base : { ...base, n_gpu_layers: 0 };
    // Ya guardado: se abre directamente del dispositivo, sin preguntar nada a internet.
    if (saved) {
      try {
        const blob = await wllama.cacheManager.open(saved.name);
        if (blob?.size) { await wllama.loadModel([blob], opts); return; }
      } catch (e) { console.warn('No se pudo abrir el modelo guardado, uso la vía normal', e); try { await wllama.exit(); } catch {} wllama = make(); }
    }
    await wllama.loadModelFromHF(MODEL, opts);
  };
  let gpu = pref === 'gpu' || (pref === 'auto' && !gpuBroken);
  try {
    if (gpu && !(make().isSupportWebGPU?.() ?? false)) gpu = false;
    await loadWith(gpu);
    if (gpu && !store.get('gpuOk', false)) {
      show('Comprobando el traductor…', 'Solo la primera vez', 100);
      if (await selfTest()) store.set('gpuOk', true);
      else {
        console.warn('La GPU da resultados incorrectos, cambio a CPU');
        store.set('gpuBroken', true); store.set('gpuOk', false);
        try { await wllama.exit(); } catch {}
        show('Preparando el traductor…', 'Tu GPU no traduce bien, uso el procesador', 100);
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
      wllama = null; state.loading = false; document.body.classList.remove('opening');
      showCard();
      els.loadBtn.textContent = 'Reintentar';
      toast(navigator.onLine ? 'No se pudo cargar el modelo. Inténtalo de nuevo.' : 'Sin conexión: necesitas internet para la primera descarga.');
      return;
    }
  }
  currentGpu = gpu;
  cache.clear();
  store.set('ready', true);
  protectStorage().then(ok => { if (ok && !fromCache) toast('Modelo guardado en tu dispositivo. Ya no se volverá a descargar.'); renderStorage(); });
  state.ready = true;
  readyWaiters.splice(0).forEach(f => f());
  const threads = wllama.getNumThreads?.() ?? 1;
  els.chip.textContent = gpu ? 'GPU' : 'CPU'; els.chip.hidden = false;
  els.infoBackend.textContent = gpu ? 'GPU (WebGPU)' : `Procesador · ${threads} ${threads === 1 ? 'hilo' : 'hilos'}`;
  renderEngine();
  hideOverlays(); state.loading = false; document.body.classList.remove('opening');
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
  if (v === 'gpu' || v === 'auto') { store.set('gpuBroken', false); store.set('gpuOk', false); }
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
  closeSheets(); showCard(); toast('Modelo borrado'); renderStorage();
});

// ---------- Traducción ----------
// Glosario del usuario, por idioma de destino: { en: [['marca', 'brand'], …] }.
const glossary = () => store.get('gloss', {});
function glossRefs(text, tgt, zh) {
  const low = text.toLowerCase();
  const hits = (glossary()[tgt] || []).filter(([a]) => a && low.includes(a.toLowerCase())).slice(0, 20);
  if (!hits.length) return '';
  return zh ? `参考下面的翻译：\n${hits.map(([a, b]) => `${a} 翻译成 ${b}`).join('\n')}\n`
    : `Reference the following translations:\n${hits.map(([a, b]) => `${a} translates to ${b}`).join('\n')}\n\n`;
}
function buildPrompt(text, tgt, src, ctx) {
  return glossRefs(text, tgt, CHINESE.has(tgt) || CHINESE.has(src)) + buildPromptBase(text, tgt, src, ctx);
}
function buildPromptBase(text, tgt, src, ctx) {
  const l = L[tgt];
  if (ctx) {
    if (CHINESE.has(tgt) || CHINESE.has(src)) return `【背景信息】\n${ctx}\n\n请结合背景信息将以下文本翻译为${l.zh}，注意只需要输出翻译后的结果，不要额外解释。\n\n【待翻译文本】\n${text}`;
    return `[Background Information]\n${ctx}\n\nPlease translate the following text into ${l.en}, taking the provided background information into consideration. Note that you should only output the translated result without any additional explanation.\n\n[Source Text]\n${text}`;
  }
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

// Mientras el modelo se abre: si el navegador trae su propio traductor (Chrome), lo uso para que la respuesta sea instantánea.
const quickTr = new Map();
async function quickTranslate(text) {
  if (!('Translator' in self) || !text.trim()) return false;
  const src = state.src === 'auto' ? state.detected : state.src;
  if (!src || src === state.tgt) return false;
  try {
    const opt = { sourceLanguage: src, targetLanguage: state.tgt };
    if ((await Translator.availability(opt)) !== 'available') return false;
    const key = src + '>' + state.tgt;
    if (!quickTr.has(key)) quickTr.set(key, await Translator.create(opt));
    const out = await quickTr.get(key).translate(text);
    if (state.ready || els.src.value !== text) return true;
    renderOutput(out); setStatus('Traducción rápida · abriendo el modelo…');
    return true;
  } catch { return false; }
}
async function translateNow() {
  if (docBusy) return;
  const text = els.src.value;
  if (!state.ready) {
    if (state.loading) {
      if (text.trim() && !(await quickTranslate(text))) setStatus('Abriendo el traductor… se traduce enseguida');
      return; // al terminar de abrir se traduce solo
    }
    if (text.trim() && els.modelCard.hidden && els.loadingBox.hidden) showCard();
    return;
  }
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
      await withLlm(async () => {
        if (ctrl.signal.aborted) return;
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
      });
      if (degenerate) break;
      if (ctrl.signal.aborted && !degenerate) throw new DOMException('aborted', 'AbortError');
      results[i] = lead + acc.trim() + trail;
      cache.set(`${tgt}\u0000${s.text}`, results[i]);
      renderOutput(compose(), true);
    }
    if (degenerate) {
      renderOutput('');
      if (currentGpu) {
        store.set('gpuBroken', true); store.set('gpuOk', false); toast('Tu GPU no traduce bien. Cambio al procesador…');
        resolve(); job = null; els.stop.hidden = true; state.ready = false;
        loadModel(); return;
      }
      setStatus('No salió bien, prueba a reformular'); resolve(); return;
    }
    const final = compose();
    renderOutput(final);
    const secs = (performance.now() - t0) / 1000;
    setStatus('Listo'); els.status.title = tokens > 4 ? `${(tokens / secs).toFixed(1)} tokens/s` : '';
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
  els.count.classList.toggle('near', v.length >= 4800);
  els.count.classList.toggle('zero', !v.length);
  if (v.length >= 5000) { els.count.classList.remove('full'); void els.count.offsetWidth; els.count.classList.add('full'); } else els.count.classList.remove('full');
  document.getElementById('copySrcBtn').disabled = !v.trim();
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
const copySrc = document.getElementById('copySrcBtn');
copySrc.addEventListener('click', async () => {
  if (!els.src.value) return;
  try { await navigator.clipboard.writeText(els.src.value); flashDone(copySrc); } catch { toast('No se pudo copiar'); }
});
els.clear.addEventListener('click', () => {
  els.src.classList.remove('wipe'); void els.src.offsetWidth; els.src.classList.add('wipe');
  els.src.value = ''; onInput(); els.src.focus(); haptic();
});

// ---------- Copiar, compartir, voz ----------
els.copy.addEventListener('click', async () => {
  if (!state.output) return;
  try { await navigator.clipboard.writeText(state.output); flashDone(els.copy); } catch { toast('No se pudo copiar'); }
});
if (navigator.share) {
  els.share.hidden = false;
  els.share.addEventListener('click', () => state.output && navigator.share({ text: state.output }).catch(() => {}));
}
function speak(text, code) {
  if (!('speechSynthesis' in window) || !text) return;
  const btn = arguments[2];
  if (btn?.classList.contains('speaking')) { speechSynthesis.cancel(); return; }
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  speak.u = u;   // Chrome pierde la frase si nadie guarda la referencia
  for (const b of [els.speakSrc, els.speakOut]) b.classList.remove('speaking');
  if (btn) { btn.classList.add('speaking'); u.onend = u.onerror = () => btn.classList.remove('speaking'); }
  const tag = L[code]?.speech || code || '';
  u.lang = tag;
  const v = speechSynthesis.getVoices().find(v => v.lang.toLowerCase() === tag.toLowerCase())
    || speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith((code || '').slice(0, 2)));
  if (v) u.voice = v; else if (code) toast('Tu dispositivo puede no tener voz para este idioma');
  const prevErr = u.onerror;
  u.onerror = e => { prevErr?.(e); if (e?.error && e.error !== 'interrupted' && e.error !== 'canceled') toast('No pude leer la traducción en voz alta'); };
  const go = () => { try { speechSynthesis.resume(); } catch {} speechSynthesis.speak(u); };
  // Hablar justo después de cancelar hace que Chrome se trague la frase: espero un instante.
  busy ? setTimeout(go, 80) : go();
}
els.speakSrc.addEventListener('click', () => speak(els.src.value, state.src === 'auto' ? state.detected : state.src, els.speakSrc));
els.speakOut.addEventListener('click', () => speak(state.output, state.tgt, els.speakOut));

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Rec) els.mic.hidden = true;
// Reconocedor de voz: si el navegador puede hacerlo dentro del dispositivo, lo pido así.
async function makeRec(code) {
  const r = new Rec();
  r.lang = L[code]?.speech || code;
  r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  try {
    if ('processLocally' in r && Rec.available && (await Rec.available({ langs: [r.lang], processLocally: true })) === 'available') r.processLocally = true;
  } catch {}
  return r;
}
const recError = e => toast(e?.error === 'not-allowed' || e?.error === 'service-not-allowed' ? 'Permite el micrófono para dictar'
  : e?.error === 'network' ? 'El dictado necesita conexión en este navegador'
  : e?.error === 'no-speech' ? 'No te he oído, prueba otra vez'
  : e?.error === 'language-not-supported' ? 'Tu navegador no dicta en este idioma' : 'No pude escucharte');
let rec = null;
els.mic.addEventListener('click', async () => {
  if (rec) { rec.stop(); return; }
  speechSynthesis?.cancel?.();
  const code = state.src === 'auto' ? (state.detected || browserLang) : state.src;
  rec = await makeRec(code);
  const before = els.src.value ? els.src.value.replace(/\s*$/, ' ') : '';
  rec.onresult = e => {
    const said = Array.from(e.results).map(r => r[0].transcript).join('');
    els.src.value = before + said; onInput(false);
  };
  rec.onend = () => { els.mic.classList.remove('on'); rec = null; };
  rec.onerror = e => { if (e.error !== 'aborted') recError(e); };
  els.mic.classList.add('on'); haptic(8);
  try { rec.start(); } catch { els.mic.classList.remove('on'); rec = null; }
});

// ---------- Conversación: un solo micrófono siempre abierto ----------
// Un detector de energía (como en convoai-jev-vad) abre el turno en ~110 ms, Whisper decide
// qué idioma se habla y lo pasa a texto, y el final del turno lo marca el silencio o, si se
// activa, Laya (un modelo pequeño que entiende si la frase está terminada).
const readyWaiters = [];
const whenReady = () => state.ready ? Promise.resolve() : new Promise(f => readyWaiters.push(f));
const talkSaved = store.get('talk', null);
const talk = {
  a: talkSaved?.a && L[talkSaved.a] ? talkSaved.a : (state.src !== 'auto' && L[state.src] ? state.src : L[browserLang] ? browserLang : 'es'),
  b: talkSaved?.b && L[talkSaved.b] ? talkSaved.b : state.tgt,
  voice: store.get('talkVoice', true), laya: store.get('talkLaya', false) && !!navigator.gpu,
  on: false, sttReady: false, layaReady: false, layaLoading: false, busy: Promise.resolve(), last: null, ctx: [],
};
if (talk.a === talk.b) talk.b = talk.a === 'en' ? 'es' : 'en';
const T = id => document.getElementById(id);
const tel = { list: T('talkList'), empty: T('talkEmpty'), mic: T('talkMic'), langA: T('talkLangA'), langB: T('talkLangB'), swap: T('talkSwapBtn'), voice: T('talkVoiceBtn'), laya: T('talkLayaBtn'), clear: T('talkClearBtn'), status: T('talkStatus'), note: T('talkNote') };
const SPK_SVG = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
// Idioma de Whisper para cada idioma de la app (null = Whisper no lo reconoce).
const WHISPER = { 'zh-Hant': 'zh', yue: 'zh', tl: 'tl', ug: null };
const wcode = c => (c in WHISPER ? WHISPER[c] : c);

function tSay(text, live = false) { tel.status.textContent = text; tel.status.classList.toggle('live', live); }
function idleStatus() {
  if (!talk.on) return tSay(talk.sttReady || useNative() ? 'Toca el micrófono para empezar' : `Toca para empezar · ${navigator.gpu ? 'unos 400' : 'unos 80'} MB la primera vez, luego sin conexión`);
  return natSpeaker();
  tSay(talk.laya && talk.layaReady ? 'Escuchando · Laya decide cuándo terminas' : 'Escuchando · hablad por turnos');
}
function setTalkLabel(btn, name) {
  const s = btn.firstChild; if (s.textContent === name) return;
  const first = !s.textContent; s.textContent = name;
  if (!first && !btn.parentElement.classList.contains('swapping')) { s.classList.remove('chg'); void s.offsetWidth; s.classList.add('chg'); }
}
function talkRender() {
  setTalkLabel(tel.langA, L[talk.a].name);
  setTalkLabel(tel.langB, L[talk.b].name);
  tel.voice.setAttribute('aria-pressed', String(talk.voice));
  tel.voice.dataset.tip = talk.voice ? 'Voz activada' : 'Voz desactivada';
  tel.laya.hidden = useNative();
  tel.laya.setAttribute('aria-pressed', String(talk.laya));
  tel.laya.dataset.tip = talk.laya ? 'Fin de turno con IA (Laya)' : 'Fin de turno por silencio';
  tel.mic.classList.toggle('on', talk.on && talk.sttReady);
  tel.mic.classList.toggle('wait', talk.on && !talk.sttReady);
  tel.mic.setAttribute('aria-pressed', String(talk.on));
  tel.mic.setAttribute('aria-label', talk.on ? 'Dejar de escuchar' : 'Empezar a escuchar');
  if (!window.AudioWorkletNode || !navigator.mediaDevices?.getUserMedia) { tel.mic.disabled = true; tel.note.textContent = 'Tu navegador no deja usar el micrófono aquí. Prueba en Chrome, Edge o Safari.'; }
  if (!tel.status.classList.contains('live')) idleStatus();
}
window.talkRender = talkRender;

/* --- El oído (worker con Whisper y Laya) --- */
let ear = null, earId = 0, earQ = Promise.resolve();
const earWait = new Map();
function earWorker() {
  if (ear) return ear;
  ear = new Worker('./listen.js?v=32', { type: 'module' });
  ear.onmessage = ({ data: m }) => {
    if (m.type === 'progress') {
      if (m.kind === 'stt' && talk.on && !talk.sttReady) {
        if (m.phase === 'cpu') { store.set('sttcpu', 1); tSay('Tu GPU no responde, paso al modo ligero…', true); }
        else if (m.phase === 'init') tSay('Preparando el oído…', true);
        else tSay(`Descargando el oído… ${m.pct}%`, true);
      }
      if (m.kind === 'laya' && talk.layaLoading) { layaRing(m.pct); if (talk.sttReady && talk.on && !cur) tSay(`Descargando Laya… ${m.pct}%`, true); }
      return;
    }
    const w = earWait.get(m.id); if (!w) return;
    earWait.delete(m.id);
    m.type === 'error' ? w.ko(new Error(m.message)) : w.ok(m);
  };
  ear.onerror = e => { console.error('listen worker', e); for (const w of earWait.values()) w.ko(new Error('worker')); earWait.clear(); ear = null; };
  return ear;
}
// Las cargas van en paralelo; las inferencias, en fila (una sesión ONNX no admite dos a la vez).
function earCall(msg, queued = true) {
  const run = () => new Promise((ok, ko) => {
    const id = ++earId; earWait.set(id, { ok, ko });
    earWorker().postMessage({ ...msg, id }, msg.audio ? [msg.audio.buffer] : []);
  });
  if (!queued) return run();
  const p = earQ.then(run, run); earQ = p.catch(() => {}); return p;
}

// Anillo del botón: null = arrancando (gira), 0-100 = progreso real, 'done' = listo, false = oculto.
let ringTimer = 0;
function layaRing(v) {
  const b = tel.laya; clearTimeout(ringTimer);
  if (v === false) { b.classList.remove('is-loading', 'is-indet', 'is-done'); b.style.setProperty('--p', 0); b.removeAttribute('aria-busy'); return; }
  if (v === 'done') {
    b.style.setProperty('--p', 100); b.classList.remove('is-indet');
    requestAnimationFrame(() => { b.classList.add('is-done'); b.classList.remove('is-loading'); });
    haptic(12); b.removeAttribute('aria-busy');
    ringTimer = setTimeout(() => { b.classList.remove('is-done'); b.style.setProperty('--p', 0); }, 900);
    b.setAttribute('aria-label', 'Detectar el fin de turno con IA (Laya)');
    return;
  }
  b.classList.remove('is-done'); b.classList.add('is-loading'); b.setAttribute('aria-busy', 'true');
  if (v == null) { b.classList.add('is-indet'); b.setAttribute('aria-label', 'Preparando Laya'); return; }
  b.classList.remove('is-indet');
  // Nunca retrocede: varios archivos informan por separado.
  const p = Math.max(Number(b.style.getPropertyValue('--p')) || 0, v);
  b.style.setProperty('--p', p); b.setAttribute('aria-label', `Descargando Laya, ${p}%`);
}
async function loadLaya() {
  if (talk.layaReady || talk.layaLoading) return;
  talk.layaLoading = true; talkRender(); layaRing(null);
  try {
    await earCall({ type: 'load-laya' }, false);
    talk.layaReady = true; store.set('layaDl', true); layaRing('done');
    if (talk.on && !cur) idleStatus();
  } catch (e) {
    console.warn('Laya', e); talk.laya = false; store.set('talkLaya', false); layaRing(false);
    toast(/nogpu/.test(e.message) ? 'Laya necesita WebGPU y tu navegador no lo tiene' : 'No pude cargar Laya. Sigo usando el silencio.');
  }
  talk.layaLoading = false; talkRender();
}

/* --- Micrófono y detector de voz --- */
const SR = 16000, FRAME = 320;            // 20 ms a 16 kHz
const OPEN_MS = 110, DIP_MS = 60;         // energía sostenida para abrir turno; huecos tolerados
const PRE_FRAMES = 15;                    // 300 ms de margen para no comerse la primera sílaba
const SILENCE_MS = 900, HARD_MS = 2600, MAX_MS = 28000;
let mic = null, cur = null;
const gate = { floor: 0.004, streak: 0, dip: 0, lastLoud: 0, ring: [], mute: 0 };
const WORKLET = `class Tap extends AudioWorkletProcessor{constructor(o){super();this.n=o.processorOptions.n;this.b=new Float32Array(this.n);this.i=0}
process(inp){const c=inp[0]&&inp[0][0];if(c)for(let k=0;k<c.length;k++){this.b[this.i++]=c[k];if(this.i===this.n){this.port.postMessage(this.b.slice(0));this.i=0}}return true}}
registerProcessor('tap',Tap)`;
function resample(f, from) {
  if (from === SR) return f;
  const out = new Float32Array(FRAME), r = (f.length - 1) / (FRAME - 1);
  for (let i = 0; i < FRAME; i++) { const x = i * r, k = Math.floor(x), t = x - k; out[i] = f[k] * (1 - t) + (f[k + 1] ?? f[k]) * t; }
  return out;
}
async function micStart() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  let ctx, src;
  try { ctx = new AudioContext({ sampleRate: SR }); src = ctx.createMediaStreamSource(stream); }
  catch { try { ctx?.close(); } catch {} ctx = new AudioContext(); src = ctx.createMediaStreamSource(stream); }
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
  const n = Math.round(ctx.sampleRate * 0.02);
  const node = new AudioWorkletNode(ctx, 'tap', { processorOptions: { n } });
  node.port.onmessage = e => onFrame(resample(e.data, ctx.sampleRate));
  src.connect(node);
  const sink = ctx.createGain(); sink.gain.value = 0; node.connect(sink).connect(ctx.destination);
  if (ctx.state === 'suspended') await ctx.resume();
  mic = { stream, ctx, node };
  Object.assign(gate, { streak: 0, dip: 0, ring: [], lastLoud: 0 });
}
function micStop() {
  if (!mic) return;
  try { mic.node.port.onmessage = null; mic.stream.getTracks().forEach(t => t.stop()); mic.ctx.close(); } catch {}
  mic = null; tel.mic.style.setProperty('--lvl', 0);
}
/* Ondas del micrófono: nivel suavizado (sube rápido, baja despacio) a 60 fps. */
const micViz = {
  hist: [], lv: 0, target: 0, voice: false, quietSince: 0, raf: 0,
  bars: null, w: [0.55, 0.82, 1, 0.82, 0.55],
  push(v, loud) {
    const muted = window.speechSynthesis?.speaking || !talk.sttReady;
    this.target = muted ? 0 : v;
    this.hist.unshift(this.target); this.hist.length = Math.min(this.hist.length, 12);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  },
  tick: () => {
    const z = micViz, now = performance.now();
    z.raf = 0;
    if (!talk.on) return z.reset();
    z.lv += (z.target - z.lv) * (z.target > z.lv ? 0.45 : 0.1);
    if (z.lv > 0.14 || cur) { z.voice = true; z.quietSince = 0; }
    else if (z.voice) { z.quietSince ||= now; if (now - z.quietSince > 380) z.voice = false; }
    tel.mic.classList.toggle('voice', z.voice);
    tel.mic.style.setProperty('--lv', z.lv.toFixed(3));
    z.bars ||= tel.mic.querySelectorAll('.mic-wave i');
    const t = now / 1000;
    z.bars.forEach((b, i) => {
      const past = z.hist[Math.abs(i - 2) * 2] ?? 0;
      const wob = 0.06 * Math.sin(t * (7 + i * 1.7) + i);
      const h = Math.min(1, 0.14 + (0.3 * z.lv + 0.7 * past) * z.w[i] * 1.15 + (z.voice ? wob : 0));
      b.style.setProperty('--h', Math.max(0.12, h).toFixed(3));
    });
    if (z.lv > 0.004 || z.voice) z.raf = requestAnimationFrame(z.tick);
  },
  reset() { this.lv = this.target = 0; this.hist.length = 0; this.voice = false; cancelAnimationFrame(this.raf); this.raf = 0; tel.mic.classList.remove('voice'); tel.mic.style.setProperty('--lv', 0); this.bars?.forEach(b => b.style.setProperty('--h', 0.14)); },
};
function onFrame(f) {
  const now = performance.now();
  let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  const rms = Math.sqrt(s / f.length);
  const th = Math.max(0.006, gate.floor * 3);   // umbral por relación señal/ruido, no absoluto
  const loud = rms > th;
  micViz.push(Math.min(1, Math.max(0, (rms - gate.floor) / (th * 4))), loud);
  // Mientras el móvil habla (la traducción en voz alta), no escucho: evita oírse a sí mismo.
  const speaking = window.speechSynthesis?.speaking;
  if (speaking) gate.mute = now + 350;
  const held = talk.hold && now < talk.holdUntil;
  if (!talk.sttReady || speaking || held || now < gate.mute) { gate.ring.length = 0; gate.streak = 0; return; }
  if (!cur) {
    // El suelo de ruido solo se ajusta cuando nadie habla: baja rápido, sube despacio.
    gate.floor = Math.max(0.0015, rms < gate.floor ? gate.floor * 0.9 + rms * 0.1 : gate.floor * 0.995 + rms * 0.005);
    gate.ring.push(f); if (gate.ring.length > PRE_FRAMES) gate.ring.shift();
    if (loud) { gate.streak += 20; gate.dip = 0; } else if ((gate.dip += 20) > DIP_MS) gate.streak = 0;
    if (gate.streak >= OPEN_MS) openTurn(now);
    return;
  }
  cur.frames.push(f);
  if (loud) { cur.lastLoud = now; cur.voiced += 20; if (cur.p != null) { cur.p = null; cur.hold = 0; } }
  const quiet = now - cur.lastLoud;
  if (now - cur.start > MAX_MS) return closeTurn();
  const useLaya = talk.laya && talk.layaReady;
  if (!useLaya) { if (quiet >= SILENCE_MS) closeTurn(); return; }
  if (quiet >= HARD_MS) return closeTurn();
  // Laya: pregunto al primer respiro y otra vez si el silencio se alarga sin respuesta clara.
  if (!cur.judging && ((quiet >= 250 && cur.judgedAt !== cur.lastLoud) || (quiet >= 1300 && cur.rejudged !== cur.lastLoud && cur.p != null))) {
    if (quiet >= 1300) cur.rejudged = cur.lastLoud;
    judgeTurn(cur, quiet);
  }
  if (cur.p != null) {
    const bar = cur.hold >= 0.5 ? 0.72 : 0.72 - 0.17 * Math.min(1, quiet / 3000);
    const confirm = 1000 - 650 * Math.max(0, Math.min(1, (cur.p - bar) / (1 - bar)));
    if (cur.p >= bar && quiet >= confirm) closeTurn();
  }
}
// Limpieza antes de Whisper: quita zumbido grave y desfase, recorta silencios y nivela el volumen.
function cleanAudio(x) {
  const n = x.length; if (!n) return x;
  // 1) Desfase (DC) y filtro paso alto ~80 Hz: fuera ruido de motor, aire acondicionado, golpes en la mesa.
  let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
  const y = new Float32Array(n), rc = 1 / (2 * Math.PI * 80), dt = 1 / SR, al = rc / (rc + dt);
  let px = 0, py = 0;
  for (let i = 0; i < n; i++) { const v = x[i] - mean; py = al * (py + v - px); px = v; y[i] = py; }
  // 2) Recorte de silencios al principio y al final (deja 250 ms de margen).
  const W = 320, fr = Math.floor(n / W); if (fr < 3) return y;
  const rms = new Float32Array(fr); let top = 0;
  for (let f = 0; f < fr; f++) { let s = 0; for (let k = f * W; k < (f + 1) * W; k++) s += y[k] * y[k]; rms[f] = Math.sqrt(s / W); if (rms[f] > top) top = rms[f]; }
  const thr = Math.max(top * 0.08, 0.004);
  let a0 = 0, a1 = fr - 1; while (a0 < fr && rms[a0] < thr) a0++; while (a1 > a0 && rms[a1] < thr) a1--;
  if (a0 >= fr) return y;
  const pad = Math.round(0.25 * SR / W);
  const s0 = Math.max(0, (a0 - pad) * W), s1 = Math.min(n, (a1 + 1 + pad) * W);
  const z = y.slice(s0, s1);
  // 3) Volumen: lleva la voz a un nivel cómodo (sin pasarse) y suaviza picos.
  let sum = 0, cnt = 0, pk = 0;
  for (let f = a0; f <= a1; f++) if (rms[f] >= thr) { sum += rms[f] * rms[f]; cnt++; }
  for (let i = 0; i < z.length; i++) { const v = Math.abs(z[i]); if (v > pk) pk = v; }
  const level = Math.sqrt(sum / Math.max(1, cnt)) || 1e-4;
  const g = Math.min(10, 0.1 / level, 0.98 / Math.max(pk, 1e-4) * 1.6);
  for (let i = 0; i < z.length; i++) { const v = z[i] * g; z[i] = v > 0.8 || v < -0.8 ? Math.tanh(v) : v; }
  return z;
}
const concat = frames => { const a = new Float32Array(frames.length * FRAME); frames.forEach((f, i) => a.set(f, i * FRAME)); return a; };
function langs() { return [wcode(talk.a), wcode(talk.b)]; }

function openTurn(now) {
  const el = addTurn('pending');
  cur = { frames: gate.ring.splice(0), start: now, lastLoud: now, voiced: OPEN_MS, p: null, hold: 0, judging: false, judgedAt: 0, el };
  gate.streak = 0;
  tSay('Te escucho…', true); haptic(6);
}
async function judgeTurn(t, quiet) {
  t.judging = true; t.judgedAt = t.lastLoud;
  try {
    const part = await earCall({ type: 'stt', audio: cleanAudio(concat(t.frames)), langs: langs(), lang: t.lang });
    if (t !== cur) return;
    t.lang = t.lang || part.lang;
    if (part.text) t.el.querySelector('.said').textContent = part.text;
    if (!part.text) return;
    const r = await earCall({ type: 'judge', text: part.text, before: talk.last, quietMs: performance.now() - t.lastLoud });
    if (t !== cur || t.judgedAt !== t.lastLoud) return;   // volvió a hablar mientras pensaba
    t.p = r.complete; t.hold = r.holding;
  } catch (e) { console.warn('judge', e); }
  finally { t.judging = false; }
}
function dropTurn(el) {
  el.remove();
  if (!tel.list.querySelector('.turn')) { tel.empty.hidden = false; tel.clear.disabled = true; }
}
function hold(on) {
  talk.hold = on; talk.holdUntil = on ? performance.now() + 180000 : 0;
  nat.busy = on; gate.ring.length = 0; gate.streak = 0;
  if (!on) gate.mute = performance.now() + 400;   // un respiro para que el eco del altavoz se apague
}
function closeTurn() {
  const t = cur; cur = null;
  if (talk.on) idleStatus();
  if (t.voiced < 250) return dropTurn(t.el);
  const audio = cleanAudio(concat(t.frames));
  const el = t.el, said = el.querySelector('.said'), heard = el.querySelector('.heard');
  // Por turnos: quien habla ahora es quien marca el idioma (sin adivinar, más rápido y preciso).
  // Quien toca por turno es solo una pista: Whisper decide entre los dos idiomas.
  const expected = nat.side, forced = wcode(talk[expected]);
  const both = wcode(talk.a) !== wcode(talk.b);
  // Por turnos de verdad: no escucho a nadie hasta que la traducción se haya leído en voz alta;
  // solo entonces le toca a la otra persona.
  hold(true); tSay('Traduciendo…', true);
  el.querySelector('.said').textContent = '';
  talk.busy = talk.busy.then(async () => {
    let res, spoke = false;
    try {
    // Contexto para Whisper: las dos últimas frases de la conversación en el idioma de quien habla
    // (lo que dijo antes y la traducción de lo que le acaban de decir).
    const ctxOf = code => talk.ctx.filter(c => c.lang === code).slice(-2).map(c => c.text).join(' ').slice(-220);
    const prompts = { [wcode(talk.a)]: ctxOf(talk.a), [wcode(talk.b)]: ctxOf(talk.b) };
    try { res = await earCall({ type: 'stt', audio, langs: langs(), lang: both ? null : forced, expect: forced, prompts, prompt: ctxOf(talk[expected]) }); }
    catch (e) { console.error(e); dropTurn(el); toast('No pude entender el audio'); return; }
    if (!res.text) return dropTurn(el);
    const side = both && res.lang === wcode(talk[otherSide(expected)]) ? otherSide(expected) : expected;
    const src = talk[side];
    spoke = await translateTurn(el, res.text, side);
    const tgt = talk[otherSide(side)], heardTxt = el.querySelector('.heard')?.textContent.trim();
    talk.ctx.push({ lang: src, text: res.text });
    if (heardTxt) talk.ctx.push({ lang: tgt, text: heardTxt });
    talk.ctx = talk.ctx.slice(-8);
    if (spoke) { tSay('Leyendo la traducción…', true); await ttsDone(); }
    // Solo cambio de turno si se tradujo algo y nadie tocó otro idioma mientras tanto.
    if (heardTxt && nat.side === expected) nat.side = otherSide(side);
    } finally {
      hold(false);
      if (talk.on && !cur) idleStatus();
    }
  });
}

function addTurn(side) {
  tel.empty.hidden = true; tel.clear.disabled = false;
  const d = document.createElement('div');
  d.className = 'turn live ' + side;
  d.innerHTML = '<div class="said"></div><div class="heard"></div>';
  const play = document.createElement('button');
  play.className = 'icon-btn play'; play.setAttribute('aria-label', 'Escuchar'); play.innerHTML = SPK_SVG;
  d.appendChild(play);
  tel.list.appendChild(d);
  d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return d;
}
const scrollEnd = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
// El motor de traducción solo atiende una petición a la vez: las pongo en cola.
let llmQueue = Promise.resolve();
const withLlm = fn => { const p = llmQueue.then(fn, fn); llmQueue = p.catch(() => {}); return p; };
const translateOne = async (...args) => {
  if (job) { job.ctrl.abort(); await job.done.catch(() => {}); }
  return withLlm(() => translateOneNow(...args));
};
async function translateOneNow(text, src, tgt, onDelta) {
  const key = `${tgt}\u0000${text}`;
  if (cache.has(key)) { onDelta?.(cache.get(key)); return cache.get(key); }
  let out = '';
  const parts = segment(text);
  for (const p of parts) {
    if ('sep' in p) { out += p.sep; continue; }
    let acc = '';
    const stream = await wllama.createChatCompletion({
      messages: [{ role: 'user', content: buildPrompt(p.text.trim(), tgt, src) }],
      stream: true, max_tokens: Math.min(1024, p.text.length * 3 + 64), ...SAMPLING,
    });
    for await (const chunk of stream) {
      const dd = chunk?.choices?.[0]?.delta?.content;
      if (dd) { acc += dd; onDelta?.(out + acc); }
      if (isDegenerate(acc)) break;
    }
    out += acc.trim() + (/\s$/.test(p.text) ? ' ' : '');
  }
  out = out.trim(); cache.set(key, out);
  return out;
}

/* Traduce un turno ya transcrito y lo lee en voz alta. Devuelve true si empezó a hablar. */
async function translateTurn(el, text, side) {
  const src = talk[side], tgt = talk[side === 'a' ? 'b' : 'a'];
  const said = el.querySelector('.said'), heard = el.querySelector('.heard');
  el.classList.remove('pending', 'live', 'a', 'b'); el.classList.add(side);
  said.textContent = text; heard.textContent = ''; heard.classList.add('wait');
  const play = el.querySelector('.play');
  play.onclick = () => speak(heard.textContent, tgt, play);
  scrollEnd();
  try {
    let out = await fastTranslate(text, src, tgt);
    if (out == null) {
      if (!state.ready) { tSay('Esperando al traductor…', true); await whenReady(); }
      const go = () => translateOne(text, src, tgt, partial => { heard.classList.remove('wait'); heard.textContent = partial; });
      try { out = await go(); }
      catch (e1) {
        console.warn('traducción, reintento', e1);
        await new Promise(r => setTimeout(r, 400));
        out = await go();
      }
      if (!out?.trim()) throw new Error('traducción vacía');
    }
    heard.classList.remove('wait'); heard.textContent = out; talk.last = out;
    scrollEnd();
    if (talk.voice && out) { speak(out, tgt, play); return true; }
  } catch (err) {
    console.error(err); heard.classList.remove('wait'); heard.textContent = '';
    const why = String(err?.message || err?.name || err || '').replace(/\s+/g, ' ').slice(0, 70);
    toast(why ? `Algo falló al traducir (${why}). Prueba otra vez.` : 'Algo falló al traducir. Prueba otra vez.');
  }
  return false;
}
/* Traductor integrado del navegador (Chrome de escritorio): instantáneo si ya tiene el par descargado. */
const fastTr = new Map();
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('tiempo')), ms))]);
const fastOff = new Set();
async function fastTranslate(text, src, tgt) {
  if (!('Translator' in self)) return null;
  const opt = { sourceLanguage: src, targetLanguage: tgt }, key = src + '>' + tgt;
  if (fastOff.has(key)) return null;
  try {
    // En algunos móviles esta API existe pero se queda colgada: si tarda, uso nuestro traductor.
    if (!fastTr.has(key)) {
      if ((await within(Translator.availability(opt), 1500)) !== 'available') { fastOff.add(key); return null; }
      fastTr.set(key, await within(Translator.create(opt), 3000));
    }
    const out = await within(fastTr.get(key).translate(text), 6000);
    return out?.trim() ? out : null;
  } catch { fastOff.add(key); fastTr.delete(key); return null; }
}
const ttsDone = () => new Promise(res => {
  const t0 = performance.now();
  const poll = () => {
    const s = window.speechSynthesis;
    if (!s || (!s.speaking && !s.pending && performance.now() - t0 > 300) || performance.now() - t0 > 30000) return setTimeout(res, 250);
    setTimeout(poll, 150);
  };
  setTimeout(poll, 150);
});

/* --- Reconocimiento de voz del propio móvil/navegador: rápido, preciso y con texto en vivo --- */
// Todo sin conexión: el reconocimiento del navegador (que usa internet) solo si se pide con ?stt=native.
const NATIVE = !!Rec && /[?&]stt=native/.test(location.search);
const nat = { rec: null, side: 'a', gen: 0, t: 0, beat: 0, busy: false };
const otherSide = s => (s === 'a' ? 'b' : 'a');
function natSpeaker() {
  tel.langA.classList.toggle('now', talk.on && nat.side === 'a');
  tel.langB.classList.toggle('now', talk.on && nat.side === 'b');
  if (!talk.on || nat.busy) return;
  if (!useNative()) return tSay(`Hablad en ${L[talk.a].name.toLowerCase()} o ${L[talk.b].name.toLowerCase()} · lo detecto solo`, true);
  tSay(`Habla en ${L[talk[nat.side]].name.toLowerCase()} · toca el otro idioma si le toca a la otra persona`, true);
}
function natBeat(on) {
  clearInterval(nat.beat); nat.beat = 0;
  if (on) nat.beat = setInterval(() => micViz.push(0.32 + Math.random() * 0.5, true), 90);
}
function natListen() {
  clearTimeout(nat.t);
  if (!talk.on) return;
  const gen = ++nat.gen, side = nat.side;
  const r = new Rec(); nat.rec = r;
  r.lang = L[talk[side]]?.speech || talk[side];
  r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  let fin = '', shown = '', el = null, err = '';
  natSpeaker();
  r.onspeechstart = () => { if (gen === nat.gen) natBeat(true); };
  r.onspeechend = () => natBeat(false);
  r.onresult = ev => {
    if (gen !== nat.gen) return;
    let f = '', i2 = '';
    for (let i = 0; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; ev.results[i].isFinal ? (f += t) : (i2 += t); }
    fin = f; shown = (f + i2).trim();
    if (!shown) return;
    micViz.push(0.75, true);
    if (!el) { el = addTurn(side); tel.empty.hidden = true; }
    el.querySelector('.said').textContent = shown;
    scrollEnd();
  };
  r.onerror = ev => { err = ev.error; };
  r.onend = async () => {
    natBeat(false);
    if (gen !== nat.gen) { if (el) dropTurn(el); return; }
    nat.rec = null;
    if (err === 'not-allowed' || err === 'service-not-allowed') { talkStop(); toast('Permite el micrófono para conversar'); return; }
    if (err === 'language-not-supported') { talkStop(); toast(`Este navegador no reconoce la voz en ${L[talk[side]].name.toLowerCase()}`); return; }
    if (err === 'network') { toast('El reconocimiento de voz necesita conexión. Paso al modo sin conexión.'); natFallback(); return; }
    const text = (fin || shown).trim();
    if (!text || !el) { if (el) dropTurn(el); nat.t = setTimeout(natListen, err === 'aborted' ? 400 : 60); return; }
    // Turno cerrado: traduzco, lo leo y le toca a la otra persona.
    nat.busy = true; nat.side = otherSide(side); natSpeaker();
    tSay('Traduciendo…', true);
    const spoke = await translateTurn(el, text, side);
    if (spoke) { tSay('Leyendo la traducción…', true); await ttsDone(); }
    nat.busy = false;
    if (talk.on && gen === nat.gen) natListen();
  };
  try { r.start(); } catch (e) { console.warn(e); nat.t = setTimeout(natListen, 400); }
}
function natStop() {
  nat.gen++; clearTimeout(nat.t); natBeat(false);
  try { nat.rec?.abort(); } catch {}
  nat.rec = null; nat.busy = false;
  tel.langA.classList.remove('now'); tel.langB.classList.remove('now');
}
let natOff = false;
function natFallback() { natOff = true; natStop(); talk.on = false; talkStart(); }
const useNative = () => NATIVE && !natOff;

async function talkStart() {
  if (!state.ready && !state.loading) { toast('Primero descarga el traductor'); setMode('text'); showCard(); return; }
  const missing = !useNative() && [talk.a, talk.b].find(c => !wcode(c));
  if (missing) { toast(`Aún no reconozco la voz en ${L[missing].name.toLowerCase()}`); return; }
  speechSynthesis?.cancel?.();
  if (useNative()) {
    talk.on = true; talk.sttReady = true; talkRender(); haptic(8);
    natListen(); return;
  }
  talk.on = true; talkRender();
  try { await micStart(); }
  catch (e) {
    talk.on = false; talkRender();
    toast(e?.name === 'NotAllowedError' ? 'Permite el micrófono para conversar' : 'No pude abrir el micrófono'); return;
  }
  if (!talk.on) return micStop();
  haptic(8);
  if (talk.laya) loadLaya();
  if (!talk.sttReady) {
    tSay('Preparando el oído…', true);
    try { await earCall({ type: 'load-stt', cpu: !!store.get('sttcpu', 0) }, false); talk.sttReady = true; }
    catch (e) { console.error(e); talkStop(); toast('No pude preparar el reconocimiento de voz. Revisa la conexión.'); return; }
  }
  talkRender(); idleStatus();
}
function talkStop() {
  micViz.reset();
  if (useNative() || nat.rec) { natStop(); talk.on = false; tel.status.classList.remove('live'); talkRender(); return; }
  if (cur) { if (cur.voiced >= 250) closeTurn(); else { dropTurn(cur.el); cur = null; } }
  micStop(); talk.on = false; tel.status.classList.remove('live'); talkRender();
}
window.talkStop = talkStop;

tel.mic.addEventListener('click', () => (talk.on ? talkStop() : talkStart()));
function pillTap(side) {
  if (talk.on && !useNative()) {
    if (nat.side === side) { openPicker(side === 'a' ? 'ta' : 'tb'); return; }
    haptic(8); nat.side = side; natSpeaker(); return;
  }
  if (talk.on && useNative()) {
    if (nat.side === side) { openPicker(side === 'a' ? 'ta' : 'tb'); return; }
    haptic(8); nat.side = side; if (!nat.busy) { natStop(); talk.on = true; natListen(); } else natSpeaker();
    return;
  }
  openPicker(side === 'a' ? 'ta' : 'tb');
}
tel.langA.addEventListener('click', () => pillTap('a'));
tel.langB.addEventListener('click', () => pillTap('b'));
tel.swap.addEventListener('click', () => {
  [talk.a, talk.b] = [talk.b, talk.a]; store.set('talk', { a: talk.a, b: talk.b }); haptic();
  tel.swap._r = (tel.swap._r || 0) + 180; tel.swap.style.setProperty('--r', tel.swap._r + 'deg');
  tel.swap.classList.remove('spin'); void tel.swap.offsetWidth; tel.swap.classList.add('spin');
  const row = tel.langA.parentElement; row.classList.remove('swapping'); void row.offsetWidth; row.classList.add('swapping');
  clearTimeout(row._t); row._t = setTimeout(() => row.classList.remove('swapping'), 450);
  talkRender();
  if (talk.on && useNative() && !nat.busy) { natStop(); talk.on = true; natListen(); }
});
tel.voice.addEventListener('click', () => {
  talk.voice = !talk.voice; store.set('talkVoice', talk.voice); if (!talk.voice) speechSynthesis?.cancel?.();
  haptic(); talkRender(); toast(talk.voice ? 'Leeré las traducciones en voz alta' : 'Sin voz: solo texto');
});
let layaArm = 0;
tel.laya.addEventListener('click', () => {
  if (talk.laya) { talk.laya = false; store.set('talkLaya', false); haptic(); talkRender(); toast('Fin de turno por silencio'); return; }
  if (!navigator.gpu) { toast('Laya necesita WebGPU y este navegador no lo tiene. Uso el silencio.'); return; }
  if (!store.get('layaDl', false) && Date.now() - layaArm > 4000) {
    layaArm = Date.now(); toast('Laya nota cuándo terminas la frase. Pesa unos 650 MB: toca otra vez para descargarlo'); return;
  }
  talk.laya = true; store.set('talkLaya', true); haptic(); talkRender();
  toast(store.get('layaDl', false) ? 'Laya decide cuándo terminas' : 'Descargando Laya, sigo con el silencio mientras tanto');
  loadLaya();
});
tel.clear.addEventListener('click', () => {
  speechSynthesis?.cancel?.();
  if (cur) { cur = null; }
  tel.list.querySelectorAll('.turn').forEach(t => t.remove());
  talk.last = null; talk.ctx = []; tel.empty.hidden = false; tel.clear.disabled = true; haptic();
  if (talk.on) idleStatus();
});
talkRender();

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
els.histBtn.addEventListener('click', () => { renderHistory(); resetClearHist(); openSheet(els.histSheet, els.histBtn); });
els.histList.addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const x = store.get('history', [])[+b.dataset.i]; if (!x) return;
  state.tgt = x.tg; store.set('tgt', x.tg);
  cache.set(`${x.tg}\u0000${x.s}`, x.t);
  els.src.value = x.s; closeSheets(); onInput(true);
});
function resetClearHist() {
  els.clearHist.classList.remove('confirm'); els.clearHist.textContent = 'Borrar todo';
  els.clearHist.hidden = !store.get('history', []).length;
}
els.clearHist.addEventListener('click', () => {
  // Dos toques: el primero pide confirmación, el segundo borra.
  if (!els.clearHist.classList.contains('confirm')) {
    els.clearHist.classList.add('confirm'); els.clearHist.textContent = '¿Seguro? Toca otra vez'; haptic();
    clearTimeout(els.clearHist._t); els.clearHist._t = setTimeout(resetClearHist, 3000);
    return;
  }
  store.set('history', []); renderHistory(); resetClearHist(); toast('Historial borrado');
});
els.infoBtn.addEventListener('click', () => { renderStorage(); openSheet(els.infoSheet, els.infoBtn); });


// ---------- Arranque ----------
renderLangs();
onInput();
if ((navigator.deviceMemory || 8) < 4) els.memHint.hidden = false;
// Al abrir: si el modelo sigue guardado se carga solo, sin descargar nada.
(async () => {
  const f = await cachedModel();
  if (f) loadModel();
  else {
    if (store.get('ready', false)) { store.set('ready', false); toast('El navegador borró el modelo para liberar espacio. Toca descargar para recuperarlo.'); }
    showCard();
  }
  renderStorage();
})();
// Permite compartir texto por URL: ?q=hola&to=en
const params = new URLSearchParams(location.search);
if (params.get('to') && L[params.get('to')]) { state.tgt = params.get('to'); renderLangs(); }
if (params.get('q')) { els.src.value = params.get('q'); onInput(); }

// ---------- Instalar como app ----------
(() => {
  const btn = document.getElementById('installBtn');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (!standalone) btn.hidden = false; });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; btn.hidden = true;
    if (outcome === 'accepted') toast('Instalando el traductor…');
  });
  addEventListener('appinstalled', () => { btn.hidden = true; toast('App instalada'); });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const hint = document.getElementById('iosHint');
  if (ios && !standalone && !localStorage.getItem('tr.iosHint')) {
    setTimeout(() => { hint.hidden = false; }, 2500);
  }
  document.getElementById('iosHintClose').addEventListener('click', () => { hint.hidden = true; localStorage.setItem('tr.iosHint', '1'); });

  // Texto compartido desde otra app o atajo "?to=xx"
  const q = new URLSearchParams(location.search);
  const shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').trim();
  const to = q.get('to');
  if (to && typeof setTarget === 'function') { try { setTarget(to); } catch {} }
  if (shared) { els.src.value = shared.slice(0, 5000); els.src.dispatchEvent(new Event('input')); }
  // Solo limpia la URL cuando ya no habrá recarga por el service worker
  if (q.toString() && (self.crossOriginIsolated || !('serviceWorker' in navigator))) history.replaceState(null, '', location.pathname);
})();


// =====================================================================
// ---------- Documentos: Word, PowerPoint, Excel, Markdown, texto ----------
// Office (.docx/.pptx/.xlsx) es un zip con XML: se traduce párrafo a párrafo y
// los tramos con formato distinto se marcan con <x1>…</x1> para devolverlos a
// su sitio. Markdown y texto se traducen línea a línea protegiendo el código,
// los enlaces y las etiquetas.
// =====================================================================
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const S_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const OOXML = 'application/vnd.openxmlformats-officedocument.';
const FORMATS = {
  docx: { name: 'Word', color: '#2b579a', mime: OOXML + 'wordprocessingml.document', kind: 'ooxml', unit: 'párrafos', required: 'word/document.xml',
    parts: /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/,
    cfg: { ns: W_NS, para: ['p'], run: 'r', text: 't', rPr: 'rPr', inner: ['tab', 'br', 'cr', 'drawing', 'pict', 'fldChar', 'ptab'], sep: [] } },
  pptx: { name: 'PowerPoint', color: '#c43e1c', mime: OOXML + 'presentationml.presentation', kind: 'ooxml', unit: 'textos', required: 'ppt/presentation.xml',
    parts: /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+|diagrams\/(data|drawing)\d+|charts\/chart\d+)\.xml$/,
    cfg: { ns: A_NS, para: ['p'], run: 'r', text: 't', rPr: 'rPr', inner: [], sep: ['br'], langAttr: true } },
  xlsx: { name: 'Excel', color: '#217346', mime: OOXML + 'spreadsheetml.sheet', kind: 'ooxml', unit: 'textos', required: 'xl/workbook.xml',
    parts: /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/,
    cfg: { ns: S_NS, para: ['si', 'is'], run: 'r', text: 't', rPr: 'rPr', inner: [], sep: [], directRuns: true, directText: true } },
  md:  { name: 'Markdown', color: '#4a4a4a', mime: 'text/markdown', kind: 'md', unit: 'líneas' },
  txt: { name: 'Texto', color: '#6b6b6b', mime: 'text/plain', kind: 'txt', unit: 'líneas' },
  srt: { name: 'Subtítulos', color: '#6b6b6b', mime: 'application/x-subrip', kind: 'txt', unit: 'líneas' },
  vtt: { name: 'Subtítulos', color: '#6b6b6b', mime: 'text/vtt', kind: 'txt', unit: 'líneas' },
};
const EXT_ALIAS = { markdown: 'md', text: 'txt' };
const OLD_FORMATS = { doc: '.docx', ppt: '.pptx', xls: '.xlsx' };
const extOf = name => { const e = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || ''; return EXT_ALIAS[e] || e; };

const D = id => document.getElementById(id);
const del = {
  modes: D('modes'), panes: document.querySelector('.panes'), pane: D('docsPane'), drop: D('drop'), input: D('docInput'),
  card: D('docCard'), icon: D('docIcon'), name: D('docName'), meta: D('docMeta'), remove: D('docRemove'), progress: D('docProgress'),
  bar: D('docBar'), status: D('docStatus'), eta: D('docEta'), preview: D('docPreview'), translate: D('docTranslate'),
  stop: D('docStop'), download: D('docDownload'), share: D('docShare'),
};
const docState = { file: null, parsed: null, result: null, ctrl: null };
const docCache = new Lru();

function setMode(mode) {
  const prev = store.get('mode', 'text');
  store.set('mode', mode);
  const idx = ['text', 'doc', 'cam', 'talk'].indexOf(mode);
  del.modes.style.setProperty('--i', Math.max(0, idx));
  if (prev !== mode) {
    haptic(6);
    const pane = mode === 'text' ? del.panes : mode === 'doc' ? del.pane : mode === 'talk' ? document.getElementById('talkPane') : document.getElementById('camPane');
    pane.classList.remove('enter'); void pane.offsetWidth; pane.classList.add('enter');
  }
  del.modes.querySelectorAll('[data-mode]').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('sel', on); b.classList.toggle('just', on && prev !== mode); b.setAttribute('aria-selected', on); });
  moveTabInd();
  del.panes.hidden = mode !== 'text';
  document.getElementById('camPane').hidden = mode !== 'cam';
  del.pane.hidden = mode !== 'doc';
  document.getElementById('talkPane').hidden = mode !== 'talk';
  document.body.classList.toggle('mode-talk', mode === 'talk');
  if (mode !== 'talk') window.talkStop?.();
  else window.talkRender?.();
  if (mode === 'text') onInput();
  else if (mode === 'doc' && docState.parsed) { state.detected = docState.parsed.lang; renderLangs(); }
  else if (mode === 'cam' && window.camState?.lang) { state.detected = camState.lang; renderLangs(); }
}
// Píldora deslizante bajo la pestaña elegida (sigue también el ancho de la etiqueta en el móvil).
function moveTabInd() {
  const ind = del.modes.querySelector('.tab-ind'), sel = del.modes.querySelector('.sel');
  if (!ind || !sel) return;
  del.modes.style.setProperty('--x', sel.offsetLeft + 'px');
  del.modes.style.setProperty('--w', sel.offsetWidth + 'px');
  ind.style.setProperty('--x', sel.offsetLeft + 'px'); ind.style.setProperty('--w', sel.offsetWidth + 'px');
  if (!del.modes.classList.contains('has-ind')) requestAnimationFrame(() => del.modes.classList.add('has-ind'));
}
if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => moveTabInd()); del.modes.querySelectorAll('[data-mode]').forEach(b => ro.observe(b)); }
addEventListener('resize', moveTabInd, { passive: true });
document.fonts?.ready.then(moveTabInd);
del.modes.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });

let jszipPromise;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return jszipPromise ||= new Promise((ok, ko) => {
    const sc = document.createElement('script'); sc.src = 'vendor/jszip/jszip.min.js';
    sc.onload = () => ok(window.JSZip); sc.onerror = ko; document.head.appendChild(sc);
  });
}

// ---------- Office (XML) ----------
const numOrder = n => n.replace(/\d+/g, d => d.padStart(6, '0'));
async function parseOoxml(file, fmt) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(file);
  if (!zip.file(fmt.required)) throw new Error('bad-file');
  const cfg = fmt.cfg, ns = cfg.ns;
  const isEl = (n, names) => n && n.nodeType === 1 && n.namespaceURI === ns && (Array.isArray(names) ? names.includes(n.localName) : n.localName === names);
  const closestPara = n => { for (let x = n.parentNode; x; x = x.parentNode) if (isEl(x, cfg.para)) return x; return null; };
  const names = Object.keys(zip.files).filter(n => fmt.parts.test(n)).sort((a, b) => numOrder(a).localeCompare(numOrder(b)));
  const ser = new XMLSerializer();
  const parts = [], units = [];
  for (const name of names) {
    const raw = await zip.file(name).async('string');
    const doc = new DOMParser().parseFromString(raw, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    const part = { name, doc, decl: (raw.match(/^<\?xml[^>]*\?>/) || [''])[0] };
    parts.push(part);
    const paras = cfg.para.flatMap(p => Array.from(doc.getElementsByTagNameNS(ns, p)));
    for (const p of paras) {
      const segs = []; let cur = null;
      if (cfg.directText) {
        const ts = Array.from(p.childNodes).filter(k => isEl(k, cfg.text));
        if (ts.length) segs.push({ key: '', ts, text: ts.map(t => t.textContent).join('') });
      }
      const els = Array.from(p.getElementsByTagNameNS(ns, '*')).filter(e =>
        (e.localName === cfg.run || cfg.sep.includes(e.localName)) && closestPara(e) === p && (!cfg.directRuns || e.parentNode === p));
      for (const r of els) {
        if (r.localName !== cfg.run) { cur = null; continue; }
        const kids = Array.from(r.childNodes);
        const ts = kids.filter(k => isEl(k, cfg.text));
        const breaks = kids.some(k => isEl(k, cfg.inner));
        if (!ts.length) { if (breaks) cur = null; continue; }
        const rPr = kids.find(k => isEl(k, cfg.rPr));
        let key = (rPr ? ser.serializeToString(rPr) : '') + '|' + r.parentNode.localName;
        if (cfg.langAttr) key = key.replace(/\s(lang|altLang)="[^"]*"/g, '');
        const text = ts.map(t => t.textContent).join('');
        if (cur && cur.key === key) { cur.ts.push(...ts); cur.text += text; }
        else { cur = { key, ts: [...ts], text }; segs.push(cur); }
        if (breaks) cur = null;
      }
      const text = segs.map(x => x.text).join('');
      if (!/\p{L}/u.test(text) || /^\s*(https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.]+)\s*$/.test(text)) continue;
      units.push({ segs, text });
    }
  }
  const slides = names.filter(n => /slides\/slide\d+\.xml$/.test(n)).length;
  const sheets = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length;
  return {
    units, extraMeta: slides ? `${slides} diapositiva${slides > 1 ? 's' : ''}` : sheets ? `${sheets} hoja${sheets > 1 ? 's' : ''}` : '',
    build: async tgt => {
      const tag = L[tgt]?.speech || tgt;
      for (const part of parts) {
        if (cfg.langAttr) for (const el of Array.from(part.doc.getElementsByTagNameNS(ns, '*')))
          if (/^(rPr|endParaRPr|defRPr)$/.test(el.localName) && el.hasAttribute('lang')) el.setAttribute('lang', tag);
        zip.file(part.name, serializeXml(part));
      }
      if (fmt === FORMATS.docx) await setWordLang(zip, tag);
      return zip.generateAsync({ type: 'blob', mimeType: fmt.mime, compression: 'DEFLATE' });
    },
  };
}
function serializeXml(part) {
  let xml = new XMLSerializer().serializeToString(part.doc);
  if (part.decl && !xml.startsWith('<?xml')) xml = part.decl + '\n' + xml;
  return xml;
}
async function setWordLang(zip, tag) {
  const st = zip.file('word/styles.xml'); if (!st) return;
  const raw = await st.async('string');
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return;
  for (const el of Array.from(doc.getElementsByTagNameNS(W_NS, 'lang')))
    if (el.hasAttributeNS(W_NS, 'val')) el.setAttributeNS(W_NS, 'w:val', tag);
  zip.file('word/styles.xml', serializeXml({ doc, decl: (raw.match(/^<\?xml[^>]*\?>/) || [''])[0] }));
}

// ---------- Texto y Markdown ----------
async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xFF && buf[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), bom: true };
  if (buf[0] === 0xFE && buf[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), bom: true };
  const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(bom ? 3 : 0)), bom }; }
  catch { return { text: new TextDecoder('windows-1252').decode(buf), bom: false }; }
}
// Un trozo de línea traducible: el texto vive en obj.textContent, como en Office.
function textPiece(str, units, extra = {}) {
  if (!/\p{L}/u.test(str)) return str;
  const lead = str.match(/^\s*/)[0], trail = str.slice(lead.length).match(/\s*$/)[0];
  const core = str.slice(lead.length, str.length - trail.length);
  const obj = { textContent: core };
  units.push({ text: core, segs: [{ ts: [obj], text: core }], ...extra });
  return { lead, obj, trail };
}
const renderPiece = x => typeof x === 'string' ? x : x.lead + x.obj.textContent + x.trail;
function textResult(lines, eol, bom, mime) {
  const body = lines.map(l => Array.isArray(l) ? l.map(renderPiece).join('') : renderPiece(l)).join(eol);
  return new Blob([bom ? '\uFEFF' : '', body], { type: mime + ';charset=utf-8' });
}

async function parseTxt(file, fmt, ext) {
  const { text, bom } = await readText(file);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const units = [];
  const subs = ext === 'srt' || ext === 'vtt';
  let vttBlock = false;
  const lines = text.split(/\r?\n/).map(line => {
    if (subs) {
      if (/^\s*$/.test(line)) { vttBlock = false; return line; }
      if (/^\s*\d+\s*$/.test(line) || /-->/.test(line) || /^WEBVTT\b/.test(line)) return line;
      if (/^(NOTE|STYLE|REGION)\b/.test(line)) vttBlock = true;
      if (vttBlock) return line;
      return textPiece(line, units, { md: true }); // protege <i>, <b> de los subtítulos
    }
    return textPiece(line, units);
  });
  return { units, build: async () => textResult(lines, eol, bom, fmt.mime) };
}

async function parseMd(file, fmt) {
  const { text, bom } = await readText(file);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const units = [];
  const src = text.split(/\r?\n/);
  let fence = null, front = /^---\s*$/.test(src[0] || ''), math = false, comment = false;
  const lines = src.map((line, i) => {
    if (front) { if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) front = false; return line; }
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(line.indexOf(f[1]) + f[1].length).trim()) fence = null; return line; }
    if (f) { fence = f[1]; return line; }
    if (/^\s*\$\$\s*$/.test(line)) { math = !math; return line; }
    if (math) return line;
    if (comment) { if (line.includes('-->')) comment = false; return line; }
    if (/^\s*<!--/.test(line)) { if (!line.includes('-->')) comment = true; return line; }
    if (/^\s*\[[^\]]+\]:\s*\S+/.test(line)) return line;                      // definición de enlace
    if (/^\s*<\/?[a-zA-Z][^>]*>\s*$/.test(line)) return line;                   // línea solo con HTML
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) return line; // separador de tabla
    if (/^\s*\|.*\|\s*$/.test(line)) {                                           // fila de tabla
      const cells = line.split(/(?<!\\)\|/);
      return cells.map((c, j) => (j === 0 || j === cells.length - 1) ? c : textPiece(c, units, { md: true })).flatMap((c, j, a) => j < a.length - 1 ? [c, '|'] : [c]);
    }
    const m = line.match(/^(\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+(?:\[[ xX]\]\s+)?)?)([\s\S]*)$/);
    return [m[1], textPiece(m[2], units, { md: true })];
  });
  return { units, build: async () => textResult(lines, eol, bom, fmt.mime) };
}

// Protege código, enlaces, etiquetas y URLs con {{n}} (el modelo los respeta).
function mdMask(s) {
  const masks = [];
  const put = v => `{{${masks.push(v) - 1}}}`;
  s = s.replace(/(`+)[\s\S]*?\1/g, put)
    .replace(/\]\((?:[^()\s]|\([^()\s]*\))*(?:\s+"[^"]*")?\)/g, m => ']' + put(m.slice(1)))
    .replace(/<\/?[A-Za-z][^>]*>|<https?:[^>]+>|<[^@\s>]+@[^>\s]+>/g, put)
    .replace(/\bhttps?:\/\/[^\s)>\]]+/g, put)
    .replace(/(?<![\w$])\$[^$\n]+\$(?![\w$])/g, put)
    .replace(/&[a-zA-Z]+;|&#\d+;/g, put);
  return { masked: s, masks };
}
function mdUnmask(out, masks) {
  const seen = new Set();
  const res = out.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => { n = +n; if (n >= masks.length) return ''; seen.add(n); return masks[n]; });
  return seen.size === masks.length ? res : null;
}
function mdPrompt(data, tgt) {
  return glossRefs(data, tgt) + `### Task\nTranslate the user-facing text within the following Markdown data into ${L[tgt].en}.\n\n### Strict Rules\n1. **Structure Preservation:** You MUST preserve the original Markdown data structure, nesting, hierarchy, and indentation exactly as they are.\n2. **Selective Translation:** Translate ONLY the visible, user-facing text content/values.\n3. **Strict Non-Translation:** NEVER translate or alter code tags, keys, properties, object names, or variable placeholders (such as {{0}}, {{1}}). Leave them exactly in their original form.\n\n### Source Data\n${data}`;
}
const stripFence = s => s.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1').trim();


// ---------- PDF ----------
// Lee el texto con pdf.js, lo agrupa en bloques (párrafos, títulos, celdas) y
// al final tapa cada bloque con el color de fondo de la página y escribe la
// traducción encima con pdf-lib, ajustando el tamaño para que quepa.
FORMATS.pdf = { name: 'PDF', color: '#d93025', mime: 'application/pdf', kind: 'pdf', unit: 'bloques' };
const PDF_CJK = { zh: 'SC', yue: 'SC', 'zh-Hant': 'TC', ja: 'JP', ko: 'KR' };
const PDF_COMPLEX = new Set(['ar', 'he', 'fa', 'ur', 'hi', 'mr', 'gu', 'bn', 'ta', 'te', 'th', 'km', 'my', 'bo', 'ug']);
const loadScript = src => new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); });
let pdfjsP, pdflibP;
const loadPdfjs = () => pdfjsP ||= import('./vendor/pdfjs/pdf.min.mjs').then(m => {
  m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href; return m;
});
const loadPdfLib = () => pdflibP ||= loadScript('vendor/pdflib/pdf-lib.min.js').then(() => loadScript('vendor/pdflib/fontkit.umd.min.js'))
  .then(() => ({ PDFLib: window.PDFLib, fontkit: window.fontkit }));
const pdfAnalysis = new WeakMap();

async function analyzePdf(file, onProgress) {
  const pdfjs = await loadPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try { pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise; }
  catch (e) { if (e?.name === 'PasswordException') throw new Error('pdf-locked'); throw e; }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const blocks = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.(n, pdf.numPages);
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1600 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim() && !it.str.length) continue;
      const [a, b, c, d, e, f] = it.transform;
      if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a <= 0 || d <= 0) continue; // texto girado: lo dejo como está
      const size = d;
      if (size < 3) continue;
      let font = null; try { if (page.commonObjs.has(it.fontName)) font = page.commonObjs.get(it.fontName); } catch {}
      const fname = `${font?.name || ''} ${tc.styles[it.fontName]?.fontFamily || ''}`;
      items.push({ str: it.str, x: e, y: f, w: it.width, size,
        bold: !!font?.bold || /bold|black|heavy|semibold|demi/i.test(fname),
        italic: !!font?.italic || /italic|oblique/i.test(fname) });
    }
    // Líneas
    items.sort((p, q) => (q.y - p.y) || (p.x - q.x));
    const lines = [];
    for (const it of items) {
      const ln = lines.find(l => Math.abs(l.y - it.y) < Math.min(l.size, it.size) * 0.35 && it.x >= l.x0 - l.size * 0.5
        && it.x - l.x1 < l.size * 1.6 && Math.abs(l.size - it.size) < l.size * 0.3);
      if (ln) {
        const gap = it.x - ln.x1;
        if (gap > ln.size * 0.12 && !/\s$/.test(ln.text) && !/^\s/.test(it.str)) ln.text += ' ';
        ln.text += it.str; ln.x1 = Math.max(ln.x1, it.x + it.w); ln.chars += it.str.length;
        if (it.bold) ln.boldChars += it.str.length; if (it.italic) ln.italicChars += it.str.length;
      } else if (it.str.trim()) {
        lines.push({ text: it.str, x0: it.x, x1: it.x + it.w, y: it.y, size: it.size, chars: it.str.length,
          boldChars: it.bold ? it.str.length : 0, italicChars: it.italic ? it.str.length : 0 });
      }
    }
    lines.forEach(l => { l.text = l.text.replace(/\s+/g, ' ').trim(); l.bold = l.boldChars > l.chars / 2; l.italic = l.italicChars > l.chars / 2; });
    // Bloques
    lines.sort((p, q) => (q.y - p.y) || (p.x0 - q.x0));
    const pblocks = [];
    for (const ln of lines) {
      if (!ln.text) continue;
      const bullet = /^([•▪◦·●○■\-–—*]|\d{1,3}[.)]|[a-z][.)])\s/i.test(ln.text);
      const blk = !bullet && pblocks.find(bk => {
        const last = bk.lines[bk.lines.length - 1];
        const dy = last.y - ln.y;
        return dy > ln.size * 0.6 && dy < Math.max(last.size, ln.size) * 1.9 && Math.abs(last.size - ln.size) < last.size * 0.15
          && ln.x0 < bk.x1 && ln.x1 > bk.x0 && last.bold === ln.bold && (bk.lines.length < 2 || Math.abs(dy - bk.lineH) < ln.size * 0.35);
      });
      if (blk) {
        const last = blk.lines[blk.lines.length - 1];
        if (blk.lines.length === 1) blk.lineH = last.y - ln.y;
        blk.lines.push(ln); blk.x0 = Math.min(blk.x0, ln.x0); blk.x1 = Math.max(blk.x1, ln.x1);
      } else pblocks.push({ page: n, lines: [ln], x0: ln.x0, x1: ln.x1, size: ln.size, lineH: ln.size * 1.2, bold: ln.bold, italic: ln.italic });
    }
    const toPx = (x, y) => vp.convertToViewportPoint(x, y).map(Math.round);
    for (const bk of pblocks) {
      const ls = bk.lines;
      bk.text = ls.reduce((acc, l) => !acc ? l.text : /[A-Za-zÀ-ÿ]-$/.test(acc) && /^\p{Ll}/u.test(l.text) ? acc.slice(0, -1) + l.text : acc + ' ' + l.text, '');
      bk.top = ls[0].y + bk.size * 0.86; bk.bottom = ls[ls.length - 1].y - bk.size * 0.24;
      bk.baseline = ls[0].y;
      const w = bk.x1 - bk.x0, mid = (bk.x0 + bk.x1) / 2;
      const centered = ls.length > 1
        ? ls.every(l => Math.abs((l.x0 + l.x1) / 2 - mid) < Math.max(2, w * 0.04)) && ls.some(l => Math.abs(l.x0 - bk.x0) > bk.size * 0.5)
        : Math.abs(mid - (base.viewBox[0] + base.viewBox[2]) / 2) < base.width * 0.03 && w < base.width * 0.8;
      bk.align = centered ? 'center' : 'left';
      bk.pageR = base.viewBox[2]; bk.single = ls.length === 1;
      // Colores leídos de la página dibujada: fondo alrededor del bloque y tinta dentro.
      const [ax, ay] = toPx(bk.x0, bk.top), [bx, by] = toPx(bk.x1, bk.bottom);
      const X0 = Math.max(0, Math.min(ax, bx)), X1 = Math.min(img.width - 1, Math.max(ax, bx));
      const Y0 = Math.max(0, Math.min(ay, by)), Y1 = Math.min(img.height - 1, Math.max(ay, by));
      const px = (x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
      const ring = [];
      for (let x = X0; x <= X1; x += 2) for (const y of [Y0 - 3, Y1 + 3]) if (y >= 0 && y < img.height) ring.push(px(x, y));
      for (let y = Y0; y <= Y1; y += 2) for (const x of [X0 - 3, X1 + 3]) if (x >= 0 && x < img.width) ring.push(px(x, y));
      const med = k => { const v = ring.map(p => p[k]).sort((p, q) => p - q); return v.length ? v[v.length >> 1] : 255; };
      bk.bg = [med(0), med(1), med(2)];
      const ink = []; let maxD = 0;
      for (let y = Y0; y <= Y1; y += 1) for (let x = X0; x <= X1; x += 1) {
        const p = px(x, y), dd = Math.abs(p[0] - bk.bg[0]) + Math.abs(p[1] - bk.bg[1]) + Math.abs(p[2] - bk.bg[2]);
        if (dd > maxD) maxD = dd; if (dd > 90) ink.push([p, dd]);
      }
      const strong = ink.filter(([, dd]) => dd > maxD * 0.7);
      bk.color = strong.length ? [0, 1, 2].map(k => Math.round(strong.reduce((a, [p]) => a + p[k], 0) / strong.length)) : [20, 20, 20];
      delete bk.lines;
      blocks.push(bk);
    }
    page.cleanup();
  }
  return { bytes, blocks, pages: pdf.numPages };
}

async function parsePdf(file) {
  if (!pdfAnalysis.has(file)) pdfAnalysis.set(file, analyzePdf(file, (n, t) => { del.meta.textContent = `Leyendo página ${n} de ${t}…`; }));
  let an;
  try { an = await pdfAnalysis.get(file); } catch (e) { pdfAnalysis.delete(file); throw e; }
  const units = an.blocks.filter(bk => /\p{L}{2}/u.test(bk.text)).map(bk => {
    const obj = { textContent: bk.text };
    return { text: bk.text, segs: [{ ts: [obj], text: bk.text }], pdf: bk, obj };
  });
  return {
    units, extraMeta: `${an.pages} página${an.pages > 1 ? 's' : ''}`,
    emptyHint: 'Este PDF no tiene texto seleccionable (parece escaneado)',
    build: tgt => buildPdf(an, units, tgt),
  };
}

const fontBytes = new Map();
async function getFont(url) {
  if (!fontBytes.has(url)) fontBytes.set(url, fetch(url).then(r => { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); }));
  return fontBytes.get(url);
}
async function pdfFonts(doc, tgt) {
  const cjk = PDF_CJK[tgt];
  if (cjk) {
    const f = await doc.embedFont(await getFont(`https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/SubsetOTF/${cjk}/NotoSans${cjk}-Regular.otf`), { subset: true });
    return { r: f, cjk: true };
  }
  const out = {};
  for (const [k, n] of [['r', 'Regular'], ['b', 'Bold'], ['i', 'Italic'], ['bi', 'BoldItalic']])
    out[k] = await doc.embedFont(await getFont(`fonts/NotoSans-${n}.ttf`), { subset: true });
  return out;
}

function wrapText(text, font, size, maxW, cjk) {
  const tokens = cjk ? text.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]|[^\s\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]+|\s+/g) || [] : text.split(/(\s+)/);
  const lines = []; let cur = '';
  const W = t => font.widthOfTextAtSize(t, size);
  for (const tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) { if (cur) cur += ' '; continue; }
    if (W(cur + tok) <= maxW || !cur.trim()) {
      if (!cur.trim() && W(tok) > maxW) { // palabra más larga que la línea: la parto
        let part = '';
        for (const ch of tok) { if (W(part + ch) > maxW && part) { lines.push(part); part = ''; } part += ch; }
        cur = part;
      } else cur += tok;
    } else { lines.push(cur.trimEnd()); cur = tok; }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

async function buildPdf(an, units, tgt) {
  const { PDFLib, fontkit } = await loadPdfLib();
  const doc = await PDFLib.PDFDocument.load(an.bytes, { ignoreEncryption: true, updateMetadata: false });
  doc.registerFontkit(fontkit);
  const fonts = await pdfFonts(doc, tgt);
  const pages = doc.getPages();
  const rgb = c => PDFLib.rgb(c[0] / 255, c[1] / 255, c[2] / 255);
  const jobs = [];
  for (const u of units) {
    const bk = u.pdf;
    const text = u.obj.textContent.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text === u.text) continue;
    const font = fonts.cjk ? fonts.r : fonts[(bk.bold ? 'b' : '') + (bk.italic ? 'i' : '')] || fonts.r;
    let w = Math.max(bk.x1 - bk.x0, bk.size * 2); const h = bk.top - bk.bottom;
    if (bk.single && bk.align === 'left') w = Math.min(w * 1.25, bk.pageR - bk.x0 - 24); // una línea suelta puede crecer un poco
    w = Math.max(w, bk.x1 - bk.x0);
    let size = bk.size, lines, lineH;
    for (;;) {
      lineH = bk.lineH * size / bk.size;
      lines = wrapText(text, font, size, w + 0.5, fonts.cjk);
      const need = (lines.length - 1) * lineH + size * 1.1;
      if (need <= h * 1.08 + 1 || size <= bk.size * 0.55) break;
      size *= 0.94;
    }
    jobs.push({ page: pages[bk.page - 1], bk, font, size, lines, lineH, w });
  }
  for (const j of jobs) j.page.drawRectangle({ x: j.bk.x0 - 1.5, y: j.bk.bottom - 1, width: Math.max(j.bk.x1 - j.bk.x0, j.bk.align === 'left' ? Math.max(...j.lines.map(l => j.font.widthOfTextAtSize(l, j.size))) : 0) + 3, height: j.bk.top - j.bk.bottom + 2, color: rgb(j.bk.bg) });
  for (const j of jobs) {
    const y0 = j.bk.top - j.size * 0.86;
    j.lines.forEach((ln, i) => {
      const lw = j.font.widthOfTextAtSize(ln, j.size);
      const x = j.bk.align === 'center' ? (j.bk.x0 + j.bk.x1 - lw) / 2 : j.bk.x0;
      j.page.drawText(ln, { x, y: y0 - i * j.lineH, size: j.size, font: j.font, color: rgb(j.bk.color) });
    });
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

// ---------- Motor de traducción común ----------
function setSegText(seg, text) {
  seg.ts.forEach((t, i) => { t.textContent = i === 0 ? text : ''; });
  if (seg.ts[0].setAttributeNS) seg.ts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
}
function taggedPrompt(data, tgt) {
  return glossRefs(data, tgt) + `### Task\nTranslate the user-facing text within the following XML data into ${L[tgt].en}.\n\n### Strict Rules\n1. **Structure Preservation:** You MUST preserve the original XML data structure, nesting, hierarchy, and indentation exactly as they are.\n2. **Selective Translation:** Translate ONLY the visible, user-facing text content/values.\n3. **Strict Non-Translation:** NEVER translate or alter code tags, keys, properties, object names, or variable placeholders. Leave them exactly in their original English/code form.\n\n### Source Data\n${data}`;
}

class Degenerate extends Error {}
// Textos cortos (celdas, títulos): varios en una sola llamada con etiquetas <xN>.
const isShort = u => !u.md && u.text.trim().length > 0 && u.text.trim().length <= 160 && !/\n/.test(u.text.trim())
  && u.segs.filter(x => /\S/.test(x.text)).length === 1;
async function translateBatch(batch, tgt, src, signal, onDelta) {
  const res = new Array(batch.length).fill(null), todo = [];
  batch.forEach((u, i) => { const c = docCache.get(`${tgt}\u0000${u.text.trim()}`); if (c != null) res[i] = c; else todo.push(i); });
  if (todo.length > 1) {
    const data = todo.map((i, k) => `<x${k}>${batch[i].text.trim()}</x${k}>`).join('\n');
    const out = await llm(taggedPrompt(data, tgt), data.length * 3 + 96, signal, a => onDelta?.(a.replace(/<\/?x\d+>/g, '')));
    const found = new Map();
    for (const m of out.matchAll(/<x(\d+)>([\s\S]*?)<\/x\1>/g)) found.set(+m[1], m[2].trim());
    todo.forEach((i, k) => { const t = found.get(k); if (t && !/<\/?x\d+>/.test(t)) { res[i] = t; docCache.set(`${tgt}\u0000${batch[i].text.trim()}`, t); } });
  }
  // Lo que no volvió bien etiquetado (o un texto suelto) se traduce uno a uno.
  for (let i = 0; i < batch.length; i++) if (res[i] == null) res[i] = await translatePlain(batch[i].text.trim(), tgt, src, signal);
  batch.forEach((u, i) => {
    const first = u.segs.find(x => /\S/.test(x.text)), lead = u.text.match(/^\s*/)[0], trail = u.text.match(/\s*$/)[0];
    u.segs.forEach(x => { if (x !== first) setSegText(x, x === first ? x.text : (/\S/.test(x.text) ? '' : x.text)); });
    setSegText(first, lead + res[i] + trail); res[i] = lead + res[i] + trail;
  });
  return res;
}
const llm = (...args) => withLlm(() => llmNow(...args));
async function llmNow(prompt, maxTokens, signal, onDelta) {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const c = new AbortController();
  const relay = () => c.abort(); signal.addEventListener('abort', relay, { once: true });
  let acc = '';
  try {
    const stream = await wllama.createChatCompletion({
      messages: [{ role: 'user', content: prompt }], stream: true,
      max_tokens: Math.min(3072, maxTokens), abortSignal: c.signal, ...SAMPLING,
    });
    for await (const ch of stream) {
      if (c.signal.aborted) break;
      const d = ch?.choices?.[0]?.delta?.content;
      if (d) { acc += d; onDelta?.(acc); }
      if (isDegenerate(acc)) { c.abort(); throw new Degenerate(); }
    }
  } finally { signal.removeEventListener('abort', relay); }
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  return acc.trim();
}

const tail = (t, n = 300) => { t = (t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? '…' + t.slice(-n) : t; };
async function translatePlain(text, tgt, src, signal, onDelta, ctx) {
  const key = `${tgt}\u0000${text}`;
  if (docCache.has(key)) return docCache.get(key);
  const out = [];
  let prev = ctx;
  for (const pc of segment(text)) {
    if ('sep' in pc) { out.push(pc.sep); continue; }
    const lead = pc.text.match(/^\s*/)[0], trail = pc.text.match(/\s*$/)[0], core = pc.text.trim();
    const done = out.join('');
    // Le paso el párrafo anterior para que mantenga términos y tono en todo el documento.
    const r = await llm(buildPrompt(core, tgt, src, prev && tail(prev)), core.length * 3 + 64, signal, a => onDelta?.(done + lead + a));
    out.push(lead + r + trail);
    prev = core;
  }
  const res = out.join('');
  docCache.set(key, res);
  return res;
}

async function translateMdText(text, tgt, src, signal, onDelta) {
  const key = `${tgt}\u0002${text}`;
  if (docCache.has(key)) return docCache.get(key);
  const { masked, masks } = mdMask(text);
  let res = null;
  if (!masks.length && !/[*_~#>\[\]]/.test(masked)) res = await translatePlain(text, tgt, src, signal, onDelta);
  else {
    const show = a => onDelta?.(a.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => masks[+n] ?? ''));
    res = mdUnmask(stripFence(await llm(mdPrompt(masked, tgt), masked.length * 3 + 96, signal, show)), masks);
    if (res == null) res = mdUnmask(await llm(buildPrompt(masked, tgt, src), masked.length * 3 + 64, signal, show), masks);
    if (res == null) res = text; // no respetó lo protegido: mejor dejar la línea como estaba
  }
  docCache.set(key, res);
  return res;
}

async function translateUnit(unit, tgt, src, signal, onDelta, ctx) {
  const live = unit.segs.filter(x => /\S/.test(x.text));
  if (!live.length) return;
  const edge = t => [t.match(/^\s*/)[0], t.match(/\s*$/)[0]];
  if (unit.md) {
    const res = await translateMdText(unit.text, tgt, src, signal, onDelta);
    setSegText(unit.segs[0], res);
    return res;
  }
  if (live.length === 1 || unit.text.length > 1500) {
    const first = live[0];
    const [lead, trail] = edge(unit.text);
    const res = await translatePlain(unit.text.trim(), tgt, src, signal, onDelta, ctx);
    unit.segs.forEach(x => { if (x !== first) setSegText(x, ''); });
    setSegText(first, lead + res + trail);
    return lead + res + trail;
  }
  // Varios formatos en el párrafo: etiquetas para conservar negritas, enlaces, etc.
  const ids = new Map();
  let data = '';
  unit.segs.forEach((x, i) => {
    if (!/\S/.test(x.text)) { data += x.text; return; }
    const [lead, trail] = edge(x.text);
    ids.set(i, [lead, trail]);
    data += `${lead}<x${i}>${x.text.trim()}</x${i}>${trail}`;
  });
  const key = `${tgt}\u0001${data}`;
  let out = docCache.get(key);
  if (out == null) {
    out = await llm(taggedPrompt(data, tgt), data.length * 3 + 96, signal, a => onDelta?.(a.replace(/<\/?x\d+>/g, '')));
    docCache.set(key, out);
  }
  const found = new Map();
  for (const m of out.matchAll(/<x(\d+)>([\s\S]*?)<\/x\1>/g)) found.set(+m[1], m[2]);
  if ([...ids.keys()].every(i => found.has(i) && /\S/.test(found.get(i)))) {
    ids.forEach(([lead, trail], i) => setSegText(unit.segs[i], lead + found.get(i).trim() + trail));
  } else {
    // No respetó las etiquetas: todo el párrafo con el formato del primer tramo.
    const plain = out.replace(/<\/?x\d+>/g, '').replace(/\s+/g, ' ').trim()
      || await translatePlain(unit.text.trim(), tgt, src, signal, onDelta);
    const first = live[0];
    unit.segs.forEach(x => { if (x !== first && /\S/.test(x.text)) setSegText(x, ''); });
    const [lead, trail] = edge(unit.text);
    setSegText(first, lead + plain + trail);
  }
  return unit.segs.map(x => x.ts.map(t => t.textContent).join('')).join('');
}

async function parseFile(file) {
  const ext = extOf(file.name), fmt = FORMATS[ext];
  const parsed = fmt.kind === 'ooxml' ? await parseOoxml(file, fmt)
    : fmt.kind === 'md' ? await parseMd(file, fmt)
    : fmt.kind === 'pdf' ? await parsePdf(file, fmt)
    : await parseTxt(file, fmt, ext);
  const sample = parsed.units.slice(0, 60).map(x => x.text).join('\n').slice(0, 2000);
  parsed.lang = detect(sample);
  parsed.chars = parsed.units.reduce((a, x) => a + x.text.length, 0);
  parsed.fmt = fmt; parsed.ext = ext;
  return parsed;
}

// ---------- Interfaz ----------
const fmtSize = b => b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function resetDocUI() {
  del.progress.hidden = true; del.preview.hidden = true; del.preview.innerHTML = '';
  del.download.hidden = true; del.share.hidden = true; del.stop.hidden = true;
  del.translate.hidden = false; del.translate.disabled = false; del.translate.textContent = 'Traducir documento';
  docState.result = null;
}

async function openDoc(file) {
  if (!file) return;
  const ext = extOf(file.name);
  if (OLD_FORMATS[ext]) { toast(`Guárdalo como ${OLD_FORMATS[ext]} y vuelve a probar`); return; }
  if (!FORMATS[ext]) { toast('Formatos: PDF, Word, PowerPoint, Excel, Markdown y texto'); return; }
  if (docBusy) { toast('Espera a que termine el documento actual'); return; }
  setMode('doc');
  const fmt = FORMATS[ext];
  del.drop.hidden = true; del.card.hidden = false; resetDocUI();
  del.icon.style.setProperty('--fc', fmt.color); del.icon.dataset.ext = ext.toUpperCase();
  del.name.textContent = file.name; del.meta.textContent = 'Leyendo…'; del.translate.disabled = true;
  try {
    const parsed = await parseFile(file);
    docState.file = file; docState.parsed = parsed;
    if (!parsed.units.length) { del.meta.textContent = parsed.emptyHint || 'No encontré texto para traducir'; return; }
    const words = parsed.units.reduce((a, x) => a + (x.text.match(/\S+/g) || []).length, 0);
    del.meta.textContent = [fmtSize(file.size), parsed.extraMeta, `${words.toLocaleString('es-ES')} palabras`].filter(Boolean).join(' · ');
    state.detected = parsed.lang;
    if (state.src === 'auto' && parsed.lang && parsed.lang === state.tgt) {
      state.tgt = state.recent.find(c => c !== parsed.lang && L[c]) || (parsed.lang === 'es' ? 'en' : 'es'); store.set('tgt', state.tgt);
    }
    renderLangs();
    del.translate.disabled = false;
  } catch (e) {
    console.error(e);
    del.meta.textContent = e?.message === 'pdf-locked' ? 'Este PDF tiene contraseña' : `No pude abrir este archivo. ¿Es un ${fmt.name} válido?`;
  }
}

async function translateDoc() {
  if (!docState.file) return;
  if (!state.ready && state.loading) { toast('El traductor se está abriendo, un segundo…'); return; }
  if (!state.ready) {
    setMode('text'); if (els.loadingBox.hidden) showCard();
    toast('Primero descarga el traductor'); return;
  }
  if (extOf(docState.file.name) === 'pdf' && PDF_COMPLEX.has(state.tgt)) {
    toast(`En PDF aún no puedo escribir en ${L[state.tgt].name.toLowerCase()}. Prueba con Word o con otro idioma.`); return;
  }
  job?.ctrl.abort();
  const parsed = await parseFile(docState.file);   // copia limpia cada vez
  docState.parsed = parsed;
  const tgt = state.tgt;
  const src = state.src === 'auto' ? parsed.lang : state.src;
  const ctrl = new AbortController(); docState.ctrl = ctrl;
  docBusy = true;
  del.translate.hidden = true; del.stop.hidden = false; del.download.hidden = true; del.share.hidden = true;
  del.progress.hidden = false; del.preview.hidden = false; del.preview.innerHTML = '';
  let lock = null; try { lock = await navigator.wakeLock?.request('screen'); } catch {}
  const units = parsed.units, total = parsed.chars;
  let doneChars = 0, failed = 0; const t0 = performance.now();
  const update = i => {
    del.bar.style.width = (total ? (doneChars / total) * 100 : 0).toFixed(1) + '%';
    del.status.textContent = `${Math.min(i + 1, units.length)} de ${units.length} ${parsed.fmt.unit}`;
    const secs = (performance.now() - t0) / 1000;
    if (doneChars > 0 && secs > 8) {
      const left = Math.round(secs * (total - doneChars) / doneChars);
      del.eta.textContent = left > 90 ? `faltan ~${Math.round(left / 60)} min` : left > 3 ? `faltan ~${left} s` : '';
    } else del.eta.textContent = '';
  };
  try {
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      update(i);
      if (isShort(unit) && isShort(units[i + 1] || {})) {
        let j = i, chars = 0;
        while (j < units.length && j - i < 12 && isShort(units[j]) && chars + units[j].text.length <= 900) chars += units[j++].text.length;
        const batch = units.slice(i, j), ps = batch.map(u => {
          const p = document.createElement('p'); p.className = 'cur'; p.textContent = u.text; del.preview.appendChild(p); return p;
        });
        while (del.preview.children.length > 400) del.preview.firstElementChild.remove();
        ps.at(-1).scrollIntoView({ block: 'nearest' });
        try {
          const res = await translateBatch(batch, tgt, src, ctrl.signal);
          ps.forEach((p, k) => { p.textContent = res[k] ?? batch[k].text; p.classList.remove('cur'); });
          batch.forEach(u => { doneChars += u.text.length; });
          i = j - 1; continue;
        } catch (e) {
          if (!(e instanceof Degenerate)) throw e;
          ps.forEach(p => p.remove()); // sigue uno a uno, que ya sabe qué hacer si la GPU falla
        }
      }
      const p = document.createElement('p'); p.className = 'cur'; p.textContent = unit.text;
      del.preview.appendChild(p);
      if (del.preview.children.length > 400) del.preview.firstElementChild.remove();
      p.scrollIntoView({ block: 'nearest' });
      try {
        const res = await translateUnit(unit, tgt, src, ctrl.signal, a => { p.textContent = a; }, units[i - 1]?.text);
        p.textContent = res ?? unit.text;
      } catch (e) {
        if (e instanceof Degenerate) {
          if (currentGpu) {
            store.set('gpuBroken', true); store.set('gpuOk', false);
            toast('Tu GPU no traduce bien. Cambio al procesador, vuelve a pulsar Traducir.');
            state.ready = false; loadModel(); throw new DOMException('aborted', 'AbortError');
          }
          failed++; p.textContent = unit.text;
        } else throw e;
      }
      p.classList.remove('cur');
      doneChars += unit.text.length;
    }
    update(units.length - 1);
    del.status.textContent = 'Preparando el archivo…'; del.eta.textContent = '';
    const blob = await parsed.build(tgt);
    const base = docState.file.name.replace(/\.[^.]+$/, '');
    const outExt = docState.file.name.match(/\.[^.]+$/)?.[0] || '.' + parsed.ext;
    docState.result = new File([blob], `${base} (${L[tgt].name})${outExt}`, { type: blob.type || parsed.fmt.mime });
    del.bar.style.width = '100%';
    const mins = Math.round((performance.now() - t0) / 60000);
    del.status.textContent = failed ? `Listo · ${failed} fragmento${failed > 1 ? 's' : ''} sin traducir` : `Listo · traducido al ${L[tgt].name.toLowerCase()}`;
    del.eta.textContent = mins >= 1 ? `${mins} min` : '';
    del.download.hidden = false;
    del.share.hidden = !(navigator.canShare && navigator.canShare({ files: [docState.result] }));
    del.translate.hidden = false; del.translate.textContent = 'Repetir';
  } catch (e) {
    if (e?.name === 'AbortError') { del.status.textContent = 'Detenido'; }
    else { console.error(e); del.status.textContent = 'Algo falló al traducir'; toast('Algo falló al traducir el documento'); }
    del.eta.textContent = ''; del.translate.hidden = false; del.translate.textContent = 'Traducir documento';
  } finally {
    docBusy = false; del.stop.hidden = true; docState.ctrl = null;
    try { await lock?.release(); } catch {}
  }
}

function downloadDoc() {
  const f = docState.result; if (!f) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

del.input.addEventListener('change', () => { openDoc(del.input.files[0]); del.input.value = ''; });
['dragenter', 'dragover'].forEach(ev => del.drop.addEventListener(ev, e => { e.preventDefault(); del.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => del.drop.addEventListener(ev, e => { e.preventDefault(); del.drop.classList.remove('over'); }));
del.drop.addEventListener('drop', e => openDoc(e.dataTransfer.files[0]));
addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
addEventListener('drop', e => { if (e.dataTransfer?.files?.length && !del.drop.contains(e.target)) { e.preventDefault(); openDoc(e.dataTransfer.files[0]); } });
del.translate.addEventListener('click', translateDoc);
del.stop.addEventListener('click', () => docState.ctrl?.abort());
del.download.addEventListener('click', downloadDoc);
del.share.addEventListener('click', () => docState.result && navigator.share({ files: [docState.result], title: docState.result.name }).catch(() => {}));
del.remove.addEventListener('click', () => {
  docState.ctrl?.abort(); docState.file = docState.parsed = docState.result = null;
  del.card.hidden = true; del.drop.hidden = false; resetDocUI();
});

// =====================================================================
// ---------- Cámara: foto → lectura del texto (Tesseract) → traducción encima ----------
// =====================================================================
const TESS = { es: 'spa', en: 'eng', fr: 'fra', pt: 'por', it: 'ita', de: 'deu', nl: 'nld', pl: 'pol', cs: 'ces', uk: 'ukr', ru: 'rus',
  tr: 'tur', ar: 'ara', he: 'heb', fa: 'fas', ur: 'urd', hi: 'hin', mr: 'mar', gu: 'guj', bn: 'ben', ta: 'tam', te: 'tel', zh: 'chi_sim',
  'zh-Hant': 'chi_tra', yue: 'chi_tra', ja: 'jpn', ko: 'kor', th: 'tha', vi: 'vie', id: 'ind', ms: 'msa', tl: 'tgl', km: 'khm', my: 'mya',
  bo: 'bod', kk: 'kaz', mn: 'mon', ug: 'uig' };
const LATIN = new Set(['es', 'en', 'fr', 'pt', 'it', 'de', 'nl', 'pl', 'cs', 'tr', 'vi', 'id', 'ms', 'tl']);
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ug']);
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const cel = {
  pane: D('camPane'), start: D('camStart'), card: D('camCard'), canvas: D('camCanvas'), view: D('camView'),
  shoot: D('camShoot'), pick: D('camPick'), camInput: D('camInput'), imgInput: D('imgInput'),
  progress: D('camProgress'), bar: D('camBar'), status: D('camStatus'), eta: D('camEta'), texts: D('camTexts'),
  stop: D('camStop'), download: D('camDownload'), share: D('camShare'), copy: D('camCopy'), redo: D('camRedo'), again: D('camNew'),
};
const camState = window.camState = { src: null, blocks: [], view: 'tr', ctrl: null, name: 'foto', lang: null, ocrSrc: null, tgt: null, result: null };
let tess = null, tessLangs = '';

async function getOcr(langs) {
  if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
  if (tess && tessLangs === langs) return tess;
  if (tess) { try { await tess.terminate(); } catch {} tess = null; }
  const abs = p => new URL(p, location.href).href;
  tess = await Tesseract.createWorker(langs.split('+'), 1, {
    workerPath: abs('vendor/tesseract/worker.min.js'), corePath: abs('vendor/tesseract/'), workerBlobURL: false,
    logger: m => {
      if (m.status === 'loading language traineddata') { cel.status.textContent = 'Descargando el lector de texto…'; setCamBar(m.progress * 30); }
      else if (m.status === 'recognizing text') { cel.status.textContent = 'Leyendo el texto…'; setCamBar(30 + m.progress * 70); }
    },
  });
  tessLangs = langs;
  return tess;
}
const setCamBar = pct => { cel.bar.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%'; };

async function loadImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

function sampleColors(img, bb) {
  const W = img.width, H = img.height, d = img.data;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const X0 = Math.max(0, bb.x0), X1 = Math.min(W - 1, bb.x1), Y0 = Math.max(0, bb.y0), Y1 = Math.min(H - 1, bb.y1);
  const ring = [], step = Math.max(1, Math.round((X1 - X0 + Y1 - Y0) / 200));
  for (let x = X0; x <= X1; x += step) for (const y of [Y0 - 3, Y1 + 3]) if (y >= 0 && y < H) ring.push(px(x, y));
  for (let y = Y0; y <= Y1; y += step) for (const x of [X0 - 3, X1 + 3]) if (x >= 0 && x < W) ring.push(px(x, y));
  const med = k => { const v = ring.map(p => p[k]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 255; };
  const bg = [med(0), med(1), med(2)];
  let maxD = 0; const ink = [];
  const st = Math.max(1, Math.round(Math.sqrt((X1 - X0) * (Y1 - Y0) / 20000)));
  for (let y = Y0; y <= Y1; y += st) for (let x = X0; x <= X1; x += st) {
    const p = px(x, y), dd = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]);
    if (dd > maxD) maxD = dd; if (dd > 60) ink.push([p, dd]);
  }
  const strong = ink.filter(([, dd]) => dd > maxD * 0.7);
  const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  let color = strong.length ? [0, 1, 2].map(k => Math.round(strong.reduce((a, [p]) => a + p[k], 0) / strong.length)) : null;
  if (!color || Math.abs(lum(color) - lum(bg)) < 60) color = lum(bg) > 128 ? [17, 17, 17] : [255, 255, 255];
  return { bg, color };
}

function ocrBlocks(data, img) {
  const out = [];
  // Tesseract a veces junta un cartel y el texto de debajo: separo por tamaño de letra y por huecos.
  const groups = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) {
    let g = [];
    for (const l of (p.lines || []).filter(l => l.text.trim() && l.confidence > 30)) {
      const prev = g[g.length - 1];
      if (prev) {
        const ph = prev.bbox.y1 - prev.bbox.y0, lh = l.bbox.y1 - l.bbox.y0;
        if (Math.abs(lh - ph) > Math.max(ph, lh) * 0.3 || l.bbox.y0 - prev.bbox.y1 > Math.min(ph, lh) * 0.9) { groups.push(g); g = []; }
      }
      g.push(l);
    }
    if (g.length) groups.push(g);
  }
  for (const lines of groups) {
    let text = lines.map(l => l.text.trim()).reduce((acc, t) => !acc ? t : /\p{L}-$/u.test(acc) && /^\p{Ll}/u.test(t) ? acc.slice(0, -1) + t : acc + ' ' + t, '');
    text = text.replace(/\s+/g, ' ').replace(/([\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af])\s+(?=[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af])/g, '$1').trim();
    const conf = lines.reduce((a, l) => a + l.confidence, 0) / lines.length;
    if (conf < 45 || !/\p{L}{2}/u.test(text)) continue;
    const bb = { x0: Math.min(...lines.map(l => l.bbox.x0)), y0: Math.min(...lines.map(l => l.bbox.y0)), x1: Math.max(...lines.map(l => l.bbox.x1)), y1: Math.max(...lines.map(l => l.bbox.y1)) };
    const lineH = lines.reduce((a, l) => a + (l.bbox.y1 - l.bbox.y0), 0) / lines.length;
    const step = lines.length > 1 ? (lines[lines.length - 1].bbox.y0 - lines[0].bbox.y0) / (lines.length - 1) : lineH * 1.25;
    out.push({ text, bb, lineH, step, n: lines.length, tr: null, ...sampleColors(img, bb) });
  }
  return out;
}

function wrapCanvas(ctx, text, maxW, cjk) {
  const tokens = cjk ? text.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]|[^\s\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]+|\s+/g) || [] : text.split(/(\s+)/);
  const lines = []; let cur = '';
  for (const tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) { if (cur) cur += ' '; continue; }
    if (!cur.trim() || ctx.measureText(cur + tok).width <= maxW) cur += tok;
    else { lines.push(cur.trimEnd()); cur = tok; }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

function renderCam() {
  const src = camState.src; if (!src) return;
  const c = cel.canvas, ctx = c.getContext('2d');
  c.width = src.width; c.height = src.height;
  ctx.drawImage(src, 0, 0);
  if (camState.view !== 'tr') return;
  const tgt = camState.tgt, cjk = !!PDF_CJK[tgt], rtl = RTL.has(tgt);
  const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
  for (const b of camState.blocks) {
    if (!b.tr) continue;
    const pad = Math.max(2, b.lineH * 0.15);
    const w = b.bb.x1 - b.bb.x0, h = b.bb.y1 - b.bb.y0;
    ctx.fillStyle = rgb(b.bg);
    ctx.beginPath(); ctx.roundRect?.(b.bb.x0 - pad, b.bb.y0 - pad, w + pad * 2, h + pad * 2, pad); ctx.roundRect ? ctx.fill() : ctx.fillRect(b.bb.x0 - pad, b.bb.y0 - pad, w + pad * 2, h + pad * 2);
    let size = b.lineH * 0.95, lines, lh;
    for (;;) {
      ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
      lh = Math.max(size * 1.15, b.step * size / (b.lineH * 0.95));
      lines = wrapCanvas(ctx, b.tr, w, cjk);
      if ((lines.length - 1) * lh + size <= h * 1.1 + 2 || size < 9) break;
      size *= 0.92;
    }
    ctx.fillStyle = rgb(b.color); ctx.textBaseline = 'top';
    ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
    const top = b.bb.y0 + Math.max(0, (h - ((lines.length - 1) * lh + size)) / 2);
    lines.forEach((ln, i) => ctx.fillText(ln, rtl ? b.bb.x1 : b.bb.x0, top + i * lh, w + pad));
  }
}

function renderCamTexts() {
  cel.texts.innerHTML = '';
  for (const b of camState.blocks) {
    const d = document.createElement('div');
    const sm = document.createElement('small'); sm.textContent = b.text;
    const tr = document.createElement('span'); tr.textContent = b.tr ?? '…'; if (!b.tr) tr.className = 'cur';
    if (RTL.has(camState.tgt)) tr.dir = 'rtl';
    d.append(sm, tr); b.el = tr; cel.texts.appendChild(d);
  }
  cel.texts.hidden = !camState.blocks.length;
}

function camButtons(done) {
  cel.stop.hidden = done; cel.download.hidden = !done || !camState.blocks.some(b => b.tr);
  cel.copy.hidden = cel.download.hidden; cel.redo.hidden = !done || !camState.blocks.length;
  cel.share.hidden = cel.download.hidden || !navigator.canShare;
  cel.view.hidden = cel.download.hidden;
}

async function camImage(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) { toast('Eso no parece una imagen'); return; }
  if (docBusy) { toast('Espera a que termine lo que se está traduciendo'); return; }
  setMode('cam');
  cel.start.hidden = true; cel.card.hidden = false;
  camState.name = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
  camState.blocks = []; camState.view = 'tr'; camState.result = null; renderCamTexts();
  cel.view.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x.dataset.v === 'tr'));
  cel.progress.hidden = false; setCamBar(0); cel.eta.textContent = ''; cel.status.textContent = 'Abriendo la foto…';
  try { camState.src = await loadImage(file); }
  catch { cel.status.textContent = 'No pude abrir esta imagen'; camButtons(true); return; }
  renderCam();
  await camRun(true);
}

async function camOcr() {
  const src = camState.src;
  const img = src.getContext('2d').getImageData(0, 0, src.width, src.height);
  const chosen = state.src !== 'auto' ? state.src : null;
  let langs = chosen ? [...new Set([TESS[chosen], 'eng'])].join('+') : 'eng+spa';
  let w = await getOcr(langs);
  let { data } = await w.recognize(src, {}, { blocks: true, text: true });
  let blocks = ocrBlocks(data, img);
  let lang = chosen || detect(blocks.map(b => b.text).join('\n'));
  if (!chosen && lang && LATIN.has(lang) && !['en', 'es'].includes(lang) && TESS[lang]) {
    langs = `${TESS[lang]}+eng`; w = await getOcr(langs);
    ({ data } = await w.recognize(src, {}, { blocks: true, text: true }));
    blocks = ocrBlocks(data, img);
  }
  camState.ocrSrc = state.src; camState.lang = lang;
  return blocks;
}

async function camRun(ocr) {
  if (docBusy) { toast('Espera a que termine lo que se está traduciendo'); return; }
  const ctrl = new AbortController(); camState.ctrl = ctrl;
  docBusy = true; camButtons(false);
  let lock = null; try { lock = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    if (ocr || !camState.blocks.length || (state.src !== 'auto' && state.src !== camState.ocrSrc)) {
      camState.blocks = await camOcr();
      if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
      state.detected = camState.lang; renderLangs();
      if (!camState.blocks.length) {
        cel.status.textContent = state.src === 'auto' ? 'No encontré texto. Si está en otro alfabeto, elige su idioma arriba.' : 'No encontré texto en la foto';
        setCamBar(0); return;
      }
    }
    if (!state.ready && state.loading) {
      renderCamTexts(); cel.status.textContent = 'Texto leído. El traductor se está abriendo, vuelve a pulsar en un segundo.'; setCamBar(100); return;
    }
    if (!state.ready) {
      renderCamTexts(); cel.status.textContent = 'Texto leído. Descarga el traductor para traducirlo.'; setCamBar(100);
      toast('Primero descarga el traductor'); return;
    }
    let tgt = state.tgt;
    if (state.src === 'auto' && camState.lang === tgt) { tgt = state.recent.find(c => c !== tgt && L[c]) || (tgt === 'es' ? 'en' : 'es'); state.tgt = tgt; store.set('tgt', tgt); renderLangs(); }
    const src = state.src === 'auto' ? camState.lang : state.src;
    camState.tgt = tgt;
    camState.blocks.forEach(b => { b.tr = null; });
    renderCamTexts(); renderCam();
    const total = camState.blocks.reduce((a, b) => a + b.text.length, 0); let done = 0; const t0 = performance.now();
    for (let i = 0; i < camState.blocks.length; i++) {
      const b = camState.blocks[i];
      cel.status.textContent = `Traduciendo ${i + 1} de ${camState.blocks.length}`;
      setCamBar(done / total * 100);
      try {
        b.tr = await translatePlain(b.text, tgt, src, ctrl.signal, a => { b.el.textContent = a; });
      } catch (e) {
        if (e instanceof Degenerate) {
          if (currentGpu) { store.set('gpuBroken', true); store.set('gpuOk', false); toast('Tu GPU no traduce bien. Cambio al procesador, vuelve a pulsar Repetir.'); state.ready = false; loadModel(); throw new DOMException('aborted', 'AbortError'); }
          b.tr = null;
        } else throw e;
      }
      if (b.el) { b.el.textContent = b.tr ?? b.text; b.el.className = ''; }
      done += b.text.length; renderCam();
      const secs = (performance.now() - t0) / 1000;
      if (secs > 6 && done < total) { const left = Math.round(secs * (total - done) / done); cel.eta.textContent = left > 3 ? `faltan ~${left} s` : ''; }
    }
    setCamBar(100); cel.eta.textContent = '';
    cel.status.textContent = `Listo · ${camState.blocks.length} texto${camState.blocks.length > 1 ? 's' : ''} traducido${camState.blocks.length > 1 ? 's' : ''} al ${L[tgt].name.toLowerCase()}`;
  } catch (e) {
    if (e?.name === 'AbortError') cel.status.textContent = 'Detenido';
    else { console.error(e); cel.status.textContent = 'Algo falló al leer la foto'; toast(navigator.onLine ? 'Algo falló al leer la foto' : 'La primera vez necesito internet para descargar el lector de texto'); }
    cel.eta.textContent = '';
  } finally {
    docBusy = false; camState.ctrl = null; camButtons(true);
    try { await lock?.release(); } catch {}
  }
}

function camBlob() {
  return new Promise(ok => cel.canvas.toBlob(ok, 'image/jpeg', 0.92)).then(b => new File([b], `${camState.name} (${L[camState.tgt]?.name || 'traducción'}).jpg`, { type: 'image/jpeg' }));
}
cel.shoot.addEventListener('click', () => cel.camInput.click());
cel.pick.addEventListener('click', () => cel.imgInput.click());
cel.again.addEventListener('click', () => { camState.ctrl?.abort(); cel.camInput.click(); });
[cel.camInput, cel.imgInput].forEach(inp => inp.addEventListener('change', () => { camImage(inp.files[0]); inp.value = ''; }));
cel.stop.addEventListener('click', () => camState.ctrl?.abort());
cel.redo.addEventListener('click', () => camRun(false));
cel.view.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  camState.view = b.dataset.v; cel.view.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); renderCam();
});
cel.download.addEventListener('click', async () => {
  const v = camState.view; if (v !== 'tr') { camState.view = 'tr'; renderCam(); }
  const f = await camBlob(); if (v !== 'tr') { camState.view = v; renderCam(); }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});
cel.share.addEventListener('click', async () => {
  const f = await camBlob();
  if (navigator.canShare?.({ files: [f] })) navigator.share({ files: [f], title: f.name }).catch(() => {});
  else toast('Tu navegador no deja compartir imágenes');
});
cel.copy.addEventListener('click', async () => {
  const t = camState.blocks.map(b => b.tr || b.text).join('\n\n');
  try { await navigator.clipboard.writeText(t); flashLabel(cel.copy, 'Copiado'); } catch { toast('No pude copiar'); }
});
cel.start.addEventListener('dragover', e => { e.preventDefault(); cel.start.classList.add('over'); });
cel.start.addEventListener('dragleave', () => cel.start.classList.remove('over'));
cel.start.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); cel.start.classList.remove('over'); camImage(e.dataTransfer.files[0]); });
addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type));
  if (f && (store.get('mode', 'text') === 'cam' || document.activeElement === document.body)) { e.preventDefault(); camImage(f); }
});
{
  const qm = new URLSearchParams(location.search).get('mode');
  setMode(['cam', 'doc', 'talk'].includes(qm) ? qm : store.get('mode', 'text'));
}

// ---------- Pulido: cabecera translúcida al hacer scroll y entrada inicial ----------
(() => {
  const top = document.querySelector('.top');
  let on = false;
  const tick = () => { const s = scrollY > 4; if (s !== on) { on = s; top?.classList.toggle('scrolled', s); } };
  addEventListener('scroll', tick, { passive: true }); tick();
  document.body.classList.add('boot');
  setTimeout(() => document.body.classList.remove('boot'), 900);
})();

/* Glosario: cómo quieres que se traduzcan ciertos términos. */
(() => {
  const g = id => document.getElementById(id);
  const box = g('gloss'); if (!box) return;
  const list = g('glossList'), from = g('glossFrom'), to = g('glossTo');
  const save = (tgt, rows) => { const all = glossary(); if (rows.length) all[tgt] = rows; else delete all[tgt]; store.set('gloss', all); cache.clear(); docCache.clear(); };
  const render = () => {
    const tgt = state.tgt, rows = glossary()[tgt] || [];
    g('glossCount').textContent = rows.length || '';
    g('glossHint').textContent = rows.length ? `Se aplica al traducir al ${(L[tgt]?.name ?? tgt).toLowerCase()}, también en texto y cámara.`
      : `Añade términos para que se traduzcan siempre igual al ${(L[tgt]?.name ?? tgt).toLowerCase()}: marcas, nombres o palabras técnicas.`;
    to.placeholder = `En ${(L[tgt]?.name ?? tgt).toLowerCase()}`;
    list.replaceChildren(...rows.map(([x, y], i) => {
      const li = document.createElement('li'), s = document.createElement('span'), b = document.createElement('button');
      s.append(x, ' '); const arrow = document.createElement('i'); arrow.textContent = '→ '; s.append(arrow, y);
      b.type = 'button'; b.setAttribute('aria-label', `Quitar ${x}`);
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      b.onclick = () => { const r = glossary()[state.tgt] || []; r.splice(i, 1); save(state.tgt, r); render(); };
      li.append(s, b); return li;
    }));
  };
  g('glossAdd').addEventListener('submit', e => {
    e.preventDefault();
    const x = from.value.trim(), y = to.value.trim(); if (!x || !y) return;
    const r = (glossary()[state.tgt] || []).filter(([k]) => k.toLowerCase() !== x.toLowerCase());
    r.push([x, y]); save(state.tgt, r); from.value = ''; to.value = ''; from.focus(); render();
  });
  box.addEventListener('toggle', render);
  let last = state.tgt; setInterval(() => { if (state.tgt !== last) { last = state.tgt; render(); } }, 500);
  render();
})();
