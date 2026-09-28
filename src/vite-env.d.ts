/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADSENSE_ENABLED?: string;
  readonly VITE_ADSENSE_CLIENT_ID?: string;
  readonly VITE_ADSENSE_MAP_LIST_LEFT_SLOT_ID?: string;
  readonly VITE_ADSENSE_MAP_LIST_RIGHT_SLOT_ID?: string;
  readonly VITE_ADSENSE_MAP_LIST_INLINE_SLOT_ID?: string;
  readonly VITE_ADSENSE_ROOM_LIST_LEFT_SLOT_ID?: string;
  readonly VITE_ADSENSE_ROOM_LIST_RIGHT_SLOT_ID?: string;
  readonly VITE_ADSENSE_ROOM_LIST_INLINE_SLOT_ID?: string;
  readonly VITE_ADSENSE_ROOM_LOBBY_LEFT_SLOT_ID?: string;
  readonly VITE_ADSENSE_ROOM_LOBBY_RIGHT_SLOT_ID?: string;
  readonly VITE_ADSENSE_GAME_ROOM_LEFT_SLOT_ID?: string;
  readonly VITE_ADSENSE_GAME_ROOM_RIGHT_SLOT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
