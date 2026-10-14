#!/usr/bin/env node
// Generates engines/licenses/NOTICES.txt — the third-party notices shipped next to the engine
// bundle (served at /engines/docs/<version>/licenses/NOTICES.txt and linked from the preview).
//
// It lists every package compiled into the wasm engines (normal and build dependencies
// reachable on wasm32-unknown-unknown, from each engine's Cargo.lock) with its licence
// expression, then the licence, notice and font-licence files found in their sources,
// de-duplicated. Upstream NOTICE files (Apache-2.0 §4(d)) and the OFL texts of the fonts the
// engines embed are included, as are the fonts served next to the engines (engines/fonts/fonts.txt)
// with their licence texts (engines/fonts/licenses/). Re-run after changing any engine Cargo.lock
// or the font list:
//
//   node engines/scripts/notices.mjs          # rewrite
//   node engines/scripts/notices.mjs --check  # exit 1 when the committed file is stale
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = ['quant-pdf', 'quant-word', 'quant-slides', 'quant-sheets'];
const OUT = join(ROOT, 'licenses', 'NOTICES.txt');
const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyright|unlicense)([-_.].*)?$|^ofl[-_.].*\.txt$|^license_.*$/i;

function metadata(engine) {
  const out = execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--locked', '--filter-platform', 'wasm32-unknown-unknown', '--manifest-path', join(ROOT, engine, 'Cargo.toml')],
    { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(out.toString());
}

/**
 * Licence-like files in `dir` (top level) plus `assets/`, and every .txt beside bundled fonts
 * (`fonts/`, `assets/fonts/`: OFL, UFL and the like, whatever their file names).
 */
function licenceFiles(dir) {
  const found = [];
  for (const sub of ['', 'assets', 'fonts', join('assets', 'fonts')]) {
    const d = join(dir, sub);
    if (!existsSync(d) || !statSync(d).isDirectory()) continue;
    const fontDir = sub.endsWith('fonts');
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if ((LICENSE_FILE.test(name) || (fontDir && /\.txt$/i.test(name))) && statSync(p).isFile()) found.push(p);
    }
  }
  return found;
}

// Standard texts for packages that publish an SPDX expression but no licence file.
const STANDARD = {
  MIT: `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
  'BSD-3-Clause': `BSD 3-Clause License

Redistribution and use in source and binary forms, with or without modification, are permitted
provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions
   and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of
   conditions and the following disclaimer in the documentation and/or other materials provided
   with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to
   endorse or promote products derived from this software without specific prior written
   permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
};

/** For a git checkout, the repository root (…/git/checkouts/<repo>-<hash>/<rev>). */
function gitRoot(dir) {
  const parts = dir.split(sep);
  const i = parts.lastIndexOf('checkouts');
  return i >= 0 && parts.length > i + 2 ? parts.slice(0, i + 3).join(sep) : null;
}

/** Code-point order: the same on every machine (localeCompare depends on ICU data). */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function label(pkg) {
  return `${pkg.name} ${pkg.version}`;
}

/** "Jane Doe <jane@example.com>" -> "Jane Doe" (plain-text output; drops the first "<…>" part). */
function withoutEmail(author) {
  const open = author.indexOf('<');
  const close = open === -1 ? -1 : author.indexOf('>', open);
  return close === -1 ? author : author.slice(0, open).trimEnd() + author.slice(close + 1);
}

const packages = new Map(); // id -> { pkg, engines:Set }
for (const engine of ENGINES) {
  const meta = metadata(engine);
  const byId = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const rootId = meta.resolve.root;
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const node = nodes.get(queue.shift());
    for (const dep of node?.deps ?? []) {
      if (!dep.dep_kinds.some((k) => k.kind !== 'dev')) continue;
      if (seen.has(dep.pkg)) continue;
      seen.add(dep.pkg);
      queue.push(dep.pkg);
    }
  }
  seen.delete(rootId);
  for (const id of seen) {
    const entry = packages.get(id) ?? { pkg: byId.get(id), engines: new Set() };
    entry.engines.add(engine.replace(/^quant-/, ''));
    packages.set(id, entry);
  }
}

const sorted = [...packages.values()].sort((a, b) => cmp(a.pkg.name, b.pkg.name) || cmp(a.pkg.version, b.pkg.version));
const texts = new Map(); // hash -> { file, text, hash, users:Set }
const missing = [];
for (const { pkg } of sorted) {
  const dir = dirname(pkg.manifest_path);
  let files = licenceFiles(dir);
  if (pkg.license_file) files.push(resolve(dir, pkg.license_file));
  const root = gitRoot(dir);
  if (root && root !== dir) files = files.concat(licenceFiles(root));
  files = [...new Set(files)].filter((f) => existsSync(f));
  if (!files.length) missing.push(pkg);
  for (const f of files) {
    const text = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim();
    const hash = createHash('sha256').update(text.replace(/\s+/g, ' ')).digest('hex');
    const entry = texts.get(hash) ?? { file: f.split(sep).pop(), text, hash, users: new Set() };
    entry.users.add(label(pkg));
    texts.set(hash, entry);
  }
}

// Fonts served as files next to the engines (engines/fonts/fonts.txt, craft-fonts manifest lines).
const FONTS_LIST = join(ROOT, 'fonts', 'fonts.txt');
const fontLines = readFileSync(FONTS_LIST, 'utf8').split('\n');
const fontsRev = (fontLines.find((l) => /^rev [0-9a-f]{40}$/.test(l.trim())) || '').trim().slice(4);
const fonts = new Map(); // family -> { styles: [], licence, licenceFile, source }
for (const line of fontLines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes(' | '))) {
  const [family, style, , , licence, licenceFile, , source] = line.split(' | ').map((f) => f.trim());
  const entry = fonts.get(family) ?? { styles: [], licence, licenceFile, source: (source || '').replace(/#.*$/, '') };
  entry.styles.push(style);
  fonts.set(family, entry);
}
for (const [family, { licenceFile }] of fonts) {
  const f = join(ROOT, 'fonts', 'licenses', licenceFile.replace(/^fonts\//, ''));
  if (!existsSync(f)) {
    console.error(`no licence text for the font ${family}: ${relative(process.cwd(), f)}`);
    process.exit(1);
  }
  const text = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim();
  const hash = createHash('sha256').update(text.replace(/\s+/g, ' ')).digest('hex');
  const entry = texts.get(hash) ?? { file: f.split(sep).pop(), text, hash, users: new Set() };
  entry.users.add(`font ${family}`);
  texts.set(hash, entry);
}

const lines = [];
lines.push('Quant Docs engines — third-party notices');
lines.push('');
lines.push('The Quant Docs preview engines (PDF, documents, presentations, spreadsheets) are WebAssembly');
lines.push('builds of open-source components, chiefly the PdfCraft, WordCraft, DeckCraft and GridCraft');
lines.push('engine crates by the ArtCraft contributors (https://github.com/storytold), licensed under the');
lines.push('MIT licence or the Apache License 2.0, at your option. Quant is not affiliated with or');
lines.push('endorsed by ArtCraft. Our adapters live in engines/ of the Quant Ecosystem repository.');
lines.push('');
lines.push('Generated by engines/scripts/notices.mjs from the engines\' Cargo.lock files. Do not edit by hand.');
lines.push('');
lines.push(`== Packages (${sorted.length}) ==`);
lines.push('');
for (const { pkg, engines } of sorted) {
  const src = pkg.repository || (pkg.source || '').replace(/^git\+/, '').replace(/\?.*$/, '') || '';
  lines.push(`${label(pkg)} — ${pkg.license || (pkg.license_file ? 'see licence file' : 'UNKNOWN')} — ${src} [${[...engines].sort().join(', ')}]`);
}
if (missing.length) {
  lines.push('');
  lines.push('Packages without a licence file in their published source (licence by the SPDX expression above;');
  lines.push('the standard texts of those licences are reproduced below):');
  for (const pkg of missing.sort((a, b) => cmp(a.name, b.name))) {
    const authors = (pkg.authors || []).map(withoutEmail).join(', ');
    lines.push(`  ${label(pkg)} — ${pkg.license || 'UNKNOWN'} — Copyright (c) ${authors || `the ${pkg.name} authors`}`);
  }
  // Apache-2.0 has a licence file in the texts below already (many packages ship it).
  const needed = Object.keys(STANDARD).filter((id) => missing.some((p) => new RegExp(`(^|[ (])${id}($|[ )])`).test(p.license || '')));
  for (const id of needed) {
    lines.push('');
    lines.push(`Standard ${id} text:`);
    lines.push('');
    lines.push(STANDARD[id]);
  }
}
lines.push('');
lines.push(`== Fonts served with the engines (${fonts.size} families) ==`);
lines.push('');
lines.push(`From craft-fonts (https://github.com/storytold/craft-fonts) at ${fontsRev || 'UNKNOWN'}; under fonts/ next to`);
lines.push('the engines, each folder with its licence text. They are handed to an engine when a document uses them.');
lines.push('');
for (const [family, { styles, licence, source }] of [...fonts].sort((a, b) => cmp(a[0], b[0]))) {
  lines.push(`${family} (${styles.join(', ')}) — ${licence} — ${source}`);
}
lines.push('');
lines.push(`== Licence, notice and font-licence texts (${texts.size}, de-duplicated) ==`);
const entries = [...texts.values()].sort((a, b) => b.users.size - a.users.size || cmp(a.file, b.file) || cmp(a.hash, b.hash));
for (const e of entries) {
  lines.push('');
  lines.push('-'.repeat(100));
  lines.push(`${e.file} — from: ${[...e.users].sort().join(', ')}`);
  lines.push('-'.repeat(100));
  lines.push('');
  lines.push(e.text);
}
lines.push('');
const output = lines.join('\n');

const unknown = sorted.filter(({ pkg }) => !pkg.license && !pkg.license_file);
if (unknown.length) {
  console.error(`packages without licence metadata: ${unknown.map(({ pkg }) => label(pkg)).join(', ')}`);
  process.exit(1);
}
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== output) {
    console.error(`${relative(process.cwd(), OUT)} is stale: run node engines/scripts/notices.mjs`);
    process.exit(1);
  }
  console.log('notices up to date');
} else {
  writeFileSync(OUT, output);
  console.log(`wrote ${relative(process.cwd(), OUT)}: ${sorted.length} packages, ${texts.size} texts, ${(output.length / 1024).toFixed(0)} KiB; ${missing.length} without licence files`);
}
