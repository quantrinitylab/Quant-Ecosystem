// ============================================================================
// QuantTube - Upload Page
// Video upload with drag-drop, progress, metadata, thumbnails, chapters
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
}

interface ThumbnailOption {
  id: string;
  url: string;
  isCustom: boolean;
  selected: boolean;
}

interface Chapter {
  id: string;
  title: string;
  timestamp: string;
}

interface SubtitleFile {
  id: string;
  language: string;
  fileName: string;
  status: 'uploaded' | 'processing' | 'ready';
}

type Visibility = 'public' | 'unlisted' | 'private' | 'scheduled';

interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  category: string;
  visibility: Visibility;
  scheduledDate: string;
  ageRestricted: boolean;
  allowComments: boolean;
  language: string;
}

interface UploadPageState {
  files: UploadFile[];
  metadata: VideoMetadata;
  thumbnails: ThumbnailOption[];
  chapters: Chapter[];
  subtitles: SubtitleFile[];
  isDragOver: boolean;
  currentStep: 'upload' | 'details' | 'thumbnails' | 'chapters' | 'review';
  loading: boolean;
  error: string | null;
  publishing: boolean;
}

const CATEGORIES = ['Entertainment', 'Music', 'Gaming', 'Education', 'Science & Tech', 'Sports', 'News', 'Comedy', 'Film', 'Howto', 'Travel', 'Pets'];

const UploadPage: React.FC = () => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [metadata, setMetadata] = useState<VideoMetadata>({
    title: '',
    description: '',
    tags: [],
    category: 'Entertainment',
    visibility: 'public',
    scheduledDate: '',
    ageRestricted: false,
    allowComments: true,
    language: 'English',
  });
  const [thumbnails, setThumbnails] = useState<ThumbnailOption[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'details' | 'thumbnails' | 'chapters' | 'review'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    };
  }, []);

  const simulateUpload = useCallback((fileId: string) => {
    uploadIntervalRef.current = setInterval(() => {
      setFiles(prev => prev.map(f => {
        if (f.id !== fileId) return f;
        if (f.progress >= 100) {
          if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
          return { ...f, status: 'processing', progress: 100 };
        }
        return { ...f, status: 'uploading', progress: Math.min(f.progress + Math.random() * 15, 100) };
      }));
    }, 500);

    setTimeout(() => {
      if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'complete', progress: 100 } : f
      ));
      setThumbnails([
        { id: 'th1', url: '/thumbs/auto-1.jpg', isCustom: false, selected: true },
        { id: 'th2', url: '/thumbs/auto-2.jpg', isCustom: false, selected: false },
        { id: 'th3', url: '/thumbs/auto-3.jpg', isCustom: false, selected: false },
      ]);
      setCurrentStep('details');
    }, 5000);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(file => {
      const uploadFile: UploadFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'pending',
      };
      setFiles(prev => [...prev, uploadFile]);
      simulateUpload(uploadFile.id);
    });
  }, [simulateUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    selectedFiles.forEach(file => {
      const uploadFile: UploadFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'pending',
      };
      setFiles(prev => [...prev, uploadFile]);
      simulateUpload(uploadFile.id);
    });
  }, [simulateUpload]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleMetadataChange = useCallback((field: keyof VideoMetadata, value: string | boolean) => {
    setMetadata(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddTag = useCallback(() => {
    if (tagInput.trim() && !metadata.tags.includes(tagInput.trim())) {
      setMetadata(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput('');
    }
  }, [tagInput, metadata.tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setMetadata(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  }, []);

  const handleSelectThumbnail = useCallback((thumbnailId: string) => {
    setThumbnails(prev => prev.map(th => ({ ...th, selected: th.id === thumbnailId })));
  }, []);

  const handleAddCustomThumbnail = useCallback(() => {
    const customThumb: ThumbnailOption = {
      id: `th-custom-${Date.now()}`,
      url: '/thumbs/custom-upload.jpg',
      isCustom: true,
      selected: true,
    };
    setThumbnails(prev => [...prev.map(th => ({ ...th, selected: false })), customThumb]);
  }, []);

  const handleAddChapter = useCallback(() => {
    const newChapter: Chapter = {
      id: `ch-${Date.now()}`,
      title: '',
      timestamp: '0:00',
    };
    setChapters(prev => [...prev, newChapter]);
  }, []);

  const handleRemoveChapter = useCallback((chapterId: string) => {
    setChapters(prev => prev.filter(ch => ch.id !== chapterId));
  }, []);

  const handleChapterChange = useCallback((chapterId: string, field: 'title' | 'timestamp', value: string) => {
    setChapters(prev => prev.map(ch => ch.id === chapterId ? { ...ch, [field]: value } : ch));
  }, []);

  const handleAddSubtitle = useCallback(() => {
    const sub: SubtitleFile = {
      id: `sub-${Date.now()}`,
      language: 'English',
      fileName: 'subtitles.srt',
      status: 'uploaded',
    };
    setSubtitles(prev => [...prev, sub]);
  }, []);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    setError(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setCurrentStep('review');
    } catch (err) {
      setError('Failed to publish video. Please try again.');
    } finally {
      setPublishing(false);
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-red-300 text-lg mb-4">{error}</p>
          <button onClick={() => setError(null)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Upload Video</h1>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {['upload', 'details', 'thumbnails', 'chapters', 'review'].map((step, i) => (
              <span key={step} className={`capitalize ${currentStep === step ? 'text-blue-400 font-medium' : ''}`}>
                {i > 0 && <span className="mx-2 text-gray-600">/</span>}
                {step}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Upload Drop Zone */}
        {currentStep === 'upload' && files.length === 0 && (
          <div
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-2xl p-16 text-center transition-colors cursor-pointer ${isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-6xl mb-4">Upload</div>
            <h2 className="text-xl font-medium text-white mb-2">Drag and drop your video files</h2>
            <p className="text-gray-400 mb-4">Or click to browse. Supports MP4, MOV, AVI, MKV up to 256GB.</p>
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Select Files</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* Upload Progress */}
        {files.length > 0 && currentStep === 'upload' && (
          <div className="space-y-4">
            {files.map(file => (
              <div key={file.id} className="p-4 bg-gray-800 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-white">{file.name}</p>
                    <p className="text-sm text-gray-400">{formatFileSize(file.size)} - {file.type}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${file.status === 'complete' ? 'bg-green-600 text-white' : file.status === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                    {file.status === 'uploading' ? `${Math.round(file.progress)}%` : file.status}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${file.status === 'complete' ? 'bg-green-500' : file.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metadata Form */}
        {currentStep === 'details' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
              <input
                type="text"
                value={metadata.title}
                onChange={(e) => handleMetadataChange('title', e.target.value)}
                placeholder="Enter video title"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                maxLength={100}
              />
              <p className="text-xs text-gray-500 mt-1">{metadata.title.length}/100</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
              <textarea
                value={metadata.description}
                onChange={(e) => handleMetadataChange('description', e.target.value)}
                placeholder="Tell viewers about your video"
                rows={5}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                maxLength={5000}
              />
              <p className="text-xs text-gray-500 mt-1">{metadata.description.length}/5000</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tags</label>
              <div className="flex gap-2 mb-2 flex-wrap">
                {metadata.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm flex items-center gap-1">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="text-gray-500 hover:text-red-400">x</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add tag and press Enter"
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button onClick={handleAddTag} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Add</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                <select
                  value={metadata.category}
                  onChange={(e) => handleMetadataChange('category', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Visibility</label>
                <select
                  value={metadata.visibility}
                  onChange={(e) => handleMetadataChange('visibility', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
            </div>

            {metadata.visibility === 'scheduled' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Schedule Date & Time</label>
                <input
                  type="datetime-local"
                  value={metadata.scheduledDate}
                  onChange={(e) => handleMetadataChange('scheduledDate', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={metadata.allowComments}
                  onChange={(e) => handleMetadataChange('allowComments', e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-800 border-gray-700"
                />
                <span className="text-sm text-gray-300">Allow comments</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={metadata.ageRestricted}
                  onChange={(e) => handleMetadataChange('ageRestricted', e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-800 border-gray-700"
                />
                <span className="text-sm text-gray-300">Age restricted (18+)</span>
              </label>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setCurrentStep('thumbnails')} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Next: Thumbnails
              </button>
            </div>
          </div>
        )}

        {/* Thumbnail Picker */}
        {currentStep === 'thumbnails' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Choose Thumbnail</h2>
            <p className="text-gray-400">Select an auto-generated thumbnail or upload a custom one.</p>

            <div className="grid grid-cols-3 gap-4">
              {thumbnails.map(thumb => (
                <div
                  key={thumb.id}
                  onClick={() => handleSelectThumbnail(thumb.id)}
                  className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition ${thumb.selected ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-gray-700 hover:border-gray-500'}`}
                >
                  <img src={thumb.url} alt="Thumbnail option" className="w-full aspect-video object-cover" />
                  {thumb.selected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">OK</div>
                  )}
                  {thumb.isCustom && (
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-purple-600 text-white text-xs rounded">Custom</span>
                  )}
                </div>
              ))}
            </div>

            <button onClick={handleAddCustomThumbnail} className="px-4 py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-400 transition">
              + Upload Custom Thumbnail
            </button>

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep('details')} className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Back</button>
              <button onClick={() => setCurrentStep('chapters')} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Next: Chapters</button>
            </div>
          </div>
        )}

        {/* Chapters Editor */}
        {currentStep === 'chapters' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Chapters</h2>
                <p className="text-gray-400 text-sm">Add chapters to help viewers navigate your video.</p>
              </div>
              <button onClick={handleAddChapter} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Add Chapter</button>
            </div>

            {chapters.length === 0 ? (
              <div className="text-center py-12 bg-gray-800 rounded-xl">
                <p className="text-gray-400">No chapters added yet.</p>
                <button onClick={handleAddChapter} className="mt-3 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Add First Chapter</button>
              </div>
            ) : (
              <div className="space-y-3">
                {chapters.map((ch, i) => (
                  <div key={ch.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                    <span className="text-sm text-gray-500 w-6">{i + 1}</span>
                    <input
                      type="text"
                      value={ch.timestamp}
                      onChange={(e) => handleChapterChange(ch.id, 'timestamp', e.target.value)}
                      placeholder="0:00"
                      className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      value={ch.title}
                      onChange={(e) => handleChapterChange(ch.id, 'title', e.target.value)}
                      placeholder="Chapter title"
                      className="flex-1 px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button onClick={() => handleRemoveChapter(ch.id)} className="text-gray-500 hover:text-red-400 text-sm px-2">Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* Subtitle Upload */}
            <div className="border-t border-gray-800 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">Subtitles / Closed Captions</h3>
                <button onClick={handleAddSubtitle} className="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">+ Add Subtitle File</button>
              </div>
              {subtitles.length === 0 ? (
                <p className="text-gray-500 text-sm">No subtitle files uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {subtitles.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                      <span className="text-sm text-white">{sub.fileName}</span>
                      <span className="text-sm text-gray-400">{sub.language}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded text-xs ${sub.status === 'ready' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'}`}>{sub.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep('thumbnails')} className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Back</button>
              <button onClick={handlePublish} disabled={publishing} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {publishing ? 'Publishing...' : 'Publish Video'}
              </button>
            </div>
          </div>
        )}

        {/* Review / Success */}
        {currentStep === 'review' && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">Done</div>
            <h2 className="text-2xl font-bold text-white mb-2">Video Published Successfully!</h2>
            <p className="text-gray-400 mb-6">Your video "{metadata.title}" is now {metadata.visibility}.</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => { setFiles([]); setCurrentStep('upload'); setMetadata({ title: '', description: '', tags: [], category: 'Entertainment', visibility: 'public', scheduledDate: '', ageRestricted: false, allowComments: true, language: 'English' }); }} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Upload Another
              </button>
              <button className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">
                Go to Studio
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default UploadPage;
