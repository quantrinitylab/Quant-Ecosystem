// @vitest-environment jsdom
// ============================================================================
// MeetingRoom Component Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock livekit-client
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn();
const mockRemoveAllListeners = vi.fn();
const mockOn = vi.fn();
const mockEnableCameraAndMicrophone = vi.fn().mockResolvedValue(undefined);

const mockLocalParticipant = {
  identity: 'local-user',
  name: 'Local User',
  isSpeaking: false,
  isMicrophoneEnabled: true,
  isCameraEnabled: true,
  enableCameraAndMicrophone: mockEnableCameraAndMicrophone,
};

const mockRemoteParticipants = new Map();

vi.mock('livekit-client', () => ({
  Room: vi.fn().mockImplementation(function () {
    return {
      connect: mockConnect,
      disconnect: mockDisconnect,
      removeAllListeners: mockRemoveAllListeners,
      on: mockOn,
      localParticipant: mockLocalParticipant,
      remoteParticipants: mockRemoteParticipants,
    };
  }),
  RoomEvent: {
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    Disconnected: 'disconnected',
    DataReceived: 'dataReceived',
  },
  Track: {
    Source: {
      Camera: 'camera',
      Microphone: 'microphone',
      ScreenShare: 'screen_share',
    },
  },
  ConnectionState: {
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Connected: 'connected',
    Reconnecting: 'reconnecting',
  },
  ConnectionQuality: {
    Excellent: 'excellent',
    Good: 'good',
    Poor: 'poor',
    Lost: 'lost',
    Unknown: 'unknown',
  },
  RemoteParticipant: vi.fn(),
  LocalParticipant: vi.fn(),
  RemoteTrackPublication: vi.fn(),
}));

import { MeetingRoom } from '../MeetingRoom';

describe('MeetingRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoteParticipants.clear();
    mockConnect.mockResolvedValue(undefined);
  });

  it('renders connecting state initially', () => {
    render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );
    expect(screen.getByText(/Connecting to test-room/)).toBeDefined();
  });

  it('connects to room with token and server URL', async () => {
    render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith('wss://test.livekit.cloud', 'test-token');
    });
  });

  it('enables camera and microphone after connecting', async () => {
    render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(mockEnableCameraAndMicrophone).toHaveBeenCalled();
    });
  });

  it('renders meeting room after successful connection', async () => {
    render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('meeting-room')).toBeDefined();
    });
  });

  it('shows local participant name', async () => {
    render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(screen.getByText('Local User')).toBeDefined();
    });
  });

  it('calls onDisconnect callback when disconnect event fires', async () => {
    const onDisconnect = vi.fn();
    render(
      <MeetingRoom
        token="test-token"
        serverUrl="wss://test.livekit.cloud"
        roomName="test-room"
        onDisconnect={onDisconnect}
      />,
    );

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled();
    });

    // Find the disconnect handler and call it
    const disconnectCall = mockOn.mock.calls.find((call) => call[0] === 'disconnected');
    expect(disconnectCall).toBeDefined();
    act(() => {
      disconnectCall![1]();
    });

    expect(onDisconnect).toHaveBeenCalled();
  });

  it('disconnects when leave button is clicked', async () => {
    render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('leave-button')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('leave-button'));
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('shows error state when connection fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

    render(
      <MeetingRoom token="bad-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(screen.getByText('Connection Error')).toBeDefined();
      expect(screen.getByText('Connection refused')).toBeDefined();
    });
  });

  it('disconnects and removes listeners on unmount', async () => {
    const { unmount } = render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalled();
    });

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockRemoveAllListeners).toHaveBeenCalled();
  });

  it('registers event handlers for participant updates', async () => {
    render(
      <MeetingRoom token="test-token" serverUrl="wss://test.livekit.cloud" roomName="test-room" />,
    );

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalled();
    });

    const registeredEvents = mockOn.mock.calls.map((call) => call[0]);
    expect(registeredEvents).toContain('participantConnected');
    expect(registeredEvents).toContain('participantDisconnected');
    expect(registeredEvents).toContain('trackSubscribed');
    expect(registeredEvents).toContain('activeSpeakersChanged');
    expect(registeredEvents).toContain('disconnected');
  });
});
