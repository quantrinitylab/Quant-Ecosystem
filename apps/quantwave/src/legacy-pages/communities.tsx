// ============================================================================
// QuantSync - Communities Browser Page
// Browse, search, create, and join communities with category filtering
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface Community {
  id: string;
  name: string;
  description: string;
  icon: string;
  banner: string;
  category: string;
  memberCount: number;
  postsToday: number;
  isJoined: boolean;
  isPrivate: boolean;
  rules: string[];
  createdAt: string;
}

interface CreateCommunityForm {
  name: string;
  description: string;
  category: string;
  isPrivate: boolean;
  rules: string[];
}

type Category =
  | 'All'
  | 'Technology'
  | 'Gaming'
  | 'Science'
  | 'Art'
  | 'Sports'
  | 'Music'
  | 'Finance'
  | 'Health';

const CATEGORIES: Category[] = [
  'All',
  'Technology',
  'Gaming',
  'Science',
  'Art',
  'Sports',
  'Music',
  'Finance',
  'Health',
];

const CommunitiesPage: React.FC = () => {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [trending, setTrending] = useState<Community[]>([]);
  const [joinedCommunities, setJoinedCommunities] = useState<Community[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<CreateCommunityForm>({
    name: '',
    description: '',
    category: 'Technology',
    isPrivate: false,
    rules: [''],
  });
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchCommunities = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      if (searchQuery) params.set('q', searchQuery);
      const res = await fetch(`/api/communities?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load communities');
      const data = await res.json();
      setCommunities(data.communities || []);
      setTrending(data.trending || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  const fetchJoined = useCallback(async () => {
    try {
      const res = await fetch('/api/communities/joined');
      if (res.ok) {
        const data = await res.json();
        setJoinedCommunities(data.communities || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchCommunities();
    fetchJoined();
  }, [fetchCommunities, fetchJoined]);

  const handleJoin = useCallback(
    async (communityId: string) => {
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === communityId ? { ...c, isJoined: true, memberCount: c.memberCount + 1 } : c,
        ),
      );
      try {
        await fetch(`/api/communities/${communityId}/join`, { method: 'POST' });
        fetchJoined();
      } catch {
        setCommunities((prev) =>
          prev.map((c) =>
            c.id === communityId ? { ...c, isJoined: false, memberCount: c.memberCount - 1 } : c,
          ),
        );
      }
    },
    [fetchJoined],
  );

  const handleLeave = useCallback(
    async (communityId: string) => {
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === communityId ? { ...c, isJoined: false, memberCount: c.memberCount - 1 } : c,
        ),
      );
      try {
        await fetch(`/api/communities/${communityId}/leave`, { method: 'POST' });
        fetchJoined();
      } catch {
        setCommunities((prev) =>
          prev.map((c) =>
            c.id === communityId ? { ...c, isJoined: true, memberCount: c.memberCount + 1 } : c,
          ),
        );
      }
    },
    [fetchJoined],
  );

  const handleCreateCommunity = useCallback(async () => {
    if (!createForm.name.trim() || !createForm.description.trim()) {
      setCreateError('Name and description are required');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error('Failed to create community');
      setShowCreateModal(false);
      setCreateForm({
        name: '',
        description: '',
        category: 'Technology',
        isPrivate: false,
        rules: [''],
      });
      fetchCommunities();
      fetchJoined();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }, [createForm, fetchCommunities, fetchJoined]);

  const addRule = useCallback(() => {
    setCreateForm((prev) => ({ ...prev, rules: [...prev.rules, ''] }));
  }, []);

  const updateRule = useCallback((index: number, value: string) => {
    setCreateForm((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? value : r)),
    }));
  }, []);

  const removeRule = useCallback((index: number) => {
    setCreateForm((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
  }, []);

  if (loading && communities.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
        <span className="ml-3 text-gray-500">Loading communities...</span>
      </div>
    );
  }

  if (error && communities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load communities</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={fetchCommunities}
          className="px-6 py-2 bg-purple-500 text-white rounded-full"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto min-h-screen flex bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <aside className="w-64 border-r p-4 hidden lg:block sticky top-0 h-screen overflow-y-auto">
        <h3 className="font-bold text-gray-700 mb-3">Your Communities</h3>
        {joinedCommunities.length === 0 ? (
          <p className="text-sm text-gray-500">You haven't joined any communities yet.</p>
        ) : (
          <div className="space-y-2">
            {joinedCommunities.map((c) => (
              <a
                key={c.id}
                href={`/community/${c.id}`}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50"
              >
                <img src={c.icon} alt="" className="w-8 h-8 rounded-full" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-gray-500">
                    {c.memberCount.toLocaleString()} members
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </aside>

      <main className="flex-1 max-w-3xl">
        <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold">Communities</h1>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-purple-500 text-white rounded-full text-sm font-medium hover:bg-purple-600"
            >
              + Create
            </button>
          </div>
          <div className="relative mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search communities..."
              className="w-full border rounded-full px-4 py-2 pl-10 text-sm"
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {trending.length > 0 && (
          <section className="px-4 py-4 border-b">
            <h2 className="font-bold text-lg mb-3">Trending Communities</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {trending.map((c) => (
                <div key={c.id} className="min-w-[200px] border rounded-xl p-3 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <img src={c.icon} alt="" className="w-10 h-10 rounded-full" />
                    <div>
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500">
                        {c.memberCount.toLocaleString()} members
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-2">{c.description}</p>
                  <button
                    onClick={() => (c.isJoined ? handleLeave(c.id) : handleJoin(c.id))}
                    className={`w-full py-1 rounded-full text-xs font-medium ${
                      c.isJoined
                        ? 'border border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-600'
                        : 'bg-purple-500 text-white hover:bg-purple-600'
                    }`}
                  >
                    {c.isJoined ? 'Joined' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="px-4 py-4">
          {communities.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🏘️</div>
              <h3 className="text-lg font-semibold text-gray-700">No communities found</h3>
              <p className="text-gray-500 mt-1">Try a different category or create your own!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {communities.map((community) => (
                <div
                  key={community.id}
                  className="border rounded-xl p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <img src={community.icon} alt="" className="w-12 h-12 rounded-full" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold">{community.name}</h3>
                          {community.isPrivate && (
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Private</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {community.description}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>{community.memberCount.toLocaleString()} members</span>
                          <span>{community.postsToday} posts today</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {community.category}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        community.isJoined ? handleLeave(community.id) : handleJoin(community.id)
                      }
                      className={`px-4 py-1.5 rounded-full text-sm font-medium flex-shrink-0 ${
                        community.isJoined
                          ? 'border border-gray-300 hover:border-red-300 hover:text-red-600'
                          : 'bg-purple-500 text-white hover:bg-purple-600'
                      }`}
                    >
                      {community.isJoined ? 'Joined' : 'Join'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Create Community</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ✕
                </button>
              </div>
              {createError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {createError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Community name"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 min-h-[80px]"
                    placeholder="What's this community about?"
                    maxLength={500}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="private"
                    checked={createForm.isPrivate}
                    onChange={(e) => setCreateForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                  />
                  <label htmlFor="private" className="text-sm">
                    Private community (invite only)
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rules</label>
                  {createForm.rules.map((rule, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={rule}
                        onChange={(e) => updateRule(idx, e.target.value)}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm"
                        placeholder={`Rule ${idx + 1}`}
                      />
                      {createForm.rules.length > 1 && (
                        <button onClick={() => removeRule(idx)} className="text-red-500">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addRule} className="text-purple-500 text-sm font-medium">
                    + Add rule
                  </button>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 border rounded-full font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCommunity}
                  disabled={creating}
                  className="flex-1 py-2 bg-purple-500 text-white rounded-full font-medium hover:bg-purple-600 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunitiesPage;
