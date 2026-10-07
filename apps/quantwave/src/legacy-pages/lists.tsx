// ============================================================================
// QuantSync - Lists Page
// User lists: create, add/remove members, per-list timeline, discover public
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface UserList {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  memberCount: number;
  followerCount: number;
  owner: { id: string; name: string; handle: string; avatar: string };
  isPinned: boolean;
  isFollowing: boolean;
  coverImage?: string;
  createdAt: string;
}

interface ListPost {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  content: string;
  likes: number;
  replies: number;
  createdAt: string;
}

type ListTab = 'your' | 'following' | 'discover';

const ListsPage: React.FC = () => {
  const [lists, setLists] = useState<UserList[]>([]);
  const [followingLists, setFollowingLists] = useState<UserList[]>([]);
  const [discoverLists, setDiscoverLists] = useState<UserList[]>([]);
  const [activeTab, setActiveTab] = useState<ListTab>('your');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('');
  const [createDesc, setCreateDesc] = useState<string>('');
  const [createPublic, setCreatePublic] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [selectedList, setSelectedList] = useState<UserList | null>(null);
  const [listPosts, setListPosts] = useState<ListPost[]>([]);
  const [postsLoading, setPostsLoading] = useState<boolean>(false);

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const [ownRes, followRes, discoverRes] = await Promise.all([
        fetch('/api/lists'),
        fetch('/api/lists/following'),
        fetch('/api/lists/discover'),
      ]);
      if (ownRes.ok) setLists((await ownRes.json()).lists || []);
      if (followRes.ok) setFollowingLists((await followRes.json()).lists || []);
      if (discoverRes.ok) setDiscoverLists((await discoverRes.json()).lists || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const fetchListPosts = useCallback(async (listId: string) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/lists/${listId}/posts`);
      if (res.ok) {
        const data = await res.json();
        setListPosts(data.posts || []);
      }
    } catch {
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const handleCreateList = useCallback(async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName, description: createDesc, isPublic: createPublic }),
      });
      if (!res.ok) throw new Error('Failed to create list');
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
      fetchLists();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }, [createName, createDesc, createPublic, fetchLists]);

  const handleFollowList = useCallback(async (listId: string) => {
    const updateList = (items: UserList[]) =>
      items.map((l) => (l.id === listId ? { ...l, isFollowing: !l.isFollowing } : l));
    setDiscoverLists(updateList);
    setFollowingLists(updateList);
    await fetch(`/api/lists/${listId}/follow`, { method: 'POST' });
  }, []);

  const handlePinList = useCallback(async (listId: string) => {
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, isPinned: !l.isPinned } : l)));
    await fetch(`/api/lists/${listId}/pin`, { method: 'POST' });
  }, []);

  const handleDeleteList = useCallback(async (listId: string) => {
    await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
    setLists((prev) => prev.filter((l) => l.id !== listId));
  }, []);

  const openList = useCallback(
    (list: UserList) => {
      setSelectedList(list);
      fetchListPosts(list.id);
    },
    [fetchListPosts],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (selectedList) {
    return (
      <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
        <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSelectedList(null)}
            className="text-gray-600 hover:text-gray-900"
          >
            ←{' '}
          </button>
          <div>
            <h1 className="font-bold">{selectedList.name}</h1>
            <p className="text-xs text-gray-500">{selectedList.memberCount} members</p>
          </div>
        </header>
        {postsLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : listPosts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-gray-500">No posts from list members yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {listPosts.map((post) => (
              <div key={post.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex gap-2">
                  <img src={post.authorAvatar} alt="" className="w-8 h-8 rounded-full" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-sm">{post.authorName}</span>
                      <span className="text-gray-500 text-xs">@{post.authorHandle}</span>
                    </div>
                    <p className="text-sm text-gray-900 mt-0.5">{post.content}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span>❤️ {post.likes}</span>
                      <span>💬 {post.replies}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Lists</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium"
          >
            + Create
          </button>
        </div>
        <div className="flex border-b">
          {(['your', 'following', 'discover'] as ListTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-center text-sm font-medium capitalize ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
            >
              {tab === 'your' ? 'Your Lists' : tab}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {activeTab === 'your' && (
        <div className="divide-y">
          {lists.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📋</div>
              <h3 className="text-lg font-semibold text-gray-700">No lists yet</h3>
              <p className="text-gray-500 mt-1">Create a list to organize your feed.</p>
            </div>
          ) : (
            lists
              .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
              .map((list) => (
                <div
                  key={list.id}
                  onClick={() => openList(list)}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {list.isPinned && <span className="text-xs">📌</span>}
                        <h3 className="font-bold text-sm">{list.name}</h3>
                        {!list.isPublic && (
                          <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">Private</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{list.description}</p>
                      <span className="text-xs text-gray-500">{list.memberCount} members</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePinList(list.id);
                        }}
                        className="p-1 hover:bg-gray-100 rounded text-xs"
                      >
                        {list.isPinned ? '📌' : '📍'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                        className="p-1 hover:bg-red-50 rounded text-xs text-red-500"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {activeTab === 'following' && (
        <div className="divide-y">
          {followingLists.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500">Not following any lists</p>
            </div>
          ) : (
            followingLists.map((list) => (
              <div
                key={list.id}
                onClick={() => openList(list)}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
              >
                <h3 className="font-bold text-sm">{list.name}</h3>
                <p className="text-xs text-gray-600">{list.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <img src={list.owner.avatar} alt="" className="w-4 h-4 rounded-full" />
                  <span className="text-xs text-gray-500">by {list.owner.name}</span>
                  <span className="text-xs text-gray-500">{list.memberCount} members</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'discover' && (
        <div className="divide-y">
          {discoverLists.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500">No public lists to discover</p>
            </div>
          ) : (
            discoverLists.map((list) => (
              <div key={list.id} className="px-4 py-3 flex items-center justify-between">
                <div onClick={() => openList(list)} className="cursor-pointer flex-1">
                  <h3 className="font-bold text-sm">{list.name}</h3>
                  <p className="text-xs text-gray-600">{list.description}</p>
                  <span className="text-xs text-gray-500">{list.followerCount} followers</span>
                </div>
                <button
                  onClick={() => handleFollowList(list.id)}
                  className={`px-3 py-1 rounded-full text-xs ${list.isFollowing ? 'border' : 'bg-blue-500 text-white'}`}
                >
                  {list.isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Create List</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="List name"
                maxLength={50}
              />
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[60px]"
                placeholder="Description (optional)"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createPublic}
                  onChange={(e) => setCreatePublic(e.target.checked)}
                />
                Make it public
              </label>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 border rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={creating || !createName.trim()}
                className="flex-1 py-2 bg-blue-500 text-white rounded-full disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListsPage;
