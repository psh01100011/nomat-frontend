export type MapReportReason =
  | 'INAPPROPRIATE'
  | 'COPYRIGHT'
  | 'SPAM'
  | 'OFFENSIVE'
  | 'BROKEN_CONTENT'
  | 'WRONG_ANSWER'
  | 'OTHER';

export type CommentReportReason =
  | 'INAPPROPRIATE'
  | 'SPAM'
  | 'OFFENSIVE'
  | 'HARASSMENT'
  | 'PERSONAL_INFO'
  | 'FALSE_INFORMATION'
  | 'OTHER';

export type ReportResponse = {
  reportId: number;
};
