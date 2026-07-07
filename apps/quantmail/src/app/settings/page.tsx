'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppShell, Card, Button, Input, FormField, TextArea } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { apiClient } from '../../services/api-client';

export default function SettingsPage() {
  const [profile, setProfile] = useState({ displayName: '', email: '', avatar: '' });
  const [emailPrefs, setEmailPrefs] = useState({ signature: '', autoReply: false });
  const [notifications, setNotifications] = useState({ email: true, push: true, desktop: false });
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Reflect the persisted theme (set pre-paint by the layout script) in the UI.
  useEffect(() => {
    try {
      const saved = (localStorage.getItem('quant-theme') as 'light' | 'dark' | 'system') || 'dark';
      setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      const response = await apiClient.getUserInfo();
      if (response.success && response.data) {
        setProfile({
          displayName: response.data.displayName || '',
          email: response.data.email || '',
          avatar: '',
        });
      }
    };
    loadProfile();
  }, []);

  const handleSaveProfile = useCallback(async () => {
    setSaveStatus('saving');
    // Profile update would be an API call
    setTimeout(() => setSaveStatus('saved'), 500);
  }, []);

  const handleThemeChange = useCallback((newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    if (typeof document === 'undefined') return;
    try {
      localStorage.setItem('quant-theme', newTheme);
    } catch {
      /* ignore */
    }
    // The design tokens live under the `.dark` class (globals.css). Resolve
    // 'system' against the OS preference and toggle the class accordingly.
    const isDark =
      newTheme === 'dark' ||
      (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full overflow-y-auto p-4 md:p-6 space-y-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Profile */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Profile</h2>
          <div className="space-y-4 max-w-md">
            <FormField label="Display Name">
              <Input
                value={profile.displayName}
                onChange={(e) => setProfile((prev) => ({ ...prev, displayName: e.target.value }))}
              />
            </FormField>
            <FormField label="Email">
              <Input value={profile.email} readOnly disabled />
            </FormField>
            <Button variant="primary" onClick={handleSaveProfile}>
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'saved'
                  ? 'Saved!'
                  : 'Save Profile'}
            </Button>
          </div>
        </Card>

        {/* Email Preferences */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Email Preferences</h2>
          <div className="space-y-4 max-w-md">
            <FormField label="Signature">
              <TextArea
                value={emailPrefs.signature}
                onChange={(e) => setEmailPrefs((prev) => ({ ...prev, signature: e.target.value }))}
                placeholder="Your email signature..."
                rows={4}
              />
            </FormField>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={emailPrefs.autoReply}
                onChange={(e) =>
                  setEmailPrefs((prev) => ({ ...prev, autoReply: e.target.checked }))
                }
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Enable auto-reply when away</span>
            </label>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Notifications</h2>
          <div className="space-y-3 max-w-md">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.email}
                onChange={(e) => setNotifications((prev) => ({ ...prev, email: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Email notifications</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.push}
                onChange={(e) => setNotifications((prev) => ({ ...prev, push: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Push notifications</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.desktop}
                onChange={(e) =>
                  setNotifications((prev) => ({ ...prev, desktop: e.target.checked }))
                }
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Desktop notifications</span>
            </label>
          </div>
        </Card>

        {/* Theme */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Theme</h2>
          <div className="flex gap-3">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <Button
                key={t}
                variant={theme === t ? 'primary' : 'secondary'}
                onClick={() => handleThemeChange(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </Card>
      </PageTransition>
    </AppShell>
  );
}
