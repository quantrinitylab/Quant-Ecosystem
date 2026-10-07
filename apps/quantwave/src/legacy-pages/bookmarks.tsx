// ============================================================================
// QuantSync - Bookmarks Page
// Saved posts with folder organization, search, sort
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface BookmarkedPost {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  content: string;
  media: { url: string; type: string }[];
  likes: number;
  replies: number;
  bookmarkedAt: string;
  folderId?: string;
}

interface BookmarkFolder {
  id: string;
  name: string;
  count: number;
  isDefault: boolean;
}

type SortBy = 'recent' | 'oldest' | 'popular';

const BookmarksPage: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<BookmarkedPost[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [showCreateFolder, setShowCreateFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');

  const fetchBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ sort: sortBy });
      if (selectedFolder) params.set('folder', selectedFolder);
      if (searchQuery) params.set('q', searchQuery);
      const [bookmarksRes, foldersRes] = await Promise.all([
        fetch(`/api/bookmarks?${params.toString()}`),
        fetch('/api/bookmarks/folders'),
      ]);
      if (!bookmarksRes.ok) throw new Error('Failed to load bookmarks');
      const bookmarksData = await bookmarksRes.json();
      const foldersData = await foldersRes.json();
      setBookmarks(bookmarksData.bookmarks || []);
      setFolders(foldersData.folders || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedFolder, sortBy, searchQuery]);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const handleRemoveBookmark = useCallback(async (postId: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== postId));
    await fetch(`/api/posts/${postId}/bookmark`, { method: 'DELETE' });
  }, []);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/bookmarks/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName }),
      });
      if (res.ok) {
        setShowCreateFolder(false);
        setNewFolderName('');
        fetchBookmarks();
      }
    } catch {}
  }, [newFolderName, fetchBookmarks]);

  const handleMoveToFolder = useCallback(async (postId: string, folderId: string) => {
    setBookmarks((prev) => prev.map((b) => (b.id === postId ? { ...b, folderId } : b)));
    await fetch(`/api/bookmarks/${postId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load bookmarks</div>
        <button onClick={fetchBookmarks} className="px-6 py-2 bg-blue-500 text-white rounded-full">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Bookmarks</h1>
          <button onClick={() => setShowCreateFolder(true)} className="text-sm text-blue-500">
            + Folder
          </button>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search bookmarks..."
          className="w-full border rounded-full px-4 py-2 text-sm bg-gray-50 mb-3"
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setSelectedFolder(null)}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${!selectedFolder ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            >
              All ({bookmarks.length})
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${selectedFolder === folder.id ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              >
                {folder.name} ({folder.count})
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="recent">Recent</option>
            <option value="oldest">Oldest</option>
            <option value="popular">Popular</option>
          </select>
        </div>
      </header>

      {bookmarks.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔖</div>
          <h3 className="text-lg font-semibold text-gray-700">No bookmarks</h3>
          <p className="text-gray-500 mt-1">Save posts to find them easily later.</p>
        </div>
      ) : (
        <div className="divide-y">
          {bookmarks.map((post) => (
            <article key={post.id} className="px-4 py-3 hover:bg-gray-50 group">
              <div className="flex gap-3">
                <img src={post.authorAvatar} alt="" className="w-10 h-10 rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="font-bold text-sm">{post.authorName}</span>
                    <span className="text-gray-500 text-xs">@{post.authorHandle}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(post.bookmarkedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-900 text-sm line-clamp-3">{post.content}</p>
                  {post.media.length > 0 && (
                    <div className="mt-2 rounded-lg overflow-hidden">
                      <img src={post.media[0]?.url} alt="" className="w-full h-32 object-cover" />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>❤️ {post.likes}</span>
                      <span>💬 {post.replies}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <select
                        value={post.folderId || ''}
                        onChange={(e) => handleMoveToFolder(post.id, e.target.value)}
                        className="text-xs border rounded px-1 py-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="">No folder</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemoveBookmark(post.id)}
                        className="text-xs text-red-500 hover:text-red-700 p-1"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-4">New Folder</h2>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4"
              placeholder="Folder name"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateFolder(false)}
                className="flex-1 py-2 border rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                className="flex-1 py-2 bg-blue-500 text-white rounded-full"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookmarksPage;
