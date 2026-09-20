import { type GameState } from '@/entities/game';
import { type MapStatus, type MapVisibility, type QuestionType } from '@/entities/map';
import { type RoomStatus } from '@/entities/room';

export function mapStatusLabel(status: MapStatus) {
  const labels: Record<MapStatus, string> = {
    DRAFT: '임시저장',
    PROCESSING: '처리 중',
    PROCESSING_FAILED: '처리 실패',
    PUBLISHED: '게시됨',
    DELETED: '삭제됨',
    BLOCKED: '차단됨',
  };
  return labels[status] ?? status;
}

export function visibilityLabel(visibility: MapVisibility) {
  const labels: Record<MapVisibility, string> = {
    PUBLIC: '공개',
    PRIVATE: '비공개',
    UNLISTED: '일부 공개',
  };
  return labels[visibility] ?? visibility;
}

export function questionTypeLabel(type: QuestionType) {
  const labels: Record<QuestionType, string> = {
    AUDIO: '오디오',
    TEXT: '텍스트',
    IMAGE: '이미지',
  };
  return labels[type] ?? type;
}

export function roomTimeLimitLabel(type: QuestionType | null | undefined) {
  return type === 'AUDIO' ? '최소 문제시간' : '제한 시간';
}

export function roomStatusLabel(status: RoomStatus) {
  const labels: Record<RoomStatus, string> = {
    WAITING: '대기 중',
    PLAYING: '게임 중',
    CLOSED: '닫힘',
    ENDED: '종료됨',
  };
  return labels[status] ?? status;
}

export function gamePhaseLabel(phase: GameState['phase']) {
  const labels: Record<GameState['phase'], string> = {
    waiting: '대기 중',
    playing: '진행 중',
    'question-ended': '정답 공개',
    ended: '게임 종료',
  };
  return labels[phase] ?? phase;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function displayNickname(nickname: string | null | undefined) {
  const normalized = nickname?.trim();
  if (!normalized || /^deleted?_user(?:_\d+)?$/i.test(normalized)) return '탈퇴한 사용자';
  return normalized;
}

export function roomJoinMessage(nickname: string | null | undefined, isGuest: boolean) {
  const name = displayNickname(nickname);
  return isGuest ? `게스트 사용자 ${name}님이 참가했습니다.` : `${name}님이 참가했습니다.`;
}
