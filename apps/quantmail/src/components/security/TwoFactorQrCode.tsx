'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * The enrolment QR, drawn here.
 *
 * The `otpauth://` URI contains the shared TOTP secret. The previous version of
 * the security page handed that URI to `api.qrserver.com` to have an image
 * drawn, which put every user's second factor in a third party's access log. So
 * the modules are computed locally and emitted as one SVG path — no network
 * call, no canvas, no data URI.
 */
interface TwoFactorQrCodeProps {
  /** The `otpauth://totp/...` URI. Must be ASCII; percent-encode before this. */
  value: string;
  /** Rendered edge length in CSS pixels. The module grid scales to fit. */
  size?: number;
  className?: string;
}

/** The spec's quiet zone. Scanners lose the finder patterns without it. */
const QUIET_ZONE_MODULES = 4;

/**
 * Dark-on-light, in fixed hex rather than theme variables. A QR inverted onto
 * our dark canvas reads on some phones and not others, and "it scanned on mine"
 * is not a standard worth holding a login behind.
 */
const MODULE_COLOR = '#111318';
const FIELD_COLOR = '#FFFFFF';

export function TwoFactorQrCode({ value, size = 200, className }: TwoFactorQrCodeProps) {
  const drawing = useMemo(() => {
    try {
      // 0 picks the smallest version that fits; 'M' recovers ~15% of the symbol
      // and is what authenticator apps' own documentation assumes.
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();

      const count = qr.getModuleCount();
      const span = count + QUIET_ZONE_MODULES * 2;
      const runs: string[] = [];

      // Horizontal run-length rather than one <rect> per module: a version-6
      // symbol is 1,681 cells, and collapsing runs turns that into a few hundred
      // path commands instead of a few hundred DOM nodes.
      for (let row = 0; row < count; row += 1) {
        let start = -1;
        for (let col = 0; col <= count; col += 1) {
          const dark = col < count && qr.isDark(row, col);
          if (dark && start === -1) start = col;
          if (!dark && start !== -1) {
            const width = col - start;
            runs.push(
              `M${start + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h${width}v1h-${width}z`,
            );
            start = -1;
          }
        }
      }

      return { span, path: runs.join('') };
    } catch {
      // Overlong data or an unencodable character. The caller always shows the
      // manual-entry secret too, so a missing QR costs a scan, not the enrolment.
      return null;
    }
  }, [value]);

  if (!drawing) return null;

  return (
    <svg
      viewBox={`0 0 ${drawing.span} ${drawing.span}`}
      width={size}
      height={size}
      // Modules are integer-aligned in viewBox units; without this the browser
      // antialiases every edge and low-end cameras start missing the timing row.
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for enrolling your authenticator app. The same secret is written out below for manual entry."
      className={className}
    >
      <rect width={drawing.span} height={drawing.span} fill={FIELD_COLOR} />
      <path d={drawing.path} fill={MODULE_COLOR} />
    </svg>
  );
}
