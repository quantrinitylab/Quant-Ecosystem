// ============================================================================
// QuantTube - Video Uploader Component
// Multi-file upload with progress bars, thumbnail preview, metadata form
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface UploadFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'queued' | 'uploading' | 'processing' | 'complete' | 'error';
  thumbnailUrl: string | null;
  duration: number | null;
}

interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  category: string;
  visibility: 'public' | 'unlisted' | 'private';
  scheduledDate: string | null;
}

interface VideoUploaderProps {
  maxFiles: number;
  maxSizeMB: number;
  onUploadComplete?: (fileId: string) => void;
  onCancel?: () => void;
}

interface UploaderState {
  files: UploadFile[];
  isDragging: boolean;
  metadata: VideoMetadata;
  selectedFileId: string | null;
  tagInput: string;
}

const CATEGORIES = ['Entertainment', 'Education', 'Gaming', 'Music', 'Sports', 'Technology', 'News', 'Comedy', 'Film'];

const formatFileSize = (bytes: number): string => {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const VideoUploader: React.FC<VideoUploaderProps> = ({ maxFiles = 10, maxSizeMB = 5120, onUploadComplete, onCancel }) => {
  const [state, setState] = useState<UploaderState>({
    files: [],
    isDragging: false,
    metadata: { title: '', description: '', tags: [], category: 'Entertainment', visibility: 'public', scheduledDate: null },
    selectedFileId: null,
    tagInput: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const uploadingFile = state.files.find(f => f.status === 'uploading');
    if (uploadingFile) {
      const interval = setInterval(() => {
        setState(prev => ({
          ...prev,
          files: prev.files.map(f => {
            if (f.id === uploadingFile.id && f.progress < 100) {
              const newProgress = Math.min(f.progress + Math.random() * 15, 100);
              return { ...f, progress: newProgress, status: newProgress >= 100 ? 'processing' : 'uploading' };
            }
            return f;
          }),
        }));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [state.files]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState(prev => ({ ...prev, isDragging: true }));
  }, []);

  const handleDragLeave = useCallback(() => {
    setState(prev => ({ ...prev, isDragging: false }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState(prev => ({ ...prev, isDragging: false }));
    const newFiles: UploadFile[] = Array.from(e.dataTransfer.files)
      .slice(0, maxFiles - state.files.length)
      .map((file, idx) => ({
        id: `file-${Date.now()}-${idx}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'queued' as const,
        thumbnailUrl: null,
        duration: null,
      }));
    setState(prev => ({ ...prev, files: [...prev.files, ...newFiles] }));
  }, [maxFiles, state.files.length]);

  const addFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles) return;
    const newFiles: UploadFile[] = Array.from(inputFiles)
      .slice(0, maxFiles - state.files.length)
      .map((file, idx) => ({
        id: `file-${Date.now()}-${idx}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'queued' as const,
        thumbnailUrl: null,
        duration: null,
      }));
    setState(prev => ({ ...prev, files: [...prev.files, ...newFiles] }));
  }, [maxFiles, state.files.length]);

  const startUpload = useCallback((fileId: string) => {
    setState(prev => ({
      ...prev,
      files: prev.files.map(f => f.id === fileId ? { ...f, status: 'uploading' as const } : f),
    }));
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState(prev => ({ ...prev, files: prev.files.filter(f => f.id !== fileId) }));
  }, []);

  const startAllUploads = useCallback(() => {
    setState(prev => ({
      ...prev,
      files: prev.files.map(f => f.status === 'queued' ? { ...f, status: 'uploading' as const } : f),
    }));
  }, []);

  const addTag = useCallback(() => {
    if (state.tagInput.trim() && state.metadata.tags.length < 15) {
      setState(prev => ({
        ...prev,
        metadata: { ...prev.metadata, tags: [...prev.metadata.tags, prev.tagInput.trim()] },
        tagInput: '',
      }));
    }
  }, [state.tagInput, state.metadata.tags.length]);

  const removeTag = useCallback((tag: string) => {
    setState(prev => ({
      ...prev,
      metadata: { ...prev.metadata, tags: prev.metadata.tags.filter(t => t !== tag) },
    }));
  }, []);

  return (
    <div className="bg-gray-900 rounded-2xl p-6 space-y-6">
      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          state.isDragging ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" multiple accept="video/*" onChange={addFiles} className="hidden" />
        <div className="text-4xl mb-3">📁</div>
        <p className="text-white font-medium">Drop video files here or click to browse</p>
        <p className="text-gray-400 text-sm mt-1">Supports MP4, MOV, AVI, MKV (max {maxSizeMB / 1024}GB per file)</p>
        <p className="text-gray-500 text-xs mt-2">{state.files.length}/{maxFiles} files selected</p>
      </div>

      {/* File List */}
      {state.files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Files ({state.files.length})</h3>
            <button onClick={startAllUploads} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              Upload All
            </button>
          </div>
          {state.files.map(file => (
            <div key={file.id} className="flex items-center space-x-3 bg-gray-800 rounded-lg p-3">
              <div className="w-16 h-10 bg-gray-700 rounded flex items-center justify-center text-xs text-gray-400">
                {file.thumbnailUrl ? <img src={file.thumbnailUrl} alt="" className="w-full h-full object-cover rounded" /> : '🎬'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{file.name}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                  {file.status === 'uploading' && (
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full max-w-[120px]">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${file.progress}%` }} />
                    </div>
                  )}
                  <span className={`text-xs capitalize ${
                    file.status === 'complete' ? 'text-green-400' :
                    file.status === 'error' ? 'text-red-400' :
                    file.status === 'uploading' ? 'text-blue-400' : 'text-gray-500'
                  }`}>{file.status}</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {file.status === 'queued' && (
                  <button onClick={() => startUpload(file.id)} className="text-blue-400 text-xs hover:text-blue-300">Upload</button>
                )}
                <button onClick={() => removeFile(file.id)} className="text-gray-500 hover:text-red-400">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Metadata Form */}
      {state.files.length > 0 && (
        <div className="space-y-4 border-t border-gray-800 pt-6">
          <h3 className="text-white font-semibold">Video Details</h3>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={state.metadata.title}
              onChange={(e) => setState(prev => ({ ...prev, metadata: { ...prev.metadata, title: e.target.value } }))}
              placeholder="Enter video title"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={state.metadata.description}
              onChange={(e) => setState(prev => ({ ...prev, metadata: { ...prev.metadata, description: e.target.value } }))}
              placeholder="Describe your video..."
              rows={4}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Category</label>
              <select
                value={state.metadata.category}
                onChange={(e) => setState(prev => ({ ...prev, metadata: { ...prev.metadata, category: e.target.value } }))}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none"
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Visibility</label>
              <select
                value={state.metadata.visibility}
                onChange={(e) => setState(prev => ({ ...prev, metadata: { ...prev.metadata, visibility: e.target.value as 'public' | 'unlisted' | 'private' } }))}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {state.metadata.tags.map(tag => (
                <span key={tag} className="flex items-center bg-gray-800 text-gray-300 px-2 py-1 rounded-full text-xs">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="ml-1 text-gray-500 hover:text-red-400">✕</button>
                </span>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={state.tagInput}
                onChange={(e) => setState(prev => ({ ...prev, tagInput: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                placeholder="Add a tag"
                className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={addTag} className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUploader;
