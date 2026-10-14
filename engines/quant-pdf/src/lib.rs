//! Quant Docs — PDF engine (WebAssembly).
//!
//! A thin, typed adapter over the PdfCraft render crate (hayro + vello_cpu): open a PDF once,
//! read its page sizes, rasterize one page at a time. It runs inside a Web Worker on the
//! user's device, so previews cost no server time and the file never leaves the browser.
//!
//! Pixels come back as straight RGBA8 already flattened onto white paper, ready for
//! `ImageData`. Errors are `JsError`s whose message starts with a stable code
//! (`E_PASSWORD`, `E_WRONG_PASSWORD`, `E_INVALID`, `E_UNSUPPORTED`, `E_RENDER`, `E_RANGE`).

use std::sync::Arc;

use pdfcraft_render::{OpenError, PageRenderer, RenderConfig, RenderRequest, RequestKind, inspect};
use wasm_bindgen::prelude::*;

/// Upper bound for the scale a caller may ask for (device pixels per PDF point).
const MAX_SCALE: f32 = 8.0;

fn open_error(e: OpenError) -> JsError {
    match e {
        OpenError::NeedsPassword => JsError::new("E_PASSWORD: the document is protected by a password"),
        OpenError::WrongPassword => JsError::new("E_WRONG_PASSWORD: the password is incorrect"),
        OpenError::Invalid(m) => JsError::new(&format!("E_INVALID: {m}")),
        OpenError::Unsupported(m) => JsError::new(&format!("E_UNSUPPORTED: {m}")),
    }
}

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

/// An open PDF.
#[wasm_bindgen]
pub struct Document {
    renderer: PageRenderer,
    sizes: Vec<f32>,
    title: Option<String>,
}

#[wasm_bindgen]
impl Document {
    /// Open `bytes` (with an optional user/owner `password`).
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>, password: Option<String>) -> Result<Document, JsError> {
        let bytes = Arc::new(bytes);
        let info = inspect(bytes.clone(), password.as_deref()).map_err(open_error)?;
        let renderer = PageRenderer::new(
            bytes,
            RenderConfig { password: password.map(Arc::from), reject_oversize: true, ..Default::default() },
        );
        if renderer.page_count() == 0 || info.pages.is_empty() {
            return Err(JsError::new("E_INVALID: the document has no pages"));
        }
        let sizes = info.pages.iter().flat_map(|p| [p.width, p.height]).collect();
        Ok(Document { renderer, sizes, title: info.title.filter(|t| !t.trim().is_empty()) })
    }

    #[wasm_bindgen(getter, js_name = pageCount)]
    pub fn page_count(&self) -> usize {
        self.sizes.len() / 2
    }

    /// `[w0, h0, w1, h1, …]` — displayed page sizes in points (after /Rotate).
    #[wasm_bindgen(js_name = pageSizes)]
    pub fn page_sizes(&self) -> Vec<f32> {
        self.sizes.clone()
    }

    /// The document title from its metadata, if any.
    #[wasm_bindgen(getter)]
    pub fn title(&self) -> Option<String> {
        self.title.clone()
    }

    /// Rasterize page `page` (0-based) at `scale` device pixels per point.
    pub fn render(&mut self, page: usize, scale: f32) -> Result<PageImage, JsError> {
        if page >= self.page_count() {
            return Err(JsError::new("E_RANGE: no such page"));
        }
        let scale = if scale.is_finite() { scale.clamp(0.05, MAX_SCALE) } else { 1.0 };
        let out = self.renderer.render(RenderRequest {
            page,
            kind: RequestKind::Pixels,
            tile: None,
            scale,
            tag: 0,
            preview: false,
        });
        if let Some(e) = out.error {
            return Err(JsError::new(&format!("E_RENDER: {e}")));
        }
        let mut rgba = out.rgba.to_vec();
        flatten_on_white(&mut rgba);
        Ok(PageImage { width: out.width, height: out.height, rgba })
    }
}

/// Engine build information (for the about / licenses screen).
#[wasm_bindgen(js_name = engineInfo)]
pub fn engine_info() -> String {
    format!("quant-pdf-engine {} (PdfCraft render, MIT OR Apache-2.0)", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::flatten_on_white;

    #[test]
    fn flattens_premultiplied_pixels_onto_white() {
        // transparent → white; opaque black stays black; 50% premultiplied red → pink.
        let mut px = vec![0, 0, 0, 0, 0, 0, 0, 255, 128, 0, 0, 128];
        flatten_on_white(&mut px);
        assert_eq!(px, vec![255, 255, 255, 255, 0, 0, 0, 255, 255, 127, 127, 255]);
    }
}
