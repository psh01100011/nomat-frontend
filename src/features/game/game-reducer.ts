import type { GameState, RoomEventMessage, RoomGameSnapshot } from '@/entities/game';
import type { RoomDetail } from '@/entities/room';
import { displayNickname, roomJoinMessage } from '@/shared/format/display-labels';

export function createInitialGameState(room: RoomDetail): GameState {
  return {
    phase: room.status === 'PLAYING' ? 'playing' : 'waiting',
    messages: [],
    scores: Object.fromEntries(
      room.members.map((member) => [
        member.userId,
        { userId: member.userId, nickname: displayNickname(member.nickname), userType: member.userType, score: 0 },
      ]),
    ),
    currentQuestion: null,
    skipVoteCount: 0,
    skipVoteThreshold: Math.floor(room.memberCount / 2) + 1,
    endedReason: null,
  };
}

export function createGameStateFromSnapshot(room: RoomDetail, snapshot: RoomGameSnapshot): GameState {
  const currentQuestion = snapshot.currentQuestion;
  const currentOutcome = currentQuestion
    ? snapshot.questionOutcomes.find((outcome) => outcome.questionId === currentQuestion.questionId)
    : null;
  const winner = snapshot.scores.find((score) => score.userId === snapshot.currentQuestionWinnerUserId);

  return {
    phase:
      snapshot.status === 'ENDED'
        ? 'ended'
        : snapshot.questionEnded
          ? 'question-ended'
          : snapshot.status === 'PLAYING'
            ? 'playing'
            : 'waiting',
    messages: [],
    scores: Object.fromEntries(
      snapshot.scores.map((score) => [
        score.userId,
        {
          userId: score.userId,
          nickname: displayNickname(score.nickname),
          userType: score.userType,
          score: score.score,
        },
      ]),
    ),
    currentQuestion:
      currentQuestion && currentQuestion.durationSeconds
        ? {
            questionId: currentQuestion.questionId,
            questionNumber: currentQuestion.questionNumber,
            promptText: currentQuestion.promptText,
            mediaUrl: currentQuestion.mediaUrl,
            mediaSourceType: currentQuestion.mediaSourceType,
            durationSeconds: currentQuestion.durationSeconds,
            endsAt: currentQuestion.endsAt,
            questionEndedAt: snapshot.questionEnded ? (currentOutcome?.endedAt ?? currentQuestion.endsAt) : null,
            initialHintEnabled: room.initialHintEnabled,
            initialHintTriggerSeconds: room.initialHintTriggerSeconds,
            hint: snapshot.hintRevealed ? snapshot.hintText : null,
            revealedAnswer: snapshot.questionEnded ? currentQuestion.answerText : null,
            correctNickname: winner ? displayNickname(winner.nickname) : null,
          }
        : null,
    skipVoteCount: snapshot.skipVoteCount,
    skipVoteThreshold: snapshot.skipVoteThreshold,
    endedReason: null,
  };
}

export function applyRoomEvent(state: GameState, event: RoomEventMessage, myUserId: number | null): GameState {
  switch (event.type) {
    case 'GAME_STARTED':
      return { ...state, phase: 'playing' };
    case 'QUESTION_STARTED':
      return {
        ...state,
        phase: 'playing',
        currentQuestion:
          event.questionId && event.questionNumber && event.durationSeconds
            ? {
                questionId: event.questionId,
                questionNumber: event.questionNumber,
                promptText: event.promptText,
                mediaUrl: event.mediaUrl,
                mediaSourceType: event.mediaSourceType,
                durationSeconds: event.durationSeconds,
                endsAt: event.endsAt,
                questionEndedAt: null,
                initialHintEnabled: event.initialHintEnabled ?? true,
                initialHintTriggerSeconds: event.initialHintTriggerSeconds ?? 10,
                hint: null,
                revealedAnswer: null,
                correctNickname: null,
              }
            : state.currentQuestion,
        skipVoteCount: 0,
        skipVoteThreshold: event.memberCount ? Math.floor(event.memberCount / 2) + 1 : state.skipVoteThreshold,
      };
    case 'HINT_REVEALED':
      return {
        ...state,
        currentQuestion: state.currentQuestion ? { ...state.currentQuestion, hint: event.hint } : state.currentQuestion,
      };
    case 'CHAT_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages.filter((message) => message.id !== event.clientMessageId),
          {
            id: event.clientMessageId ?? `${event.occurredAt}-${event.userId}`,
            author: displayNickname(event.nickname ?? '알 수 없음'),
            content: event.content ?? '',
            pending: false,
            mine: event.userId === myUserId,
            userType: event.userType,
          },
        ].slice(-80),
      };
    case 'CORRECT_ANSWER':
      return {
        ...state,
        currentQuestion: state.currentQuestion
          ? { ...state.currentQuestion, correctNickname: displayNickname(event.nickname) }
          : state.currentQuestion,
        messages: [
          ...state.messages,
          {
            id: `correct-${event.occurredAt}`,
            author: '시스템',
            content: `${displayNickname(event.nickname ?? '참가자')}님이 정답을 맞혔습니다.`,
            pending: false,
            mine: false,
            system: true,
          },
        ].slice(-80),
      };
    case 'SCORE_UPDATED':
      if (!event.userId || event.score === null) return state;
      return {
        ...state,
        scores: {
          ...state.scores,
          [event.userId]: {
            userId: event.userId,
            nickname: displayNickname(event.nickname ?? state.scores[event.userId]?.nickname ?? '참가자'),
            userType: event.userType ?? state.scores[event.userId]?.userType ?? null,
            score: event.score,
          },
        },
      };
    case 'SKIP_VOTE_UPDATED':
      return {
        ...state,
        skipVoteCount: event.skipVoteCount ?? state.skipVoteCount,
        skipVoteThreshold: event.skipVoteThreshold ?? state.skipVoteThreshold,
      };
    case 'QUESTION_AUDIO_LOAD_FAILED':
      if (
        !state.currentQuestion ||
        state.currentQuestion.questionId !== event.questionId ||
        state.currentQuestion.questionNumber !== event.questionNumber
      ) {
        return state;
      }
      return {
        ...state,
        phase: 'question-ended',
        messages: [
          ...state.messages,
          {
            id: `audio-load-failed-${event.questionId}-${event.questionNumber}`,
            author: '시스템',
            content: event.content ?? '오디오 파일을 불러올 수 없어 해당 문제를 건너뜁니다.',
            pending: false,
            mine: false,
            system: true,
          },
        ].slice(-80),
        currentQuestion: {
          ...state.currentQuestion,
          questionEndedAt: event.occurredAt,
        },
      };
    case 'MEMBER_JOINED': {
      const nextThreshold = event.memberCount ? Math.floor(event.memberCount / 2) + 1 : state.skipVoteThreshold;
      return {
        ...state,
        skipVoteThreshold: nextThreshold,
        skipVoteCount: Math.min(state.skipVoteCount, nextThreshold),
        messages: [
          ...state.messages,
          {
            id: `joined-${event.occurredAt ?? Date.now()}-${event.userId ?? 'unknown'}`,
            author: '시스템',
            content: roomJoinMessage(event.nickname ?? '참가자', event.userType === 'GUEST'),
            pending: false,
            mine: false,
            system: true,
          },
        ].slice(-80),
      };
    }
    case 'MEMBER_LEFT': {
      const nickname = displayNickname(event.nickname ?? (event.userId ? state.scores[event.userId]?.nickname : null) ?? '참가자');
      const nextScores = { ...state.scores };
      if (event.userId) delete nextScores[event.userId];
      const nextThreshold = event.memberCount ? Math.floor(event.memberCount / 2) + 1 : state.skipVoteThreshold;
      return {
        ...state,
        scores: nextScores,
        skipVoteThreshold: nextThreshold,
        skipVoteCount: Math.min(state.skipVoteCount, nextThreshold),
        messages: [
          ...state.messages,
          {
            id: `left-${event.occurredAt ?? Date.now()}-${event.userId ?? 'unknown'}`,
            author: '시스템',
            content: `${nickname}님이 나갔습니다.`,
            pending: false,
            mine: false,
            system: true,
          },
        ].slice(-80),
      };
    }
    case 'MEMBER_KICKED': {
      const nickname = event.targetUserId ? displayNickname(state.scores[event.targetUserId]?.nickname) : '참가자';
      const nextScores = { ...state.scores };
      if (event.targetUserId) delete nextScores[event.targetUserId];
      const nextThreshold = event.memberCount ? Math.floor(event.memberCount / 2) + 1 : state.skipVoteThreshold;
      return {
        ...state,
        scores: nextScores,
        skipVoteThreshold: nextThreshold,
        skipVoteCount: Math.min(state.skipVoteCount, nextThreshold),
        messages: [
          ...state.messages,
          {
            id: `kicked-${event.occurredAt ?? Date.now()}-${event.targetUserId ?? 'unknown'}`,
            author: '시스템',
            content: `${nickname ?? '참가자'}님이 방에서 내보내졌습니다.`,
            pending: false,
            mine: false,
            system: true,
          },
        ].slice(-80),
      };
    }
    case 'QUESTION_ENDED': {
      const revealMessages = buildQuestionEndMessages(state, event);
      return {
        ...state,
        phase: 'question-ended',
        messages: [...state.messages, ...revealMessages].slice(-80),
        currentQuestion: state.currentQuestion
          ? {
              ...state.currentQuestion,
              revealedAnswer: event.answerText ?? state.currentQuestion.revealedAnswer,
              questionEndedAt: event.occurredAt,
            }
          : state.currentQuestion,
      };
    }
    case 'GAME_ENDED':
      return {
        ...state,
        phase: 'ended',
        endedReason: event.endedReason,
        messages: [
          ...state.messages,
          {
            id: `game-ended-${event.occurredAt ?? Date.now()}`,
            author: '시스템',
            content: '게임이 종료되었습니다.',
            pending: false,
            mine: false,
            system: true,
          },
        ].slice(-80),
      };
    case 'ROOM_CLOSED':
      return state;
    default:
      return state;
  }
}

function buildQuestionEndMessages(state: GameState, event: RoomEventMessage) {
  const occurredAt = event.occurredAt ?? String(Date.now());
  const answerText = event.answerText ?? state.currentQuestion?.revealedAnswer;
  const skipped = state.skipVoteThreshold > 0 && state.skipVoteCount >= state.skipVoteThreshold;
  const prefix = skipped
    ? '스킵 투표로 문제를 넘겼습니다.'
    : state.currentQuestion?.correctNickname
      ? null
      : '정답자가 없어 문제를 종료했습니다.';

  if (!prefix && !answerText) return [];

  return [
    {
      id: `question-ended-${occurredAt}`,
      author: '시스템',
      content: [prefix, answerText ? `정답: ${answerText}` : null].filter(Boolean).join(' '),
      pending: false,
      mine: false,
      system: true,
    },
  ];
}

export function addPendingMessage(
  state: GameState,
  content: string,
  clientMessageId: string,
  author: string,
  userType: GameState['scores'][number]['userType'],
): GameState {
  return {
    ...state,
    messages: [
      ...state.messages,
      { id: clientMessageId, author, content, pending: true, mine: true, userType },
    ].slice(-80),
  };
}
