import { RoomEventMessage } from '@/entities/game';

const LAST_ROOM_EVENT_KEY = 'nomat.lastRoomEvent';

export const roomEventBuffer = {
  write(event: RoomEventMessage) {
    sessionStorage.setItem(LAST_ROOM_EVENT_KEY, JSON.stringify(event));
  },
  consume(roomId: number): RoomEventMessage | null {
    const raw = sessionStorage.getItem(LAST_ROOM_EVENT_KEY);
    if (!raw) return null;

    sessionStorage.removeItem(LAST_ROOM_EVENT_KEY);

    try {
      const event = JSON.parse(raw) as RoomEventMessage;
      return event.roomId === roomId ? event : null;
    } catch {
      return null;
    }
  },
};
