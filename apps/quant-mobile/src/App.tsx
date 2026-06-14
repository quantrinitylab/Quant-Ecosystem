import React, { useCallback, useState } from 'react';
import { AppLauncherGrid } from './components/AppLauncherGrid';
import { BottomNavigation, type TabId } from './components/BottomNavigation';
import { QUANT_APPS } from './app-launcher';

// Base URL the hosted Quant web apps are served from. On a Capacitor device the
// shell opens each app in the native in-app browser; on the web build it opens a
// new tab. Override at build time via VITE_APP_BASE_URL if needed.
const APP_BASE_URL =
  (import.meta.env?.VITE_APP_BASE_URL as string | undefined) ?? 'https://app.quant.app';

/**
 * Quant mega-shell root: an app launcher grid + bottom tab bar. This is the web
 * layer that Capacitor wraps into the native iOS/Android shells.
 */
export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('home');

  const launchApp = useCallback((appId: string): void => {
    const app = QUANT_APPS.find((a) => a.id === appId);
    const route = app?.route ?? `/${appId}`;
    window.open(`${APP_BASE_URL}${route}`, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className="quant-mobile-shell">
      <main className="quant-mobile-content">
        {activeTab === 'home' ? (
          <AppLauncherGrid onAppLaunch={launchApp} />
        ) : (
          <section className="quant-mobile-placeholder">
            <p>{activeTab}</p>
          </section>
        )}
      </main>
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
