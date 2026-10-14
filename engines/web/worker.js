// Quant Docs engine worker (module worker), served from /engines/docs/<version>/worker.js.
//
// Loads each engine (wasm-bindgen ES module + .wasm) lazily on first use and answers
// { id, op, … } messages with { id, ok, result | error }. Engine errors keep their stable
// code prefix ("E_PASSWORD: …"). A WebAssembly trap is reported as fatal — the instance
// may be corrupt, so the client terminates this worker and starts a fresh one.
//
// Engines that draw text from font files the bundle serves (fonts/, see fonts.js) export
// addFont(bytes) and Document#fontsUsed(): before an open document is answered, the files it
// needs are fetched (same origin, immutable) and added — once per engine instance.

import { fontFilesFor } from './fonts.js';

const FILES = {
  pdf: 'pdf/quant_pdf_engine',
  word: 'word/quant_word_engine',
  slides: 'slides/quant_slides_engine',
  sheets: 'sheets/quant_sheets_engine',
};
const MAX_BYTES = 60 * 1024 * 1024;
/** How long an open waits for font files; later arrivals still apply to the next pages drawn. */
const FONT_WAIT_MS = 15_000;

const engines = new Map();
const docs = new Map();
let nextDoc = 1;

function load(kind) {
  const base = FILES[kind];
  if (!base) return Promise.reject(new Error(`E_UNSUPPORTED: no engine for "${kind}"`));
  if (!engines.has(kind)) {
    const loading = import(new URL(`${base}.js`, import.meta.url).href)
      .then(async (mod) => {
        await mod.default({ module_or_path: new URL(`${base}_bg.wasm`, import.meta.url) });
        return mod;
      })
      .catch((e) => {
        engines.delete(kind);
        throw new Error(`E_LOAD: ${e && e.message ? e.message : e}`);
      });
    engines.set(kind, loading);
  }
  return engines.get(kind);
}

let fontIndex = null;
const fontLoads = new Map();

function loadFontIndex() {
  if (!fontIndex) {
    fontIndex = fetch(new URL('fonts/index.json', import.meta.url))
      .then((r) => (r.ok ? r.json() : { fonts: [] }))
      .then((j) => (j && Array.isArray(j.fonts) ? j.fonts : []))
      .catch(() => {
        fontIndex = null;
        return [];
      });
  }
  return fontIndex;
}

/** Fetch and add the font files `doc` draws with (a missing one only means a stand-in face). */
async function provideFonts(kind, mod, doc) {
  if (typeof mod.addFont !== 'function' || typeof doc.fontsUsed !== 'function') return;
  let used;
  try {
    used = JSON.parse(doc.fontsUsed());
  } catch {
    return;
  }
  const files = fontFilesFor(used, await loadFontIndex());
  const loads = files.map((file) => {
    const key = `${kind}:${file}`;
    if (!fontLoads.has(key)) {
      const loading = fetch(new URL(`fonts/${file}`, import.meta.url))
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          mod.addFont(new Uint8Array(buf));
        })
        .catch(() => {
          fontLoads.delete(key);
        });
      fontLoads.set(key, loading);
    }
    return fontLoads.get(key);
  });
  let timer;
  await Promise.race([Promise.all(loads), new Promise((resolve) => (timer = setTimeout(resolve, FONT_WAIT_MS)))]);
  clearTimeout(timer);
}

function bytesOf(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error('E_INVALID: no file bytes');
  if (buffer.byteLength > MAX_BYTES) throw new Error('E_TOO_LARGE: the file is too large to preview');
  return new Uint8Array(buffer);
}

async function handle(msg) {
  switch (msg.op) {
    case 'open': {
      const mod = await load(msg.kind);
      const bytes = bytesOf(msg.bytes);
      const doc = msg.kind === 'pdf' ? new mod.Document(bytes, msg.password || undefined) : new mod.Document(String(msg.name || ''), bytes);
      try {
        await provideFonts(msg.kind, mod, doc);
      } catch {
        // Fonts only change how text looks; the document still opens.
      }
      const docId = nextDoc++;
      docs.set(docId, doc);
      return { result: { docId, pageCount: doc.pageCount, pageSizes: Array.from(doc.pageSizes()), title: doc.title ?? null } };
    }
    case 'render': {
      const doc = docs.get(msg.docId);
      if (!doc) throw new Error('E_CLOSED: the document is closed');
      const img = doc.render(msg.page, msg.scale);
      const { width, height } = img;
      const rgba = img.takeRgba();
      img.free();
      return { result: { width, height, rgba }, transfer: [rgba.buffer] };
    }
    case 'close': {
      const doc = docs.get(msg.docId);
      if (doc) {
        docs.delete(msg.docId);
        doc.free();
      }
      return { result: null };
    }
    case 'sheets': {
      const mod = await load('sheets');
      const json = mod.previewWorkbook(String(msg.name || ''), bytesOf(msg.bytes), msg.maxRows | 0, msg.maxCols | 0);
      return { result: JSON.parse(json) };
    }
    default:
      throw new Error(`E_UNSUPPORTED: unknown operation "${msg.op}"`);
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    const { result, transfer } = await handle(msg);
    self.postMessage({ id: msg.id, ok: true, result }, transfer || []);
  } catch (e) {
    const fatal = typeof WebAssembly !== 'undefined' && e instanceof WebAssembly.RuntimeError;
    const message = e && e.message ? e.message : String(e);
    self.postMessage({ id: msg.id, ok: false, fatal, error: fatal ? `E_CRASH: ${message}` : message });
  }
};
