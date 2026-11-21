'use strict';

// QC-F-155 — Content-Security-Policy (Report-Only, Slice-1) for QuantChat web.
//
// This module is the SINGLE source of the CSP directives for the web app.
// `next.config.js` is plain CommonJS that Node loads directly, so the policy
// lives here as plain JS too: the config can `require` it without a build
// step, and vitest can read the same map for the parity test against
// `@quant/security`'s CSPGenerator (see src/__tests__/security-headers.test.ts).
// The generator itself cannot be required from the config — it ships as TS
// ESM source and its `generate()` injects a fresh random nonce on every call,
// which no rendered script would ever match — so the generator is pinned as
// the policy source through that parity test instead, never at runtime.
//
// Every directive below is census-backed (specialist-qc-f-155-buildprep.md):
//   - Browser -> API traffic is same-origin only (the Next proxy is the only
//     thing that fetches a backend URL), so `connect-src 'self'` covers it.
//   - Chat WebSocket is same-origin by design, but the deployed LiveKit host
//     and any NEXT_PUBLIC_WS_URL override come from env, so `connect-src`
//     carries the scheme-wide `wss:` allowance for Slice-1; Slice-2 narrows
//     it to the real host once ops confirms it.
//   - Media is `data:` (stories/avatar), `blob:` (camera capture previews),
//     or the own-storage host the backend media-URL validator already
//     restricts uploads to — no third-party media host can load.
//   - Inline styles are structural (the brand <style> element, style props,
//     framer-motion), and Next's inline bootstrap scripts ship without a
//     nonce (there is no middleware), so script/style keep 'unsafe-inline'
//     in Slice-1. There is NO 'unsafe-eval' anywhere: app code has no
//     eval/new Function; 'wasm-unsafe-eval' exists only so the self-hosted
//     background-blur WASM can compile.
//   - No `report-uri`/`report-to`: no CSP report collector exists in the
//     repo, and pointing reports at a phantom route would only manufacture
//     404 noise. The collector is Slice-2 work.
// Slice-1 is Report-Only on purpose: it blocks nothing, it maps the real
// violations. Enforcing is a separate, later package.

const CSP_MEDIA_HOST = 'https://quantchat-media.s3.amazonaws.com';

// Ordered [directive, values] pairs. Order is load-bearing: the parity test
// feeds this map to CSPGenerator in this order and compares the emitted
// string byte-for-byte.
const CSP_DIRECTIVES = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:', CSP_MEDIA_HOST]],
  ['media-src', ["'self'", 'data:', 'blob:', CSP_MEDIA_HOST]],
  ['font-src', ["'self'"]],
  ['connect-src', ["'self'", 'wss:', CSP_MEDIA_HOST]],
  ['worker-src', ["'self'", 'blob:']],
  ['frame-src', ["'self'"]],
  ['child-src', ["'self'", 'blob:']],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
];

function buildCspValue() {
  return CSP_DIRECTIVES.map(([name, values]) => [name, ...values].join(' ')).join('; ');
}

function buildCspHeader() {
  return { key: 'Content-Security-Policy-Report-Only', value: buildCspValue() };
}

module.exports = { CSP_MEDIA_HOST, CSP_DIRECTIVES, buildCspValue, buildCspHeader };
