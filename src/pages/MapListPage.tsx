import { useQuery } from '@tanstack/react-query';
import { DoorOpen, FileQuestion, Gamepad2, Heart, ListChecks, MessageSquare, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORY_OPTIONS } from '@/entities/category';
import { MapListItem } from '@/entities/map';
import { MapDetailDialog } from '@/features/maps/MapDetailDialog';
import { mapApi } from '@/features/maps/map-api';
import { queryKeys } from '@/shared/api/query-keys';
import { displayNickname, questionTypeLabel } from '@/shared/format/display-labels';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { MapArtwork } from '@/shared/ui/FallbackMedia';
import { Pagination } from '@/shared/ui/Pagination';
import styles from './map-pages.module.css';

export function MapListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keywordInput, setKeywordInput] = useState('');
  const [params, setParams] = useState({ keyword: '', categoryId: '', questionType: '', sort: 'latest', page: 0, size: 12 });
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  const mapsQuery = useQuery({
    queryKey: queryKeys.maps(params),
    queryFn: () => mapApi.list({ ...params, categoryId: params.categoryId ? Number(params.categoryId) : undefined }),
  });

  useEffect(() => {
    const mapId = Number(searchParams.get('mapId'));
    if (Number.isFinite(mapId) && mapId > 0) setSelectedMapId(mapId);
  }, [searchParams]);

  const closeMapDetail = () => {
    setSelectedMapId(null);
    setSearchParams({});
  };
  const applySearch = () => setParams({ ...params, keyword: keywordInput, page: 0 });

  return (
    <section className={styles.shell}>
      <div className={styles.browseToolbar}>
        <div className={styles.browseTabs}>
          <button className={styles.browseTabActive} type="button">맵</button>
          <button type="button" onClick={() => navigate('/rooms', { replace: true })}><DoorOpen size={16} />게임방</button>
        </div>
        <Button icon={<Plus size={17} />} onClick={() => navigate('/maps/new')}>맵 제작</Button>
      </div>
      <div className={styles.filters}>
        <div className={styles.searchRow}>
          <input maxLength={40} value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applySearch(); }} placeholder="제목 또는 제작자 검색" />
          <Button icon={<Search size={17} />} onClick={applySearch}>검색</Button>
        </div>
        <div className={styles.filterControls}>
          <select value={params.categoryId} onChange={(event) => setParams({ ...params, categoryId: event.target.value, page: 0 })}>
            <option value="">전체 카테고리</option>
            {CATEGORY_OPTIONS.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.name}</option>)}
          </select>
          <select value={params.questionType} onChange={(event) => setParams({ ...params, questionType: event.target.value, page: 0 })}>
            <option value="">전체 유형</option><option value="TEXT">텍스트</option><option value="IMAGE">이미지</option><option value="AUDIO">오디오</option>
          </select>
          <select value={params.sort} onChange={(event) => setParams({ ...params, sort: event.target.value, page: 0 })}>
            <option value="latest">최신순</option><option value="popular">인기순</option><option value="mostPlayed">플레이순</option><option value="mostLiked">좋아요순</option>
          </select>
        </div>
      </div>
      {mapsQuery.isError && <Alert tone="danger">맵 목록을 불러오지 못했습니다.</Alert>}
      {mapsQuery.isLoading ? <EmptyState title="맵을 불러오는 중입니다." /> : mapsQuery.data?.maps.length ? (
        <>
          <div className={styles.mapGrid}>{mapsQuery.data.maps.map((map) => <MapCard key={map.mapId} map={map} onClick={() => setSelectedMapId(map.mapId)} />)}</div>
          <Pagination page={params.page} totalPages={mapsQuery.data.totalPages} onChange={(page) => setParams({ ...params, page })} />
        </>
      ) : <EmptyState title="표시할 맵이 없습니다." />}
      <MapDetailDialog mapId={selectedMapId} onClose={closeMapDetail} />
    </section>
  );
}

function MapCard({ map, onClick }: { map: MapListItem; onClick: () => void }) {
  return (
    <article className={styles.mapCard} onClick={onClick}>
      <div className={styles.thumb}><MapArtwork title={map.title} type={map.questionType} imageUrl={map.thumbnailUrl} /></div>
      <div className={styles.mapBody}>
        <h2 className={styles.mapTitle}>{map.title}</h2>
        <QuizInfoGroup map={map} />
        <ReactionInfoGroup map={map} />
        <span className={styles.mapCreatorText}><span>제작자</span>{displayNickname(map.creator.nickname)}</span>
      </div>
    </article>
  );
}

function QuizInfoGroup({ map }: { map: Pick<MapListItem, 'category' | 'questionType' | 'questionCount'> }) {
  return <div className={styles.quizMeta}><span className={`${styles.quizType} ${styles[`quizType${map.questionType}`]}`}><FileQuestion size={14} /> {questionTypeLabel(map.questionType)}</span>{isUsefulCategory(map.category.name) && <span className={styles.quizCategory}>{map.category.name}</span>}<span className={styles.quizCount}><ListChecks size={14} /> {map.questionCount}문제</span></div>;
}

function ReactionInfoGroup({ map }: { map: Pick<MapListItem, 'playCount' | 'likeCount' | 'commentCount'> }) {
  return <div className={styles.reactionStats}><span><Gamepad2 size={14} /> {map.playCount}</span><span><Heart size={14} /> {map.likeCount}</span><span><MessageSquare size={14} /> {map.commentCount}</span></div>;
}

function isUsefulCategory(name: string) { return name.trim() !== '' && name.trim() !== '테스트'; }
