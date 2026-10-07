// ============================================================================
// QuantSync - Settings Page
// Account, privacy, notifications, content prefs, muted words, blocked users
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface AccountSettings {
  email: string;
  phone: string;
  username: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  birthDate: string;
}

interface PrivacySettings {
  whoCanDM: 'everyone' | 'following' | 'nobody';
  whoCanSeePost: 'everyone' | 'followers' | 'circle';
  discoverableByEmail: boolean;
  discoverableByPhone: boolean;
  showOnlineStatus: boolean;
  allowTagging: 'everyone' | 'following' | 'nobody';
}

interface NotifSettings {
  likes: boolean;
  reposts: boolean;
  replies: boolean;
  mentions: boolean;
  follows: boolean;
  dms: boolean;
  emailDigest: 'daily' | 'weekly' | 'never';
  pushEnabled: boolean;
}

interface ContentSettings {
  showSensitive: boolean;
  autoplayVideos: boolean;
  dataUsage: 'low' | 'normal' | 'high';
  language: string;
  theme: 'light' | 'dark' | 'auto';
}

type SettingsTab = 'account' | 'privacy' | 'notifications' | 'content' | 'muted' | 'blocked';

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [account, setAccount] = useState<AccountSettings>({
    email: '',
    phone: '',
    username: '',
    displayName: '',
    bio: '',
    location: '',
    website: '',
    birthDate: '',
  });
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    whoCanDM: 'everyone',
    whoCanSeePost: 'everyone',
    discoverableByEmail: true,
    discoverableByPhone: false,
    showOnlineStatus: true,
    allowTagging: 'everyone',
  });
  const [notifs, setNotifs] = useState<NotifSettings>({
    likes: true,
    reposts: true,
    replies: true,
    mentions: true,
    follows: true,
    dms: true,
    emailDigest: 'weekly',
    pushEnabled: true,
  });
  const [content, setContent] = useState<ContentSettings>({
    showSensitive: false,
    autoplayVideos: true,
    dataUsage: 'normal',
    language: 'en',
    theme: 'auto',
  });
  const [mutedWords, setMutedWords] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<
    { id: string; name: string; handle: string; avatar: string }[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [newMutedWord, setNewMutedWord] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showDeactivate, setShowDeactivate] = useState<boolean>(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();
      if (data.account) setAccount(data.account);
      if (data.privacy) setPrivacy(data.privacy);
      if (data.notifications) setNotifs(data.notifications);
      if (data.content) setContent(data.content);
      if (data.mutedWords) setMutedWords(data.mutedWords);
      if (data.blockedUsers) setBlockedUsers(data.blockedUsers);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, privacy, notifications: notifs, content, mutedWords }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [account, privacy, notifs, content, mutedWords]);

  const addMutedWord = useCallback(() => {
    if (newMutedWord.trim() && !mutedWords.includes(newMutedWord.trim())) {
      setMutedWords((prev) => [...prev, newMutedWord.trim()]);
      setNewMutedWord('');
    }
  }, [newMutedWord, mutedWords]);

  const removeMutedWord = useCallback((word: string) => {
    setMutedWords((prev) => prev.filter((w) => w !== word));
  }, []);

  const unblockUser = useCallback(async (userId: string) => {
    setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    await fetch(`/api/users/${userId}/unblock`, { method: 'POST' });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error && !account.email) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load settings</div>
        <button onClick={fetchSettings} className="px-6 py-2 bg-blue-500 text-white rounded-full">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto min-h-screen flex bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <aside className="w-56 border-r p-4 hidden md:block sticky top-0 h-screen">
        <h2 className="font-bold text-lg mb-4">Settings</h2>
        {(
          ['account', 'privacy', 'notifications', 'content', 'muted', 'blocked'] as SettingsTab[]
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm capitalize mb-1 ${activeTab === tab ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {tab === 'muted' ? 'Muted Words' : tab === 'blocked' ? 'Blocked Accounts' : tab}
          </button>
        ))}
        <hr className="my-4" />
        <button
          onClick={() => setShowDeactivate(true)}
          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
        >
          Deactivate Account
        </button>
      </aside>

      <main className="flex-1 p-6 max-w-2xl">
        {saveSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Settings saved successfully!
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {activeTab === 'account' && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">Account Information</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Display Name</label>
              <input
                type="text"
                value={account.displayName}
                onChange={(e) => setAccount((a) => ({ ...a, displayName: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                type="text"
                value={account.username}
                onChange={(e) => setAccount((a) => ({ ...a, username: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={account.email}
                onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="tel"
                value={account.phone}
                onChange={(e) => setAccount((a) => ({ ...a, phone: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bio</label>
              <textarea
                value={account.bio}
                onChange={(e) => setAccount((a) => ({ ...a, bio: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 min-h-[80px]"
                maxLength={160}
              />
              <span className="text-xs text-gray-400">{account.bio.length}/160</span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                value={account.location}
                onChange={(e) => setAccount((a) => ({ ...a, location: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Website</label>
              <input
                type="url"
                value={account.website}
                onChange={(e) => setAccount((a) => ({ ...a, website: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">Privacy</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Who can send you DMs</label>
              <select
                value={privacy.whoCanDM}
                onChange={(e) => setPrivacy((p) => ({ ...p, whoCanDM: e.target.value as any }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="everyone">Everyone</option>
                <option value="following">People you follow</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Who can see your posts</label>
              <select
                value={privacy.whoCanSeePost}
                onChange={(e) =>
                  setPrivacy((p) => ({ ...p, whoCanSeePost: e.target.value as any }))
                }
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="everyone">Everyone</option>
                <option value="followers">Followers only</option>
                <option value="circle">Close circle</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Who can tag you</label>
              <select
                value={privacy.allowTagging}
                onChange={(e) => setPrivacy((p) => ({ ...p, allowTagging: e.target.value as any }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="everyone">Everyone</option>
                <option value="following">People you follow</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
            <label className="flex items-center justify-between py-2">
              <span className="text-sm">Discoverable by email</span>
              <input
                type="checkbox"
                checked={privacy.discoverableByEmail}
                onChange={(e) =>
                  setPrivacy((p) => ({ ...p, discoverableByEmail: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between py-2">
              <span className="text-sm">Discoverable by phone</span>
              <input
                type="checkbox"
                checked={privacy.discoverableByPhone}
                onChange={(e) =>
                  setPrivacy((p) => ({ ...p, discoverableByPhone: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between py-2">
              <span className="text-sm">Show online status</span>
              <input
                type="checkbox"
                checked={privacy.showOnlineStatus}
                onChange={(e) => setPrivacy((p) => ({ ...p, showOnlineStatus: e.target.checked }))}
              />
            </label>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">Notifications</h3>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Likes</span>
              <input
                type="checkbox"
                checked={notifs.likes}
                onChange={(e) => setNotifs((n) => ({ ...n, likes: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Reposts</span>
              <input
                type="checkbox"
                checked={notifs.reposts}
                onChange={(e) => setNotifs((n) => ({ ...n, reposts: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Replies</span>
              <input
                type="checkbox"
                checked={notifs.replies}
                onChange={(e) => setNotifs((n) => ({ ...n, replies: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Mentions</span>
              <input
                type="checkbox"
                checked={notifs.mentions}
                onChange={(e) => setNotifs((n) => ({ ...n, mentions: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Follows</span>
              <input
                type="checkbox"
                checked={notifs.follows}
                onChange={(e) => setNotifs((n) => ({ ...n, follows: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Direct messages</span>
              <input
                type="checkbox"
                checked={notifs.dms}
                onChange={(e) => setNotifs((n) => ({ ...n, dms: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Push notifications</span>
              <input
                type="checkbox"
                checked={notifs.pushEnabled}
                onChange={(e) => setNotifs((n) => ({ ...n, pushEnabled: e.target.checked }))}
              />
            </label>
            <div>
              <label className="block text-sm font-medium mb-1">Email digest</label>
              <select
                value={notifs.emailDigest}
                onChange={(e) => setNotifs((n) => ({ ...n, emailDigest: e.target.value as any }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="never">Never</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">Content Preferences</h3>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Show sensitive content</span>
              <input
                type="checkbox"
                checked={content.showSensitive}
                onChange={(e) => setContent((c) => ({ ...c, showSensitive: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between py-2 border-b">
              <span className="text-sm">Autoplay videos</span>
              <input
                type="checkbox"
                checked={content.autoplayVideos}
                onChange={(e) => setContent((c) => ({ ...c, autoplayVideos: e.target.checked }))}
              />
            </label>
            <div>
              <label className="block text-sm font-medium mb-1">Data usage</label>
              <select
                value={content.dataUsage}
                onChange={(e) => setContent((c) => ({ ...c, dataUsage: e.target.value as any }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High quality</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Theme</label>
              <select
                value={content.theme}
                onChange={(e) => setContent((c) => ({ ...c, theme: e.target.value as any }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="auto">System default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Language</label>
              <select
                value={content.language}
                onChange={(e) => setContent((c) => ({ ...c, language: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="hi">Hindi</option>
                <option value="ja">Japanese</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'muted' && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">Muted Words</h3>
            <p className="text-sm text-gray-600">
              Posts containing these words will be hidden from your feed.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMutedWord}
                onChange={(e) => setNewMutedWord(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2"
                placeholder="Add word or phrase"
                onKeyDown={(e) => e.key === 'Enter' && addMutedWord()}
              />
              <button
                onClick={addMutedWord}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {mutedWords.map((word) => (
                <span
                  key={word}
                  className="flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-full text-sm"
                >
                  {word}
                  <button
                    onClick={() => removeMutedWord(word)}
                    className="text-gray-500 hover:text-red-500"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            {mutedWords.length === 0 && <p className="text-gray-500 text-sm">No muted words.</p>}
          </div>
        )}

        {activeTab === 'blocked' && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">Blocked Accounts</h3>
            {blockedUsers.length === 0 ? (
              <p className="text-gray-500 text-sm">No blocked accounts.</p>
            ) : (
              blockedUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-3">
                    <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                    <div>
                      <div className="font-medium text-sm">{user.name}</div>
                      <div className="text-xs text-gray-500">@{user.handle}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => unblockUser(user.id)}
                    className="px-3 py-1 border rounded-full text-sm text-red-600 hover:bg-red-50"
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2 bg-blue-500 text-white rounded-full font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </main>

      {showDeactivate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-red-600 mb-4">Deactivate Account</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will temporarily disable your account. You can reactivate it by logging back in
              within 30 days.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeactivate(false)}
                className="flex-1 py-2 border rounded-full"
              >
                Cancel
              </button>
              <button className="flex-1 py-2 bg-red-500 text-white rounded-full">Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
