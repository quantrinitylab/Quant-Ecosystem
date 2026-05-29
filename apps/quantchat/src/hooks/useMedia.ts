// ============================================================================
// QuantChat - useMedia Hook
// Camera access, photo capture, video recording, gallery, audio, upload
// ============================================================================
import { useState, useCallback, useRef } from 'react';
import { getAuthToken } from '../lib/auth';

interface MediaFile {
  id: string;
  type: 'photo' | 'video' | 'audio' | 'file';
  url: string;
  thumbnailUrl?: string;
  name: string;
  size: number;
  mimeType: string;
  duration?: number;
  width?: number;
  height?: number;
}
interface UploadProgress {
  fileId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}
interface UseMediaReturn {
  cameraStream: MediaStream | null;
  isRecording: boolean;
  recordingDuration: number;
  capturedMedia: MediaFile | null;
  uploads: UploadProgress[];
  error: string | null;
  startCamera: (facingMode?: string) => Promise<void>;
  stopCamera: () => void;
  capturePhoto: () => MediaFile | null;
  startVideoRecording: () => void;
  stopVideoRecording: () => Promise<MediaFile | null>;
  startAudioRecording: () => void;
  stopAudioRecording: () => Promise<MediaFile | null>;
  pickFromGallery: (accept?: string) => Promise<MediaFile | null>;
  uploadFile: (file: File) => Promise<string | null>;
  uploadMedia: (media: MediaFile) => Promise<string | null>;
  switchCamera: () => Promise<void>;
  hasPermission: (type: 'camera' | 'microphone') => Promise<boolean>;
}

const generateId = (): string => `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function useMedia(): UseMediaReturn {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [capturedMedia, setCapturedMedia] = useState<MediaFile | null>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<string>('user');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const startCamera = useCallback(
    async (mode: string = 'user') => {
      setError(null);
      try {
        if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        setCameraStream(stream);
        setFacingMode(mode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera access denied');
      }
    },
    [cameraStream],
  );

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  const capturePhoto = useCallback((): MediaFile | null => {
    if (!cameraStream) {
      setError('Camera not started');
      return null;
    }
    const video = document.createElement('video');
    video.srcObject = cameraStream;
    video.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const media: MediaFile = {
      id: generateId(),
      type: 'photo',
      url: dataUrl,
      name: `photo_${Date.now()}.jpg`,
      size: Math.round(dataUrl.length * 0.75),
      mimeType: 'image/jpeg',
      width: canvas.width,
      height: canvas.height,
    };
    setCapturedMedia(media);
    return media;
  }, [cameraStream]);

  const startVideoRecording = useCallback(() => {
    if (!cameraStream) {
      setError('Camera not started');
      return;
    }
    chunksRef.current = [];
    setRecordingDuration(0);
    setIsRecording(true);
    try {
      const recorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm;codecs=vp9' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setError('Recording not supported');
      setIsRecording(false);
    }
  }, [cameraStream]);

  const stopVideoRecording = useCallback(async (): Promise<MediaFile | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const media: MediaFile = {
          id: generateId(),
          type: 'video',
          url,
          name: `video_${Date.now()}.webm`,
          size: blob.size,
          mimeType: 'video/webm',
          duration: recordingDuration,
        };
        setCapturedMedia(media);
        setIsRecording(false);
        if (durationTimerRef.current) clearInterval(durationTimerRef.current);
        resolve(media);
      };
      mediaRecorderRef.current.stop();
    });
  }, [recordingDuration]);

  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      setRecordingDuration(0);
      setIsRecording(true);
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setError('Microphone access denied');
    }
  }, []);

  const stopAudioRecording = useCallback(async (): Promise<MediaFile | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const media: MediaFile = {
          id: generateId(),
          type: 'audio',
          url,
          name: `audio_${Date.now()}.webm`,
          size: blob.size,
          mimeType: 'audio/webm',
          duration: recordingDuration,
        };
        setCapturedMedia(media);
        setIsRecording(false);
        if (durationTimerRef.current) clearInterval(durationTimerRef.current);
        resolve(media);
      };
      mediaRecorderRef.current.stop();
    });
  }, [recordingDuration]);

  const pickFromGallery = useCallback(
    async (accept: string = 'image/*,video/*'): Promise<MediaFile | null> => {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          const url = URL.createObjectURL(file);
          const type = file.type.startsWith('video')
            ? 'video'
            : file.type.startsWith('audio')
              ? 'audio'
              : 'photo';
          const media: MediaFile = {
            id: generateId(),
            type: type as MediaFile['type'],
            url,
            name: file.name,
            size: file.size,
            mimeType: file.type,
          };
          setCapturedMedia(media);
          resolve(media);
        };
        input.click();
      });
    },
    [],
  );

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    const uploadId = generateId();
    setUploads((prev) => [...prev, { fileId: uploadId, progress: 0, status: 'uploading' }]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const xhr = new XMLHttpRequest();
      const url = await new Promise<string>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setUploads((prev) =>
              prev.map((u) =>
                u.fileId === uploadId
                  ? { ...u, progress: Math.round((e.loaded / e.total) * 100) }
                  : u,
              ),
            );
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            resolve(data.url);
          } else reject(new Error('Upload failed'));
        };
        xhr.onerror = () => reject(new Error('Upload error'));
        xhr.open('POST', '/api/media/upload');
        const token = getAuthToken() || '';
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });
      setUploads((prev) =>
        prev.map((u) => (u.fileId === uploadId ? { ...u, progress: 100, status: 'complete' } : u)),
      );
      return url;
    } catch (err) {
      setUploads((prev) =>
        prev.map((u) =>
          u.fileId === uploadId
            ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Failed' }
            : u,
        ),
      );
      return null;
    }
  }, []);

  const uploadMedia = useCallback(
    async (media: MediaFile): Promise<string | null> => {
      const response = await fetch(media.url);
      const blob = await response.blob();
      const file = new File([blob], media.name, { type: media.mimeType });
      return uploadFile(file);
    },
    [uploadFile],
  );

  const switchCamera = useCallback(async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    await startCamera(newMode);
  }, [facingMode, startCamera]);

  const hasPermission = useCallback(async (type: 'camera' | 'microphone'): Promise<boolean> => {
    try {
      const name =
        type === 'camera' ? ('camera' as PermissionName) : ('microphone' as PermissionName);
      const result = await navigator.permissions.query({ name });
      return result.state === 'granted';
    } catch {
      return false;
    }
  }, []);

  return {
    cameraStream,
    isRecording,
    recordingDuration,
    capturedMedia,
    uploads,
    error,
    startCamera,
    stopCamera,
    capturePhoto,
    startVideoRecording,
    stopVideoRecording,
    startAudioRecording,
    stopAudioRecording,
    pickFromGallery,
    uploadFile,
    uploadMedia,
    switchCamera,
    hasPermission,
  };
}

export default useMedia;
