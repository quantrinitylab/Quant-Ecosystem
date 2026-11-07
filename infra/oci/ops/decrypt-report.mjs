#!/usr/bin/env node
// Decrypts a report produced by encrypt-report.mjs. Runs on the owner's machine only.
//
//   node decrypt-report.mjs <private-key.pem> <file>      file may be a raw block or a
//                                                         downloaded Actions job log
// The block is located between its BEGIN and END markers. GitHub prefixes every log line
// with a timestamp and may start the file with a byte-order mark; both are stripped.

import { constants, createDecipheriv, createPrivateKey, privateDecrypt } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [keyPath, inputPath] = process.argv.slice(2);
if (!keyPath || !inputPath) {
  console.error('usage: decrypt-report.mjs <private-key.pem> <file>');
  process.exit(2);
}

const BEGIN = '-----BEGIN QUANT OPS REPORT-----';
const END = '-----END QUANT OPS REPORT-----';
const text = readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
const start = text.indexOf(BEGIN);
const stop = text.indexOf(END);
if (start < 0 || stop < start) {
  console.error('no encrypted report block found in the input');
  process.exit(1);
}

const body = text
  .slice(start + BEGIN.length, stop)
  .split(/\r?\n/)
  .map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, '').trim())
  .join('');

const envelope = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
if (envelope.v !== 1 || envelope.alg !== 'RSA-OAEP-256+A256GCM') {
  console.error('unsupported report format');
  process.exit(1);
}

const dataKey = privateDecrypt(
  { key: createPrivateKey(readFileSync(keyPath)), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from(envelope.wrappedKey, 'base64'),
);
const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(envelope.iv, 'base64'));
decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
process.stdout.write(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]));
