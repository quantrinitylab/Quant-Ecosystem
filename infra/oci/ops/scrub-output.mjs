#!/usr/bin/env node
// Defence in depth for .github/workflows/ops-diagnose.yml.
//
// The Actions log and run summary of this repository are public. The diagnose
// script already prints names, counts and flags only; this filter sits between
// ssh and the log so a future mistake in that script cannot publish a secret.
//
// Reads stdin, writes stdout line by line, and masks:
//   * credentials inside URLs  (scheme://user:password@host -> scheme://<credentials>@host)
//   * e-mail addresses
//   * long token-like strings  (32+ of A-Z a-z 0-9 + _ =), except git SHAs and
//     SHA-256 digests (exactly 40 or 64 lowercase hex characters).
//
// '-' and '/' are deliberately not part of the token class so image names,
// paths and psql table borders are never mistaken for tokens.

import { createInterface } from 'node:readline';

const URL_CREDENTIALS = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/@\s]+@/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const TOKEN = /[A-Za-z0-9+_=]{32,}/g;
const HEX_DIGEST = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function scrubLine(line) {
  return line
    .replace(URL_CREDENTIALS, '$1<credentials>@')
    .replace(EMAIL, '<email>')
    .replace(TOKEN, (match) => (HEX_DIGEST.test(match) ? match : '<token>'));
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  process.stdout.write(`${scrubLine(line)}\n`);
}
