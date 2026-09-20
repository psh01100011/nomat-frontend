const CURRENT_ROOM_ID_KEY = 'nomat.currentRoomId';

export const currentRoomStorage = {
  read(): number | null {
    const value = sessionStorage.getItem(CURRENT_ROOM_ID_KEY);
    const roomId = Number(value);
    return Number.isFinite(roomId) && roomId > 0 ? roomId : null;
  },
  write(roomId: number) {
    sessionStorage.setItem(CURRENT_ROOM_ID_KEY, String(roomId));
  },
  clear() {
    sessionStorage.removeItem(CURRENT_ROOM_ID_KEY);
  },
};
