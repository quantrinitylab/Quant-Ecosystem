// ============================================================================
// QuantChat - Story Creator Component
// Camera capture, gallery, text, drawing, stickers, music, filters, post
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@quant/common';

interface StoryCreatorProps {
  onPost: (story: StoryData) => Promise<void>;
  onClose: () => void;
}
interface StoryData {
  type: 'photo' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
  textStyle?: TextStyle;
  filter?: string;
  stickers: Sticker[];
  drawings: DrawingPath[];
  music?: { id: string; name: string; startTime: number };
  duration: number;
  privacy: 'friends' | 'everyone' | 'custom';
}
interface TextStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  alignment: 'left' | 'center' | 'right';
  position: { x: number; y: number };
}
interface Sticker {
  id: string;
  url: string;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
}
interface DrawingPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}
interface FilterOption {
  id: string;
  name: string;
  cssFilter: string;
}
interface StickerOption {
  id: string;
  url: string;
  category: string;
}

const FILTERS: FilterOption[] = [
  { id: 'none', name: 'Normal', cssFilter: 'none' },
  { id: 'vintage', name: 'Vintage', cssFilter: 'sepia(0.5) contrast(1.1)' },
  { id: 'bright', name: 'Bright', cssFilter: 'brightness(1.2) saturate(1.3)' },
  { id: 'bw', name: 'B&W', cssFilter: 'grayscale(1)' },
  { id: 'warm', name: 'Warm', cssFilter: 'sepia(0.2) saturate(1.4) brightness(1.1)' },
  { id: 'cool', name: 'Cool', cssFilter: 'saturate(0.8) hue-rotate(20deg) brightness(1.05)' },
  { id: 'dramatic', name: 'Drama', cssFilter: 'contrast(1.4) saturate(1.2) brightness(0.9)' },
  { id: 'fade', name: 'Fade', cssFilter: 'contrast(0.8) brightness(1.1) saturate(0.7)' },
];

const FONTS = ['Arial', 'Georgia', 'Courier New', 'Comic Sans MS', 'Impact', 'Verdana'];
const DRAWING_COLORS = [
  '#FFFFFF',
  '#000000',
  '#FF0000',
  '#00FF00',
  '#0000FF',
  '#FFFF00',
  '#FF00FF',
  '#00FFFF',
  '#FF6B35',
  '#7B2FBE',
];

export const StoryCreator: React.FC<StoryCreatorProps> = ({ onPost, onClose }) => {
  const [mode, setMode] = useState<'camera' | 'gallery' | 'text'>('camera');
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [drawings, setDrawings] = useState<DrawingPath[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawColor, setDrawColor] = useState<string>('#FFFFFF');
  const [drawWidth, setDrawWidth] = useState<number>(3);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [showTextTool, setShowTextTool] = useState<boolean>(false);
  const [textStyle, setTextStyle] = useState<TextStyle>({
    content: '',
    fontFamily: 'Arial',
    fontSize: 24,
    color: '#FFFFFF',
    backgroundColor: 'transparent',
    alignment: 'center',
    position: { x: 50, y: 50 },
  });
  const [showStickers, setShowStickers] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showMusic, setShowMusic] = useState<boolean>(false);
  const [selectedMusic, setSelectedMusic] = useState<{
    id: string;
    name: string;
    startTime: number;
  } | null>(null);
  const [privacy, setPrivacy] = useState<'friends' | 'everyone'>('friends');
  const [posting, setPosting] = useState<boolean>(false);
  const [recording, setRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [mode]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1080, height: 1920 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      logger.error('Camera access denied:', err);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      setCapturedMedia(canvas.toDataURL('image/jpeg', 0.9));
      setMediaType('photo');
    }
  }, []);

  const startRecording = useCallback(() => {
    setRecording(true);
    setRecordingTime(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((t) => {
        if (t >= 60) {
          stopRecording();
          return t;
        }
        return t + 1;
      });
    }, 1000);
  }, []);

  const stopRecording = useCallback(() => {
    setRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setCapturedMedia('video-placeholder');
    setMediaType('video');
  }, []);

  const handleGallerySelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedMedia(reader.result as string);
      setMediaType(file.type.startsWith('video') ? 'video' : 'photo');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrawStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const point =
        'touches' in e
          ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
          : {
              x: (e as React.MouseEvent).clientX - rect.left,
              y: (e as React.MouseEvent).clientY - rect.top,
            };
      setCurrentPath([point]);
    },
    [isDrawing],
  );

  const handleDrawMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || currentPath.length === 0) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const point =
        'touches' in e
          ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
          : {
              x: (e as React.MouseEvent).clientX - rect.left,
              y: (e as React.MouseEvent).clientY - rect.top,
            };
      setCurrentPath((prev) => [...prev, point]);
    },
    [isDrawing, currentPath],
  );

  const handleDrawEnd = useCallback(() => {
    if (currentPath.length > 1) {
      setDrawings((prev) => [...prev, { points: currentPath, color: drawColor, width: drawWidth }]);
    }
    setCurrentPath([]);
  }, [currentPath, drawColor, drawWidth]);

  const addSticker = useCallback((sticker: StickerOption) => {
    setStickers((prev) => [
      ...prev,
      { id: sticker.id, url: sticker.url, position: { x: 50, y: 50 }, scale: 1, rotation: 0 },
    ]);
    setShowStickers(false);
  }, []);

  const handlePost = useCallback(async () => {
    setPosting(true);
    try {
      // Text mode posts a real text story (type 'text' + text body); the old
      // code sent type 'photo' with mediaUrl 'text-mode', which the stories
      // page rejected as a non-remote upload — text stories could never post.
      const isTextMode = mode === 'text';
      const storyData: StoryData = {
        type: isTextMode ? 'text' : mediaType,
        mediaUrl: isTextMode ? undefined : capturedMedia || undefined,
        filter: activeFilter,
        stickers,
        drawings,
        music: selectedMusic || undefined,
        duration: mediaType === 'video' ? recordingTime : 5,
        privacy,
        ...(showTextTool && { text: textStyle.content, textStyle }),
      };
      await onPost(storyData);
    } catch (err) {
      logger.error('Post failed:', err);
    } finally {
      setPosting(false);
    }
  }, [
    mode,
    mediaType,
    capturedMedia,
    activeFilter,
    stickers,
    drawings,
    selectedMusic,
    recordingTime,
    privacy,
    textStyle,
    showTextTool,
    onPost,
  ]);

  return (
    <div className="story-creator">
      <div className="creator-header">
        <button onClick={onClose} className="close-btn">
          \u2715
        </button>
        <div className="mode-tabs">
          <button onClick={() => setMode('camera')} className={mode === 'camera' ? 'active' : ''}>
            Camera
          </button>
          <button onClick={() => setMode('gallery')} className={mode === 'gallery' ? 'active' : ''}>
            Gallery
          </button>
          <button
            onClick={() => {
              setMode('text');
              setShowTextTool(true);
              setCapturedMedia('text-mode');
            }}
            className={mode === 'text' ? 'active' : ''}
          >
            Text
          </button>
        </div>
      </div>

      <div
        className="creator-canvas"
        onMouseDown={handleDrawStart}
        onMouseMove={handleDrawMove}
        onMouseUp={handleDrawEnd}
        onTouchStart={handleDrawStart}
        onTouchMove={handleDrawMove}
        onTouchEnd={handleDrawEnd}
      >
        {!capturedMedia && mode === 'camera' && (
          <>
            <video
              ref={videoRef}
              className="camera-preview"
              style={{ filter: FILTERS.find((f) => f.id === activeFilter)?.cssFilter }}
              autoPlay
              playsInline
              muted
            />
            <canvas ref={canvasRef} hidden />
          </>
        )}
        {capturedMedia && capturedMedia !== 'text-mode' && (
          <div
            className="captured-preview"
            style={{ filter: FILTERS.find((f) => f.id === activeFilter)?.cssFilter }}
          >
            {mediaType === 'video' ? (
              <video src={capturedMedia} className="preview-video" />
            ) : (
              <img src={capturedMedia} alt="" className="preview-image" />
            )}
          </div>
        )}
        {mode === 'text' && (
          <div
            className="text-canvas"
            style={{
              backgroundColor:
                textStyle.backgroundColor !== 'transparent' ? textStyle.backgroundColor : '#000',
            }}
          >
            <div
              className="text-content"
              style={{
                fontFamily: textStyle.fontFamily,
                fontSize: `${textStyle.fontSize}px`,
                color: textStyle.color,
                textAlign: textStyle.alignment,
              }}
            >
              {textStyle.content || 'Tap to type...'}
            </div>
          </div>
        )}
        {drawings.map((path, i) => (
          <svg key={i} className="drawing-layer">
            <polyline
              points={path.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={path.color}
              strokeWidth={path.width}
              strokeLinecap="round"
            />
          </svg>
        ))}
        {currentPath.length > 0 && (
          <svg className="drawing-layer active">
            <polyline
              points={currentPath.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={drawColor}
              strokeWidth={drawWidth}
              strokeLinecap="round"
            />
          </svg>
        )}
        {stickers.map((s) => (
          <div
            key={s.id}
            className="sticker-overlay"
            style={{
              left: `${s.position.x}%`,
              top: `${s.position.y}%`,
              transform: `scale(${s.scale}) rotate(${s.rotation}deg)`,
            }}
          >
            <img src={s.url} alt="" />
          </div>
        ))}
      </div>

      {!capturedMedia && mode === 'camera' && (
        <div className="capture-controls">
          <button onClick={capturePhoto} className="capture-btn">
            {recording ? (
              <span className="recording-indicator">{recordingTime}s</span>
            ) : (
              <span className="capture-circle"></span>
            )}
          </button>
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className="record-btn"
          >
            Hold to Record
          </button>
        </div>
      )}
      {mode === 'gallery' && !capturedMedia && (
        <div className="gallery-picker">
          <input type="file" accept="image/*,video/*" onChange={handleGallerySelect} />
          <p>Select a photo or video from your gallery</p>
        </div>
      )}

      {(capturedMedia || mode === 'text') && (
        <div className="editing-tools">
          <div className="tool-bar">
            <button
              onClick={() => setShowTextTool(!showTextTool)}
              className={showTextTool ? 'active' : ''}
            >
              T
            </button>
            <button onClick={() => setIsDrawing(!isDrawing)} className={isDrawing ? 'active' : ''}>
              \u270F\uFE0F
            </button>
            <button onClick={() => setShowStickers(!showStickers)}>{'\u{1F600}'}</button>
            <button onClick={() => setShowFilters(!showFilters)}>{'\u{1F3A8}'}</button>
            <button onClick={() => setShowMusic(!showMusic)}>{'\u{1F3B5}'}</button>
          </div>
          {isDrawing && (
            <div className="draw-options">
              <div className="draw-colors">
                {DRAWING_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDrawColor(c)}
                    className={drawColor === c ? 'active' : ''}
                    style={{ backgroundColor: c }}
                  ></button>
                ))}
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={drawWidth}
                onChange={(e) => setDrawWidth(Number(e.target.value))}
              />
              <button onClick={() => setDrawings((prev) => prev.slice(0, -1))}>Undo</button>
            </div>
          )}
          {showTextTool && (
            <div className="text-options">
              <textarea
                value={textStyle.content}
                onChange={(e) => setTextStyle((p) => ({ ...p, content: e.target.value }))}
                placeholder="Type something..."
              />
              <select
                value={textStyle.fontFamily}
                onChange={(e) => setTextStyle((p) => ({ ...p, fontFamily: e.target.value }))}
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <input
                type="color"
                value={textStyle.color}
                onChange={(e) => setTextStyle((p) => ({ ...p, color: e.target.value }))}
              />
              <input
                type="range"
                min="12"
                max="72"
                value={textStyle.fontSize}
                onChange={(e) => setTextStyle((p) => ({ ...p, fontSize: Number(e.target.value) }))}
              />
            </div>
          )}
          {showFilters && (
            <div className="filter-options">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={activeFilter === f.id ? 'active' : ''}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <div className="post-controls">
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'friends' | 'everyone')}
            >
              <option value="friends">Friends</option>
              <option value="everyone">Everyone</option>
            </select>
            <button onClick={handlePost} disabled={posting} className="post-btn">
              {posting ? 'Posting...' : 'Post Story'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryCreator;
