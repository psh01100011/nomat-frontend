import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Clock3, DoorOpen, FileQuestion, ListChecks, Lock, Map as MapIcon, RefreshCw, Search, Tags } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CATEGORY_OPTIONS } from '@/entities/category';
import { QuestionType } from '@/entities/map';
import { AlreadyJoinedRoomModal } from '@/features/rooms/AlreadyJoinedRoomModal';
import { roomApi } from '@/features/rooms/room-api';
import { currentRoomStorage } from '@/features/rooms/current-room-storage';
import { getAlreadyJoinedRoomId, getAlreadyJoinedRoomStatus } from '@/features/rooms/room-error';
import { AdSlot } from '@/shared/ads/AdSlot';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { queryKeys } from '@/shared/api/query-keys';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { questionTypeLabel, roomTimeLimitLabel } from '@/shared/format/display-labels';
import { useAuth } from '@/features/auth/auth-context';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { MapArtwork } from '@/shared/ui/FallbackMedia';
import { FormField } from '@/shared/ui/FormField';
import { Modal } from '@/shared/ui/Modal';
import styles from './room-pages.module.css';

export function RoomListPage() {
  const runOnce = useSingleFlight();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [keywordInput, setKeywordInput] = useState('');
  const [params, setParams] = useState({
    keyword: '',
    status: '',
    categoryId: '',
    questionType: '',
    size: 12,
    joinableOnly: false,
  });
  const [hidePasswordRooms, setHidePasswordRooms] = useState(false);
  const [passwordRoomId, setPasswordRoomId] = useState<number | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [alreadyJoinedRoomId, setAlreadyJoinedRoomId] = useState<number | null>(null);
  const [alreadyJoinedRoomStatus, setAlreadyJoinedRoomStatus] = useState<ReturnType<typeof getAlreadyJoinedRoomStatus>>(null);
  const [alreadyJoinedOpen, setAlreadyJoinedOpen] = useState(false);

  const roomsQuery = useInfiniteQuery({
    queryKey: queryKeys.rooms({ ...params, hidePasswordRooms }),
    queryFn: ({ pageParam = 0 }) =>
      roomApi.list({
        keyword: params.keyword,
        status: params.status,
        categoryId: params.categoryId ? Number(params.categoryId) : undefined,
        questionType: params.questionType || undefined,
        excludePasswordRooms: hidePasswordRooms,
        joinableOnly: params.joinableOnly,
        page: pageParam,
        size: params.size,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.hasNext ? pages.length : undefined),
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const allRooms = useMemo(() => roomsQuery.data?.pages.flatMap((page) => page.rooms) ?? [], [roomsQuery.data?.pages]);
  const visibleRooms = allRooms
    ? [...allRooms].sort((a, b) => {
        if (a.status === b.status) return 0;
        if (a.status === 'WAITING') return -1;
        if (b.status === 'WAITING') return 1;
        return 0;
      })
    : [];

  const joinMutation = useMutation({
    mutationFn: ({ roomId, password }: { roomId: number; password?: string }) => roomApi.join(roomId, password),
    onSuccess: (room) => {
      currentRoomStorage.write(room.roomId);
      navigate('/room');
    },
    onError: (error) => {
      setPasswordRoomId(null);
      if (toApiErrorMessage(error) === 'already_joined_room') {
        setAlreadyJoinedRoomId(getAlreadyJoinedRoomId(error));
        setAlreadyJoinedRoomStatus(getAlreadyJoinedRoomStatus(error));
        setAlreadyJoinedOpen(true);
        return;
      }
      setNotice(joinErrorNotice(toApiErrorMessage(error)));
    },
  });

  useEffect(() => {
    const state = location.state as { noticeTitle?: string; noticeMessage?: string } | null;
    if (!state?.noticeTitle || !state.noticeMessage) return;
    setNotice({ title: state.noticeTitle, message: state.noticeMessage });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !roomsQuery.hasNextPage || roomsQuery.isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && roomsQuery.hasNextPage && !roomsQuery.isFetchingNextPage) {
        void roomsQuery.fetchNextPage();
      }
    }, { rootMargin: '160px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [roomsQuery]);

  const applySearch = () => setParams({ ...params, keyword: keywordInput });
  const closePasswordModal = () => {
    setPasswordRoomId(null);
    setPasswordInput('');
  };
  const requireLoginToJoin = () => {
    setLoginPromptOpen(true);
  };

  return (
    <section className={`${styles.shell} ${styles.listAdShell}`}>
      <div className={styles.browseToolbar}>
        <div className={styles.browseTabs}>
          <button type="button" onClick={() => navigate('/maps', { replace: true })}>
            <MapIcon size={16} />
            맵
          </button>
          <button className={styles.browseTabActive} type="button">
            게임방
          </button>
        </div>
        <Button icon={<RefreshCw size={17} />} onClick={() => roomsQuery.refetch()} disabled={roomsQuery.isFetching}>
          재조회
        </Button>
      </div>
      <div className={styles.filters}>
        <div className={styles.searchRow}>
          <input
            maxLength={40}
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              applySearch();
            }}
            placeholder="방 또는 맵 제목 검색"
          />
          <Button icon={<Search size={17} />} onClick={applySearch}>
            검색
          </Button>
        </div>
        <div className={styles.filterControls}>
          <select value={params.status} onChange={(event) => setParams({ ...params, status: event.target.value })}>
            <option value="">전체 상태</option>
            <option value="WAITING">대기중</option>
            <option value="PLAYING">게임중</option>
          </select>
          <select value={params.categoryId} onChange={(event) => setParams({ ...params, categoryId: event.target.value })}>
            <option value="">전체 카테고리</option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category.categoryId} value={category.categoryId}>
                {category.name}
              </option>
            ))}
          </select>
          <select value={params.questionType} onChange={(event) => setParams({ ...params, questionType: event.target.value })}>
            <option value="">전체 유형</option>
            <option value="TEXT">텍스트</option>
            <option value="IMAGE">이미지</option>
            <option value="AUDIO">오디오</option>
          </select>
          <label className={styles.checkFilter}>
            <input type="checkbox" checked={hidePasswordRooms} onChange={(event) => setHidePasswordRooms(event.target.checked)} />
            비밀방 제외
          </label>
        </div>
      </div>
      <AdSlot className={`${styles.roomAdRail} ${styles.contentAdRailLeft}`} minViewportWidth={1480} placement="roomListLeft" variant="vertical" />
      <AdSlot className={`${styles.roomAdRail} ${styles.contentAdRailRight}`} minViewportWidth={1480} placement="roomListRight" variant="vertical" />
      {roomsQuery.isError && <Alert tone="danger">방 목록을 불러오지 못했습니다.</Alert>}
      {roomsQuery.isLoading ? (
        <EmptyState title="방 목록을 불러오는 중입니다." />
      ) : visibleRooms.length ? (
        <>
          <div className={styles.roomList}>
            {visibleRooms.map((room) => (
              <article className={styles.roomItem} key={room.roomId}>
                <RoomMapThumb
                  mapTitle={room.mapTitle}
                  questionType={room.questionType}
                  thumbnailUrl={room.thumbnailUrl}
                />
                <div className={styles.roomInfo}>
                  <h2 className={styles.roomTitle}>
                    {room.title}
                    {room.hasPassword && <Lock size={15} aria-label="비밀번호 방" />}
                  </h2>
                  <p className={styles.roomMapTitle}>
                    <MapIcon size={15} />
                    {room.mapTitle}
                  </p>
                  <RoomMapMeta
                    categoryName={room.categoryName}
                    questionType={room.questionType}
                    selectedQuestionCount={room.selectedQuestionCount}
                    answerTimeLimitSeconds={room.answerTimeLimitSeconds}
                  />
                </div>
                <Button
                  icon={room.hasPassword ? <Lock size={17} /> : <DoorOpen size={17} />}
                  variant={room.status === 'PLAYING' ? 'danger' : 'primary'}
                  disabled={room.status === 'PLAYING' || joinMutation.isPending}
                  onClick={() => {
                    if (!auth.isAuthenticated) {
                      requireLoginToJoin();
                      return;
                    }
                    if (room.hasPassword) {
                      setPasswordRoomId(room.roomId);
                      setPasswordInput('');
                      return;
                    }
                    runOnce('room-join', () => joinMutation.mutateAsync({ roomId: room.roomId }));
                  }}
                >
                  {room.status === 'PLAYING' ? '게임중' : `${room.memberCount}/${room.maxPlayers}`}
                </Button>
              </article>
            ))}
          </div>
          <div className={styles.infiniteStatus} ref={loadMoreRef}>
            {roomsQuery.isFetchingNextPage ? '방을 더 불러오는 중입니다.' : roomsQuery.hasNextPage ? '더 보기' : '마지막 방입니다.'}
          </div>
        </>
      ) : (
        <EmptyState
          title="아직 열린 게임방이 없습니다."
          description="플레이할 맵을 골라 새로운 게임방을 만들어보세요."
          action={
            <Button icon={<MapIcon size={17} />} onClick={() => navigate('/maps')}>
              맵에서 방 만들기
            </Button>
          }
        />
      )}
      <AdSlot
        className={styles.footerAd}
        maxViewportWidth={1479}
        minViewportWidth={861}
        placement="roomListInline"
        variant="horizontal"
      />
      <Modal
        open={loginPromptOpen}
        title="로그인이 필요합니다"
        onClose={() => setLoginPromptOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLoginPromptOpen(false)}>
              취소
            </Button>
            <Button onClick={() => navigate('/login', { state: { from: '/rooms' } })}>
              로그인
            </Button>
          </>
        }
      >
        <p className="muted">로그인이 필요한 서비스입니다.{'\n'}로그인 후 방에 입장할 수 있습니다.</p>
      </Modal>
      <AlreadyJoinedRoomModal
        open={alreadyJoinedOpen}
        roomId={alreadyJoinedRoomId}
        status={alreadyJoinedRoomStatus}
        onClose={() => setAlreadyJoinedOpen(false)}
      />
      <Modal
        open={Boolean(passwordRoomId)}
        title="비밀번호 입력"
        onClose={closePasswordModal}
        footer={
          <>
            <Button variant="secondary" onClick={closePasswordModal}>
              취소
            </Button>
            <Button
              icon={<DoorOpen size={17} />}
              disabled={!passwordInput.trim() || joinMutation.isPending}
              onClick={() => passwordRoomId && runOnce('room-join', () => joinMutation.mutateAsync({ roomId: passwordRoomId, password: passwordInput }))}
            >
              입장
            </Button>
          </>
        }
      >
        <FormField
          label="방 비밀번호"
          helperText="방장이 설정한 비밀번호를 입력해주세요."
          counterText={remainingText(passwordInput, 20)}
        >
          <input
            autoComplete="new-password"
            autoFocus
            maxLength={20}
            name="room-join-password"
            type="password"
            value={passwordInput}
            onChange={(event) => setPasswordInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !passwordRoomId || !passwordInput.trim() || joinMutation.isPending) return;
              runOnce('room-join', () => joinMutation.mutateAsync({ roomId: passwordRoomId, password: passwordInput }));
            }}
          />
        </FormField>
      </Modal>
      <Modal
        open={Boolean(notice)}
        title={notice?.title ?? '안내'}
        onClose={() => setNotice(null)}
        footer={<Button onClick={() => setNotice(null)}>확인</Button>}
      >
        <p className="muted">{notice?.message}</p>
      </Modal>
    </section>
  );
}

function RoomMapMeta({
  categoryName,
  questionType,
  selectedQuestionCount,
  answerTimeLimitSeconds,
}: {
  categoryName: string;
  questionType: QuestionType;
  selectedQuestionCount: number;
  answerTimeLimitSeconds: number;
}) {
  return (
    <div className={styles.roomQuizMeta}>
      <span className={`${styles.roomQuizType} ${styles[`roomQuizType${questionType}`]}`}>
        <FileQuestion size={14} /> {questionTypeLabel(questionType)}
      </span>
      <span>
        <Tags size={14} /> {categoryName}
      </span>
      <span>
        <ListChecks size={14} /> {selectedQuestionCount}문제
      </span>
      <span>
        <Clock3 size={14} /> {roomTimeLimitLabel(questionType)} {answerTimeLimitSeconds}초
      </span>
    </div>
  );
}

function RoomMapThumb({
  mapTitle,
  questionType,
  thumbnailUrl,
}: {
  mapTitle: string;
  questionType: QuestionType;
  thumbnailUrl: string | null;
}) {
  return (
    <div className={styles.roomThumb}>
      <MapArtwork
        title={mapTitle}
        type={questionType}
        imageUrl={thumbnailUrl}
      />
    </div>
  );
}

function joinErrorNotice(messageCode: string) {
  if (messageCode === 'invalid_room_password') {
    return { title: '비밀번호가 올바르지 않습니다', message: '방 비밀번호를 다시 확인해주세요.' };
  }
  if (messageCode === 'room_access_denied' || messageCode === 'forbidden_room_access') {
    return { title: '입장할 수 없는 방입니다', message: '방에서 내보내졌거나 입장 권한이 없습니다.' };
  }
  if (messageCode === 'cannot_join_room') {
    return { title: '입장할 수 없습니다', message: '이미 게임이 진행 중이거나 정원이 가득 찬 방입니다.' };
  }
  if (messageCode === 'room_not_found') {
    return { title: '방을 찾을 수 없습니다', message: '방이 삭제되었거나 종료되었습니다.' };
  }
  return { title: '방에 입장하지 못했습니다', message: '잠시 후 다시 시도해주세요.' };
}

function remainingText(value: string, max: number) {
  return `${value.length}/${max}`;
}
