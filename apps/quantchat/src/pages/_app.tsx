import type { AppProps } from 'next/app';
import '../app/globals.css';

/**
 * Pages-Router shell. The app's primary routes use the App Router (which
 * applies globals.css via the root layout), but the legacy Pages-Router
 * pages under src/pages/ (calls, discover, settings, bitmoji) rendered
 * completely unstyled without this — the missing _app.tsx was why /calls
 * showed raw browser-default HTML.
 */
export default function QuantChatPagesApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
