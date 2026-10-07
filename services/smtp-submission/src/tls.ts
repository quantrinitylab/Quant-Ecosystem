// ============================================================================
// SMTP Submission Daemon - TLS Configuration
// ============================================================================

import fs from 'node:fs';

export interface TlsKeyPair {
  key: string | Buffer;
  cert: string | Buffer;
}

/**
 * Built-in fallback 2048-bit RSA self-signed certificate for development and testing.
 * Has SAN entries for: localhost, 127.0.0.1, submission.quantmail.in, imap.quantmail.in.
 */
const DEFAULT_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDaizS3SPtILY/Y
ZjRFRrfUai8unOqP1KxNbtcEcHT2vP8sL7FCjK7/kX/acRIeHKJ290QmEDiUoL85
24ZdKsCzgU3nmhPAS44Lwfa4SQv9CPh0K9wgWdIeQGB+ZQm/L2VwHb6IfbZ6mkfw
jk5z8gfX1tbKVX0tSDLvHAaCVH2WYZN9WbFdmKhUEzwypi3ZbB5aenPYvbdBKNtF
HizWk3fhUhqPiw5pH6mTOOSzfH4V1zW3vtu/wSDb0WZfZxlmJeUX9WsDKhAlMruW
Q3PNsnMeEHBJQHSYei5i6A4ans/0c4gWRe9AU8Dfk7dHTWEzYLByqLgvHn8uC3cb
6XMFwtKbAgMBAAECggEAHbKsuLrPBDlwzTWM+ocIJHJDiXWNvdA8Po+GjOtinERa
9rG1HbfexgsLJppBSIdCn/ZXs/EgseMq6UgGznKor3FYWVXg7juLiNcprv76L+n/
/VAX1euZd+lD/kO+WyqBLIcA5S0ULD1P87Aa7Xr2jDhShY9azIRTAOw8NDTFa4xZ
gFEOTmZ+am3VlducZpdSObqggrXAdlwqJQfjZW+9riiIHcu+K1nQ75DpdZAFznfC
X6YcQmb2UQdgwN8ojHwN3n5p6/RV159LIDjvm2azuxjpQTMSNoYTMMRxpnVXkK1N
3HeEH34fyXDqIXTC6UpkLL2zINqkz5UFPHfU28xykQKBgQD/F4WhQucrohmrVffY
q37/kOVx46+Qi/OaP0Nu/AW9i8UHvHGg6XPLYDdybCYvbWjR7O/ZEntex1j0v65D
cN2+5fD/B73b5n7OUgaPv2MAQQv1GEenSyxjF4ttTGAWSPOrbA4zrE9RxLw7kR6w
Zo5RbP977GJkkTkDYB/vFKZWqwKBgQDbUmA05QRzdyZzepn7t/Ch6ECtPEYIHqa/
3+exhHoZ4toDApcnzGlxpXf4w4p4HRPNybsskpcv314iRThj3n0clWGdvm1zZQLx
7rH0r1UERGQI1vYWisH0+EoDYWuyS9WaYB7ybbeA+RCrdg4QV8WtJw6ZetZszsux
TlyfvBYz0QKBgQCr3bI32zabLET1Lh+liK4xC/O6zveLgO9ovjT1wrEvasseEjXQ
f1l37eSNoBX+IE3eGi/i5dPfIJprk/WaFKIiKxQ7D4E4dkx7P8KR+RV/p1OiF3C3
YyuNu+BBjJK0kQQzO8M5x19NrSpRS84MdZxveeuMF9CXB00NXCdH0nbbrwKBgQC7
VDP6WfagTRAZqIlneGffUsoTbZz/iHazAqMae+XywFGoKolDJBSYTlYXs6VNDMEC
j6EA5ECgUjBMI0WT/9BrHqifHKzN2GRYkqGLNkrudx/ecQUGogQiogRNuONNCfrr
fdhRByeq0JHNcet3SBD+4ZJVw5bsnwFac20nvnZUUQKBgAWz7/qEa3+QoiRQ90AN
u8HtlnYHH0ta5JouFtEOGqGMEHtxlosgP7+J/Laz1yLShumrMjjsEPXgB+sfMpME
4hROkoxCfLoJv4p0toK8rI1qsQ46cgMbIacjqf5Uk3Q5bkMANkeOGicdfFOkE1xF
DzWBtIC49ykXAInV8lPPnjhR
-----END PRIVATE KEY-----
`;

const DEFAULT_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDUzCCAjugAwIBAgIUQTFh7Pwvc/OxJhsmUeZAFajpLxIwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDkyMzEzMDA0M1oXDTM2MDky
MDEzMDA0M1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA2os0t0j7SC2P2GY0RUa31GovLpzqj9SsTW7XBHB09rz/
LC+xQoyu/5F/2nESHhyidvdEJhA4lKC/OduGXSrAs4FN55oTwEuOC8H2uEkL/Qj4
dCvcIFnSHkBgfmUJvy9lcB2+iH22eppH8I5Oc/IH19bWylV9LUgy7xwGglR9lmGT
fVmxXZioVBM8MqYt2WweWnpz2L23QSjbRR4s1pN34VIaj4sOaR+pkzjks3x+Fdc1
t77bv8Eg29FmX2cZZiXlF/VrAyoQJTK7lkNzzbJzHhBwSUB0mHouYugOGp7P9HOI
FkXvQFPA35O3R01hM2Cwcqi4Lx5/Lgt3G+lzBcLSmwIDAQABo4GcMIGZMB0GA1Ud
DgQWBBRnEoX6VyjQUS9OhZfUQmFumGsXaDAfBgNVHSMEGDAWgBRnEoX6VyjQUS9O
hZfUQmFumGsXaDAPBgNVHRMBAf8EBTADAQH/MEYGA1UdEQQ/MD2CCWxvY2FsaG9z
dIIXc3VibWlzc2lvbi5xdWFudG1haWwuaW6CEWltYXAucXVhbnRtYWlsLmluhwR/
AAABMA0GCSqGSIb3DQEBCwUAA4IBAQBLs0UVfznJyutnZ1E+9H3f9RQ/5I59qPge
Syd/OIRWHJtxetmrYHLwD3aL1j3BtayGMDiPCoRHj4aErFz2m97pYBFfmmFpUesr
qpyYXYUahEGdQq3bOvueH0i0b14yNg342P5s/5zHPzhD+UNvDHVYDXZoOK1+6Nh+
fjX5E9mPMgsRCHMnTekno8YXvcoqH6VuFWqOeQT9RJhLzPM9Jv+fzv52+6u8kIUJ
liCqiCEE2NSOcIpNBCMcxYMQsm/dbfwbjascLTqLKfiHo7OlAiPFhVA7LNHhjYbX
uKd9X0MW5+OVl1y/PoNzAzZTk/RGGo6kDdz81P2UEwMAaHl5SWMW
-----END CERTIFICATE-----
`;

/**
 * Resolves TLS key and certificate options from environment variables, files, or built-in defaults.
 */
export function resolveTlsKeyPair(
  options: {
    key?: string | Buffer;
    cert?: string | Buffer;
    keyPath?: string;
    certPath?: string;
  } = {},
): TlsKeyPair {
  let key: string | Buffer = options.key || process.env['TLS_KEY'] || '';
  let cert: string | Buffer = options.cert || process.env['TLS_CERT'] || '';

  const keyPath = options.keyPath || process.env['TLS_KEY_PATH'];
  const certPath = options.certPath || process.env['TLS_CERT_PATH'];

  if (!key && keyPath && fs.existsSync(keyPath)) {
    key = fs.readFileSync(keyPath);
  }

  if (!cert && certPath && fs.existsSync(certPath)) {
    cert = fs.readFileSync(certPath);
  }

  return {
    key: key || DEFAULT_TLS_KEY,
    cert: cert || DEFAULT_TLS_CERT,
  };
}
