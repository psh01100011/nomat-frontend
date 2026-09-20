export type ApiResponse<T> = {
  message: string;
  data: T;
};

export type PageResponse<TListKey extends string, TItem> = {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
} & Record<TListKey, TItem[]>;

export type ApiErrorMessage =
  | 'invalid_request'
  | 'invalid_token'
  | 'invalid_id_or_password'
  | 'duplicate_login_id'
  | 'duplicate_nickname'
  | 'map_not_found'
  | 'map_or_question_not_found'
  | 'forbidden_map_access'
  | 'map_version_conflict'
  | 'already_liked_map'
  | 'already_favorited_map'
  | 'comment_not_found'
  | 'forbidden_comment_access'
  | 'already_reported_map'
  | 'already_reported_comment'
  | 'room_not_found'
  | 'invalid_room_password'
  | 'already_joined_room'
  | 'cannot_join_room'
  | 'room_access_denied'
  | 'forbidden_room_access'
  | 'cannot_start_game'
  | 'message_rate_limited'
  | 'internal_server_error'
  | string;

export type ApiErrorData = null | Record<string, unknown>;

export class ApiClientError extends Error {
  readonly status: number;
  readonly messageCode: ApiErrorMessage;
  readonly data: ApiErrorData;

  constructor(status: number, messageCode: ApiErrorMessage, data: ApiErrorData = null) {
    super(messageCode);
    this.name = 'ApiClientError';
    this.status = status;
    this.messageCode = messageCode;
    this.data = data;
  }
}

export type DateTimeString = string;
