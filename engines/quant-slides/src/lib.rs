//! Quant Docs — Slides engine (WebAssembly).
//!
//! A thin, typed adapter over DeckCraft's import, model and render crates: open a .pptx (or
//! DeckCraft's own format) and rasterize one slide at a time — on the user's device, inside a
//! Web Worker.
//!
//! Pixels come back as straight RGBA8 flattened onto white. Errors are `JsError`s whose
//! message starts with a stable code (`E_INVALID`, `E_RANGE`).
//!
//! Fonts: the web build compiles in only DeckCraft's last-resort face. The worker reads
//! [`Document::fonts_used`] and hands the matching font files (or their metric-compatible
//! stand-ins, e.g. Carlito for Calibri) to [`add_font`] before the first slide is drawn.

use deckcraft_fonts::FontDb;
use deckcraft_model::resolve::{self, Ctx};
use deckcraft_model::text::{Bullet, TextBody};
use deckcraft_model::{Presentation, Shape, ShapeKind};
use deckcraft_render::{RenderOpts, render_slide};
use wasm_bindgen::prelude::*;

const MAX_SCALE: f64 = 8.0;

/// DeckCraft's own format first, then Office Open XML — the order of DeckCraft's
/// `cmd::file::open_presentation`, without its plain-text outline import.
fn open_presentation(bytes: &[u8]) -> Result<Presentation, String> {
    if deckcraft_format::sniff(bytes) {
        return deckcraft_format::load(bytes).map_err(|e| e.to_string());
    }
    if deckcraft_pptx::sniff(bytes) {
        let mut pres = deckcraft_pptx::import(bytes).map_err(|e| e.to_string())?;
        deckcraft_format::repair(&mut pres);
        return Ok(pres);
    }
    Err("not a presentation this engine can read (expected .pptx)".into())
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

/// An open presentation.
#[wasm_bindgen]
pub struct Document {
    pres: Presentation,
}

#[wasm_bindgen]
impl Document {
    /// Open `bytes` (the format is detected from the content; `name` is kept for API parity
    /// with the other engines).
    #[wasm_bindgen(constructor)]
    pub fn new(_name: &str, bytes: Vec<u8>) -> Result<Document, JsError> {
        let pres = open_presentation(&bytes).map_err(|e| JsError::new(&format!("E_INVALID: {e}")))?;
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

    /// The fonts the slides' text is drawn in, as JSON:
    /// `[{"family":"Calibri","bold":false,"italic":false}, …]` — theme fonts resolved, bullet
    /// fonts and the theme's heading/body fonts included, de-duplicated (case-insensitive).
    #[wasm_bindgen(js_name = fontsUsed)]
    pub fn fonts_used(&self) -> String {
        let list: Vec<serde_json::Value> = fonts_used(&self.pres)
            .into_iter()
            .map(|(family, bold, italic)| serde_json::json!({ "family": family, "bold": bold, "italic": italic }))
            .collect();
        serde_json::Value::Array(list).to_string()
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

/// Make a font file (TrueType/OpenType bytes) available to every slide this engine instance
/// draws from now on. Returns the number of faces added (0: unreadable, or already loaded).
#[wasm_bindgen(js_name = addFont)]
pub fn add_font(bytes: Vec<u8>) -> usize {
    FontDb::global().add_font(bytes)
}

/// Is `family` loaded (compiled in, or added with [`add_font`])?
#[wasm_bindgen(js_name = hasFontFamily)]
pub fn has_font_family(family: &str) -> bool {
    FontDb::global().has_family(family)
}

/// (family, bold, italic) for the slides' text — after DeckCraft's `used_fonts`
/// (deckcraft-engine `fonts.rs`, MIT OR Apache-2.0), plus the run's weight and slant and the
/// theme's heading/body fonts. Table cells also ask for bold: table styles embolden header rows.
fn fonts_used(p: &Presentation) -> Vec<(String, bool, bool)> {
    let mut out: Vec<(String, bool, bool)> = Vec::new();
    let mut add = |family: String, bold: bool, italic: bool| {
        let family = family.trim().to_string();
        if !family.is_empty() && !out.iter().any(|(f, b, i)| f.eq_ignore_ascii_case(&family) && *b == bold && *i == italic) {
            out.push((family, bold, italic));
        }
    };
    for slide in &p.slides {
        let Some(ctx) = Ctx::for_slide(p, slide) else { continue };
        add(ctx.master.theme.fonts.major.latin.clone(), false, false);
        add(ctx.master.theme.fonts.minor.latin.clone(), false, false);
        deckcraft_model::walk(&slide.shapes, &mut |s, _| {
            if let Some(body) = &s.text {
                body_fonts(&ctx, s, body, false, &mut add);
            }
            if let ShapeKind::Table(t) = &s.kind {
                for cell in t.rows.iter().flat_map(|r| &r.cells) {
                    body_fonts(&ctx, s, &cell.text, true, &mut add);
                }
            }
        });
    }
    out
}

fn body_fonts(ctx: &Ctx, s: &Shape, body: &TextBody, table: bool, add: &mut dyn FnMut(String, bool, bool)) {
    for para in &body.paragraphs {
        let mut has_text = false;
        for run in para.runs.iter().filter(|r| !r.text.trim().is_empty()) {
            has_text = true;
            let r = resolve::run(ctx, s, para, &run.props);
            let family = resolve::font_family(ctx, &r);
            let (bold, italic) = (r.bold.unwrap_or(false), r.italic.unwrap_or(false));
            add(family.clone(), bold, italic);
            if table && !bold {
                add(family, true, italic);
            }
        }
        if !has_text {
            continue;
        }
        let pp = resolve::para(ctx, s, para);
        if matches!(pp.bullet, Some(Bullet::Char { .. }))
            && let Some(f) = pp.bullet_font.as_deref()
        {
            add(ctx.master.theme.font(f), false, false);
        }
    }
}

#[wasm_bindgen(js_name = engineInfo)]
pub fn engine_info() -> String {
    format!("quant-slides-engine {} (DeckCraft, MIT OR Apache-2.0)", env!("CARGO_PKG_VERSION"))
}
