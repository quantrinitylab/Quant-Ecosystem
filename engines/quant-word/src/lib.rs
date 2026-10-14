//! Quant Docs — Word engine (WebAssembly).
//!
//! A thin, typed adapter over the WordCraft engine: open a .docx (also .doc, .odt, .rtf and
//! the other formats WordCraft reads), lay it out in print view and rasterize one page at a
//! time — on the user's device, inside a Web Worker. Fonts are the open fonts WordCraft embeds.
//!
//! Pixels come back as straight RGBA8 flattened onto white paper. Errors are `JsError`s
//! whose message starts with a stable code (`E_INVALID`, `E_RANGE`).

use std::sync::Arc;

use wasm_bindgen::prelude::*;
use wordcraft_engine::{Session, io, layout::DocLayout, render as wrender};

const MAX_SCALE: f32 = 8.0;

/// Premultiplied RGBA8 → straight RGBA8 composited over white (opaque).
fn flatten_on_white(px: &mut [u8]) {
    for p in px.chunks_exact_mut(4) {
        let inv = 255 - p[3];
        p[0] = p[0].saturating_add(inv);
        p[1] = p[1].saturating_add(inv);
        p[2] = p[2].saturating_add(inv);
        p[3] = 255;
    }
}

/// One rendered page.
#[wasm_bindgen]
pub struct PageImage {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

#[wasm_bindgen]
impl PageImage {
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    /// The pixels (straight RGBA8, opaque). Moves them out: call once.
    #[wasm_bindgen(js_name = takeRgba)]
    pub fn take_rgba(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.rgba)
    }
}

/// An open word-processing document.
#[wasm_bindgen]
pub struct Document {
    session: Session,
    layout: Arc<DocLayout>,
}

#[wasm_bindgen]
impl Document {
    /// Open `bytes`; `name` (the file name) helps detect the format.
    #[wasm_bindgen(constructor)]
    pub fn new(name: &str, bytes: Vec<u8>) -> Result<Document, JsError> {
        let doc = io::open_bytes(name, &bytes).map_err(|e| JsError::new(&format!("E_INVALID: {e}")))?;
        let session = Session::new(doc);
        let layout = session.export_layout_with(false);
        if layout.pages.is_empty() {
            return Err(JsError::new("E_INVALID: the document has no pages"));
        }
        Ok(Document { session, layout })
    }

    #[wasm_bindgen(getter, js_name = pageCount)]
    pub fn page_count(&self) -> usize {
        self.layout.pages.len()
    }

    /// `[w0, h0, w1, h1, …]` — page sizes in points.
    #[wasm_bindgen(js_name = pageSizes)]
    pub fn page_sizes(&self) -> Vec<f32> {
        self.layout.pages.iter().flat_map(|p| [p.w, p.h]).collect()
    }

    /// The document title from its properties, if any.
    #[wasm_bindgen(getter)]
    pub fn title(&self) -> Option<String> {
        let t = self.session.doc.core.title.trim();
        (!t.is_empty()).then(|| t.to_string())
    }

    /// Rasterize page `page` (0-based) at `scale` device pixels per point. The printed page:
    /// headers and footers at full strength.
    pub fn render(&mut self, page: usize, scale: f32) -> Result<PageImage, JsError> {
        let pg = self.layout.pages.get(page).ok_or_else(|| JsError::new("E_RANGE: no such page"))?;
        let scale = if scale.is_finite() { scale.clamp(0.05, MAX_SCALE) } else { 1.0 };
        let mut opts = wrender::RenderOptions::default();
        opts.display.dim_header = false;
        let img = wrender::render_page(&self.session.doc, pg, scale, &opts);
        let mut rgba = img.pixels;
        flatten_on_white(&mut rgba);
        Ok(PageImage { width: img.width, height: img.height, rgba })
    }
}

#[wasm_bindgen(js_name = engineInfo)]
pub fn engine_info() -> String {
    format!("quant-word-engine {} (WordCraft, MIT OR Apache-2.0)", env!("CARGO_PKG_VERSION"))
}
