import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, DoorOpen, Link2, Play, Send, Settings, Trash2, UserMinus, UsersRound } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { roomEventBuffer } from '@/features/game/room-event-buffer';
import { createRoomSocket } from '@/features/game/room-socket';
import { useAudioVolume } from '@/features/game/use-audio-volume';
import { useSoundEffects } from '@/features/game/use-sound-effects';
import { roomApi } from '@/features/rooms/room-api';
import { currentRoomStorage } from '@/features/rooms/current-room-storage';
import { type ChatMessage } from '@/entities/game';
import { RoomDetail, RoomMember } from '@/entities/room';
import { AdSlot } from '@/shared/ads/AdSlot';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { queryKeys } from '@/shared/api/query-keys';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { displayNickname, questionTypeLabel, roomJoinMessage, roomTimeLimitLabel } from '@/shared/format/display-labels';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FormField } from '@/shared/ui/FormField';
import { MapArtwork, UserAvatar } from '@/shared/ui/FallbackMedia';
import { Modal } from '@/shared/ui/Modal';
import { NumericTextInput } from '@/shared/ui/NumericTextInput';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { SoundSettingsButton } from '@/shared/ui/SoundSettingsButton';
import { RoomHeaderOutletContext } from '@/widgets/AppLayout';
import styles from './room-pages.module.css';

export function RoomPage() {
  const runOnce = useSingleFlight();
  const auth = useAuth();
  const navigate = useNavigate();
  const { setRoomHeader } = useOutletContext<RoomHeaderOutletContext>();
  const queryClient = useQueryClient();
  const roomId = currentRoomStorage.read();
  const [socketError, setSocketError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roomSettings, setRoomSettings] = useState({
    maxPlayers: '8',
    selectedQuestionCount: '10',
    answerTimeLimitSeconds: '30',
  });
  const [settingsErrors, setSettingsErrors] = useState<Partial<Record<'maxPlayers' | 'selectedQuestionCount' | 'answerTimeLimitSeconds', string>>>({});
  const [kickTarget, setKickTarget] = useState<RoomMember | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState<'copied' | 'failed' | null>(null);
  const inviteRequestRef = useRef(false);
  const inviteTokenRef = useRef<string | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const lastChatSentAtRef = useRef(0);
  const previousMembersRef = useRef<Map<number, Pick<RoomMember, 'nickname' | 'userType'>> | null>(null);
  const { volume: soundVolume, setVolume: setSoundVolume, playChat } = useSoundEffects();
  const { volume: audioVolume, setVolume: setAudioVolume } = useAudioVolume();

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
        noticeTitle: '방에 들어갈 수 없습니다',
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
        noticeTitle: '방에 들어갈 수 없습니다',
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

  const deleteMutation = useMutation({
    mutationFn: () => roomApi.remove(roomId ?? 0),
    onSuccess: () => {
      currentRoomStorage.clear();
      navigate('/rooms', { replace: true });
    },
  });

  const kickMutation = useMutation({
    mutationFn: (targetUserId: number) => roomApi.kick(roomId ?? 0, targetUserId),
    onSuccess: (_, targetUserId) => {
      setKickTarget(null);
      queryClient.setQueryData<RoomDetail>(queryKeys.roomDetail(roomId ?? 0), (current) =>
        current
          ? {
              ...current,
              memberCount: Math.max(0, current.memberCount - 1),
              members: current.members.filter((member) => member.userId !== targetUserId),
            }
          : current,
      );
    },
  });

  const startMutation = useMutation({
    mutationFn: () => roomApi.start(roomId ?? 0),
    onSuccess: (room) => {
      queryClient.setQueryData(queryKeys.roomDetail(room.roomId), room);
      navigate('/play');
    },
  });

  const settingsMutation = useMutation({
    mutationFn: () => {
      const room = roomQuery.data;
      if (!room) throw new Error('room_required');
      const validation = validateRoomSettings(roomSettings, room.memberCount, room.map.questionCount, room.map.questionType);
      if (validation) {
        setSettingsErrors({ [validation.field]: validation.message });
        throw new Error(`form:${validation.field}`);
      }
      setSettingsErrors({});
      return roomApi.updateSettings(room.roomId, {
        maxPlayers: boundedNumber(roomSettings.maxPlayers, Math.max(2, room.memberCount), 12),
        selectedQuestionCount: boundedNumber(roomSettings.selectedQuestionCount, 1, Math.min(300, room.map.questionCount)),
        answerTimeLimitSeconds: boundedNumber(roomSettings.answerTimeLimitSeconds, 5, 300),
      });
    },
    onSuccess: (room) => {
      setSettingsOpen(false);
      queryClient.setQueryData(queryKeys.roomDetail(room.roomId), room);
    },
    onError: (error) => {
      if (error instanceof Error && error.message.startsWith('form:')) return;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => roomApi.createInvite(roomId ?? 0),
  });

  const copyInviteLink = async () => {
    if (!roomId || inviteRequestRef.current) return;
    inviteRequestRef.current = true;
    setInviteFeedback(null);
    try {
      if (!inviteTokenRef.current) {
        const response = await inviteMutation.mutateAsync();
        inviteTokenRef.current = response.inviteToken;
      }
      await copyText(`${window.location.origin}/rooms/invite/${inviteTokenRef.current}`);
      setInviteFeedback('copied');
    } catch {
      setInviteFeedback('failed');
    } finally {
      inviteRequestRef.current = false;
    }
  };

  useEffect(() => {
    if (!inviteFeedback) return;
    const timeoutId = window.setTimeout(() => setInviteFeedback(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [inviteFeedback]);

  const handleSocketError = useCallback((message: string) => {
    const code = normalizeSocketError(message);
    if (code === 'websocket_error' || code === 'internal_server_error' || code === 'unknown_error') {
      setSocketError('실시간 연결을 다시 시도하고 있습니다.');
      return;
    }
    if (code === 'websocket_session_unavailable') {
      setSocketError('실시간 세션을 만들지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return;
    }
    if (code === 'room_access_denied' || code === 'forbidden_room_access' || code === 'room_not_found' || code === 'cannot_join_room') {
      void queryClient
        .fetchQuery({ queryKey: queryKeys.roomDetail(roomId ?? 0), queryFn: () => roomApi.detail(roomId ?? 0) })
        .then(() => setSocketError('실시간 연결을 다시 시도하고 있습니다.'))
        .catch((error) => {
          currentRoomStorage.clear();
          const notice = roomAccessNotice(toApiErrorMessage(error) || code);
          navigate('/rooms', {
            replace: true,
            state: {
              noticeTitle: notice.title,
              noticeMessage: notice.message,
            },
          });
        });
      return;
    }
    setSocketError('실시간 연결을 다시 시도하고 있습니다.');
  }, [navigate, queryClient, roomId]);

  const socket = useMemo(() => {
    if (!roomId) return null;
    return createRoomSocket({
      roomId,
      onEvent: (event) => {
        if (event.type === 'CHAT_MESSAGE') {
          playChat();
          setMessages((current) => [
            ...current.filter((message) => message.id !== event.clientMessageId),
            {
              id: event.clientMessageId ?? `${event.occurredAt}-${event.userId}`,
              author: displayNickname(event.nickname ?? '알 수 없음'),
              content: event.content ?? '',
              pending: false,
              mine: event.userId === auth.userId,
              userType: event.userType,
            },
          ].slice(-80));
        }
        if (event.type === 'HOST_CHANGED' && event.newHostUserId) {
          const currentRoom = queryClient.getQueryData<RoomDetail>(queryKeys.roomDetail(roomId));
          const newHost = currentRoom?.members.find((member) => member.userId === event.newHostUserId);
          setMessages((current) => [
            ...current,
            {
              id: `host-changed-${event.occurredAt ?? Date.now()}-${event.newHostUserId}`,
              author: '시스템',
              content: `${displayNickname(newHost?.nickname ?? '참가자')}님이 새로운 방장이 되었습니다.`,
              pending: false,
              mine: false,
              system: true,
            },
          ].slice(-80));
        }
        if (
          event.type === 'MEMBER_JOINED' ||
          event.type === 'MEMBER_LEFT' ||
          event.type === 'HOST_CHANGED' ||
          event.type === 'MEMBER_KICKED' ||
          event.type === 'ROOM_SETTINGS_UPDATED'
        ) {
          if (event.type === 'ROOM_SETTINGS_UPDATED') {
            queryClient.setQueryData<RoomDetail>(queryKeys.roomDetail(roomId), (current) =>
              current
                ? {
                    ...current,
                    hasPassword: event.hasPassword ?? current.hasPassword,
                    maxPlayers: event.maxPlayers ?? current.maxPlayers,
                    selectedQuestionCount: event.selectedQuestionCount ?? current.selectedQuestionCount,
                    answerTimeLimitSeconds: event.answerTimeLimitSeconds ?? current.answerTimeLimitSeconds,
                    memberCount: event.memberCount ?? current.memberCount,
                  }
                : current,
            );
          }
          if (event.type !== 'ROOM_SETTINGS_UPDATED') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.roomDetail(roomId) });
          }
        }
        if (event.type === 'GAME_STARTED') {
          setIsStarting(true);
          window.setTimeout(() => navigate('/play'), 1800);
        }
        if (event.type === 'QUESTION_STARTED') {
          roomEventBuffer.write(event);
          navigate('/play');
        }
        if (event.type === 'ROOM_CLOSED' || (event.type === 'MEMBER_KICKED' && event.targetUserId === auth.userId)) {
          currentRoomStorage.clear();
          navigate('/rooms', {
            replace: true,
            state:
              event.type === 'MEMBER_KICKED'
                ? { noticeTitle: '방에서 내보내졌습니다', noticeMessage: '방장이 대기방에서 내보냈습니다.' }
                : { noticeTitle: '방이 종료되었습니다', noticeMessage: '방이 삭제되었거나 종료되었습니다.' },
          });
        }
      },
      onError: handleSocketError,
      onReconnect: () => {
        setSocketError('');
        void queryClient.invalidateQueries({ queryKey: queryKeys.roomDetail(roomId) });
      },
    });
  }, [auth.userId, handleSocketError, navigate, playChat, queryClient, roomId]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (roomQuery.data?.status === 'PLAYING') navigate('/play', { replace: true });
  }, [navigate, roomQuery.data?.status]);

  useEffect(() => {
    const room = roomQuery.data;
    if (!room || settingsOpen) return;
    setRoomSettings({
      maxPlayers: String(room.maxPlayers),
      selectedQuestionCount: String(room.selectedQuestionCount),
      answerTimeLimitSeconds: String(room.answerTimeLimitSeconds),
    });
    setSettingsErrors({});
  }, [roomQuery.data, settingsOpen]);

  useEffect(() => {
    const room = roomQuery.data;
    if (!room) return;
    const previousMembers = previousMembersRef.current;
    const nextMembers = new Map(
      room.members.map((member) => [member.userId, { nickname: displayNickname(member.nickname), userType: member.userType }]),
    );
    if (previousMembers) {
      const systemMessages: ChatMessage[] = [];
      nextMembers.forEach((member, userId) => {
        if (previousMembers.has(userId)) return;
        systemMessages.push({
          id: `joined-snapshot-${Date.now()}-${userId}`,
          author: '시스템',
          content: roomJoinMessage(member.nickname, member.userType === 'GUEST'),
          pending: false,
          mine: false,
          system: true,
        });
      });
      previousMembers.forEach((member, userId) => {
        if (nextMembers.has(userId)) return;
        systemMessages.push({
          id: `left-snapshot-${Date.now()}-${userId}`,
          author: '시스템',
          content: `${member.nickname}님이 나갔습니다.`,
          pending: false,
          mine: false,
          system: true,
        });
      });
      if (systemMessages.length) setMessages((current) => [...current, ...systemMessages].slice(-80));
    }
    previousMembersRef.current = nextMembers;
  }, [roomQuery.data]);

  useEffect(() => {
    if (!roomQuery.isError) return;
    const code = toApiErrorMessage(roomQuery.error);
    const notice = roomAccessNotice(code);
    currentRoomStorage.clear();
    navigate('/rooms', {
      replace: true,
      state: {
        noticeTitle: notice.title,
        noticeMessage: notice.message,
      },
    });
  }, [navigate, roomQuery.error, roomQuery.isError]);

  useEffect(() => {
    const room = roomQuery.data;
    if (!room) {
      setRoomHeader(null);
      return;
    }
    const isHost = room.hostUserId === auth.userId;
    setRoomHeader({
      actions: (
        <>
          <SoundSettingsButton
            audioVolume={audioVolume}
            onAudioVolumeChange={setAudioVolume}
            onSoundVolumeChange={setSoundVolume}
            showAudioVolume={room.map.questionType === 'AUDIO'}
            soundVolume={soundVolume}
          />
          <Button
            icon={<DoorOpen size={17} />}
            title="대기방 나가기"
            variant="danger"
            onClick={() => setExitOpen(true)}
          >
            나가기
          </Button>
          {isHost && (
            <Button icon={<Play size={17} />} disabled={startMutation.isPending} onClick={() => runOnce('room-start', () => startMutation.mutateAsync())}>
              시작
            </Button>
          )}
        </>
      ),
    });
    return () => setRoomHeader(null);
  }, [auth.userId, deleteMutation.isPending, inviteFeedback, inviteMutation.isPending, roomQuery.data, setRoomHeader, settingsMutation.isPending, startMutation.isPending]);

  useEffect(() => {
    if (exitOpen || settingsOpen || Boolean(kickTarget)) return;
    const handleEnterFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      chatInputRef.current?.focus();
    };
    window.addEventListener('keydown', handleEnterFocus);
    return () => window.removeEventListener('keydown', handleEnterFocus);
  }, [exitOpen, kickTarget, settingsOpen]);

  if (!roomId) return <Navigate replace to="/rooms" />;
  if (roomQuery.isLoading) return <EmptyState title="방 정보를 불러오는 중입니다." />;
  if (roomQuery.isError || !roomQuery.data) return <EmptyState title="방 정보를 확인하는 중입니다." />;

  const room = roomQuery.data;
  const isHost = room.hostUserId === auth.userId;
  const roomQuestionType = room.map.questionType ?? null;
  const compactMembers = room.maxPlayers > 12;
  const lobbyAuthorColors = buildAuthorColorMap(messages);
  const sendLobbyMessage = () => {
    const content = chatInput.trim();
    if (!content || !socket) return;
    const now = Date.now();
    if (now - lastChatSentAtRef.current < 250) return;
    lastChatSentAtRef.current = now;
    const clientMessageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: clientMessageId,
        author: displayNickname(auth.user?.nickname ?? '나'),
        content,
        pending: true,
        mine: true,
        userType: auth.userType,
      },
    ].slice(-80));
    socket.sendMessage(content, clientMessageId);
    setChatInput('');
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  };
  const handleLobbyChatKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as ReactKeyboardEvent<HTMLInputElement>['nativeEvent'] & {
      isComposing?: boolean;
      keyCode?: number;
    };
    if (event.key !== 'Enter' || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    event.preventDefault();
    sendLobbyMessage();
  };

  return (
    <section className={`${styles.shell} ${styles.lobbyAdShell}`}>
      {startMutation.isError && <Alert tone="danger">게임을 시작하지 못했습니다.</Alert>}
      {deleteMutation.isError && <Alert tone="danger">방을 삭제하지 못했습니다.</Alert>}
      {kickMutation.isError && <Alert tone="danger">참가자를 내보내지 못했습니다.</Alert>}
      {settingsMutation.isError && !(settingsMutation.error instanceof Error && settingsMutation.error.message.startsWith('form:')) && (
        <Alert tone="danger">방 설정을 변경하지 못했습니다.</Alert>
      )}
      {socketError && <Alert tone="danger">실시간 연결 오류: {socketError}</Alert>}
      {inviteFeedback === 'failed' && <Alert tone="danger">초대 링크를 복사하지 못했습니다. 잠시 후 다시 시도해주세요.</Alert>}
      {isStarting && <Alert>게임을 준비하고 있습니다. 첫 문제가 시작되면 자동으로 이동합니다.</Alert>}
      <div className={styles.roomExperience}>
        <div className={styles.roomLayout}>
          <aside className={`${styles.side} ${styles.lobbySide} ${compactMembers ? styles.compactMembers : ''}`}>
          <div className={styles.mapThumb}>
            <MapArtwork title={room.map.title} imageUrl={room.map.thumbnailUrl} />
          </div>
          <div className={styles.sideBody}>
            <h2 className={styles.roomTitle}>{room.map.title}</h2>
            <div className={styles.meta}>
              {roomQuestionType && (
                <span className={`${styles.roomQuizType} ${styles[`roomQuizType${roomQuestionType}`]}`}>
                  {questionTypeLabel(roomQuestionType)}
                </span>
              )}
              <span className={styles.roomCategoryText}>{room.map.categoryName}</span>
            </div>
          </div>
          <div className={styles.memberPanel}>
            <div className={styles.memberHeader}>
              <h2>참가자</h2>
              <span>{room.memberCount}/{room.maxPlayers}</span>
            </div>
            <Button
              className={styles.inviteButton}
              disabled={inviteMutation.isPending}
              icon={inviteFeedback === 'copied' ? <Check size={16} /> : <Link2 size={16} />}
              size="sm"
              variant="secondary"
              onClick={() => void copyInviteLink()}
            >
              {inviteFeedback === 'copied' ? '초대 링크 복사됨' : '초대 링크 복사'}
            </Button>
            <ul
              className={styles.memberList}
              style={{ '--member-slot-count': room.maxPlayers } as CSSProperties}
            >
              {Array.from({ length: room.maxPlayers }).map((_, index) => {
                const member = room.members[index];
                return (
                  <li className={`${styles.member} ${member ? '' : styles.memberEmpty}`} key={member?.userId ?? `empty-${index}`}>
                    {member ? (
                      <>
                        <span className={styles.memberInfo} title={displayNickname(member.nickname)}>
                          <UserAvatar
                            nickname={displayNickname(member.nickname)}
                            imageUrl={member.profileImageUrl}
                            size={compactMembers ? 'xs' : 'sm'}
                            userType={member.userType}
                          />
                          <span>{displayNickname(member.nickname)}</span>
                        </span>
                        <span className={styles.memberActions}>
                          {member.host && <StatusBadge tone="primary">방장</StatusBadge>}
                          {isHost && !member.host && member.userId !== auth.userId && (
                            <Button
                              icon={<UserMinus size={15} />}
                              iconOnly
                              size="sm"
                              variant="ghost"
                              aria-label={`${displayNickname(member.nickname)} 내보내기`}
                              onClick={() => setKickTarget(member)}
                            />
                          )}
                        </span>
                      </>
                    ) : (
                      <span className={styles.emptySlot}>빈 자리</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          </aside>
          <main className={`${styles.mainPanel} ${styles.lobbyPanel}`}>
          <div className={`${styles.section} ${styles.lobbyHero}`}>
            <div className={styles.lobbySettingsHeader}>
              <strong>게임 설정</strong>
              {isHost && (
                <Button
                  disabled={settingsMutation.isPending}
                  icon={<Settings size={16} />}
                  size="sm"
                  title="방 설정"
                  variant="secondary"
                  onClick={() => setSettingsOpen(true)}
                >
                  방 설정
                </Button>
              )}
            </div>
            <div className={styles.lobbyStats}>
              <div>
                <UsersRound size={18} />
                <span>참가자</span>
                <strong>
                  {room.memberCount}/{room.maxPlayers}
                </strong>
              </div>
              <div>
                <Play size={18} />
                <span>문제</span>
                <strong>{room.selectedQuestionCount}</strong>
              </div>
              <div>
                <Clock3 size={18} />
                <span>{roomTimeLimitLabel(roomQuestionType)}</span>
                <strong>{room.answerTimeLimitSeconds}초</strong>
              </div>
            </div>
          </div>
          <section className={`${styles.chat} ${styles.lobbyChat}`}>
            {messages.length ? (
              messages.map((message) => (
                <div
                  className={[
                    styles.message,
                    message.pending ? styles.messagePending : '',
                    message.system ? styles.messageSystem : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={message.id}
                  style={{ '--chat-author-color': lobbyAuthorColors.get(message.author) } as CSSProperties}
                >
                  <strong>{message.author}</strong>: {message.content}
                </div>
              ))
            ) : (
              <div className={styles.chatEmpty}>대기 중에도 채팅할 수 있습니다.</div>
            )}
          </section>
          <div className={`${styles.composer} ${styles.lobbyComposer}`}>
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={handleLobbyChatKeyDown}
              placeholder="채팅 입력 (Enter 키로 입력창 이동)"
            />
            <Button icon={<Send size={17} />} onClick={sendLobbyMessage} disabled={!chatInput.trim()}>
              전송
            </Button>
          </div>
          </main>
        </div>
        <AdSlot
          className={`${styles.roomAdRail} ${styles.contentAdRailLeft}`}
          minViewportWidth={1480}
          placement="roomLobbyLeft"
          variant="vertical"
        />
        <AdSlot
          className={`${styles.roomAdRail} ${styles.contentAdRailRight}`}
          minViewportWidth={1480}
          placement="roomLobbyRight"
          variant="vertical"
        />
      </div>
      <Modal
        open={settingsOpen}
        title="방 설정"
        onClose={() => setSettingsOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
              취소
            </Button>
            <Button icon={<Settings size={17} />} disabled={settingsMutation.isPending} onClick={() => runOnce('room-settings', () => settingsMutation.mutateAsync())}>
              저장
            </Button>
          </>
        }
      >
        <div className={styles.settingsForm}>
          <div className={styles.settingsGrid}>
            <FormField label="최대 참가자" helperText={`${Math.max(2, room.memberCount)}-12명`} errorText={settingsErrors.maxPlayers}>
              <NumericTextInput
                max={12}
                min={Math.max(2, room.memberCount)}
                value={roomSettings.maxPlayers}
                onChange={(maxPlayers) => {
                  setRoomSettings((current) => ({ ...current, maxPlayers }));
                  setSettingsErrors((current) => ({ ...current, maxPlayers: undefined }));
                }}
              />
            </FormField>
            <FormField label="문제 수" helperText={`1-${Math.min(300, room.map.questionCount)}문제`} errorText={settingsErrors.selectedQuestionCount}>
              <NumericTextInput
                max={Math.min(300, room.map.questionCount)}
                min={1}
                value={roomSettings.selectedQuestionCount}
                onChange={(selectedQuestionCount) => {
                  setRoomSettings((current) => ({ ...current, selectedQuestionCount }));
                  setSettingsErrors((current) => ({ ...current, selectedQuestionCount: undefined }));
                }}
              />
            </FormField>
            <FormField label={roomTimeLimitLabel(roomQuestionType)} helperText="5-300초" errorText={settingsErrors.answerTimeLimitSeconds}>
              <NumericTextInput
                max={300}
                min={5}
                value={roomSettings.answerTimeLimitSeconds}
                onChange={(answerTimeLimitSeconds) => {
                  setRoomSettings((current) => ({ ...current, answerTimeLimitSeconds }));
                  setSettingsErrors((current) => ({ ...current, answerTimeLimitSeconds: undefined }));
                }}
              />
            </FormField>
          </div>
        </div>
      </Modal>
      <Modal
        open={exitOpen}
        title="대기방 나가기"
        onClose={() => setExitOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExitOpen(false)}>
              취소
            </Button>
            {isHost && (
              <Button variant="danger" icon={<Trash2 size={17} />} disabled={deleteMutation.isPending} onClick={() => runOnce('room-exit', () => deleteMutation.mutateAsync())}>
                방 삭제
              </Button>
            )}
            <Button variant="danger" icon={<DoorOpen size={17} />} disabled={leaveMutation.isPending} onClick={() => runOnce('room-exit', () => leaveMutation.mutateAsync())}>
              나가기
            </Button>
          </>
        }
      >
        <p className="muted">현재 대기방에서 나가고 방 목록으로 이동합니다.</p>
      </Modal>
      <Modal
        open={Boolean(kickTarget)}
        title="참가자 내보내기"
        onClose={() => setKickTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setKickTarget(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              icon={<UserMinus size={17} />}
              disabled={kickMutation.isPending}
              onClick={() => kickTarget && runOnce('room-kick', () => kickMutation.mutateAsync(kickTarget.userId))}
            >
              내보내기
            </Button>
          </>
        }
      >
        <p className="muted">{displayNickname(kickTarget?.nickname)}님을 대기방에서 내보냅니다.</p>
      </Modal>
    </section>
  );
}

function normalizeSocketError(message: string) {
  try {
    const parsed = JSON.parse(message) as { message?: string };
    return parsed.message ?? message;
  } catch {
    return message;
  }
}

function roomAccessNotice(messageCode: string) {
  if (messageCode === 'cannot_join_room') {
    return { title: '이미 시작된 방입니다', message: '게임이 진행 중이어서 대기방으로 다시 들어갈 수 없습니다.' };
  }
  if (messageCode === 'room_access_denied' || messageCode === 'forbidden_room_access') {
    return { title: '들어갈 수 없는 방입니다', message: '방에서 내보내졌거나 입장 권한이 없습니다.' };
  }
  if (messageCode === 'room_not_found') {
    return { title: '방을 찾을 수 없습니다', message: '방이 삭제되었거나 종료되었습니다.' };
  }
  if (messageCode === 'websocket_session_unavailable') {
    return { title: '실시간 세션을 만들지 못했습니다', message: '페이지를 새로고침한 뒤 다시 시도해주세요.' };
  }
  return { title: '대기방 연결 상태를 확인 중입니다', message: '실시간 연결을 다시 시도하고 있습니다.' };
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that block the asynchronous Clipboard API.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('clipboard_write_failed');
}

function validateRoomSettings(
  settings: {
    maxPlayers: string;
    selectedQuestionCount: string;
    answerTimeLimitSeconds: string;
  },
  memberCount: number,
  mapQuestionCount: number,
  questionType: RoomDetail['map']['questionType'],
) {
  const maxPlayers = Number(settings.maxPlayers);
  const selectedQuestionCount = Number(settings.selectedQuestionCount);
  const answerTimeLimitSeconds = Number(settings.answerTimeLimitSeconds);
  if (!Number.isFinite(maxPlayers) || maxPlayers < Math.max(2, memberCount) || maxPlayers > 12) {
    return { field: 'maxPlayers' as const, message: `현재 참가자 수 이상, 최대 12명까지 설정할 수 있습니다.` };
  }
  if (
    !Number.isFinite(selectedQuestionCount) ||
    selectedQuestionCount < 1 ||
    selectedQuestionCount > Math.min(300, mapQuestionCount)
  ) {
    return { field: 'selectedQuestionCount' as const, message: `1-${Math.min(300, mapQuestionCount)}문제까지 설정할 수 있습니다.` };
  }
  if (!Number.isFinite(answerTimeLimitSeconds) || answerTimeLimitSeconds < 5 || answerTimeLimitSeconds > 300) {
    return { field: 'answerTimeLimitSeconds' as const, message: `${roomTimeLimitLabel(questionType)}은 5-300초로 설정해주세요.` };
  }
  return null;
}

function boundedNumber(value: string, min: number, max: number) {
  if (!value) return min;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === 'range') return false;
  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

const CHAT_AUTHOR_COLORS = ['#15803d', '#b45309', '#7c3aed', '#0f766e', '#be123c', '#c2410c', '#a16207', '#64748b'];

function buildAuthorColorMap(messages: ChatMessage[]) {
  const map = new Map<string, string>();
  messages.forEach((message) => {
    if (message.system || map.has(message.author)) return;
    map.set(message.author, CHAT_AUTHOR_COLORS[map.size % CHAT_AUTHOR_COLORS.length]);
  });
  return map;
}
