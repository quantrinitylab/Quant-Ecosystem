// ============================================================================
// QuantSync - ThreadComposer Component
// Multi-post thread creation with character counters, drag to reorder, preview
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';

interface ThreadPost {
  id: string;
  content: string;
  media: { url: string; type: string }[];
  charCount: number;
}

interface ThreadComposerProps {
  maxChars?: number;
  maxPosts?: number;
  onSubmit: (posts: { content: string; media: { url: string; type: string }[] }[]) => void;
  onCancel: () => void;
  submitting?: boolean;
}

const ThreadComposer: React.FC<ThreadComposerProps> = ({
  maxChars = 5000,
  maxPosts = 25,
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  const [posts, setPosts] = useState<ThreadPost[]>([
    { id: '1', content: '', media: [], charCount: 0 },
    { id: '2', content: '', media: [], charCount: 0 },
  ]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const dragOverRef = useRef<string | null>(null);

  const addPost = useCallback(() => {
    if (posts.length >= maxPosts) return;
    setPosts((prev) => [...prev, { id: String(Date.now()), content: '', media: [], charCount: 0 }]);
  }, [posts.length, maxPosts]);

  const removePost = useCallback(
    (id: string) => {
      if (posts.length <= 2) return;
      setPosts((prev) => prev.filter((p) => p.id !== id));
    },
    [posts.length],
  );

  const updateContent = useCallback((id: string, content: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, content, charCount: content.length } : p)),
    );
    setError(null);
  }, []);

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverRef.current = id;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedId || draggedId === targetId) return;
      setPosts((prev) => {
        const newPosts = [...prev];
        const dragIdx = newPosts.findIndex((p) => p.id === draggedId);
        const targetIdx = newPosts.findIndex((p) => p.id === targetId);
        const [dragged] = newPosts.splice(dragIdx, 1);
        if (dragged) newPosts.splice(targetIdx, 0, dragged);
        return newPosts;
      });
      setDraggedId(null);
    },
    [draggedId],
  );

  const handleSubmit = useCallback(() => {
    const filledPosts = posts.filter((p) => p.content.trim());
    if (filledPosts.length < 2) {
      setError('A thread needs at least 2 posts');
      return;
    }
    const overLimit = filledPosts.some((p) => p.charCount > maxChars);
    if (overLimit) {
      setError(`Each post must be under ${maxChars} characters`);
      return;
    }
    onSubmit(filledPosts.map((p) => ({ content: p.content, media: p.media })));
  }, [posts, maxChars, onSubmit]);

  const totalChars = posts.reduce((sum, p) => sum + p.charCount, 0);
  const filledCount = posts.filter((p) => p.content.trim()).length;
  const canSubmit = filledCount >= 2 && !posts.some((p) => p.charCount > maxChars) && !submitting;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg">Create Thread</h2>
          <p className="text-xs text-gray-500">
            {filledCount} posts · {totalChars} total characters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1 rounded-full text-xs ${showPreview ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-lg">
            ✕
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          {error}
        </div>
      )}

      {showPreview ? (
        <div className="p-4 space-y-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Thread Preview</h3>
          {posts
            .filter((p) => p.content.trim())
            .map((post, idx) => (
              <div key={post.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                    {idx + 1}
                  </div>
                  {idx < posts.filter((p) => p.content.trim()).length - 1 && (
                    <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <p className="text-gray-900 whitespace-pre-wrap text-sm">{post.content}</p>
                  {post.media.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {post.media.map((m, i) => (
                        <div key={i} className="w-16 h-16 rounded bg-gray-100 overflow-hidden">
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {posts.map((post, idx) => (
            <div
              key={post.id}
              draggable
              onDragStart={() => handleDragStart(post.id)}
              onDragOver={(e) => handleDragOver(e, post.id)}
              onDrop={(e) => handleDrop(e, post.id)}
              className={`border rounded-xl p-3 transition-all ${draggedId === post.id ? 'opacity-50 border-dashed' : 'border-gray-200'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="cursor-grab text-gray-400 hover:text-gray-600"
                    title="Drag to reorder"
                  >
                    ⋮⋮
                  </span>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    Post {idx + 1}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs ${post.charCount > maxChars ? 'text-red-500 font-bold' : 'text-gray-400'}`}
                  >
                    {post.charCount}/{maxChars}
                  </span>
                  {posts.length > 2 && (
                    <button
                      onClick={() => removePost(post.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 text-red-400 hover:text-red-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={post.content}
                onChange={(e) => updateContent(post.id, e.target.value)}
                placeholder={idx === 0 ? 'Start your thread...' : `Continue the thread...`}
                className="w-full min-h-[80px] resize-none border-none outline-none text-sm placeholder-gray-400"
                maxLength={maxChars + 100}
              />
              {idx < posts.length - 1 && (
                <div className="flex justify-center mt-1">
                  <div className="w-0.5 h-4 bg-blue-200" />
                </div>
              )}
            </div>
          ))}

          {posts.length < maxPosts && (
            <button
              onClick={addPost}
              className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              + Add post to thread ({posts.length}/{maxPosts})
            </button>
          )}
        </div>
      )}

      <div className="p-4 border-t flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {filledCount} of {posts.length} posts filled
        </span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 border rounded-full text-sm font-medium">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Posting...' : `Post Thread (${filledCount} posts)`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThreadComposer;
