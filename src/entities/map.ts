import { DateTimeString, PageResponse } from './common';
import { UserSummary } from './user';

export type MapStatus = 'DRAFT' | 'PROCESSING' | 'PROCESSING_FAILED' | 'PUBLISHED' | 'DELETED' | 'BLOCKED';
export type MapVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
export type QuestionType = 'TEXT' | 'IMAGE' | 'AUDIO';
export type QuestionMediaSourceType = 'UPLOAD' | 'YOUTUBE' | 'TTS';
export type QuestionMediaProcessingStatus = 'QUEUED' | 'PROCESSING' | 'RETRYING' | 'READY' | 'FAILED';
export type AudioProcessingDisplayStatus = QuestionMediaProcessingStatus | 'DELAYED';
export type AudioProcessingFailureType = 'SOURCE' | 'SERVER';
export type AudioProcessingFailureCode =
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_ACCESS_RESTRICTED'
  | 'AUDIO_STREAM_UNAVAILABLE'
  | 'INVALID_AUDIO_RANGE'
  | 'DOWNLOAD_TEMPORARY_ERROR'
  | 'PROCESSING_TIMEOUT'
  | 'TRANSCODING_ERROR'
  | 'STORAGE_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

export type AudioProcessingSummary = {
  status: AudioProcessingDisplayStatus;
  totalCount: number;
  queuedCount: number;
  processingCount: number;
  retryingCount: number;
  readyCount: number;
  failedCount: number;
  retryableFailedCount: number;
  sourceFailureCount: number;
  canRetryAll: boolean;
  requestedAt: DateTimeString | null;
  lastUpdatedAt: DateTimeString | null;
};

export type MapCategory = {
  categoryId: number;
  name: string;
};

export type MapListItem = {
  mapId: number;
  title: string;
  status: MapStatus;
  visibility: MapVisibility;
  category: MapCategory;
  questionType: QuestionType;
  thumbnailUrl: string | null;
  creator: Pick<UserSummary, 'userId' | 'nickname'>;
  questionCount: number;
  playCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  liked: boolean;
  favorited: boolean;
  audioProcessing: AudioProcessingSummary | null;
  createdAt: DateTimeString;
};

export type MapDetail = Omit<MapListItem, 'creator' | 'status' | 'visibility' | 'audioProcessing'> & {
  creator: UserSummary;
  description: string | null;
  updatedAt: DateTimeString;
};

export type MapQuestionMedia = {
  mediaId?: number;
  sourceType: QuestionMediaSourceType;
  assetId?: number | null;
  assetUrl?: string | null;
  sourceUrl?: string | null;
  startTimeMs?: number | null;
  endTimeMs?: number | null;
  durationMs?: number | null;
  processingStatus?: QuestionMediaProcessingStatus;
  failureCode?: AudioProcessingFailureCode | null;
  failureType?: AudioProcessingFailureType | null;
  failureMessage?: string | null;
  canRetry?: boolean;
  audioUrl?: string | null;
};

export type MapEditorQuestion = {
  questionId: number;
  promptText: string;
  media: MapQuestionMedia | null;
  answers: string[];
};

export type MapEditorDetail = {
  mapId: number;
  version: number;
  status: MapStatus;
  visibility: MapVisibility;
  title: string | null;
  categoryId: number | null;
  questionType: QuestionType | null;
  thumbnailAssetId: number | null;
  thumbnailUrl: string | null;
  description: string | null;
  questions: MapEditorQuestion[];
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type MapListResponse = PageResponse<'maps', MapListItem>;

export type MapCreateQuestion = {
  promptText: string;
  media?: {
    sourceType: Extract<QuestionMediaSourceType, 'UPLOAD' | 'YOUTUBE'>;
    assetId?: number;
    sourceUrl?: string;
    startTimeMs?: number;
    endTimeMs?: number;
  } | null;
  answers: string[];
};

export type MapCreateRequest = {
  title: string;
  categoryId: number;
  questionType: QuestionType;
  thumbnailAssetId?: number | null;
  description?: string | null;
  visibility?: MapVisibility;
  questions: MapCreateQuestion[];
};

export type MapDraftRequest = Partial<Omit<MapCreateRequest, 'questions'>> & {
  questions?: MapCreateQuestion[];
};

export type MapCreateResponse = {
  mapId: number;
};

export type MapDraftResponse = {
  mapId: number;
  version: number;
  status: 'DRAFT';
  savedAt: DateTimeString;
};

export type MapModifyResponse = {
  mapId: number;
  version: number;
  createdQuestions: Array<{ clientId: string; questionId: number }>;
  updatedAt: DateTimeString;
};

export type MapReactionResponse = {
  mapId: number;
  liked?: boolean;
  favorited?: boolean;
  likeCount?: number;
  favoriteCount?: number;
};

export type AudioProcessingRetryResponse = {
  mapId: number;
  retriedQuestionIds: number[];
  retriedCount: number;
  requestedAt: DateTimeString;
};
