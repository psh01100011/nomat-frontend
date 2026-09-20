import { CommentReportReason, MapReportReason, ReportResponse } from '@/entities/report';
import { apiRequest, jsonBody } from '@/shared/api/http-client';

export const reportApi = {
  map(mapId: number, body: { reason: MapReportReason; description?: string | null }) {
    return apiRequest<ReportResponse>(`/api/maps/${mapId}/report`, {
      method: 'POST',
      body: jsonBody(body),
    });
  },
  comment(commentId: number, body: { reason: CommentReportReason; description?: string | null }) {
    return apiRequest<ReportResponse>(`/api/comments/${commentId}/report`, {
      method: 'POST',
      body: jsonBody(body),
    });
  },
};
