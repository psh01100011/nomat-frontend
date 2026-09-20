import { DateTimeString, PageResponse } from './common';
import { UserSummary } from './user';

export type Comment = {
  commentId: number;
  content: string;
  writer: UserSummary;
  isMine: boolean;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
};

export type CommentListResponse = PageResponse<'comments', Comment>;

export type CommentCreateResponse = Omit<Comment, 'isMine' | 'updatedAt'>;

export type CommentUpdateResponse = {
  commentId: number;
  content: string;
  updatedAt: DateTimeString;
};
