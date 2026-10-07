// ============================================================================
// QuantMax - useGroupRooms Hook
// Group video rooms state: room management, participants, chat
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { apiClient } from '../services/api-client';

interface Room {
  id: string;
  topic: string;
  hostId: string;
  hostName: string;
  participants: Participant[];
  maxParticipants: number;
  spectators: number;
  isPrivate: boolean;
  createdAt: number;
  tags: string[];
}

interface Participant {
  id: string;
  name: string;
  avatar: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isHost: boolean;
  joinedAt: number;
}

interface RoomChat {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

export function useGroupRooms(userId: string) {
  const queryClient = useQueryClient();
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [chat, setChat] = useState<RoomChat[]>([]);

  const roomsQuery = useQuery({
    queryKey: ['group-rooms'],
    queryFn: async () => {
      const response = await apiClient.getGroupRooms();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load rooms');
      }
      return (response.data ?? []) as Room[];
    },
  });

  const createRoomMutation = useMutation({
    mutationFn: async (data: {
      topic: string;
      maxParticipants: number;
      isPrivate: boolean;
      tags: string[];
    }) => {
      const response = await apiClient.createGroupRoom(data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create room');
      }
      return response.data as Room;
    },
    onSuccess: (room) => {
      setCurrentRoom(room);
      setChat([
        {
          id: 'sys-1',
          userId: 'system',
          userName: 'System',
          message: `Room "${room.topic}" created!`,
          timestamp: Date.now(),
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['group-rooms'] });
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const response = await apiClient.joinGroupRoom(roomId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to join room');
      }
      return response.data as Room;
    },
    onSuccess: (room) => {
      setCurrentRoom(room);
      setChat([
        {
          id: 'sys-join',
          userId: 'system',
          userName: 'System',
          message: 'You joined the room!',
          timestamp: Date.now(),
        },
      ]);
    },
  });

  const loadRooms = useCallback(async () => {
    await roomsQuery.refetch();
  }, [roomsQuery]);

  const createRoom = useCallback(
    async (
      topic: string,
      maxParticipants: number,
      isPrivate: boolean,
      tags: string[],
    ): Promise<Room> => {
      return createRoomMutation.mutateAsync({ topic, maxParticipants, isPrivate, tags });
    },
    [createRoomMutation],
  );

  const joinRoom = useCallback(
    async (roomId: string): Promise<boolean> => {
      try {
        await joinRoomMutation.mutateAsync(roomId);
        return true;
      } catch {
        return false;
      }
    },
    [joinRoomMutation],
  );

  const leaveRoom = useCallback(() => {
    if (!currentRoom) return;
    apiClient.leaveGroupRoom(currentRoom.id);
    setCurrentRoom(null);
    setChat([]);
    queryClient.invalidateQueries({ queryKey: ['group-rooms'] });
  }, [currentRoom, queryClient]);

  const sendMessage = useCallback(
    (message: string) => {
      if (!currentRoom) return;
      const msg: RoomChat = {
        id: `msg-${Date.now()}`,
        userId,
        userName: 'You',
        message,
        timestamp: Date.now(),
      };
      setChat((prev) => [...prev, msg]);
      apiClient.sendGroupRoomMessage(currentRoom.id, message);
    },
    [currentRoom, userId],
  );

  const toggleMute = useCallback(() => {
    if (!currentRoom) return;
    setCurrentRoom((prev) =>
      prev
        ? {
            ...prev,
            participants: prev.participants.map((p) =>
              p.id === userId ? { ...p, isMuted: !p.isMuted } : p,
            ),
          }
        : null,
    );
  }, [currentRoom, userId]);

  const toggleCamera = useCallback(() => {
    if (!currentRoom) return;
    setCurrentRoom((prev) =>
      prev
        ? {
            ...prev,
            participants: prev.participants.map((p) =>
              p.id === userId ? { ...p, isCameraOff: !p.isCameraOff } : p,
            ),
          }
        : null,
    );
  }, [currentRoom, userId]);

  const kickParticipant = useCallback(
    (targetId: string) => {
      if (!currentRoom) return;
      setCurrentRoom((prev) =>
        prev ? { ...prev, participants: prev.participants.filter((p) => p.id !== targetId) } : null,
      );
    },
    [currentRoom],
  );

  return {
    rooms: roomsQuery.data ?? [],
    currentRoom,
    chat,
    isInRoom: !!currentRoom,
    isLoading: roomsQuery.isLoading,
    error: roomsQuery.error,
    loadRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    toggleMute,
    toggleCamera,
    kickParticipant,
  };
}

export default useGroupRooms;
