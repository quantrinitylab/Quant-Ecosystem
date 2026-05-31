'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';

export interface RemoteParticipant {
  participantId: string;
  displayName: string;
  stream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSpeaking: boolean;
}

export interface UseLiveKitOptions {
  roomId: string;
  token?: string;
  serverUrl?: string;
}

export interface UseLiveKitReturn {
  localStream: MediaStream | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  remoteParticipants: RemoteParticipant[];
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  disconnect: () => void;
}

export function useLiveKit({ roomId, token, serverUrl }: UseLiveKitOptions): UseLiveKitReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resolvedUrl = serverUrl || LIVEKIT_URL;

  // Speaking detection using AudioContext/AnalyserNode
  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      speakingIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        setIsSpeaking(average > 15);
      }, 100);
    } catch {
      // AudioContext not available in some environments
    }
  }, []);

  const stopSpeakingDetection = useCallback(() => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsSpeaking(false);
  }, []);

  // Handle signaling messages from WebSocket
  const handleSignalingMessage = useCallback(
    async (message: {
      type: string;
      participantId?: string;
      displayName?: string;
      offer?: RTCSessionDescriptionInit;
      answer?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    }) => {
      const { type, participantId } = message;
      if (!participantId) return;

      if (type === 'participant-joined') {
        setRemoteParticipants((prev) => {
          if (prev.find((p) => p.participantId === participantId)) return prev;
          return [
            ...prev,
            {
              participantId,
              displayName: message.displayName || 'Participant',
              stream: null,
              audioEnabled: true,
              videoEnabled: true,
              isSpeaking: false,
            },
          ];
        });

        // Create peer connection for the new participant
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        peerConnectionsRef.current.set(participantId, pc);

        // Add local tracks to the connection
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current!);
          });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
          const [remoteStream] = event.streams;
          setRemoteParticipants((prev) =>
            prev.map((p) =>
              p.participantId === participantId ? { ...p, stream: remoteStream } : p,
            ),
          );
        };

        // ICE candidate handling
        pc.onicecandidate = (event) => {
          if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'ice-candidate',
                participantId,
                candidate: event.candidate.toJSON(),
              }),
            );
          }
        };

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'offer',
              participantId,
              offer: pc.localDescription,
            }),
          );
        }
      } else if (type === 'offer' && message.offer) {
        let pc = peerConnectionsRef.current.get(participantId);
        if (!pc) {
          pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          peerConnectionsRef.current.set(participantId, pc);

          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
              pc!.addTrack(track, localStreamRef.current!);
            });
          }

          pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            setRemoteParticipants((prev) =>
              prev.map((p) =>
                p.participantId === participantId ? { ...p, stream: remoteStream } : p,
              ),
            );
          };

          pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'ice-candidate',
                  participantId,
                  candidate: event.candidate.toJSON(),
                }),
              );
            }
          };
        }

        await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'answer',
              participantId,
              answer: pc.localDescription,
            }),
          );
        }
      } else if (type === 'answer' && message.answer) {
        const pc = peerConnectionsRef.current.get(participantId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
      } else if (type === 'ice-candidate' && message.candidate) {
        const pc = peerConnectionsRef.current.get(participantId);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
      } else if (type === 'participant-left') {
        const pc = peerConnectionsRef.current.get(participantId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(participantId);
        }
        setRemoteParticipants((prev) => prev.filter((p) => p.participantId !== participantId));
      } else if (type === 'track-state') {
        setRemoteParticipants((prev) =>
          prev.map((p) =>
            p.participantId === participantId
              ? {
                  ...p,
                  audioEnabled:
                    ((message as Record<string, unknown>).audioEnabled as boolean) ??
                    p.audioEnabled,
                  videoEnabled:
                    ((message as Record<string, unknown>).videoEnabled as boolean) ??
                    p.videoEnabled,
                  isSpeaking:
                    ((message as Record<string, unknown>).isSpeaking as boolean) ?? p.isSpeaking,
                }
              : p,
          ),
        );
      }
    },
    [],
  );

  useEffect(() => {
    if (!token || !roomId) return;

    let cancelled = false;

    async function connect() {
      setIsConnecting(true);
      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Start speaking detection on local stream
        startSpeakingDetection(stream);

        // Connect to signaling WebSocket
        const wsUrl = `${resolvedUrl}/room/${roomId}?token=${encodeURIComponent(token!)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.addEventListener('open', () => {
          if (!cancelled) {
            setIsConnected(true);
            setIsConnecting(false);
          }
        });

        ws.addEventListener('message', (event) => {
          try {
            const msg = JSON.parse(event.data);
            handleSignalingMessage(msg);
          } catch {
            // Ignore non-JSON messages
          }
        });

        ws.addEventListener('close', () => {
          if (!cancelled) {
            setIsConnected(false);
          }
        });

        ws.addEventListener('error', () => {
          if (!cancelled) {
            setError('WebSocket connection failed');
            setIsConnected(false);
            setIsConnecting(false);
          }
        });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to access media devices';
          setError(message);
          setIsConnecting(false);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      stopSpeakingDetection();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setLocalStream(null);
      setIsConnected(false);
      setRemoteParticipants([]);
    };
  }, [
    token,
    roomId,
    resolvedUrl,
    handleSignalingMessage,
    startSpeakingDetection,
    stopSpeakingDetection,
  ]);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      const newEnabled = !audioEnabled;
      audioTracks.forEach((track) => {
        track.enabled = newEnabled;
      });
      setAudioEnabled(newEnabled);

      // Broadcast track state to remote participants
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'track-state-update', audioEnabled: newEnabled }),
        );
      }
    }
  }, [audioEnabled]);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      const newEnabled = !videoEnabled;
      videoTracks.forEach((track) => {
        track.enabled = newEnabled;
      });
      setVideoEnabled(newEnabled);

      // Broadcast track state to remote participants
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'track-state-update', videoEnabled: newEnabled }),
        );
      }
    }
  }, [videoEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'screen-share-stop' }));
      }
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);

      // Replace video track in peer connections with screen share track
      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        screenTrack.addEventListener('ended', () => {
          screenStreamRef.current = null;
          setIsScreenSharing(false);
          // Restore camera track
          const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
          if (cameraTrack) {
            peerConnectionsRef.current.forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              if (sender) {
                sender.replaceTrack(cameraTrack);
              }
            });
          }
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'screen-share-stop' }));
          }
        });
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'screen-share-start' }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to share screen';
      setError(message);
    }
  }, []);

  const disconnect = useCallback(() => {
    stopSpeakingDetection();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setLocalStream(null);
    setIsConnected(false);
    setIsConnecting(false);
    setIsScreenSharing(false);
    setRemoteParticipants([]);
  }, [stopSpeakingDetection]);

  return {
    localStream,
    isConnected,
    isConnecting,
    error,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    isSpeaking,
    remoteParticipants,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    disconnect,
  };
}
