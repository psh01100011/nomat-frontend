import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, FileQuestion, Gamepad2, Heart, ListChecks, LoaderCircle, MessageSquare, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioProcessingSummary, MapListItem } from '@/entities/map';
import { useAuth } from '@/features/auth/auth-context';
import { MapDetailDialog } from '@/features/maps/MapDetailDialog';
import { mapApi } from '@/features/maps/map-api';
import { AdSlot } from '@/shared/ads/AdSlot';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { queryKeys } from '@/shared/api/query-keys';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { mapStatusLabel, questionTypeLabel, visibilityLabel } from '@/shared/format/display-labels';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { MapArtwork } from '@/shared/ui/FallbackMedia';
import { Modal } from '@/shared/ui/Modal';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Pagination } from '@/shared/ui/Pagination';
import styles from './map-pages.module.css';

export function MyMapsPage() {
  const runOnce = useSingleFlight();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<MapListItem | null>(null);
  const [retryTarget, setRetryTarget] = useState<MapListItem | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const params = { creatorId: auth.userId ?? undefined, page, size: 12, sort: 'latest' };

  const mapsQuery = useQuery({
    queryKey: queryKeys.maps(params),
    queryFn: () => mapApi.listMine(params),
    enabled: Boolean(auth.userId),
    refetchInterval: (query) => (hasActiveAudioProcessing(query.state.data?.maps) ? 5000 : false),
  });
  const selectedMap = mapsQueryDataMap(mapsQuery.data?.maps, selectedMapId);
  const deleteMutation = useMutation({
    mutationFn: (mapId: number) => mapApi.remove(mapId),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.maps(params) });
    },
  });
  const audioRetryMutation = useMutation({
    mutationFn: (mapId: number) => mapApi.retryAudioProcessing(mapId),
    onSuccess: async () => {
      setRetryTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['maps'] });
    },
  });

  return (
    <section className={`${styles.shell} ${styles.adShell}`}>
      <PageHeader title="내가 만든 맵" actions={<Button onClick={() => navigate('/maps/new')}>맵 제작</Button>} />
      <AdSlot className={`${styles.sideAd} ${styles.sideAdLeft}`} minViewportWidth={1480} placement="mapListLeft" variant="vertical" />
      <AdSlot className={`${styles.sideAd} ${styles.sideAdRight}`} minViewportWidth={1480} placement="mapListRight" variant="vertical" />
      {mapsQuery.isError && <Alert tone="danger">내 맵 목록을 불러오지 못했습니다.</Alert>}
      {deleteMutation.isError && <Alert tone="danger">맵을 삭제하지 못했습니다.</Alert>}
      {audioRetryMutation.isError && <Alert tone="danger">{audioRetryErrorMessage(toApiErrorMessage(audioRetryMutation.error))}</Alert>}
      {mapsQuery.isLoading ? <EmptyState title="내 맵을 불러오는 중입니다." /> : mapsQuery.data?.maps.length ? (
        <>
          <div className={styles.ownerGrid}>
            {mapsQuery.data.maps.map((map) => (
              <MyMapCard
                key={map.mapId}
                map={map}
                onEdit={() => navigate(`/maps/${map.mapId}/edit`)}
                onOpen={() => {
                  if (map.status === 'PUBLISHED') setSelectedMapId(map.mapId);
                }}
                onDelete={() => setDeleteTarget(map)}
                onRetry={() => setRetryTarget(map)}
                retryPending={audioRetryMutation.isPending && audioRetryMutation.variables === map.mapId}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={mapsQuery.data.totalPages} onChange={setPage} />
        </>
      ) : <EmptyState title="아직 만든 맵이 없습니다." />}
      <AdSlot
        className={styles.footerAd}
        maxViewportWidth={1479}
        minViewportWidth={861}
        placement="mapListInline"
        variant="horizontal"
      />

      <Modal open={Boolean(deleteTarget)} title="맵 삭제" onClose={() => setDeleteTarget(null)} footer={<><Button variant="secondary" onClick={() => setDeleteTarget(null)}>취소</Button><Button variant="danger" icon={<Trash2 size={17} />} disabled={deleteMutation.isPending} onClick={() => deleteTarget && runOnce('map-delete', () => deleteMutation.mutateAsync(deleteTarget.mapId))}>삭제</Button></>}>
        <p className="muted">‘{deleteTarget?.title}’ 맵을 삭제합니다. 삭제한 맵은 다시 복구할 수 없습니다.</p>
      </Modal>
      <Modal open={Boolean(retryTarget)} title="서버 오류를 다시 처리할까요?" onClose={() => { if (!audioRetryMutation.isPending) setRetryTarget(null); }} footer={<><Button variant="secondary" disabled={audioRetryMutation.isPending} onClick={() => setRetryTarget(null)}>취소</Button><Button icon={audioRetryMutation.isPending ? <LoaderCircle className={styles.spin} size={17} /> : <RefreshCw size={17} />} disabled={audioRetryMutation.isPending} onClick={() => retryTarget && runOnce('audio-retry', () => audioRetryMutation.mutateAsync(retryTarget.mapId))}>{audioRetryMutation.isPending ? '재시도 요청 중' : '다시 시도'}</Button></>}>
        <p className="muted">‘{retryTarget?.title}’의 서버 오류 {retryTarget?.audioProcessing?.retryableFailedCount ?? 0}개를 다시 처리합니다. 영상 오류 문제는 대상에 포함되지 않으며, 처리 상태는 이 목록에서 자동으로 갱신됩니다.</p>
      </Modal>
      <MapDetailDialog
        mapId={selectedMapId}
        publicActionsEnabled={selectedMap?.visibility === 'PUBLIC'}
        onClose={() => setSelectedMapId(null)}
      />
    </section>
  );
}

function MyMapCard({ map, onOpen, onEdit, onDelete, onRetry, retryPending }: { map: MapListItem; onOpen: () => void; onEdit: () => void; onDelete: () => void; onRetry: () => void; retryPending: boolean }) {
  const canOpenDetail = map.status === 'PUBLISHED';
  return (
    <article className={`${styles.ownerCard} ${canOpenDetail ? '' : styles.ownerCardLocked}`} role="button" tabIndex={canOpenDetail ? 0 : -1} onClick={onOpen} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); onOpen(); }}>
      <div className={styles.thumb}><MapArtwork title={map.title} type={map.questionType} imageUrl={map.thumbnailUrl} /></div>
      <div className={styles.mapBody}>
        <h2 className={styles.mapTitle}>{map.title}</h2>
        <QuizInfoGroup map={map} />
        <OwnerStateGroup map={map} compact />
        {map.status !== 'DRAFT' && map.audioProcessing && map.audioProcessing.status !== 'READY' ? <AudioProcessingState summary={map.audioProcessing} inline /> : <ReactionInfoGroup map={map} />}
        <div className={styles.actions}>
          {map.audioProcessing?.canRetryAll && <Button size="sm" iconOnly icon={retryPending ? <LoaderCircle className={styles.spin} size={15} /> : <RefreshCw size={15} />} variant="secondary" aria-label={retryPending ? '오디오 재시도 요청 중' : '서버 오류 다시 시도'} title={retryPending ? '오디오 재시도 요청 중' : '서버 오류 다시 시도'} disabled={retryPending} onClick={(event) => { event.stopPropagation(); onRetry(); }} />}
          <Button size="sm" icon={<Edit3 size={15} />} onClick={(event) => { event.stopPropagation(); onEdit(); }}>수정</Button>
          <Button size="sm" icon={<Trash2 size={15} />} variant="danger" onClick={(event) => { event.stopPropagation(); onDelete(); }}>삭제</Button>
        </div>
      </div>
    </article>
  );
}

function QuizInfoGroup({ map }: { map: Pick<MapListItem, 'category' | 'questionType' | 'questionCount'> }) {
  return <div className={styles.quizMeta}><span className={`${styles.quizType} ${styles[`quizType${map.questionType}`]}`}><FileQuestion size={14} /> {questionTypeLabel(map.questionType)}</span>{isUsefulCategory(map.category.name) && <span className={styles.quizCategory}>{map.category.name}</span>}<span className={styles.quizCount}><ListChecks size={14} /> {map.questionCount}문제</span></div>;
}

function OwnerStateGroup({ map, compact = false }: { map: Pick<MapListItem, 'status' | 'visibility' | 'audioProcessing'>; compact?: boolean }) {
  const state = ownerDisplayState(map);
  return <div className={`${styles.ownerStateMeta} ${compact ? styles.ownerStateMetaCompact : ''}`}><span className={`${styles.stateChip} ${styles[state.className]}`}>{state.label}</span><span className={styles.stateChip}>{visibilityLabel(map.visibility)}</span></div>;
}

function ownerDisplayState(map: Pick<MapListItem, 'status' | 'audioProcessing'>) {
  if (map.status === 'PROCESSING_FAILED') return { label: mapStatusLabel(map.status), className: 'stateChipDanger' };
  if (map.status === 'PROCESSING' && map.audioProcessing) {
    const labels: Partial<Record<AudioProcessingSummary['status'], string>> = { FAILED: '처리 실패', DELAYED: '처리 지연', RETRYING: '재시도 중', QUEUED: '처리 대기' };
    return { label: labels[map.audioProcessing.status] ?? mapStatusLabel(map.status), className: map.audioProcessing.status === 'FAILED' ? 'stateChipDanger' : 'stateChipWarning' };
  }
  return { label: mapStatusLabel(map.status), className: map.status === 'PUBLISHED' ? 'stateChipSuccess' : 'stateChipWarning' };
}

function AudioProcessingState({ summary, inline = false }: { summary: AudioProcessingSummary; inline?: boolean }) {
  const label = audioProcessingLabel(summary);
  const detail = audioProcessingDetail(summary);
  const progress = summary.totalCount ? Math.round((summary.readyCount / summary.totalCount) * 100) : 0;
  if (inline) return <div className={styles.audioProcessingInline}><span className={`${styles.audioStatus} ${styles[`audioStatus${audioProcessingTone(summary.status)}`]}`}>{isActiveAudioStatus(summary.status) && <LoaderCircle className={styles.spin} size={15} aria-hidden="true" />}{label}</span><progress className={styles.audioProgress} max={100} value={progress} aria-label={`오디오 처리 ${progress}% 완료`} /><strong>{summary.readyCount}/{summary.totalCount}</strong></div>;
  return <div className={styles.audioProcessing}><div className={styles.audioProcessingTopline}><span className={`${styles.audioStatus} ${styles[`audioStatus${audioProcessingTone(summary.status)}`]}`}>{isActiveAudioStatus(summary.status) && <LoaderCircle className={styles.spin} size={15} aria-hidden="true" />}{label}</span><strong>{summary.readyCount}/{summary.totalCount} 완료</strong></div><progress className={styles.audioProgress} max={100} value={progress} aria-label={`오디오 처리 ${progress}% 완료`} />{detail && <span className={styles.audioProcessingDetail}>{detail}</span>}</div>;
}

function audioProcessingLabel(summary: AudioProcessingSummary) {
  if (summary.status === 'QUEUED') return '처리 대기';
  if (summary.status === 'PROCESSING') return '오디오 처리 중';
  if (summary.status === 'RETRYING') return '자동 재시도 중';
  if (summary.status === 'DELAYED') return '처리 지연';
  if (summary.status === 'READY') return '처리 완료';
  return summary.sourceFailureCount > 0 ? '영상 수정 필요' : '서버 오류';
}
function audioProcessingDetail(summary: AudioProcessingSummary) { const details: string[] = []; if (summary.sourceFailureCount > 0) details.push(`영상 오류 ${summary.sourceFailureCount}개`); if (summary.retryableFailedCount > 0) details.push(`재시도 가능 ${summary.retryableFailedCount}개`); if (summary.status === 'DELAYED') details.push('평소보다 처리가 오래 걸리고 있습니다.'); return details.join(' · '); }
function audioProcessingTone(status: AudioProcessingSummary['status']) { if (status === 'READY') return 'Success'; if (status === 'FAILED') return 'Danger'; if (status === 'DELAYED' || status === 'RETRYING') return 'Warning'; return 'Active'; }
function isActiveAudioStatus(status: AudioProcessingSummary['status']) { return status === 'QUEUED' || status === 'PROCESSING' || status === 'RETRYING' || status === 'DELAYED'; }
function hasActiveAudioProcessing(maps?: MapListItem[]) { return maps?.some((map) => { if (map.status === 'DRAFT') return false; const status = map.audioProcessing?.status; return status === 'QUEUED' || status === 'PROCESSING' || status === 'RETRYING' || status === 'DELAYED'; }) ?? false; }
function mapsQueryDataMap(maps: MapListItem[] | undefined, mapId: number | null) { return mapId === null ? undefined : maps?.find((map) => map.mapId === mapId); }
function audioRetryErrorMessage(messageCode: string) { if (messageCode === 'audio_source_failures_must_be_fixed') return '영상 오류가 남아 있어 다시 시도할 수 없습니다. 맵 수정에서 영상 오류 문제를 먼저 수정하거나 삭제해주세요.'; if (messageCode === 'audio_processing_retry_not_allowed') return '현재 다시 시도할 수 있는 서버 오류가 없습니다.'; return '오디오 재시도를 요청하지 못했습니다. 잠시 후 다시 시도해주세요.'; }
function ReactionInfoGroup({ map }: { map: Pick<MapListItem, 'playCount' | 'likeCount' | 'commentCount'> }) { return <div className={styles.reactionStats}><span><Gamepad2 size={14} /> {map.playCount}</span><span><Heart size={14} /> {map.likeCount}</span><span><MessageSquare size={14} /> {map.commentCount}</span></div>; }
function isUsefulCategory(name: string) { return name.trim() !== '' && name.trim() !== '테스트'; }
