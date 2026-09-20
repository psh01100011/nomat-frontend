import { DateTimeString, PageResponse } from './common';
import { QuestionType } from './map';
import { UserType } from './user';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'CLOSED' | 'ENDED';
export type TimeLimitMode = 'FIXED' | 'AUDIO_LENGTH';

export type RoomListItem = {
  roomId: number;
  title: string;
  mapId: number;
  mapTitle: string;
  status: RoomStatus;
  hasPassword: boolean;
  memberCount: number;
  maxPlayers: number;
  hostNickname: string;
  hostUserType: UserType;
  questionType: QuestionType;
  categoryId: number;
  categoryName: string;
  thumbnailUrl: string | null;
  selectedQuestionCount: number;
  answerTimeLimitSeconds: number;
  timeLimitMode: TimeLimitMode;
  initialHintEnabled: boolean;
  initialHintTriggerSeconds: number;
  createdAt: DateTimeString;
};

export type RoomMember = {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  userType: UserType;
  host: boolean;
};

export type RoomDetail = {
  roomId: number;
  title: string;
  status: RoomStatus;
  hasPassword: boolean;
  maxPlayers: number;
  selectedQuestionCount: number;
  answerTimeLimitSeconds: number;
  timeLimitMode: TimeLimitMode;
  audioRepeatEnabled: boolean;
  initialHintEnabled: boolean;
  initialHintTriggerSeconds: number;
  map: {
    mapId: number;
    title: string;
    categoryId: number;
    categoryName: string;
    questionType?: QuestionType | null;
    thumbnailUrl: string | null;
    questionCount: number;
  };
  hostUserId: number;
  memberCount: number;
  members: RoomMember[];
  createdAt: DateTimeString;
};

export type RoomListResponse = PageResponse<'rooms', RoomListItem>;

export type RoomCreateRequest = {
  mapId: number;
  title: string;
  password?: string | null;
  maxPlayers: number;
  selectedQuestionCount: number;
  answerTimeLimitSeconds: number;
  timeLimitMode?: TimeLimitMode | null;
  audioRepeatEnabled?: boolean | null;
  initialHintEnabled?: boolean | null;
  initialHintTriggerSeconds?: number | null;
};

export type RoomCreateResponse = {
  roomId: number;
  status: RoomStatus;
  hostUserId: number;
};

export type CurrentRoomResponse = {
  roomId: number;
  status: RoomStatus;
};

export type RoomSettingsUpdateRequest = Partial<{
  password: string | null;
  maxPlayers: number;
  selectedQuestionCount: number;
  answerTimeLimitSeconds: number;
}>;
