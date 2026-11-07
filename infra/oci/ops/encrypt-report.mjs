#!/usr/bin/env node
// Encrypts stdin for the ops key and writes an armoured block to stdout.
//
// Why: this repository is public, so its Actions logs are too. The VM report lists
// container tags, ports, row counts and secret NAMES. That is useful to the owner
// and unhelpful to anyone scanning for weak spots, so the workflow prints only this
// encrypted block. The private key never enters the repository or GitHub.
//
// Scheme: a fresh AES-256-GCM key per report, wrapped with RSA-OAEP (SHA-256).
//
//   node encrypt-report.mjs infra/oci/ops/report-public-key.pem < report.txt > report.enc.txt
//   node decrypt-report.mjs <private-key.pem> report.enc.txt       (or a downloaded job log)

import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('usage: encrypt-report.mjs <public-key.pem>');
  process.exit(2);
}

let publicKey;
try {
  publicKey = createPublicKey(readFileSync(keyPath));
} catch {
  console.error(`cannot read a public key from ${keyPath}`);
  process.exit(2);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const plain = Buffer.concat(chunks);

const dataKey = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
const tag = cipher.getAuthTag();
const wrappedKey = publicEncrypt(
  { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  dataKey,
);

const envelope = Buffer.from(
  JSON.stringify({
    v: 1,
    alg: 'RSA-OAEP-256+A256GCM',
    wrappedKey: wrappedKey.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }),
);

const lines = envelope.toString('base64').match(/.{1,76}/g) ?? [];
process.stdout.write(`-----BEGIN QUANT OPS REPORT-----\n${lines.join('\n')}\n-----END QUANT OPS REPORT-----\n`);
