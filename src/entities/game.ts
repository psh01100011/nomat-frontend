import { DateTimeString } from './common';
import { UserType } from './user';

export type RoomEventType =
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'HOST_CHANGED'
  | 'MEMBER_KICKED'
  | 'ROOM_SETTINGS_UPDATED'
  | 'ROOM_CLOSED'
  | 'GAME_STARTED'
  | 'QUESTION_STARTED'
  | 'HINT_REVEALED'
  | 'CHAT_MESSAGE'
  | 'CORRECT_ANSWER'
  | 'SCORE_UPDATED'
  | 'SKIP_VOTE_UPDATED'
  | 'QUESTION_AUDIO_LOAD_FAILED'
  | 'QUESTION_ENDED'
  | 'GAME_ENDED';

export type RoomEventMessage = {
  type: RoomEventType;
  roomId: number;
  userId: number | null;
  targetUserId: number | null;
  previousHostUserId: number | null;
  newHostUserId: number | null;
  memberCount: number;
  hasPassword?: boolean | null;
  maxPlayers?: number | null;
  selectedQuestionCount?: number | null;
  closedReason: string | null;
  endedReason: string | null;
  content: string | null;
  clientMessageId: string | null;
  nickname: string | null;
  userType: UserType | null;
  score: number | null;
  questionNumber: number | null;
  questionId: number | null;
  promptText: string | null;
  mediaUrl: string | null;
  mediaSourceType: string | null;
  mediaDurationMs: number | null;
  answerText?: string | null;
  durationSeconds: number | null;
  startedAt: DateTimeString | null;
  endsAt: DateTimeString | null;
  audioRepeatEnabled: boolean | null;
  answerTimeLimitSeconds: number | null;
  initialHintEnabled: boolean | null;
  initialHintTriggerSeconds: number | null;
  hint: string | null;
  occurredAt: DateTimeString | null;
  skipVoteCount: number | null;
  skipVoteThreshold: number | null;
};

export type ChatMessage = {
  id: string;
  author: string;
  content: string;
  pending: boolean;
  mine: boolean;
  system?: boolean;
  userType?: UserType | null;
};

export type GameState = {
  phase: 'waiting' | 'playing' | 'question-ended' | 'ended';
  messages: ChatMessage[];
  scores: Record<number, { userId: number; nickname: string; userType: UserType | null; score: number }>;
  currentQuestion: {
    questionId: number;
    questionNumber: number;
    promptText: string | null;
    mediaUrl: string | null;
    mediaSourceType: string | null;
    durationSeconds: number;
    endsAt: DateTimeString | null;
    questionEndedAt: DateTimeString | null;
    initialHintEnabled: boolean;
    initialHintTriggerSeconds: number;
    hint: string | null;
    revealedAnswer: string | null;
    correctNickname: string | null;
  } | null;
  skipVoteCount: number;
  skipVoteThreshold: number;
  endedReason: string | null;
};
