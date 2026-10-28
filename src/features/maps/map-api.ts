import {
  AudioProcessingRetryResponse,
  MapCreateRequest,
  MapCreateResponse,
  MapDetail,
  MapDraftRequest,
  MapDraftResponse,
  MapEditorDetail,
  MapListResponse,
  MapReactionResponse,
} from '@/entities/map';
import { apiRequest, jsonBody } from '@/shared/api/http-client';

export type MapListParams = {
  keyword?: string;
  categoryId?: number;
  questionType?: string;
  page?: number;
  size?: number;
  sort?: string;
  creatorId?: number;
};

function toQuery(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const mapApi = {
  list(params: MapListParams) {
    return apiRequest<MapListResponse>(`/api/maps${toQuery(params)}`, { auth: 'optional' });
  },
  listMine(params: MapListParams) {
    return apiRequest<MapListResponse>(`/api/maps${toQuery(params)}`);
  },
  detail(mapId: number) {
    return apiRequest<MapDetail>(`/api/maps/${mapId}`, { auth: 'optional' });
  },
  editor(mapId: number) {
    return apiRequest<MapEditorDetail>(`/api/maps/${mapId}/editor`);
  },
  create(body: MapCreateRequest) {
    return apiRequest<MapCreateResponse>('/api/maps', {
      method: 'POST',
      body: jsonBody(body),
    });
  },
  saveDraft(body: MapDraftRequest) {
    return apiRequest<MapDraftResponse>('/api/maps/drafts', {
      method: 'POST',
      body: jsonBody(body),
    });
  },
  update(mapId: number, body: unknown) {
    return apiRequest<{ mapId: number; version: number; updatedAt: string }>(`/api/maps/${mapId}`, {
      method: 'PATCH',
      body: jsonBody(body),
    });
  },
  remove(mapId: number) {
    return apiRequest<null>(`/api/maps/${mapId}`, { method: 'DELETE' });
  },
  like(mapId: number) {
    return apiRequest<MapReactionResponse>(`/api/maps/${mapId}/like`, { method: 'POST' });
  },
  unlike(mapId: number) {
    return apiRequest<MapReactionResponse>(`/api/maps/${mapId}/like`, { method: 'DELETE' });
  },
  favorite(mapId: number) {
    return apiRequest<MapReactionResponse>(`/api/maps/${mapId}/favorite`, { method: 'POST' });
  },
  unfavorite(mapId: number) {
    return apiRequest<MapReactionResponse>(`/api/maps/${mapId}/favorite`, { method: 'DELETE' });
  },
  retryAudioProcessing(mapId: number) {
    return apiRequest<AudioProcessingRetryResponse>(`/api/maps/${mapId}/audio-processing/retry`, { method: 'POST' });
  },
};
