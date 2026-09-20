import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, FileQuestion, Flag, Gamepad2, Heart, ListChecks, MessageSquare, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Comment } from '@/entities/comment';
import { MapDetail, MapListItem, MapListResponse, MapReactionResponse } from '@/entities/map';
import { CommentReportReason, MapReportReason } from '@/entities/report';
import { useAuth } from '@/features/auth/auth-context';
import { commentApi } from '@/features/comments/comment-api';
import { mapApi } from '@/features/maps/map-api';
import { reportApi } from '@/features/reports/report-api';
import { AlreadyJoinedRoomModal } from '@/features/rooms/AlreadyJoinedRoomModal';
import { currentRoomStorage } from '@/features/rooms/current-room-storage';
import { roomApi } from '@/features/rooms/room-api';
import { getAlreadyJoinedRoomId, getAlreadyJoinedRoomStatus } from '@/features/rooms/room-error';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { queryKeys } from '@/shared/api/query-keys';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { displayNickname, formatDate, questionTypeLabel, roomTimeLimitLabel } from '@/shared/format/display-labels';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { MapArtwork, UserAvatar } from '@/shared/ui/FallbackMedia';
import { FormField } from '@/shared/ui/FormField';
import { Modal } from '@/shared/ui/Modal';
import { NumericTextInput } from '@/shared/ui/NumericTextInput';
import { Pagination } from '@/shared/ui/Pagination';
import styles from '@/pages/map-pages.module.css';

type MapDetailDialogProps = {
  mapId: number | null;
  onClose: () => void;
};

export function MapDetailDialog({ mapId, onClose }: MapDetailDialogProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runOnce = useSingleFlight();
  const [commentPage, setCommentPage] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<Comment | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportCloseConfirmOpen, setReportCloseConfirmOpen] = useState(false);
  const [reportReason, setReportReason] = useState<MapReportReason | CommentReportReason>('OTHER');
  const [reportDescription, setReportDescription] = useState('');
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [roomPasswordError, setRoomPasswordError] = useState('');
  const [roomMaxPlayers, setRoomMaxPlayers] = useState('8');
  const [roomQuestionCount, setRoomQuestionCount] = useState('10');
  const [roomAnswerTimeLimit, setRoomAnswerTimeLimit] = useState('30');
  const [alreadyJoinedRoomId, setAlreadyJoinedRoomId] = useState<number | null>(null);
  const [alreadyJoinedRoomStatus, setAlreadyJoinedRoomStatus] = useState<ReturnType<typeof getAlreadyJoinedRoomStatus>>(null);
  const [alreadyJoinedOpen, setAlreadyJoinedOpen] = useState(false);

  useEffect(() => {
    setCommentPage(0);
    setCommentText('');
  }, [mapId]);

  const detailQuery = useQuery({
    queryKey: queryKeys.mapDetail(mapId ?? 0),
    queryFn: () => mapApi.detail(mapId ?? 0),
    enabled: Boolean(mapId),
  });

  const commentsQuery = useQuery({
    queryKey: [...queryKeys.comments(mapId ?? 0, commentPage), auth.userId ?? 'guest'],
    queryFn: () => commentApi.list(mapId ?? 0, commentPage, 8, 'latest', auth.isAuthenticated ? 'optional' : 'none'),
    enabled: Boolean(mapId),
    retry: false,
  });

  const commentMutation = useMutation({
    mutationFn: () => commentApi.create(mapId ?? 0, commentText.trim()),
    onSuccess: async () => {
      setCommentText('');
      setCommentPage(0);
      await queryClient.invalidateQueries({ queryKey: ['comments', mapId ?? 0] });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ targetMapId, action }: { targetMapId: number; action: 'like' | 'unlike' | 'favorite' | 'unfavorite' }) => {
      if (action === 'like') return mapApi.like(targetMapId);
      if (action === 'unlike') return mapApi.unlike(targetMapId);
      if (action === 'favorite') return mapApi.favorite(targetMapId);
      return mapApi.unfavorite(targetMapId);
    },
    onSuccess: (reaction) => {
      queryClient.setQueriesData<MapListResponse>({ queryKey: ['maps'] }, (current) =>
        current
          ? {
              ...current,
              maps: current.maps.map((map) => map.mapId === reaction.mapId ? applyReaction(map, reaction) : map),
            }
          : current,
      );
      queryClient.setQueryData<MapDetail>(queryKeys.mapDetail(reaction.mapId), (current) =>
        current ? applyReaction(current, reaction) : current,
      );
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => {
      if (!reportTarget) throw new Error('report_target_required');
      const description = reportDescription.trim() || null;
      if (reportTarget.type === 'map') {
        return reportApi.map(reportTarget.mapId, { reason: reportReason as MapReportReason, description });
      }
      return reportApi.comment(reportTarget.commentId, { reason: reportReason as CommentReportReason, description });
    },
    onSuccess: () => {
      setReportTarget(null);
      setReportDescription('');
      setNotice({ title: '신고가 접수되었습니다', message: '검토 후 필요한 조치를 진행합니다.' });
    },
    onError: (error) => setNotice(reportErrorNotice(toApiErrorMessage(error))),
  });

  const commentDeleteMutation = useMutation({
    mutationFn: commentApi.remove,
    onSuccess: async () => {
      setDeleteCommentTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['comments', mapId ?? 0] });
    },
  });

  const commentUpdateMutation = useMutation({
    mutationFn: ({ commentId, content }: { commentId: number; content: string }) => commentApi.update(commentId, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['comments', mapId ?? 0] });
    },
  });

  const selectedMap = detailQuery.data;
  const roomMutation = useMutation({
    mutationFn: (map: MapDetail) =>
      roomApi.create({
        mapId: map.mapId,
        title: normalizeRoomTitle(roomTitle, map.title),
        password: roomPassword.trim() || null,
        maxPlayers: boundedNumber(roomMaxPlayers, 2, 12),
        selectedQuestionCount: boundedNumber(roomQuestionCount, 1, map.questionCount),
        answerTimeLimitSeconds: boundedNumber(roomAnswerTimeLimit, 5, 300),
        timeLimitMode: 'FIXED',
        audioRepeatEnabled: true,
        initialHintEnabled: true,
        initialHintTriggerSeconds: 10,
      }),
    onSuccess: (room) => {
      currentRoomStorage.write(room.roomId);
      navigate('/room');
    },
    onError: (error) => {
      if (toApiErrorMessage(error) !== 'already_joined_room') return;
      setRoomOpen(false);
      setAlreadyJoinedRoomId(getAlreadyJoinedRoomId(error));
      setAlreadyJoinedRoomStatus(getAlreadyJoinedRoomStatus(error));
      setAlreadyJoinedOpen(true);
    },
  });

  const memberOnlyTitle = auth.isGuest ? '회원만 이용할 수 있습니다.' : '로그인이 필요합니다.';
  const showRoomCreateError = roomMutation.isError && toApiErrorMessage(roomMutation.error) !== 'already_joined_room';
  const openRoomModal = () => {
    if (!selectedMap || !auth.isAuthenticated) return;
    setRoomTitle('');
    setRoomPassword('');
    setRoomPasswordError('');
    setRoomMaxPlayers('8');
    setRoomQuestionCount(String(Math.max(1, Math.min(10, selectedMap.questionCount))));
    setRoomAnswerTimeLimit('30');
    setRoomOpen(true);
  };
  const createRoom = () => {
    if (!selectedMap || roomMutation.isPending) return;
    const normalizedPassword = roomPassword.trim();
    if (normalizedPassword && normalizedPassword.length < 4) {
      setRoomPasswordError('4자 이상 입력해주세요.');
      return;
    }
    setRoomPasswordError('');
    runOnce('room-create', () => roomMutation.mutateAsync(selectedMap));
  };
  const resetReportModal = () => {
    setReportTarget(null);
    setReportDescription('');
    setReportReason('OTHER');
  };
  const closeReportModal = () => {
    if (reportDescription.trim() || reportReason !== 'OTHER') {
      setReportCloseConfirmOpen(true);
      return;
    }
    resetReportModal();
  };

  return (
    <>
      <Modal
        open={Boolean(mapId)}
        title={selectedMap?.title ?? '맵 상세'}
        width={720}
        onClose={onClose}
        footer={selectedMap ? (
          <div className={styles.detailFooter}>
            <div className={styles.detailActions}>
              <Button
                size="sm"
                icon={<Heart size={17} />}
                variant={selectedMap.liked ? 'primary' : 'secondary'}
                className={selectedMap.liked ? styles.reactionActive : ''}
                disabled={!auth.isMember || reactionMutation.isPending}
                title={!auth.isMember ? memberOnlyTitle : undefined}
                onClick={() => auth.isMember && runOnce('map-reaction', () => reactionMutation.mutateAsync({ targetMapId: selectedMap.mapId, action: selectedMap.liked ? 'unlike' : 'like' }))}
              >
                좋아요
              </Button>
              <Button
                size="sm"
                icon={<Bookmark size={17} />}
                variant={selectedMap.favorited ? 'primary' : 'secondary'}
                className={selectedMap.favorited ? styles.reactionActive : ''}
                disabled={!auth.isMember || reactionMutation.isPending}
                title={!auth.isMember ? memberOnlyTitle : undefined}
                onClick={() => auth.isMember && runOnce('map-reaction', () => reactionMutation.mutateAsync({ targetMapId: selectedMap.mapId, action: selectedMap.favorited ? 'unfavorite' : 'favorite' }))}
              >
                즐겨찾기
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!auth.isMember}
                title={!auth.isMember ? memberOnlyTitle : undefined}
                icon={<Flag size={17} />}
                onClick={() => {
                  if (!auth.isMember) return;
                  setReportTarget({ type: 'map', mapId: selectedMap.mapId });
                  setReportReason('OTHER');
                  setReportDescription('');
                }}
              >
                신고
              </Button>
            </div>
            <Button onClick={openRoomModal} disabled={!auth.isAuthenticated}>
              {auth.isAuthenticated ? '이 맵으로 방 만들기' : '로그인 후 방 만들기'}
            </Button>
          </div>
        ) : null}
      >
        {detailQuery.isLoading ? (
          <EmptyState title="맵 상세를 불러오는 중입니다." />
        ) : detailQuery.isError ? (
          <Alert tone="danger">맵 상세를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</Alert>
        ) : selectedMap ? (
          <div className={styles.detailGrid}>
            <div className={styles.detailCreatorRow}>
              <UserAvatar nickname={displayNickname(selectedMap.creator.nickname)} imageUrl={selectedMap.creator.profileImageUrl} size="sm" />
              <span>{displayNickname(selectedMap.creator.nickname)}</span>
            </div>
            <div className={styles.detailPrimary}>
              {selectedMap.thumbnailUrl && (
                <div className={styles.thumb}>
                  <MapArtwork title={selectedMap.title} type={selectedMap.questionType} imageUrl={selectedMap.thumbnailUrl} />
                </div>
              )}
              {selectedMap.description && <p className="muted">{selectedMap.description}</p>}
            </div>
            <div className={styles.detailInfoStack}>
              <div className={styles.detailMetaStack}>
                <QuizInfoGroup map={selectedMap} />
                <ReactionInfoGroup map={selectedMap} />
              </div>
            </div>
            <section className={styles.commentList}>
              <div className={styles.commentTitle}>
                <h3>댓글</h3>
                <span>{commentsQuery.data?.totalElements ?? selectedMap.commentCount}개</span>
              </div>
              {commentsQuery.isError && <Alert tone="danger">댓글을 불러오지 못했습니다.</Alert>}
              {auth.isMember ? (
                <div className={styles.commentComposer}>
                  <textarea maxLength={COMMENT_MAX_LENGTH} rows={3} value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="댓글 입력" />
                  <span className={styles.commentCounter}>{remainingText(commentText, COMMENT_MAX_LENGTH)}</span>
                  <Button icon={<MessageSquare size={17} />} onClick={() => runOnce('comment-create', () => commentMutation.mutateAsync())} disabled={!commentText.trim() || commentMutation.isPending}>
                    등록
                  </Button>
                </div>
              ) : (
                <Alert>{auth.isGuest ? '댓글 작성은 회원만 이용할 수 있습니다.' : '댓글 작성은 로그인이 필요합니다.'}</Alert>
              )}
              {commentMutation.isError && <Alert tone="danger">댓글을 등록하지 못했습니다. 내용을 확인하고 다시 시도해주세요.</Alert>}
              {commentsQuery.isLoading ? (
                <EmptyState title="댓글을 불러오는 중입니다." />
              ) : commentsQuery.data?.comments.length ? (
                commentsQuery.data.comments.map((comment) => (
                  <CommentItem
                    key={comment.commentId}
                    comment={comment}
                    creatorId={selectedMap.creator.userId}
                    onDelete={() => setDeleteCommentTarget(comment)}
                    onReport={() => {
                      if (!auth.isMember) return;
                      setReportTarget({ type: 'comment', commentId: comment.commentId });
                      setReportReason('OTHER');
                      setReportDescription('');
                    }}
                    onUpdate={(content) => runOnce(`comment-update:${comment.commentId}`, () => commentUpdateMutation.mutateAsync({ commentId: comment.commentId, content }))}
                    canReport={auth.isMember}
                    reportDisabledTitle={memberOnlyTitle}
                  />
                ))
              ) : !commentsQuery.isError ? (
                <EmptyState title="댓글이 없습니다." description="첫 댓글을 남겨보세요." />
              ) : null}
              {!commentsQuery.isLoading && !commentsQuery.isError && (
                <Pagination page={commentPage} totalPages={commentsQuery.data?.totalPages ?? 0} onChange={setCommentPage} />
              )}
            </section>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(deleteCommentTarget)} title="댓글 삭제" onClose={() => setDeleteCommentTarget(null)} footer={<><Button variant="secondary" onClick={() => setDeleteCommentTarget(null)}>취소</Button><Button icon={<Trash2 size={17} />} variant="danger" disabled={commentDeleteMutation.isPending} onClick={() => deleteCommentTarget && runOnce('comment-delete', () => commentDeleteMutation.mutateAsync(deleteCommentTarget.commentId))}>삭제</Button></>}>
        <p className="muted">댓글을 삭제합니다. 삭제한 댓글은 복구할 수 없습니다.</p>
      </Modal>

      <Modal open={reportCloseConfirmOpen} title="신고 작성 취소" onClose={() => setReportCloseConfirmOpen(false)} footer={<><Button variant="secondary" onClick={() => setReportCloseConfirmOpen(false)}>계속 작성</Button><Button variant="danger" onClick={() => { setReportCloseConfirmOpen(false); resetReportModal(); }}>닫기</Button></>}>
        <p className="muted">작성 중인 신고 내용이 사라집니다.{'\n'}신고 작성을 닫을까요?</p>
      </Modal>

      <Modal open={Boolean(reportTarget)} title={reportTarget?.type === 'comment' ? '댓글 신고' : '맵 신고'} onClose={closeReportModal} footer={<><Button variant="secondary" onClick={closeReportModal}>취소</Button><Button onClick={() => runOnce('report-create', () => reportMutation.mutateAsync())} disabled={reportMutation.isPending || (reportReason === 'OTHER' && reportDescription.trim().length < 10)}>신고 제출</Button></>}>
        <div className={styles.editorForm}>
          <FormField label="신고 사유">
            <select value={reportReason} onChange={(event) => setReportReason(event.target.value as MapReportReason | CommentReportReason)}>
              {(reportTarget?.type === 'comment' ? COMMENT_REPORT_REASONS : MAP_REPORT_REASONS).map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
            </select>
          </FormField>
          <FormField label="상세 내용" counterText={remainingText(reportDescription, REPORT_DESCRIPTION_MAX)}>
            <textarea maxLength={REPORT_DESCRIPTION_MAX} rows={4} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} placeholder={reportReason === 'OTHER' ? '기타 사유는 상세 내용을 입력해주세요.' : '상세 내용을 입력하면 검토에 도움이 됩니다.'} />
          </FormField>
        </div>
      </Modal>
      <Modal open={Boolean(notice)} title={notice?.title ?? '안내'} onClose={() => setNotice(null)} footer={<Button onClick={() => setNotice(null)}>확인</Button>}>
        <p className="muted">{notice?.message}</p>
      </Modal>

      <Modal open={roomOpen} title="방 만들기" onClose={() => { setRoomOpen(false); setRoomPasswordError(''); }} footer={<Button onClick={createRoom} disabled={!selectedMap || roomMutation.isPending}>방 만들기</Button>}>
        {showRoomCreateError && <Alert tone="danger">방을 만들지 못했습니다. 입력값과 맵 상태를 확인해주세요.</Alert>}
        <div className={styles.editorForm}>
          <FormField label="방 제목" helperText="방 목록과 대기방 상단에 표시됩니다." counterText={remainingText(roomTitle, 30)}>
            <input autoComplete="off" maxLength={30} name="room-title" value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createRoom(); }} placeholder={selectedMap?.title} />
          </FormField>
          <FormField label="비밀번호" errorText={roomPasswordError} helperText="선택 사항 · 설정하려면 4-20자로 입력해주세요." counterText={remainingText(roomPassword, 20)}>
            <input autoComplete="new-password" maxLength={20} name="room-create-password" value={roomPassword} onChange={(event) => { setRoomPassword(event.target.value); if (roomPasswordError) setRoomPasswordError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') createRoom(); }} placeholder="선택 사항" type="password" />
          </FormField>
          <div className={styles.row}>
            <FormField label="최대 인원" helperText="방에 들어올 수 있는 최대 참가자 수입니다.">
              <NumericTextInput min={2} max={12} value={roomMaxPlayers} onKeyDown={(event) => { if (event.key === 'Enter') createRoom(); }} onChange={setRoomMaxPlayers} />
            </FormField>
            <FormField label="문제 수" helperText={`이 맵은 최대 ${selectedMap?.questionCount ?? 0}문제까지 사용할 수 있습니다.`}>
              <NumericTextInput min={1} max={selectedMap?.questionCount ?? 1} value={roomQuestionCount} onKeyDown={(event) => { if (event.key === 'Enter') createRoom(); }} onChange={setRoomQuestionCount} />
            </FormField>
          </div>
          <FormField label={roomTimeLimitLabel(selectedMap?.questionType)} helperText={selectedMap?.questionType === 'AUDIO' ? '오디오 문제에서 최소로 보장할 문제 시간입니다. 5-300초' : '각 문제마다 정답을 입력할 수 있는 시간입니다. 5-300초'}>
            <NumericTextInput min={5} max={300} value={roomAnswerTimeLimit} onKeyDown={(event) => { if (event.key === 'Enter') createRoom(); }} onChange={setRoomAnswerTimeLimit} />
          </FormField>
        </div>
      </Modal>
      <AlreadyJoinedRoomModal open={alreadyJoinedOpen} roomId={alreadyJoinedRoomId} status={alreadyJoinedRoomStatus} onClose={() => setAlreadyJoinedOpen(false)} />
    </>
  );
}

function QuizInfoGroup({ map }: { map: Pick<MapListItem, 'category' | 'questionType' | 'questionCount'> }) {
  return <div className={styles.quizMeta}><span className={`${styles.quizType} ${styles[`quizType${map.questionType}`]}`}><FileQuestion size={14} /> {questionTypeLabel(map.questionType)}</span>{isUsefulCategory(map.category.name) && <span className={styles.quizCategory}>{map.category.name}</span>}<span className={styles.quizCount}><ListChecks size={14} /> {map.questionCount}문제</span></div>;
}

function ReactionInfoGroup({ map }: { map: Pick<MapListItem, 'playCount' | 'likeCount' | 'commentCount'> }) {
  return <div className={styles.reactionStats}><span><Gamepad2 size={14} /> {map.playCount}</span><span><Heart size={14} /> {map.likeCount}</span><span><MessageSquare size={14} /> {map.commentCount}</span></div>;
}

function CommentItem({ comment, creatorId, onDelete, onReport, onUpdate, canReport, reportDisabledTitle }: { comment: Comment; creatorId?: number; onDelete: () => void; onReport: () => void; onUpdate: (content: string) => void; canReport: boolean; reportDisabledTitle: string }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(comment.content);
  const [expanded, setExpanded] = useState(false);
  const isLong = comment.content.length > 160 || comment.content.split('\n').length > 3;
  return (
    <article className={styles.comment}>
      <div className={styles.commentHeader}><span className={styles.commentAuthor}><UserAvatar nickname={displayNickname(comment.writer.nickname)} imageUrl={comment.writer.profileImageUrl} size="sm" /><strong>{displayNickname(comment.writer.nickname)}</strong>{creatorId === comment.writer.userId && <span className={styles.creatorBadge}>제작자</span>}</span><span>{formatDate(comment.createdAt)}</span></div>
      {editing ? <div className={styles.commentEditBox}><textarea maxLength={COMMENT_MAX_LENGTH} rows={3} value={content} onChange={(event) => setContent(event.target.value)} /><span className={styles.commentCounter}>{remainingText(content, COMMENT_MAX_LENGTH)}</span></div> : <><p className={`${styles.commentBody} ${isLong && !expanded ? styles.commentCollapsed : ''}`}>{comment.content}</p>{isLong && <button className={styles.moreButton} type="button" onClick={() => setExpanded((current) => !current)}>{expanded ? '접기' : '더보기'}</button>}</>}
      <div className={styles.actions} style={{ marginTop: '0.45rem' }}>
        {comment.isMine && <><Button size="sm" variant="ghost" onClick={() => { if (editing) onUpdate(content); setEditing(!editing); }}>{editing ? '저장' : '수정'}</Button>{!editing && <Button icon={<Trash2 size={14} />} size="sm" variant="ghost" onClick={onDelete}>삭제</Button>}</>}
        {!comment.isMine && <Button icon={<Flag size={14} />} size="sm" variant="ghost" disabled={!canReport} title={!canReport ? reportDisabledTitle : undefined} onClick={onReport}>신고</Button>}
      </div>
    </article>
  );
}

const COMMENT_MAX_LENGTH = 300;
const REPORT_DESCRIPTION_MAX = 500;
type ReportTarget = { type: 'map'; mapId: number } | { type: 'comment'; commentId: number };
const MAP_REPORT_REASONS: Array<{ value: MapReportReason; label: string }> = [{ value: 'INAPPROPRIATE', label: '부적절한 콘텐츠' }, { value: 'COPYRIGHT', label: '저작권 문제' }, { value: 'SPAM', label: '스팸/광고' }, { value: 'OFFENSIVE', label: '혐오/공격적 표현' }, { value: 'BROKEN_CONTENT', label: '콘텐츠 오류' }, { value: 'WRONG_ANSWER', label: '정답 오류' }, { value: 'OTHER', label: '기타' }];
const COMMENT_REPORT_REASONS: Array<{ value: CommentReportReason; label: string }> = [{ value: 'INAPPROPRIATE', label: '부적절한 댓글' }, { value: 'SPAM', label: '스팸/광고' }, { value: 'OFFENSIVE', label: '혐오/공격적 표현' }, { value: 'HARASSMENT', label: '비방/괴롭힘' }, { value: 'PERSONAL_INFO', label: '개인정보 노출' }, { value: 'FALSE_INFORMATION', label: '허위 정보' }, { value: 'OTHER', label: '기타' }];

function reportErrorNotice(messageCode: string) {
  if (messageCode === 'already_reported_map' || messageCode === 'already_reported_comment') return { title: '이미 신고했습니다', message: '같은 대상은 한 번만 신고할 수 있습니다.' };
  if (messageCode === 'invalid_request') return { title: '신고 내용을 확인해주세요', message: '기타 사유는 10자 이상 500자 이하로 입력해야 합니다.' };
  return { title: '신고에 실패했습니다', message: '잠시 후 다시 시도해주세요.' };
}

function isUsefulCategory(name: string) { return name.trim() !== '' && name.trim() !== '테스트'; }
function applyReaction<T extends MapDetail | MapListItem>(map: T, reaction: MapReactionResponse): T {
  return {
    ...map,
    liked: reaction.liked ?? map.liked,
    favorited: reaction.favorited ?? map.favorited,
    likeCount: reaction.likeCount ?? map.likeCount,
    favoriteCount: reaction.favoriteCount ?? map.favoriteCount,
  };
}
function normalizeRoomTitle(input: string, mapTitle: string) { return (input.trim() || `${mapTitle} 방`).trim().slice(0, 30); }
function boundedNumber(value: string, min: number, max: number) { const parsed = Number(value); return !value || !Number.isFinite(parsed) ? min : Math.max(min, Math.min(max, parsed)); }
function remainingText(value: string, max: number) { return `${value.length}/${max}`; }
