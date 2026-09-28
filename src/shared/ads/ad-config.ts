export type AdPlacement =
  | 'mapListLeft'
  | 'mapListRight'
  | 'mapListInline'
  | 'roomListLeft'
  | 'roomListRight'
  | 'roomListInline'
  | 'roomLobbyLeft'
  | 'roomLobbyRight'
  | 'gameRoomLeft'
  | 'gameRoomRight';

const slotIds: Record<AdPlacement, string> = {
  mapListLeft: import.meta.env.VITE_ADSENSE_MAP_LIST_LEFT_SLOT_ID ?? '',
  mapListRight: import.meta.env.VITE_ADSENSE_MAP_LIST_RIGHT_SLOT_ID ?? '',
  mapListInline: import.meta.env.VITE_ADSENSE_MAP_LIST_INLINE_SLOT_ID ?? '',
  roomListLeft: import.meta.env.VITE_ADSENSE_ROOM_LIST_LEFT_SLOT_ID ?? '',
  roomListRight: import.meta.env.VITE_ADSENSE_ROOM_LIST_RIGHT_SLOT_ID ?? '',
  roomListInline: import.meta.env.VITE_ADSENSE_ROOM_LIST_INLINE_SLOT_ID ?? '',
  roomLobbyLeft: import.meta.env.VITE_ADSENSE_ROOM_LOBBY_LEFT_SLOT_ID ?? '',
  roomLobbyRight: import.meta.env.VITE_ADSENSE_ROOM_LOBBY_RIGHT_SLOT_ID ?? '',
  gameRoomLeft: import.meta.env.VITE_ADSENSE_GAME_ROOM_LEFT_SLOT_ID ?? '',
  gameRoomRight: import.meta.env.VITE_ADSENSE_GAME_ROOM_RIGHT_SLOT_ID ?? '',
};

export const adConfig = {
  enabled: import.meta.env.PROD && import.meta.env.VITE_ADSENSE_ENABLED === 'true',
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID ?? '',
  slotIds,
};

export function getAdSlotId(placement: AdPlacement) {
  return adConfig.slotIds[placement].trim();
}
