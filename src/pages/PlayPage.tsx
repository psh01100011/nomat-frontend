import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, ImageIcon, MessageSquare, Send, SkipForward, Timer, Trophy, Volume2 } from 'lucide-react';
import { CSSProperties, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { addPendingMessage, applyRoomEvent, createInitialGameState } from '@/features/game/game-reducer';
import { roomEventBuffer } from '@/features/game/room-event-buffer';
import { createRoomSocket } from '@/features/game/room-socket';
import { useSoundEffects } from '@/features/game/use-sound-effects';
import { currentRoomStorage } from '@/features/rooms/current-room-storage';
import { roomApi } from '@/features/rooms/room-api';
import { queryKeys } from '@/shared/api/query-keys';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { displayNickname } from '@/shared/format/display-labels';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { UserAvatar } from '@/shared/ui/FallbackMedia';
import { Modal } from '@/shared/ui/Modal';
import { RoomHeaderOutletContext } from '@/widgets/AppLayout';
import styles from './room-pages.module.css';

export function PlayPage() {
  const runOnce = useSingleFlight();
  const auth = useAuth();
  const navigate = useNavigate();
  const { setRoomHeader } = useOutletContext<RoomHeaderOutletContext>();
  const queryClient = useQueryClient();
  const roomId = currentRoomStorage.read();
  const [input, setInput] = useState('');
  const [socketError, setSocketError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [exitOpen, setExitOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [skippedQuestionKey, setSkippedQuestionKey] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState(() => readAudioVolume());
  const initializedRoomId = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    volume: soundVolume,
    setVolume: setSoundVolume,
    playChat,
    playCorrect,
    playHint,
    playSkip,
    playQuestionEnd,
  } = useSoundEffects();
  const currentQuestionRef = useRef(currentQuestionSnapshot(null));
  const correctQuestionKeyRef = useRef<string | null>(null);
  const lastSkipVoteCountRef = useRef(0);
  const reportedAudioFailureQuestionKeyRef = useRef<string | null>(null);
  const lastChatSentAtRef = useRef(0);

  useEffect(() => {
    if (!roomId) navigate('/rooms', { replace: true });
  }, [navigate, roomId]);

  const roomQuery = useQuery({
    queryKey: queryKeys.roomDetail(roomId ?? 0),
    queryFn: () => roomApi.detail(roomId ?? 0),
    enabled: Boolean(roomId),
  });

  useEffect(() => {
    if (!roomQuery.isError) return;
    currentRoomStorage.clear();
    navigate('/rooms', {
      replace: true,
      state: {
        noticeTitle: '게임방에 들어갈 수 없습니다',
        noticeMessage: '이미 나간 방이거나 참여할 수 없는 방입니다.',
      },
    });
  }, [navigate, roomQuery.isError]);

  useEffect(() => {
    if (!roomQuery.data || !auth.userId) return;
    if (roomQuery.data.members.some((member) => member.userId === auth.userId)) return;
    currentRoomStorage.clear();
    navigate('/rooms', {
      replace: true,
      state: {
        noticeTitle: '게임방에 들어갈 수 없습니다',
        noticeMessage: '이미 나간 방이거나 참여할 수 없는 방입니다.',
      },
    });
  }, [auth.userId, navigate, roomQuery.data]);

  const leaveMutation = useMutation({
    mutationFn: () => roomApi.leave(roomId ?? 0),
    onMutate: () => {
      currentRoomStorage.clear();
      queryClient.removeQueries({ queryKey: queryKeys.currentRoom });
    },
    onSettled: async () => {
      currentRoomStorage.clear();
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentRoom });
      navigate('/rooms', { replace: true });
    },
  });

  const [gameState, dispatchGame] = useReducer(
    (
      state: ReturnType<typeof createInitialGameState> | null,
      action:
        | { type: 'reset'; room: NonNullable<typeof roomQuery.data> }
        | { type: 'event'; event: Parameters<typeof applyRoomEvent>[1] }
        | { type: 'pending'; content: string; clientMessageId: string },
    ) => {
      if (action.type === 'reset') return createInitialGameState(action.room);
      if (!state) return state;
      if (action.type === 'event') return applyRoomEvent(state, action.event, auth.userId);
      return addPendingMessage(state, action.content, action.clientMessageId, auth.user?.nickname ?? '나', auth.userType);
    },
    null,
  );

  useEffect(() => {
    if (!roomQuery.data || !roomId || initializedRoomId.current === roomId) return;
    initializedRoomId.current = roomId;
    dispatchGame({ type: 'reset', room: roomQuery.data });
    const bufferedEvent = roomEventBuffer.consume(roomId);
    if (bufferedEvent) dispatchGame({ type: 'event', event: bufferedEvent });
  }, [roomId, roomQuery.data]);

  const socket = useMemo(() => {
    if (!roomId) return null;
    return createRoomSocket({
      roomId,
      onEvent: (event) => {
        if (event.type === 'CHAT_MESSAGE') playChat();
        if (event.type === 'CORRECT_ANSWER') {
          correctQuestionKeyRef.current = questionKey(
            event.questionId ?? currentQuestionRef.current.questionId ?? 0,
            event.questionNumber ?? currentQuestionRef.current.questionNumber ?? 0,
          );
          playCorrect();
        }
        if (event.type === 'HINT_REVEALED') playHint();
        if (event.type === 'SKIP_VOTE_UPDATED' && (event.skipVoteCount ?? 0) > lastSkipVoteCountRef.current) {
          playSkip();
          lastSkipVoteCountRef.current = event.skipVoteCount ?? lastSkipVoteCountRef.current;
        }
        if (
          event.type === 'QUESTION_ENDED' &&
          correctQuestionKeyRef.current !==
            questionKey(currentQuestionRef.current.questionId ?? 0, currentQuestionRef.current.questionNumber ?? 0)
        ) {
          playQuestionEnd();
        }
        dispatchGame({ type: 'event', event });
        if (
          event.type === 'MEMBER_JOINED' ||
          event.type === 'MEMBER_LEFT' ||
          event.type === 'HOST_CHANGED' ||
          event.type === 'MEMBER_KICKED' ||
          event.type === 'ROOM_SETTINGS_UPDATED'
        ) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.roomDetail(roomId) });
        }
        if (event.type === 'ROOM_CLOSED' || (event.type === 'MEMBER_KICKED' && event.targetUserId === auth.userId)) {
          currentRoomStorage.clear();
          navigate('/rooms', {
            replace: true,
            state:
              event.type === 'MEMBER_KICKED'
                ? { noticeTitle: '방에서 내보내졌습니다', noticeMessage: '방장이 게임방에서 내보냈습니다.' }
                : { noticeTitle: '방이 종료되었습니다', noticeMessage: '방이 삭제되었거나 종료되었습니다.' },
          });
        }
      },
      onError: (message) => setSocketError(socketErrorMessage(message)),
      onReconnect: () => {
        setSocketError('');
        void queryClient.invalidateQueries({ queryKey: queryKeys.roomDetail(roomId) });
      },
    });
  }, [auth.userId, navigate, playChat, playCorrect, playHint, playQuestionEnd, playSkip, queryClient, roomId]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  const currentQuestion = gameState?.currentQuestion ?? null;
  const phase = gameState?.phase ?? 'waiting';
  const isImageQuestion = currentQuestion?.mediaSourceType === 'UPLOAD';
  const keepChatFocus = useCallback(() => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const sendSkip = useCallback(() => {
    if (!socket || !currentQuestion || phase !== 'playing') {
      keepChatFocus();
      return;
    }
    setSkippedQuestionKey(questionKey(currentQuestion.questionId, currentQuestion.questionNumber));
    socket.sendSkipVote(currentQuestion.questionId, currentQuestion.questionNumber);
    keepChatFocus();
  }, [currentQuestion, keepChatFocus, phase, socket]);

  const reportAudioLoadFailure = useCallback(() => {
    if (!socket || !currentQuestion || phase !== 'playing') return;
    const key = questionKey(currentQuestion.questionId, currentQuestion.questionNumber);
    if (reportedAudioFailureQuestionKeyRef.current === key) return;
    if (socket.sendAudioLoadFailure(currentQuestion.questionId, currentQuestion.questionNumber)) {
      reportedAudioFailureQuestionKeyRef.current = key;
    }
  }, [currentQuestion, phase, socket]);

  useEffect(() => {
    setSkippedQuestionKey(null);
    reportedAudioFailureQuestionKeyRef.current = null;
    correctQuestionKeyRef.current = null;
    lastSkipVoteCountRef.current = 0;
  }, [currentQuestion?.questionId, currentQuestion?.questionNumber]);

  useEffect(() => {
    currentQuestionRef.current = currentQuestionSnapshot(currentQuestion);
    lastSkipVoteCountRef.current = gameState?.skipVoteCount ?? 0;
  }, [currentQuestion, gameState?.skipVoteCount]);

  useEffect(() => {
    localStorage.setItem(AUDIO_VOLUME_KEY, String(audioVolume));
    if (audioRef.current) audioRef.current.volume = audioVolume;
  }, [audioVolume, currentQuestion?.mediaUrl]);

  useEffect(() => {
    if (!currentQuestion?.endsAt || phase === 'ended') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [currentQuestion?.endsAt, phase]);

  useEffect(() => {
    if (!currentQuestion || phase === 'ended') return;

    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      sendSkip();
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [currentQuestion, phase, sendSkip]);

  useEffect(() => {
    keepChatFocus();
  }, [currentQuestion?.questionId, keepChatFocus, phase]);

  useEffect(() => {
    if (phase === 'ended') setResultOpen(true);
  }, [phase]);

  useEffect(() => {
    const room = roomQuery.data;
    if (!room) {
      setRoomHeader(null);
      return;
    }
    setRoomHeader({
      title: room.title,
      description: room.map.title,
      actions: (
        <Button variant="danger" icon={<DoorOpen size={17} />} onClick={() => setExitOpen(true)}>
          나가기
        </Button>
      ),
    });
    return () => setRoomHeader(null);
  }, [roomQuery.data, setRoomHeader]);

  useEffect(() => {
    if (exitOpen || resultOpen) return;
    const handleEnterFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', handleEnterFocus);
    return () => window.removeEventListener('keydown', handleEnterFocus);
  }, [exitOpen, resultOpen]);

  const remainingMs = currentQuestion ? getRemainingMs(currentQuestion.endsAt, currentQuestion.durationSeconds, now) : 0;
  const nextQuestionMs =
    phase === 'question-ended' && currentQuestion?.questionEndedAt ? getTransitionMs(currentQuestion.questionEndedAt, now) : 0;
  const displayMs = phase === 'question-ended' ? nextQuestionMs : remainingMs;
  const displaySeconds = Math.max(0, Math.ceil(displayMs / 1000));
  const progressPercent = currentQuestion?.durationSeconds
    ? Math.max(
        0,
        Math.min(100, (displayMs / (phase === 'question-ended' ? NEXT_QUESTION_DELAY_MS : currentQuestion.durationSeconds * 1000)) * 100),
      )
    : 0;
  const revealState = getRevealState(currentQuestion, phase, now);
  const canInteractWithQuestion = phase === 'playing' && Boolean(currentQuestion);
  const hasVotedSkip = currentQuestion
    ? skippedQuestionKey === questionKey(currentQuestion.questionId, currentQuestion.questionNumber)
    : false;

  if (!roomId) return <Navigate replace to="/rooms" />;
  if (roomQuery.isLoading || !gameState) return <EmptyState title="게임 정보를 불러오는 중입니다." />;
  if (roomQuery.isError || !roomQuery.data) {
    currentRoomStorage.clear();
    return (
      <section className={styles.shell}>
        <Alert tone="danger">게임방을 복구하지 못했습니다.</Alert>
      </section>
    );
  }

  const room = roomQuery.data;
  const scores = Object.values(gameState.scores).sort((a, b) => b.score - a.score);
  const membersById = new Map(room.members.map((member) => [member.userId, member]));
  const compactScores = scores.length > 12;
  const chatAuthorColors = buildAuthorColorMap(gameState.messages);

  const sendMessage = () => {
    const content = input.trim();
    if (!content || !socket) return;
    const now = Date.now();
    if (now - lastChatSentAtRef.current < 250) return;
    lastChatSentAtRef.current = now;
    const clientMessageId = crypto.randomUUID();
    dispatchGame({ type: 'pending', content, clientMessageId });
    socket.sendMessage(content, clientMessageId);
    setInput('');
    keepChatFocus();
  };

  const handleMessageKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as ReactKeyboardEvent<HTMLInputElement>['nativeEvent'] & {
      isComposing?: boolean;
      keyCode?: number;
    };
    if (event.key !== 'Enter' || event.shiftKey || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    event.preventDefault();
    sendMessage();
  };

  return (
    <section className={styles.shell}>
      {socketError && <Alert tone="danger">실시간 연결 오류: {socketError}</Alert>}
      <div className={`${styles.roomLayout} ${questionLayoutClass(currentQuestion?.mediaSourceType)}`}>
        <aside className={styles.side}>
          <div className={styles.sideBody}>
            <SoundControl volume={soundVolume} onChange={setSoundVolume} />
            <h2>점수</h2>
            <div className={`${styles.scoreGrid} ${compactScores ? styles.scoreGridCompact : ''}`}>
              {scores.map((score, index) => (
                <div className={styles.score} key={score.userId}>
                  <span className={styles.memberInfo}>
                    <span className={styles.rankBadge}>{index + 1}</span>
                    <UserAvatar
                      nickname={displayNickname(score.nickname)}
                      imageUrl={membersById.get(score.userId)?.profileImageUrl}
                      size={compactScores ? 'xs' : 'sm'}
                      userType={score.userType}
                    />
                    <span className={styles.scoreText} title={displayNickname(score.nickname)}>
                      <strong>{displayNickname(score.nickname)}</strong>
                      <span>{score.score}점</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <main className={styles.mainPanel}>
          <section className={styles.section}>
            {gameState.phase === 'ended' ? (
              <EmptyState title="게임 종료" description={gameState.endedReason ?? '모든 문제가 종료되었습니다.'} />
            ) : currentQuestion ? (
              <div className={`${styles.playBoard} ${isImageQuestion ? styles.imagePlayBoard : ''}`}>
                <div className={styles.questionStatus}>
                  <div>
                    <span>문제</span>
                    <strong>{currentQuestion.questionNumber}/{room.selectedQuestionCount}</strong>
                  </div>
                  <div>
                    <span>{gameState.phase === 'question-ended' ? '다음 문제' : '남은 시간'}</span>
                    <strong>{formatSeconds(displaySeconds)}</strong>
                  </div>
                  <div>
                    <span>스킵</span>
                    <strong>{gameState.skipVoteCount}/{gameState.skipVoteThreshold}</strong>
                  </div>
                </div>
                <div className={styles.timerTrack}>
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                {currentQuestion.mediaUrl && isImageQuestion && (
                  <div className={styles.imageQuestionPanel}>
                    <img alt="문제 이미지" src={currentQuestion.mediaUrl} />
                  </div>
                )}
                {currentQuestion.mediaUrl && !isImageQuestion && (
                  <div className={styles.mediaPanel}>
                    <audio ref={audioRef} autoPlay loop src={currentQuestion.mediaUrl} onError={reportAudioLoadFailure} />
                    <div className={styles.audioControl}>
                      <Volume2 size={18} />
                      <span>음량</span>
                      <input
                        aria-label="문제 음량"
                        max={100}
                        min={0}
                        type="range"
                        value={Math.round(audioVolume * 100)}
                        onChange={(event) => setAudioVolume(Number(event.target.value) / 100)}
                      />
                    </div>
                  </div>
                )}
                {!currentQuestion.mediaUrl && isImageQuestion && (
                  <div className={styles.mediaPanel}>
                    <ImageIcon size={24} />
                    <span>문제 이미지를 불러오는 중입니다.</span>
                  </div>
                )}
                <div className={styles.questionTextStack}>
                  <div className={styles.promptPanel}>
                    <div className={styles.promptIcon}>
                      <Timer size={26} />
                    </div>
                    <div>
                      <p>{currentQuestion.promptText || '정답을 입력해주세요.'}</p>
                    </div>
                  </div>
                  <div
                    className={[
                      styles.revealSlot,
                      revealState.kind === 'answer' ? styles.revealSlotAnswer : '',
                      revealState.kind === 'hint' ? styles.revealSlotHint : '',
                      revealState.kind === 'waiting' ? styles.revealSlotWaiting : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {revealState.kind === 'waiting' && <span className={styles.revealFill} style={{ width: `${revealState.progress}%` }} />}
                    <span>{revealState.label}</span>
                    <strong>{revealState.content}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="문제 시작을 기다리는 중입니다." />
            )}
          </section>
          <section className={styles.chat}>
            {gameState.messages.map((message) => (
              <div
                className={[
                  styles.message,
                  message.pending ? styles.messagePending : '',
                  message.system ? styles.messageSystem : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={message.id}
                style={{ '--chat-author-color': chatAuthorColors.get(message.author) } as CSSProperties}
              >
                <strong>{message.author}</strong>: {message.content}
              </div>
            ))}
          </section>
          <div className={styles.composer}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleMessageKeyDown}
              placeholder="정답 또는 채팅 입력 (Enter 키로 입력창 이동)"
              disabled={gameState.phase === 'ended'}
            />
            <Button
              icon={<SkipForward size={17} />}
              variant="secondary"
              className={hasVotedSkip ? styles.skipVotedButton : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={sendSkip}
              disabled={!canInteractWithQuestion}
            >
              스킵 <kbd className={styles.shortcutKey}>Esc</kbd>
            </Button>
            <Button
              icon={<Send size={17} />}
              onMouseDown={(event) => event.preventDefault()}
              onClick={sendMessage}
              disabled={!input.trim() || gameState.phase === 'ended'}
            >
              전송
            </Button>
          </div>
        </main>
      </div>
      <Modal
        open={exitOpen}
        title="게임방 나가기"
        onClose={() => setExitOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExitOpen(false)}>
              취소
            </Button>
            <Button variant="danger" icon={<DoorOpen size={17} />} disabled={leaveMutation.isPending} onClick={() => runOnce('room-leave', () => leaveMutation.mutateAsync())}>
              나가기
            </Button>
          </>
        }
      >
        <p className="muted">현재 게임방에서 나가고 방 목록으로 이동합니다.</p>
      </Modal>
      <Modal
        open={gameState.phase === 'ended' && resultOpen}
        title="게임 결과"
        width={560}
        closeButton={false}
        onClose={() => undefined}
        footer={
          <>
            <Button
              variant="secondary"
              icon={<MessageSquare size={17} />}
              onClick={() => {
                currentRoomStorage.clear();
                navigate(`/maps?mapId=${room.map.mapId}`);
              }}
            >
              맵 리뷰하기
            </Button>
            <Button variant="primary" icon={<DoorOpen size={17} />} disabled={leaveMutation.isPending} onClick={() => runOnce('room-leave', () => leaveMutation.mutateAsync())}>
              방 목록으로
            </Button>
          </>
        }
      >
        <div className={styles.resultPanel}>
          <div className={styles.resultTitle}>
            <Trophy size={22} />
            <div>
              <strong>{gameState.endedReason ?? '모든 문제가 종료되었습니다.'}</strong>
              <span>플레이한 맵에 좋아요와 댓글을 남길 수 있습니다.</span>
            </div>
          </div>
          <div className={styles.resultList}>
            {scores.map((score, index) => (
              <div className={styles.resultItem} key={score.userId}>
                <span className={styles.rankBadge}>{index + 1}</span>
                <UserAvatar
                  nickname={displayNickname(score.nickname)}
                  imageUrl={membersById.get(score.userId)?.profileImageUrl}
                  size="sm"
                  userType={score.userType}
                />
                <strong>{displayNickname(score.nickname)}</strong>
                <span>{score.score}점</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </section>
  );
}

function getRemainingMs(endsAt: string | null, fallbackDurationSeconds: number, now: number) {
  if (!endsAt) return fallbackDurationSeconds * 1000;
  const endTime = Date.parse(endsAt);
  if (!Number.isFinite(endTime)) return fallbackDurationSeconds * 1000;
  return Math.max(0, endTime - now);
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const NEXT_QUESTION_DELAY_MS = 3000;
const DEFAULT_HINT_TRIGGER_SECONDS = 10;
const AUDIO_VOLUME_KEY = 'nomat.audioVolume';
const CHAT_AUTHOR_COLORS = ['#15803d', '#b45309', '#7c3aed', '#0f766e', '#be123c', '#c2410c', '#a16207', '#64748b'];

function socketErrorMessage(messageCode: string) {
  if (messageCode === 'websocket_session_unavailable') {
    return '실시간 세션을 만들지 못했습니다. 새로고침 후 다시 시도해주세요.';
  }
  if (messageCode === 'invalid_token') {
    return '로그인 정보가 만료되었습니다. 다시 로그인해주세요.';
  }
  if (messageCode === 'forbidden_room_access' || messageCode === 'room_access_denied') {
    return '방에 접근할 권한이 없습니다.';
  }
  if (messageCode === 'room_not_found') {
    return '방이 삭제되었거나 종료되었습니다.';
  }
  return '실시간 연결을 다시 시도하고 있습니다.';
}

function questionKey(questionId: number, questionNumber: number) {
  return `${questionId}:${questionNumber}`;
}

function currentQuestionSnapshot(question: CurrentQuestion | null) {
  return {
    questionId: question?.questionId ?? null,
    questionNumber: question?.questionNumber ?? null,
    correctNickname: question?.correctNickname ?? null,
  };
}

function questionLayoutClass(mediaSourceType: string | null | undefined) {
  if (mediaSourceType === 'UPLOAD') return styles.imageQuestionLayout;
  if (mediaSourceType) return styles.audioQuestionLayout;
  return styles.textQuestionLayout;
}

function readAudioVolume() {
  const stored = Number(localStorage.getItem(AUDIO_VOLUME_KEY));
  return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.8;
}

function SoundControl({ volume, onChange }: { volume: number; onChange: (volume: number) => void }) {
  return (
    <div className={styles.soundControl}>
      <Volume2 size={16} />
      <span>효과음</span>
      <input
        aria-label="효과음 음량"
        max={100}
        min={0}
        type="range"
        value={Math.round(volume * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === 'range') return false;
  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

function buildAuthorColorMap(messages: { author: string; system?: boolean }[]) {
  const map = new Map<string, string>();
  messages.forEach((message) => {
    if (message.system || map.has(message.author)) return;
    map.set(message.author, CHAT_AUTHOR_COLORS[map.size % CHAT_AUTHOR_COLORS.length]);
  });
  return map;
}

type CurrentQuestion = NonNullable<ReturnType<typeof createInitialGameState>['currentQuestion']>;
type PlayPhase = ReturnType<typeof createInitialGameState>['phase'];

function getRevealState(question: CurrentQuestion | null, phase: PlayPhase, now: number) {
  if (!question) return { kind: 'waiting' as const, label: '힌트', content: '문제 시작 대기', progress: 0 };
  if (phase === 'question-ended') {
    return {
      kind: 'answer' as const,
      label: '정답',
      content: question.revealedAnswer ?? '정답 정보 확인 중',
      progress: 100,
    };
  }
  if (question.hint) {
    return { kind: 'hint' as const, label: '힌트', content: question.hint, progress: 100 };
  }
  if (!question.initialHintEnabled) {
    return { kind: 'waiting' as const, label: '힌트 없음', content: '정답을 기다리는 중', progress: 0 };
  }

  const triggerSeconds = question.initialHintTriggerSeconds || DEFAULT_HINT_TRIGGER_SECONDS;
  const endsAt = question.endsAt ? Date.parse(question.endsAt) : Number.NaN;
  const startedAt = Number.isFinite(endsAt) ? endsAt - question.durationSeconds * 1000 : Number.NaN;
  const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;
  const hintRevealDelayMs = Math.max(0, (question.durationSeconds - triggerSeconds) * 1000);
  const progress = hintRevealDelayMs === 0 ? 100 : Math.max(0, Math.min(100, (elapsedMs / hintRevealDelayMs) * 100));
  const remainingSeconds = Math.max(0, Math.ceil((hintRevealDelayMs - elapsedMs) / 1000));

  return {
    kind: 'waiting' as const,
    label: '힌트',
    content: remainingSeconds > 0 ? `${remainingSeconds}초 뒤 공개` : '힌트 공개 대기',
    progress,
  };
}

function getTransitionMs(questionEndedAt: string, now: number) {
  const endedAt = Date.parse(questionEndedAt);
  if (!Number.isFinite(endedAt)) return NEXT_QUESTION_DELAY_MS;
  return Math.max(0, endedAt + NEXT_QUESTION_DELAY_MS - now);
}
