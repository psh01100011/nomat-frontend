import { ApiClientError } from '@/entities/common';
import { RoomStatus } from '@/entities/room';
import { currentRoomStorage } from './current-room-storage';

export function getAlreadyJoinedRoomId(error: unknown) {
  if (!(error instanceof ApiClientError) || error.messageCode !== 'already_joined_room') return null;
  const dataRoomId = readRoomId(error.data);
  return dataRoomId ?? currentRoomStorage.read();
}

export function getAlreadyJoinedRoomStatus(error: unknown) {
  if (!(error instanceof ApiClientError) || error.messageCode !== 'already_joined_room') return null;
  const status = error.data?.status;
  return typeof status === 'string' ? (status as RoomStatus) : null;
}

function readRoomId(data: null | Record<string, unknown>) {
  if (!data) return null;
  const value = data.roomId ?? data.currentRoomId;
  const roomId = Number(value);
  return Number.isFinite(roomId) && roomId > 0 ? roomId : null;
}
