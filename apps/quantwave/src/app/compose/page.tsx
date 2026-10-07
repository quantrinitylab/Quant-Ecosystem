'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { PageTransition, SpringButton, Card } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { quantSyncAPI } from '../../services/api-client';

type AudienceType = 'public' | 'followers' | 'mutual';

interface PollState {
  enabled: boolean;
  options: string[];
  duration: string;
}

const MAX_CHARS = 280;
const MAX_IMAGES = 4;
const AUDIENCE_OPTIONS: { id: AudienceType; label: string; icon: string }[] = [
  { id: 'public', label: 'Public', icon: '\uD83C\uDF10' },
  { id: 'followers', label: 'Followers Only', icon: '\uD83D\uDC65' },
  { id: 'mutual', label: 'Mutual Only', icon: '\uD83E\uDD1D' },
];

const DURATION_OPTIONS = ['1 hour', '6 hours', '12 hours', '1 day', '3 days', '7 days'];

export default function ComposePage() {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [audience, setAudience] = useState<AudienceType>('public');
  const [showAudienceDropdown, setShowAudienceDropdown] = useState(false);
  const [poll, setPoll] = useState<PollState>({
    enabled: false,
    options: ['', ''],
    duration: '1 day',
  });

  const charCount = content.length;
  const charsRemaining = MAX_CHARS - charCount;
  const isOverLimit = charCount > MAX_CHARS;
  const isNearLimit = charsRemaining <= 20;
  const canPost = content.trim().length > 0 && !isOverLimit;

  const createPostMutation = useMutation({
    mutationFn: async () => {
      const postData: {
        content: string;
        type?: string;
        mediaAttachments?: { url: string; type: string }[];
        poll?: { question: string; options: string[]; duration: string };
      } = { content };

      if (images.length > 0) {
        postData.mediaAttachments = images.map((url) => ({ url, type: 'image' }));
      }
      if (poll.enabled && poll.options.filter((o) => o.trim()).length >= 2) {
        postData.poll = {
          question: content,
          options: poll.options.filter((o) => o.trim()),
          duration: poll.duration,
        };
      }

      const response = await quantSyncAPI.createPost(postData);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create post');
      }
      return response.data;
    },
    onSuccess: () => {
      setContent('');
      setImages([]);
      setPoll({ enabled: false, options: ['', ''], duration: '1 day' });
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    },
  });

  const handleAddImage = useCallback(() => {
    if (images.length >= MAX_IMAGES) return;
    // Simulate adding an image placeholder
    const placeholders = [
      '/media/upload-1.jpg',
      '/media/upload-2.jpg',
      '/media/upload-3.jpg',
      '/media/upload-4.jpg',
    ];
    setImages((prev) => [...prev, placeholders[prev.length] || '/media/placeholder.jpg']);
  }, [images.length]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleTogglePoll = useCallback(() => {
    setPoll((prev) => ({
      ...prev,
      enabled: !prev.enabled,
      options: prev.enabled ? ['', ''] : prev.options,
    }));
  }, []);

  const handleAddPollOption = useCallback(() => {
    if (poll.options.length >= 4) return;
    setPoll((prev) => ({ ...prev, options: [...prev.options, ''] }));
  }, [poll.options.length]);

  const handleRemovePollOption = useCallback(
    (index: number) => {
      if (poll.options.length <= 2) return;
      setPoll((prev) => ({
        ...prev,
        options: prev.options.filter((_, i) => i !== index),
      }));
    },
    [poll.options.length],
  );

  const handlePollOptionChange = useCallback((index: number, value: string) => {
    setPoll((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === index ? value : opt)),
    }));
  }, []);

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
        <div className="flex items-center justify-between mb-6">
          <a
            href="/"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            &#x2190; Back
          </a>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Compose</h1>
          <div className="w-11" />
        </div>

        <Card className="p-4 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-800">
          {/* Audience selector */}
          <div className="relative mb-3">
            <button
              onClick={() => setShowAudienceDropdown(!showAudienceDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 min-h-[44px]"
            >
              <span>{AUDIENCE_OPTIONS.find((a) => a.id === audience)?.icon}</span>
              <span>{AUDIENCE_OPTIONS.find((a) => a.id === audience)?.label}</span>
              <span className="text-xs">&#x25BC;</span>
            </button>
            <AnimatePresence>
              {showAudienceDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 top-full mt-1 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-700 rounded-xl shadow-lg py-1 w-52 z-20"
                >
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setAudience(opt.id);
                        setShowAudienceDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px] ${audience === opt.id ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                      {audience === opt.id && (
                        <span className="ml-auto text-blue-500">&#x2713;</span>
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Textarea */}
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              className="w-full min-h-[120px] bg-transparent text-gray-900 dark:text-gray-100 text-lg placeholder-gray-400 dark:placeholder-gray-500 border-none outline-none resize-none"
              autoFocus
            />
          </div>

          {/* Image attachments */}
          <AnimatePresence>
            {images.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`mt-3 rounded-xl overflow-hidden border dark:border-gray-700 ${images.length > 1 ? 'grid grid-cols-2 gap-1' : ''}`}
              >
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-video bg-gray-100 dark:bg-gray-800">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/80"
                    >
                      &#x2715;
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Poll creator */}
          <AnimatePresence>
            {poll.enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 border dark:border-gray-700 rounded-xl p-4"
              >
                <div className="space-y-2">
                  {poll.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 min-h-[44px]"
                        maxLength={50}
                      />
                      {poll.options.length > 2 && (
                        <button
                          onClick={() => handleRemovePollOption(idx)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          &#x2715;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {poll.options.length < 4 && (
                  <button
                    onClick={handleAddPollOption}
                    className="mt-2 text-blue-500 text-sm font-medium hover:text-blue-600 min-h-[44px]"
                  >
                    + Add option
                  </button>
                )}
                <div className="mt-3 pt-3 border-t dark:border-gray-700">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                    Poll duration
                  </label>
                  <select
                    value={poll.duration}
                    onChange={(e) => setPoll((prev) => ({ ...prev, duration: e.target.value }))}
                    className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 min-h-[44px]"
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t dark:border-gray-800">
            <div className="flex items-center gap-1">
              <SpringButton
                onClick={handleAddImage}
                disabled={images.length >= MAX_IMAGES || poll.enabled}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Add image"
              >
                &#x1F5BC;&#xFE0F;
              </SpringButton>
              <SpringButton
                onClick={handleTogglePoll}
                disabled={images.length > 0}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 disabled:cursor-not-allowed ${poll.enabled ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-blue-500'}`}
                aria-label="Create poll"
              >
                &#x1F4CA;
              </SpringButton>
            </div>

            <div className="flex items-center gap-3">
              {/* Character counter */}
              <div
                className={`text-sm font-medium ${isOverLimit ? 'text-red-500' : isNearLimit ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'}`}
              >
                {charsRemaining}
              </div>
              {/* Progress ring */}
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={`${Math.min(charCount / MAX_CHARS, 1) * 62.83} 62.83`}
                  strokeLinecap="round"
                  transform="rotate(-90 12 12)"
                  className={
                    isOverLimit ? 'text-red-500' : isNearLimit ? 'text-orange-500' : 'text-blue-500'
                  }
                />
              </svg>
              {/* Post button */}
              <SpringButton
                onClick={() => createPostMutation.mutate()}
                disabled={!canPost || createPostMutation.isPending}
                className="min-h-[44px] px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createPostMutation.isPending ? 'Posting...' : 'Post'}
              </SpringButton>
            </div>
          </div>

          {createPostMutation.isError && (
            <p className="mt-2 text-sm text-red-500">
              {createPostMutation.error instanceof Error
                ? createPostMutation.error.message
                : 'Failed to post'}
            </p>
          )}
        </Card>
      </main>
    </PageTransition>
  );
}
