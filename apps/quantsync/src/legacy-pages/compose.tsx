// ============================================================================
// QuantSync - Post Composer Page
// Rich post creation with character counter, media upload, polls, threads
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface MediaItem {
  id: string;
  file: File | null;
  url: string;
  type: 'image' | 'video' | 'gif';
  thumbnail?: string;
}

interface PollOption {
  id: string;
  text: string;
}

interface ScheduleData {
  date: string;
  time: string;
  timezone: string;
}

interface ThreadPost {
  id: string;
  content: string;
  media: MediaItem[];
}

interface MentionSuggestion {
  id: string;
  handle: string;
  name: string;
  avatar: string;
}

const MIN_CHARS = 1;
const MAX_CHARS = 5000;
const MAX_MEDIA = 4;
const MAX_POLL_OPTIONS = 4;
const MIN_POLL_OPTIONS = 2;

const ComposePage: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [showPoll, setShowPoll] = useState<boolean>(false);
  const [pollOptions, setPollOptions] = useState<PollOption[]>([
    { id: '1', text: '' },
    { id: '2', text: '' },
  ]);
  const [pollDuration, setPollDuration] = useState<string>('1d');
  const [threadMode, setThreadMode] = useState<boolean>(false);
  const [threadPosts, setThreadPosts] = useState<ThreadPost[]>([]);
  const [showSchedule, setShowSchedule] = useState<boolean>(false);
  const [schedule, setSchedule] = useState<ScheduleData>({ date: '', time: '', timezone: 'UTC' });
  const [posting, setPosting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState<boolean>(false);
  const [_mentionQuery, setMentionQuery] = useState<string>('');
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [showMentions, setShowMentions] = useState<boolean>(false);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [showHashtags, setShowHashtags] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<NodeJS.Timeout | null>(null);

  const charCount = content.length;
  const charPercentage = Math.min((charCount / MAX_CHARS) * 100, 100);
  const isOverLimit = charCount > MAX_CHARS;
  const canPost = charCount >= MIN_CHARS && charCount <= MAX_CHARS && !posting;

  useEffect(() => {
    const savedDraft = localStorage.getItem('quantsync_draft');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        setContent(draft.content || '');
        setMedia(draft.media || []);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      if (content.length > 0) {
        localStorage.setItem('quantsync_draft', JSON.stringify({ content, media }));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      }
    }, 3000);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [content, media]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1] ?? '');
      setShowMentions(true);
      fetchMentionSuggestions(mentionMatch[1] ?? '');
    } else {
      setShowMentions(false);
    }
    const hashtagMatch = textBeforeCursor.match(/#(\w*)$/);
    if (hashtagMatch && hashtagMatch[1] && hashtagMatch[1].length > 0) {
      setShowHashtags(true);
      fetchHashtagSuggestions(hashtagMatch[1]);
    } else {
      setShowHashtags(false);
    }
  }, []);

  const fetchMentionSuggestions = async (query: string) => {
    if (query.length < 1) return;
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      setMentionSuggestions(data.users || []);
    } catch {
      setMentionSuggestions([]);
    }
  };

  const fetchHashtagSuggestions = async (query: string) => {
    try {
      const res = await fetch(`/api/hashtags/suggest?q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      setHashtagSuggestions(data.hashtags || []);
    } catch {
      setHashtagSuggestions([]);
    }
  };

  const insertMention = useCallback(
    (handle: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursorPos = textarea.selectionStart;
      const textBefore = content.slice(0, cursorPos);
      const textAfter = content.slice(cursorPos);
      const newBefore = textBefore.replace(/@\w*$/, `@${handle} `);
      setContent(newBefore + textAfter);
      setShowMentions(false);
    },
    [content],
  );

  const handleMediaUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const newMedia: MediaItem[] = [];
      for (let i = 0; i < files.length && media.length + newMedia.length < MAX_MEDIA; i++) {
        const file = files[i];
        if (!file) continue;
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        newMedia.push({
          id: `media_${Date.now()}_${i}`,
          file,
          url: URL.createObjectURL(file),
          type,
        });
      }
      setMedia((prev) => [...prev, ...newMedia]);
    },
    [media],
  );

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addPollOption = useCallback(() => {
    if (pollOptions.length >= MAX_POLL_OPTIONS) return;
    setPollOptions((prev) => [...prev, { id: String(prev.length + 1), text: '' }]);
  }, [pollOptions]);

  const removePollOption = useCallback(
    (id: string) => {
      if (pollOptions.length <= MIN_POLL_OPTIONS) return;
      setPollOptions((prev) => prev.filter((o) => o.id !== id));
    },
    [pollOptions],
  );

  const updatePollOption = useCallback((id: string, text: string) => {
    setPollOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }, []);

  const addThreadPost = useCallback(() => {
    setThreadPosts((prev) => [...prev, { id: `thread_${Date.now()}`, content: '', media: [] }]);
  }, []);

  const updateThreadPost = useCallback((id: string, content: string) => {
    setThreadPosts((prev) => prev.map((tp) => (tp.id === id ? { ...tp, content } : tp)));
  }, []);

  const removeThreadPost = useCallback((id: string) => {
    setThreadPosts((prev) => prev.filter((tp) => tp.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      const payload: any = { content };
      if (media.length > 0) payload.media = media.map((m) => ({ type: m.type, url: m.url }));
      if (showPoll) {
        payload.poll = { options: pollOptions.map((o) => o.text), duration: pollDuration };
      }
      if (threadMode && threadPosts.length > 0) {
        payload.thread = threadPosts.map((tp) => ({ content: tp.content }));
      }
      if (showSchedule && schedule.date) {
        payload.scheduledAt = `${schedule.date}T${schedule.time}:00Z`;
      }
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create post');
      localStorage.removeItem('quantsync_draft');
      setContent('');
      setMedia([]);
      setPollOptions([
        { id: '1', text: '' },
        { id: '2', text: '' },
      ]);
      setShowPoll(false);
      setThreadMode(false);
      setThreadPosts([]);
    } catch (err: any) {
      setError(err.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  }, [
    canPost,
    content,
    media,
    showPoll,
    pollOptions,
    pollDuration,
    threadMode,
    threadPosts,
    showSchedule,
    schedule,
  ]);

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
        <button className="text-gray-600 hover:text-gray-900 text-lg">✕</button>
        <div className="flex items-center gap-3">
          {draftSaved && <span className="text-xs text-green-500">Draft saved</span>}
          <button
            onClick={handleSubmit}
            disabled={!canPost}
            className={`px-5 py-2 rounded-full font-bold text-sm ${
              canPost
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-blue-200 text-white cursor-not-allowed'
            }`}
          >
            {posting ? 'Posting...' : showSchedule ? 'Schedule' : 'Post'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="p-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0">
            U
          </div>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder="What's happening?"
              className="w-full min-h-[120px] text-xl resize-none border-none outline-none placeholder-gray-400"
              maxLength={MAX_CHARS + 100}
            />

            {showMentions && mentionSuggestions.length > 0 && (
              <div className="border rounded-lg shadow-lg bg-white mt-1 max-h-48 overflow-y-auto">
                {mentionSuggestions.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => insertMention(user.handle)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                  >
                    <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                    <div className="text-left">
                      <div className="font-medium text-sm">{user.name}</div>
                      <div className="text-xs text-gray-500">@{user.handle}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showHashtags && hashtagSuggestions.length > 0 && (
              <div className="border rounded-lg shadow-lg bg-white mt-1">
                {hashtagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setContent((prev) => prev.replace(/#\w*$/, `#${tag} `));
                      setShowHashtags(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {media.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="relative rounded-xl overflow-hidden aspect-video bg-gray-100"
                  >
                    {m.type === 'video' ? (
                      <video src={m.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => removeMedia(m.id)}
                      className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showPoll && (
              <div className="mt-4 border rounded-xl p-4">
                <h4 className="font-medium mb-3">Poll</h4>
                {pollOptions.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => updatePollOption(opt.id, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 border rounded-lg px-3 py-2 text-sm"
                      maxLength={50}
                    />
                    {pollOptions.length > MIN_POLL_OPTIONS && (
                      <button
                        onClick={() => removePollOption(opt.id)}
                        className="text-red-500 text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < MAX_POLL_OPTIONS && (
                  <button
                    onClick={addPollOption}
                    className="text-blue-500 text-sm font-medium mt-1"
                  >
                    + Add option
                  </button>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-sm text-gray-600">Duration:</label>
                  <select
                    value={pollDuration}
                    onChange={(e) => setPollDuration(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="1h">1 hour</option>
                    <option value="6h">6 hours</option>
                    <option value="1d">1 day</option>
                    <option value="3d">3 days</option>
                    <option value="7d">7 days</option>
                  </select>
                </div>
              </div>
            )}

            {threadMode && (
              <div className="mt-4 border-l-2 border-blue-300 pl-4">
                <h4 className="font-medium mb-3 text-sm text-blue-600">Thread</h4>
                {threadPosts.map((tp, idx) => (
                  <div key={tp.id} className="mb-3 relative">
                    <textarea
                      value={tp.content}
                      onChange={(e) => updateThreadPost(tp.id, e.target.value)}
                      placeholder={`Post ${idx + 2} in thread...`}
                      className="w-full min-h-[80px] border rounded-lg p-3 text-sm resize-none"
                      maxLength={MAX_CHARS}
                    />
                    <button
                      onClick={() => removeThreadPost(tp.id)}
                      className="absolute top-2 right-2 text-red-400 text-xs"
                    >
                      ✕
                    </button>
                    <div className="text-xs text-gray-400 text-right">
                      {tp.content.length}/{MAX_CHARS}
                    </div>
                  </div>
                ))}
                <button onClick={addThreadPost} className="text-blue-500 text-sm font-medium">
                  + Add to thread
                </button>
              </div>
            )}

            {showSchedule && (
              <div className="mt-4 border rounded-xl p-4">
                <h4 className="font-medium mb-3">Schedule Post</h4>
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={schedule.date}
                    onChange={(e) => setSchedule((s) => ({ ...s, date: e.target.value }))}
                    className="border rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={schedule.time}
                    onChange={(e) => setSchedule((s) => ({ ...s, time: e.target.value }))}
                    className="border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t px-4 py-3 flex items-center justify-between sticky bottom-0 bg-white">
        <div className="flex items-center gap-1">
          <label className="cursor-pointer p-2 rounded-full hover:bg-blue-50 text-blue-500">
            🖼️
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleMediaUpload}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setShowPoll(!showPoll)}
            className={`p-2 rounded-full hover:bg-blue-50 ${showPoll ? 'text-blue-600' : 'text-blue-500'}`}
          >
            📊
          </button>
          <button
            onClick={() => setThreadMode(!threadMode)}
            className={`p-2 rounded-full hover:bg-blue-50 ${threadMode ? 'text-blue-600' : 'text-blue-500'}`}
          >
            🧵
          </button>
          <button
            onClick={() => setShowSchedule(!showSchedule)}
            className={`p-2 rounded-full hover:bg-blue-50 ${showSchedule ? 'text-blue-600' : 'text-blue-500'}`}
          >
            📅
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke={isOverLimit ? '#ef4444' : charPercentage > 90 ? '#f59e0b' : '#3b82f6'}
                strokeWidth="3"
                strokeDasharray={`${charPercentage * 0.942} 100`}
              />
            </svg>
          </div>
          <span className={`text-sm ${isOverLimit ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
            {MAX_CHARS - charCount}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ComposePage;
