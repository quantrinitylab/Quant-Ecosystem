// ============================================================================
// QuantNeon - Create Post Flow
// Image URLs, caption, AI caption + hashtag assist, real publish via API
// ============================================================================

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { PageTransition, LoadingState } from '@quant/shared-ui';
import { apiClient } from '../services/api-client';

const CreatePostPage: React.FC = () => {
  const router = useRouter();
  const [step, setStep] = useState<'select' | 'edit' | 'caption'>('select');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageInput, setImageInput] = useState('');
  const [caption, setCaption] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiCaptions, setAiCaptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addImage = useCallback(() => {
    const url = imageInput.trim();
    if (!url) return;
    setSelectedImages((prev) => [...prev, url]);
    setImageInput('');
  }, [imageInput]);

  const generateCaption = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await apiClient.generateCaption({
        mediaUrl: selectedImages[0],
        description: caption || undefined,
      });
      if (response.success && response.data?.captions) {
        setAiCaptions(response.data.captions);
      } else {
        setError(response.error?.message ?? 'Failed to generate captions');
      }
    } catch {
      setError('Failed to generate captions');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedImages, caption]);

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    setError(null);
    try {
      const response = await apiClient.createPost({
        caption,
        mediaUrls: selectedImages,
        type: selectedImages.length > 1 ? 'CAROUSEL' : 'IMAGE',
        visibility: 'PUBLIC',
      });
      if (response.success && response.data?.post) {
        await router.push(`/post/${response.data.post.id}`);
        return;
      }
      setError(response.error?.message ?? 'Failed to publish post');
    } catch {
      setError('Failed to publish post');
    } finally {
      setIsPublishing(false);
    }
  }, [caption, selectedImages, router]);

  if (isPublishing) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14] flex items-center justify-center">
          <LoadingState variant="spinner" text="Sharing your post..." />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-white dark:bg-[#0F0F14] text-gray-900 dark:text-gray-100">
        <div className="px-4 max-w-2xl mx-auto py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">New Post</h1>
            {step === 'caption' && (
              <button
                className="min-h-[44px] px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
                onClick={handlePublish}
                disabled={selectedImages.length === 0}
              >
                Share
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-2 text-sm">
              {error}
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  className="flex-1 h-11 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                  placeholder="Paste image URL"
                  value={imageInput}
                  onChange={(e) => setImageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addImage()}
                  aria-label="Image URL"
                />
                <button
                  className="min-h-[44px] px-4 bg-gray-200 dark:bg-gray-700 rounded-xl font-medium"
                  onClick={addImage}
                >
                  Add
                </button>
              </div>
              {selectedImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {selectedImages.map((url, i) => (
                    <img
                      key={`${url}-${i}`}
                      src={url}
                      alt=""
                      className="aspect-square object-cover rounded-lg"
                    />
                  ))}
                </div>
              ) : (
                <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                  <p className="text-gray-500 dark:text-gray-400">Add at least one image</p>
                </div>
              )}
              <button
                className="w-full min-h-[44px] py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50"
                onClick={() => setStep('edit')}
                disabled={selectedImages.length === 0}
              >
                Next
              </button>
            </div>
          )}

          {step === 'edit' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-1">
                {selectedImages.map((url, i) => (
                  <img
                    key={`${url}-${i}`}
                    src={url}
                    alt=""
                    className="aspect-square object-cover rounded-lg"
                  />
                ))}
              </div>
              <button
                className="w-full min-h-[44px] py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700"
                onClick={() => setStep('caption')}
              >
                Next
              </button>
            </div>
          )}

          {step === 'caption' && (
            <div className="space-y-4">
              <textarea
                className="w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 resize-none text-gray-900 dark:text-white"
                placeholder="Write a caption..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <button
                className="w-full min-h-[44px] py-2.5 rounded-xl border border-purple-500 text-purple-600 dark:text-purple-300 font-medium hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
                onClick={generateCaption}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : '✨ Generate AI captions'}
              </button>
              {aiCaptions.length > 0 && (
                <div className="space-y-2">
                  {aiCaptions.map((c, i) => (
                    <button
                      key={i}
                      className="w-full text-left text-sm bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      onClick={() => setCaption(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default CreatePostPage;
