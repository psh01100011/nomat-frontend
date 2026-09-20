import {
  CurrentRoomResponse,
  RoomCreateRequest,
  RoomCreateResponse,
  RoomDetail,
  RoomListResponse,
  RoomSettingsUpdateRequest,
} from '@/entities/room';
import type { RoomGameSnapshot } from '@/entities/game';
import { apiRequest, jsonBody } from '@/shared/api/http-client';

export type RoomListParams = {
  keyword?: string;
  mapId?: number;
  categoryId?: number;
  questionType?: string;
  hasPassword?: boolean;
  excludePasswordRooms?: boolean;
  status?: string;
  joinableOnly?: boolean;
  page?: number;
  size?: number;
  sort?: string;
};

export type RoomInviteResponse = {
  inviteToken: string;
};

function toQuery(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const roomApi = {
  create(body: RoomCreateRequest) {
    return apiRequest<RoomCreateResponse>('/api/rooms', {
      method: 'POST',
      body: jsonBody(body),
    });
  },
  list(params: RoomListParams) {
    return apiRequest<RoomListResponse>(`/api/rooms${toQuery(params)}`, { auth: 'optional' });
  },
  detail(roomId: number) {
    return apiRequest<RoomDetail>(`/api/rooms/${roomId}`, { auth: 'optional' });
  },
  gameSnapshot(roomId: number) {
    return apiRequest<RoomGameSnapshot>(`/api/rooms/${roomId}/game/snapshot`);
  },
  current() {
    return apiRequest<CurrentRoomResponse>('/api/rooms/me/current');
  },
  join(roomId: number, password?: string) {
    return apiRequest<RoomDetail>(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      body: password ? jsonBody({ password }) : undefined,
    });
  },
  createInvite(roomId: number) {
    return apiRequest<RoomInviteResponse>(`/api/rooms/${roomId}/invite`, { method: 'POST' });
  },
  joinByInvite(inviteToken: string) {
    return apiRequest<RoomDetail>(`/api/rooms/invites/${inviteToken}/join`, { method: 'POST' });
  },
  leave(roomId: number) {
    return apiRequest<null>(`/api/rooms/${roomId}/leave`, { method: 'POST' });
  },
  remove(roomId: number) {
    return apiRequest<null>(`/api/rooms/${roomId}`, { method: 'DELETE' });
  },
  kick(roomId: number, targetUserId: number) {
    return apiRequest<null>(`/api/rooms/${roomId}/members/${targetUserId}`, { method: 'DELETE' });
  },
  start(roomId: number) {
    return apiRequest<RoomDetail>(`/api/rooms/${roomId}/start`, { method: 'POST' });
  },
  updateSettings(roomId: number, body: RoomSettingsUpdateRequest) {
    return apiRequest<RoomDetail>(`/api/rooms/${roomId}/settings`, {
      method: 'PATCH',
      body: jsonBody(body),
    });
  },
};
