import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectUri = searchParams.get('redirect_uri');
  const clientId = searchParams.get('client_id');

  if (!redirectUri || !clientId) {
    const missingParam: 'client_id' | 'redirect_uri' = !clientId ? 'client_id' : 'redirect_uri';
    return invalidRequestResponse(request, missingParam);
  }

  const targetUrl = new URL('/sso', request.url);

  // Forward all params, map redirect_uri to returnTo
  searchParams.forEach((value, key) => {
    if (key === 'redirect_uri') {
      targetUrl.searchParams.set('returnTo', value);
    } else {
      targetUrl.searchParams.set(key, value);
    }
  });

  return NextResponse.redirect(targetUrl, 302);
}

/**
 * Content negotiation for the invalid-request branch.
 *
 * The `/oauth/authorize` route is the browser entry point third-party apps
 * link to ("Sign in with QuantMail"), so a human can land here with a broken link.
 * Browsers send `Accept: text/html,...`; programmatic/API callers send
 * `application/json` (or nothing / a wildcard). A bare
 * `{"error":"invalid_request"}` on a white page is a dead end for a person
 * who just clicked a sign-in button — they get a branded dark error page
 * that names the problem and says what to do next. JSON stays the default
 * (missing/ambiguous Accept) so API clients see no behavior change.
 */
function wantsHtml(request: NextRequest): boolean {
  const accept = request.headers.get('accept') ?? '';
  const htmlAt = accept.indexOf('text/html');
  if (htmlAt === -1) return false;
  const jsonAt = accept.indexOf('application/json');
  return jsonAt === -1 || htmlAt < jsonAt;
}

function invalidRequestResponse(request: NextRequest, missingParam: 'client_id' | 'redirect_uri') {
  if (wantsHtml(request)) {
    return new NextResponse(renderInvalidRequestPage(missingParam), {
      status: 400,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
  return NextResponse.json(
    {
      error: 'invalid_request',
      error_description: `Missing required parameter: ${missingParam}.`,
    },
    { status: 400, headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Branded dark error page for browser visitors. Self-contained inline styles:
 * a route-handler response carries no app stylesheet, so everything the page
 * needs is in this template. Pure black, Mail-orange accent, the canonical
 * vector M mark (same artwork as public/favicon.svg) — no divider lines.
 *
 * `missingParam` is one of two constants chosen by the caller, never user
 * input, so nothing untrusted is interpolated into the markup.
 */
function renderInvalidRequestPage(missingParam: 'client_id' | 'redirect_uri'): string {
  const paramMeaning =
    missingParam === 'client_id'
      ? 'which app is asking to sign you in'
      : 'where to send you after sign-in';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<title>Invalid sign-in request &middot; QuantMail</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #000000;
    color: #fafafa;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  main { width: 100%; max-width: 560px; text-align: center; }
  .mark { width: 56px; height: 56px; margin: 0 auto 20px; display: block; }
  .eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: #ff8c42; margin: 0 0 10px;
  }
  h1 {
    font-size: 26px; font-weight: 600; letter-spacing: -0.03em;
    margin: 0 0 12px; color: #ffffff;
  }
  p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 12px; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px; color: #ffd9b8;
    background: rgba(255, 140, 66, 0.1);
    border: 1px solid rgba(255, 140, 66, 0.25);
    border-radius: 6px; padding: 1px 6px;
  }
  .next { text-align: left; margin: 28px 0 0; }
  .next h2 {
    font-size: 12px; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; color: #71717a; margin: 0 0 12px;
  }
  .next ol { margin: 0; padding: 0; list-style: none; }
  .next li {
    display: flex; gap: 12px; align-items: flex-start;
    font-size: 14px; line-height: 1.55; color: #d4d4d8;
    margin-bottom: 12px;
  }
  .next li:last-child { margin-bottom: 0; }
  .num {
    flex: none; width: 24px; height: 24px; border-radius: 999px;
    background: rgba(255, 140, 66, 0.12);
    border: 1px solid rgba(255, 140, 66, 0.35);
    color: #ff8c42; font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .cta {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 48px; margin-top: 28px; padding: 0 28px;
    background: #ff8c42; color: #1a0d02;
    font-size: 15px; font-weight: 700; text-decoration: none;
    border-radius: 12px;
  }
  .cta:hover { background: #ffa25e; }
  .cta:focus-visible { outline: 2px solid #ff8c42; outline-offset: 3px; }
</style>
</head>
<body>
<main>
<svg class="mark" viewBox="0 0 100 100" role="img" aria-label="QuantMail">
  <defs>
    <radialGradient id="qm-ember" cx="42" cy="40" r="82" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFC189"/>
      <stop offset="0.3" stop-color="#FF9450"/>
      <stop offset="0.5" stop-color="#FF8C42"/>
      <stop offset="0.74" stop-color="#C8520F"/>
      <stop offset="1" stop-color="#6E2606"/>
    </radialGradient>
    <linearGradient id="qm-paper" x1="23" y1="30" x2="77" y2="74" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.46" stop-color="#F7F8FB"/>
      <stop offset="1" stop-color="#E3E6ED"/>
    </linearGradient>
  </defs>
  <rect x="5" y="5" width="90" height="90" rx="22" fill="url(#qm-ember)"/>
  <path d="M 30 74 A 7 7 0 0 1 23 67 L 23 42 C 23 34 27 30 32 30 C 38 32 44 47 50 47 C 56 47 62 32 68 30 C 73 30 77 34 77 42 L 77 67 A 7 7 0 0 1 70 74 Z" fill="url(#qm-paper)"/>
  <circle cx="40.5" cy="60" r="3.5" fill="#170F0A"/>
  <circle cx="59.5" cy="60" r="3.5" fill="#170F0A"/>
</svg>
<p class="eyebrow">Error 400</p>
<h1>This sign-in link is incomplete</h1>
<p>
  The link that brought you here is missing a required detail &mdash;
  the <code>${missingParam}</code> parameter (${paramMeaning}).
  Nothing was signed in, and nothing was sent anywhere.
</p>
<div class="next">
  <h2>What you can do</h2>
  <ol>
    <li>
      <span class="num" aria-hidden="true">1</span>
      <span>Go back to the app or website that sent you here and start the sign-in again &mdash; a fresh link usually fixes it.</span>
    </li>
    <li>
      <span class="num" aria-hidden="true">2</span>
      <span>If it keeps failing, let that app&rsquo;s developer know: their sign-in link is missing the <code>${missingParam}</code> parameter.</span>
    </li>
  </ol>
</div>
<a class="cta" href="/">Back to QuantMail</a>
</main>
</body>
</html>`;
}
