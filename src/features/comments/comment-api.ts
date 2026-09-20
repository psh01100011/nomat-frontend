import { CommentCreateResponse, CommentListResponse, CommentUpdateResponse } from '@/entities/comment';
import { apiRequest, jsonBody } from '@/shared/api/http-client';

export const commentApi = {
  list(mapId: number, page = 0, size = 20, sort = 'latest', auth: 'optional' | 'none' = 'optional') {
    return apiRequest<CommentListResponse>(
      `/api/maps/${mapId}/comments?page=${page}&size=${size}&sort=${sort}`,
      { auth },
    );
  },
  create(mapId: number, content: string) {
    return apiRequest<CommentCreateResponse>(`/api/maps/${mapId}/comments`, {
      method: 'POST',
      body: jsonBody({ content }),
    });
  },
  update(commentId: number, content: string) {
    return apiRequest<CommentUpdateResponse>(`/api/comments/${commentId}`, {
      method: 'PATCH',
      body: jsonBody({ content }),
    });
  },
  remove(commentId: number) {
    return apiRequest<null>(`/api/comments/${commentId}`, { method: 'DELETE' });
  },
};
