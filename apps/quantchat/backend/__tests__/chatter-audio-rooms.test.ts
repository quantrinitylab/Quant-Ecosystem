import { describe, it, expect, beforeEach } from 'vitest';
import { AudioRoomService } from '../services/audio-room.service';

describe('Chatter Live Social Audio Rooms Service', () => {
  beforeEach(() => {
    AudioRoomService.clearAllRoomsForTesting();
  });

  it('room creation assigns creator as host and initializes active status', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_host',
      { username: 'hostuser', displayName: 'Host User' },
      { title: 'Tech Talk Live', topic: 'AI & Web3', tags: ['tech', 'ai'] },
    );

    expect(room).toBeDefined();
    expect(room.id).toBeTypeOf('string');
    expect(room.title).toBe('Tech Talk Live');
    expect(room.isActive).toBe(true);
    expect(room.hostId).toBe('user_host');
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0].userId).toBe('user_host');
    expect(room.participants[0].role).toBe('host');
    expect(room.participants[0].isMuted).toBe(false);
  });

  it('joining room as listener updates participant count', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_host',
      { username: 'hostuser', displayName: 'Host User' },
      { title: 'Open Mic' },
    );

    const { room: updatedRoom, participant } = AudioRoomService.joinAudioRoom(
      room.id,
      { userId: 'user_listener', username: 'listener1', displayName: 'Listener One' },
      'listener',
    );

    expect(updatedRoom.participants).toHaveLength(2);
    expect(participant.userId).toBe('user_listener');
    expect(participant.role).toBe('listener');
    expect(participant.isMuted).toBe(true);
  });

  it('raising and lowering hand updates handRaised state', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_host',
      { username: 'hostuser', displayName: 'Host User' },
      { title: 'Q&A Session' },
    );
    AudioRoomService.joinAudioRoom(room.id, {
      userId: 'user_listener',
      username: 'listener1',
      displayName: 'Listener One',
    });

    const raised = AudioRoomService.raiseHand(room.id, 'user_listener');
    expect(raised.handRaised).toBe(true);
    expect(raised.handRaisedAt).toBeDefined();

    const lowered = AudioRoomService.lowerHand(room.id, 'user_listener');
    expect(lowered.handRaised).toBe(false);
    expect(lowered.handRaisedAt).toBeUndefined();
  });

  it('host promoting listener to speaker converts role and resets handRaised', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_host',
      { username: 'hostuser', displayName: 'Host User' },
      { title: 'Discussion' },
    );
    AudioRoomService.joinAudioRoom(room.id, {
      userId: 'user_listener',
      username: 'listener1',
      displayName: 'Listener One',
    });
    AudioRoomService.raiseHand(room.id, 'user_listener');

    const promoted = AudioRoomService.promoteToSpeaker(room.id, 'user_host', 'user_listener');
    expect(promoted.role).toBe('speaker');
    expect(promoted.isMuted).toBe(false);
    expect(promoted.handRaised).toBe(false);
  });

  it('non-host cannot promote listener (throws 403 or error)', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_host',
      { username: 'hostuser', displayName: 'Host User' },
      { title: 'Discussion' },
    );
    AudioRoomService.joinAudioRoom(room.id, {
      userId: 'user_listener1',
      username: 'listener1',
      displayName: 'Listener One',
    });
    AudioRoomService.joinAudioRoom(room.id, {
      userId: 'user_listener2',
      username: 'listener2',
      displayName: 'Listener Two',
    });

    expect(() => {
      AudioRoomService.promoteToSpeaker(room.id, 'user_listener1', 'user_listener2');
    }).toThrow();
  });

  it('host muting speaker sets isMuted: true', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_host',
      { username: 'hostuser', displayName: 'Host User' },
      { title: 'Discussion' },
    );
    AudioRoomService.joinAudioRoom(
      room.id,
      { userId: 'user_speaker', username: 'speaker1', displayName: 'Speaker One' },
      'speaker',
    );

    const muted = AudioRoomService.muteSpeaker(room.id, 'user_host', 'user_speaker');
    expect(muted.isMuted).toBe(true);
  });

  it('leaving room removes participant and if host leaves, automatically promotes next speaker or closes room', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_host',
      { username: 'hostuser', displayName: 'Host User' },
      { title: 'Discussion' },
    );
    AudioRoomService.joinAudioRoom(
      room.id,
      { userId: 'user_speaker', username: 'speaker1', displayName: 'Speaker One' },
      'speaker',
    );
    AudioRoomService.joinAudioRoom(
      room.id,
      { userId: 'user_listener', username: 'listener1', displayName: 'Listener One' },
      'listener',
    );

    // Host leaves
    const result = AudioRoomService.leaveAudioRoom(room.id, 'user_host');
    expect(result.hostTransferred).toBe(true);
    expect(result.room).not.toBeNull();
    expect(result.room?.hostId).toBe('user_speaker');
    expect(result.room?.participants.find((p) => p.userId === 'user_speaker')?.role).toBe('host');

    // Remaining participants leave until room closes
    AudioRoomService.leaveAudioRoom(room.id, 'user_speaker');
    const finalResult = AudioRoomService.leaveAudioRoom(room.id, 'user_listener');
    expect(finalResult.room).toBeNull();
  });
});
