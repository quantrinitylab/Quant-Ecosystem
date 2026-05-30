export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRTCHookOptions {
  roomId: string;
  participantId: string;
  signalingUrl: string;
  iceServers?: RTCIceServer[];
  onTrack?: (event: { track: MediaStreamTrack; streams: readonly MediaStream[] }) => void;
  onParticipantJoined?: (participantId: string) => void;
  onParticipantLeft?: (participantId: string) => void;
}

export interface PeerConnectionManager {
  connect(): void;
  disconnect(): void;
  createOffer(targetId: string): Promise<string>;
  handleOffer(fromId: string, sdp: string): Promise<string>;
  handleAnswer(fromId: string, sdp: string): void;
  addIceCandidate(fromId: string, candidate: RTCIceCandidateInit): void;
  getLocalStream(): MediaStream | null;
  setLocalStream(stream: MediaStream): void;
  muteTrack(track: 'audio' | 'video'): void;
  unmuteTrack(track: 'audio' | 'video'): void;
}

export function createPeerConnectionManager(options: WebRTCHookOptions): PeerConnectionManager {
  const peers = new Map<string, RTCPeerConnection>();
  let localStream: MediaStream | null = null;
  let ws: WebSocket | null = null;

  function getOrCreatePeer(peerId: string): RTCPeerConnection {
    let pc = peers.get(peerId);
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: options.iceServers as RTCIceServer[] | undefined,
      });
      pc.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'ice-candidate',
              roomId: options.roomId,
              fromId: options.participantId,
              toId: peerId,
              candidate: {
                candidate: event.candidate.candidate,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                sdpMid: event.candidate.sdpMid,
              },
            }),
          );
        }
      };
      pc.ontrack = (event) => {
        options.onTrack?.({ track: event.track, streams: event.streams });
      };
      if (localStream) {
        for (const track of localStream.getTracks()) {
          pc.addTrack(track, localStream);
        }
      }
      peers.set(peerId, pc);
    }
    return pc;
  }

  function handleSignalingMessage(data: string): void {
    let msg: { type: string; fromId?: string; sdp?: string; candidate?: RTCIceCandidateInit };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'offer':
        if (msg.fromId && msg.sdp) {
          void manager.handleOffer(msg.fromId, msg.sdp);
        }
        break;
      case 'answer':
        if (msg.fromId && msg.sdp) {
          manager.handleAnswer(msg.fromId, msg.sdp);
        }
        break;
      case 'ice-candidate':
        if (msg.fromId && msg.candidate) {
          manager.addIceCandidate(msg.fromId, msg.candidate);
        }
        break;
      case 'participant-joined':
        if (msg.fromId) {
          options.onParticipantJoined?.(msg.fromId);
        }
        break;
      case 'participant-left':
        if (msg.fromId) {
          const pc = peers.get(msg.fromId);
          if (pc) {
            pc.close();
            peers.delete(msg.fromId);
          }
          options.onParticipantLeft?.(msg.fromId);
        }
        break;
    }
  }

  const manager: PeerConnectionManager = {
    connect() {
      ws = new WebSocket(options.signalingUrl);
      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: 'join',
            roomId: options.roomId,
            participantId: options.participantId,
          }),
        );
      };
      ws.onmessage = (event) => {
        handleSignalingMessage(event.data as string);
      };
    },

    disconnect() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'leave',
            roomId: options.roomId,
            participantId: options.participantId,
          }),
        );
        ws.close();
      }
      for (const pc of peers.values()) {
        pc.close();
      }
      peers.clear();
      ws = null;
    },

    async createOffer(targetId: string): Promise<string> {
      const pc = getOrCreatePeer(targetId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'offer',
            roomId: options.roomId,
            fromId: options.participantId,
            toId: targetId,
            sdp: offer.sdp,
          }),
        );
      }
      return offer.sdp ?? '';
    },

    async handleOffer(fromId: string, sdp: string): Promise<string> {
      const pc = getOrCreatePeer(fromId);
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'answer',
            roomId: options.roomId,
            fromId: options.participantId,
            toId: fromId,
            sdp: answer.sdp,
          }),
        );
      }
      return answer.sdp ?? '';
    },

    handleAnswer(fromId: string, sdp: string): void {
      const pc = peers.get(fromId);
      if (pc) {
        void pc.setRemoteDescription({ type: 'answer', sdp });
      }
    },

    addIceCandidate(fromId: string, candidate: RTCIceCandidateInit): void {
      const pc = peers.get(fromId);
      if (pc) {
        void pc.addIceCandidate(candidate);
      }
    },

    getLocalStream(): MediaStream | null {
      return localStream;
    },

    setLocalStream(stream: MediaStream): void {
      localStream = stream;
      for (const [, pc] of peers) {
        const senders = pc.getSenders();
        for (const track of stream.getTracks()) {
          const existingSender = senders.find((s) => s.track?.kind === track.kind);
          if (existingSender) {
            void existingSender.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
          }
        }
      }
    },

    muteTrack(track: 'audio' | 'video'): void {
      if (!localStream) return;
      const tracks =
        track === 'audio' ? localStream.getAudioTracks() : localStream.getVideoTracks();
      for (const t of tracks) {
        t.enabled = false;
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'mute',
            roomId: options.roomId,
            participantId: options.participantId,
            track,
          }),
        );
      }
    },

    unmuteTrack(track: 'audio' | 'video'): void {
      if (!localStream) return;
      const tracks =
        track === 'audio' ? localStream.getAudioTracks() : localStream.getVideoTracks();
      for (const t of tracks) {
        t.enabled = true;
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'unmute',
            roomId: options.roomId,
            participantId: options.participantId,
            track,
          }),
        );
      }
    },
  };

  return manager;
}
