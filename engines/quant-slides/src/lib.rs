//! Quant Docs — Slides engine (WebAssembly).
//!
//! A thin, typed adapter over the DeckCraft engine: open a .pptx (or DeckCraft's own format)
//! and rasterize one slide at a time — on the user's device, inside a Web Worker.
//!
//! Pixels come back as straight RGBA8 flattened onto white. Errors are `JsError`s whose
//! message starts with a stable code (`E_INVALID`, `E_RANGE`).

use deckcraft_engine::cmd::file::open_presentation;
use deckcraft_engine::model::Presentation;
use deckcraft_engine::render::{RenderOpts, render_slide};
use wasm_bindgen::prelude::*;

const MAX_SCALE: f64 = 8.0;

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

/// An open presentation.
#[wasm_bindgen]
pub struct Document {
    pres: Presentation,
}

#[wasm_bindgen]
impl Document {
    /// Open `bytes`; `name` (the file name) helps detect the format.
    #[wasm_bindgen(constructor)]
    pub fn new(name: &str, bytes: Vec<u8>) -> Result<Document, JsError> {
        let pres = open_presentation(name, &bytes).map_err(|e| JsError::new(&format!("E_INVALID: {e}")))?;
        if pres.slides.is_empty() {
            return Err(JsError::new("E_INVALID: the presentation has no slides"));
        }
        Ok(Document { pres })
    }

    #[wasm_bindgen(getter, js_name = pageCount)]
    pub fn page_count(&self) -> usize {
        self.pres.slides.len()
    }

    /// `[w0, h0, w1, h1, …]` — slide sizes in points (every slide shares the deck size).
    #[wasm_bindgen(js_name = pageSizes)]
    pub fn page_sizes(&self) -> Vec<f32> {
        let (w, h) = (self.pres.slide_size.width as f32, self.pres.slide_size.height as f32);
        (0..self.pres.slides.len()).flat_map(|_| [w, h]).collect()
    }

    #[wasm_bindgen(getter)]
    pub fn title(&self) -> Option<String> {
        None
    }

    /// Rasterize slide `page` (0-based) at `scale` device pixels per point (show view).
    pub fn render(&mut self, page: usize, scale: f32) -> Result<PageImage, JsError> {
        if page >= self.pres.slides.len() {
            return Err(JsError::new("E_RANGE: no such slide"));
        }
        let scale = if scale.is_finite() { (scale as f64).clamp(0.05, MAX_SCALE) } else { 1.0 };
        let img = render_slide(&self.pres, page, &RenderOpts { scale, edit: false, ..Default::default() });
        let mut rgba = img.pixels;
        flatten_on_white(&mut rgba);
        Ok(PageImage { width: img.width, height: img.height, rgba })
    }
}

#[wasm_bindgen(js_name = engineInfo)]
pub fn engine_info() -> String {
    format!("quant-slides-engine {} (DeckCraft, MIT OR Apache-2.0)", env!("CARGO_PKG_VERSION"))
}
