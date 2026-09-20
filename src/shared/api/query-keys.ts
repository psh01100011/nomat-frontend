export const queryKeys = {
  me: ['me'] as const,
  maps: (params: Record<string, unknown>) => ['maps', params] as const,
  mapDetail: (mapId: number) => ['map-detail', mapId] as const,
  mapEditor: (mapId: number) => ['map-editor', mapId] as const,
  comments: (mapId: number, page: number) => ['comments', mapId, page] as const,
  rooms: (params: Record<string, unknown>) => ['rooms', params] as const,
  currentRoom: ['rooms', 'current'] as const,
  roomDetail: (roomId: number) => ['room-detail', roomId] as const,
};
