import { describe, it, expect, beforeEach } from 'vitest';
import { RoomService } from '../services/room.service';
import type { CreateRoomInput, JoinParticipantInput } from '../services/room.service';

describe('RoomService', () => {
  let service: RoomService;

  beforeEach(() => {
    service = new RoomService();
  });

  describe('createRoom', () => {
    it('creates a room with a generated id, name, hostId, and active status', () => {
      const input: CreateRoomInput = {
        name: 'Sprint Planning',
        hostId: 'user-1',
        settings: {
          maxParticipants: 10,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      };

      const room = service.createRoom(input);

      expect(room.id).toBeDefined();
      expect(room.name).toBe('Sprint Planning');
      expect(room.hostId).toBe('user-1');
      expect(room.status).toBe('active');
      expect(room.participants).toEqual([]);
      expect(room.createdAt).toBeInstanceOf(Date);
    });

    it('uses default settings when settings not provided', () => {
      const input: CreateRoomInput = {
        name: 'Quick Call',
        hostId: 'user-2',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      };

      const room = service.createRoom(input);

      expect(room.settings.maxParticipants).toBe(50);
      expect(room.settings.waitingRoom).toBe(false);
      expect(room.settings.muteOnEntry).toBe(false);
      expect(room.settings.allowScreenShare).toBe(true);
    });

    it('generates unique ids for multiple rooms', () => {
      const input: CreateRoomInput = {
        name: 'Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      };

      const room1 = service.createRoom(input);
      const room2 = service.createRoom(input);

      expect(room1.id).not.toBe(room2.id);
    });

    it('stores room settings correctly', () => {
      const input: CreateRoomInput = {
        name: 'Secure Room',
        hostId: 'user-admin',
        settings: {
          maxParticipants: 5,
          waitingRoom: true,
          muteOnEntry: true,
          allowScreenShare: false,
          enableRecording: true,
          enableTranscript: true,
        },
      };

      const room = service.createRoom(input);

      expect(room.settings.maxParticipants).toBe(5);
      expect(room.settings.waitingRoom).toBe(true);
      expect(room.settings.muteOnEntry).toBe(true);
      expect(room.settings.allowScreenShare).toBe(false);
      expect(room.settings.enableRecording).toBe(true);
      expect(room.settings.enableTranscript).toBe(true);
    });
  });

  describe('joinRoom', () => {
    it('adds a participant to the room', () => {
      const room = service.createRoom({
        name: 'Team Standup',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      const participant: JoinParticipantInput = {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      };

      const updatedRoom = service.joinRoom(room.id, participant);

      expect(updatedRoom.participants).toHaveLength(1);
      expect(updatedRoom.participants[0]!.userId).toBe('user-2');
      expect(updatedRoom.participants[0]!.displayName).toBe('Alice');
      expect(updatedRoom.participants[0]!.role).toBe('participant');
      expect(updatedRoom.participants[0]!.id).toBeDefined();
    });

    it('throws ROOM_NOT_FOUND if room does not exist', () => {
      const participant: JoinParticipantInput = {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      };

      expect(() => service.joinRoom('non-existent-id', participant)).toThrow('Room not found');
    });

    it('throws ROOM_FULL when room is at max capacity', () => {
      const room = service.createRoom({
        name: 'Small Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 2,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      service.joinRoom(room.id, {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });
      service.joinRoom(room.id, {
        userId: 'user-3',
        displayName: 'Bob',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });

      expect(() =>
        service.joinRoom(room.id, {
          userId: 'user-4',
          displayName: 'Charlie',
          role: 'participant',
          audioEnabled: true,
          videoEnabled: true,
        }),
      ).toThrow('Room is full');
    });

    it('throws ALREADY_IN_ROOM if user is already a participant', () => {
      const room = service.createRoom({
        name: 'Test Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      service.joinRoom(room.id, {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });

      expect(() =>
        service.joinRoom(room.id, {
          userId: 'user-2',
          displayName: 'Alice Again',
          role: 'participant',
          audioEnabled: true,
          videoEnabled: true,
        }),
      ).toThrow('User already in room');
    });

    it('mutes audio on entry when muteOnEntry is enabled', () => {
      const room = service.createRoom({
        name: 'Muted Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: true,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      const updatedRoom = service.joinRoom(room.id, {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });

      expect(updatedRoom.participants[0]!.audioEnabled).toBe(false);
    });
  });

  describe('leaveRoom', () => {
    it('removes a participant from the room', () => {
      const room = service.createRoom({
        name: 'Team Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      const updatedRoom = service.joinRoom(room.id, {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });

      const participantId = updatedRoom.participants[0]!.id;
      const result = service.leaveRoom(room.id, participantId);

      expect(result.participants).toHaveLength(0);
    });

    it('throws PARTICIPANT_NOT_FOUND if participant is not in the room', () => {
      const room = service.createRoom({
        name: 'Team Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      expect(() => service.leaveRoom(room.id, 'non-existent-participant')).toThrow(
        'Participant not found in room',
      );
    });

    it('throws ROOM_NOT_FOUND if room does not exist', () => {
      expect(() => service.leaveRoom('non-existent-room', 'participant-1')).toThrow(
        'Room not found',
      );
    });
  });

  describe('getRoom', () => {
    it('returns the room when it exists', () => {
      const created = service.createRoom({
        name: 'Existing Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      const room = service.getRoom(created.id);

      expect(room.id).toBe(created.id);
      expect(room.name).toBe('Existing Room');
    });

    it('throws ROOM_NOT_FOUND for a non-existent room', () => {
      expect(() => service.getRoom('does-not-exist')).toThrow('Room not found');
    });

    it('returns room with current participant state', () => {
      const created = service.createRoom({
        name: 'Active Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      service.joinRoom(created.id, {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });

      const room = service.getRoom(created.id);

      expect(room.participants).toHaveLength(1);
      expect(room.participants[0]!.userId).toBe('user-2');
    });
  });

  describe('listParticipants', () => {
    it('returns empty array for room with no participants', () => {
      const room = service.createRoom({
        name: 'Empty Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      const participants = service.listParticipants(room.id);

      expect(participants).toEqual([]);
    });

    it('returns all current participants', () => {
      const room = service.createRoom({
        name: 'Full Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      service.joinRoom(room.id, {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });
      service.joinRoom(room.id, {
        userId: 'user-3',
        displayName: 'Bob',
        role: 'co-host',
        audioEnabled: true,
        videoEnabled: true,
      });

      const participants = service.listParticipants(room.id);

      expect(participants).toHaveLength(2);
      expect(participants[0]!.displayName).toBe('Alice');
      expect(participants[1]!.displayName).toBe('Bob');
    });

    it('throws ROOM_NOT_FOUND for non-existent room', () => {
      expect(() => service.listParticipants('ghost-room')).toThrow('Room not found');
    });
  });

  describe('closeRoom', () => {
    it('marks room as closed and clears participants', () => {
      const room = service.createRoom({
        name: 'Closing Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      service.joinRoom(room.id, {
        userId: 'user-2',
        displayName: 'Alice',
        role: 'participant',
        audioEnabled: true,
        videoEnabled: true,
      });

      service.closeRoom(room.id);

      const closedRoom = service.getRoom(room.id);
      expect(closedRoom.status).toBe('closed');
      expect(closedRoom.participants).toHaveLength(0);
    });

    it('throws ROOM_NOT_FOUND if room does not exist', () => {
      expect(() => service.closeRoom('non-existent')).toThrow('Room not found');
    });

    it('prevents joining a closed room', () => {
      const room = service.createRoom({
        name: 'Closed Room',
        hostId: 'user-1',
        settings: {
          maxParticipants: 50,
          waitingRoom: false,
          muteOnEntry: false,
          allowScreenShare: true,
          enableRecording: false,
          enableTranscript: false,
        },
      });

      service.closeRoom(room.id);

      expect(() =>
        service.joinRoom(room.id, {
          userId: 'user-2',
          displayName: 'Alice',
          role: 'participant',
          audioEnabled: true,
          videoEnabled: true,
        }),
      ).toThrow('Room is closed');
    });
  });
});
