import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Map, Moon, Pencil, Sun, User } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import { UserAvatar } from '@/shared/ui/FallbackMedia';
import { Modal } from '@/shared/ui/Modal';
import { RouteBoundary } from '@/shared/ui/RouteBoundary';
import { useAuth } from '@/features/auth/auth-context';
import { currentRoomStorage } from '@/features/rooms/current-room-storage';
import { roomApi } from '@/features/rooms/room-api';
import { queryKeys } from '@/shared/api/query-keys';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import styles from './layout.module.css';

export type RoomHeaderState = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export type RoomHeaderOutletContext = {
  setRoomHeader: (header: RoomHeaderState | null) => void;
};

export function AppLayout() {
  const runOnce = useSingleFlight();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [currentRoomId, setCurrentRoomId] = useState(() => currentRoomStorage.read());
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('nomat.theme') === 'dark' ? 'dark' : 'light',
  );
  const [roomHeader, setRoomHeader] = useState<RoomHeaderState | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [reconnectNotice, setReconnectNotice] = useState('');
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const isRoomRoute = location.pathname === '/room' || location.pathname === '/play';
  const currentRoomQuery = useQuery({
    queryKey: queryKeys.currentRoom,
    queryFn: roomApi.current,
    enabled: auth.isAuthenticated && !isRoomRoute,
    retry: false,
  });
  const effectiveRoomId = currentRoomQuery.data?.roomId ?? currentRoomId;
  const shouldShowReconnect = auth.isAuthenticated && Boolean(effectiveRoomId) && !isRoomRoute;

  const leaveStoredRoomMutation = useMutation({
    mutationFn: () => roomApi.leave(effectiveRoomId ?? 0),
    onMutate: async () => {
      currentRoomStorage.clear();
      setCurrentRoomId(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.currentRoom });
      queryClient.removeQueries({ queryKey: queryKeys.currentRoom });
    },
    onSettled: async () => {
      currentRoomStorage.clear();
      setCurrentRoomId(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentRoom });
    },
  });

  const reconnectToCurrentRoom = async () => {
    if (!effectiveRoomId) return;
    try {
      const currentRoom = await roomApi.current();
      if (currentRoom.roomId !== effectiveRoomId) {
        currentRoomStorage.clear();
        setCurrentRoomId(null);
        setReconnectNotice('이미 나간 방이거나 더 이상 참여 중인 방이 아닙니다.');
        return;
      }
      currentRoomStorage.write(currentRoom.roomId);
      setCurrentRoomId(currentRoom.roomId);
      setReconnectNotice('');
      navigate(currentRoom.status === 'PLAYING' ? '/play' : '/room');
    } catch {
      currentRoomStorage.clear();
      setCurrentRoomId(null);
      setReconnectNotice('이미 나간 방이거나 더 이상 참여 중인 방이 아닙니다.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentRoom });
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('nomat.theme', theme);
  }, [theme]);

  useEffect(() => {
    setCurrentRoomId(currentRoomStorage.read());
    if (!isRoomRoute) setRoomHeader(null);
  }, [isRoomRoute, location.pathname]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [profileMenuOpen]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {isRoomRoute ? (
            <>
              <span className={styles.brand}>
                <span className={styles.brandMark}>N</span>
                NOMAT
              </span>
              <div className={styles.roomHeaderText}>
                <strong>{roomHeader?.title ?? '게임방'}</strong>
                {roomHeader?.description && <span>{roomHeader.description}</span>}
              </div>
              <div className={styles.actions}>
                <Button
                  icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  iconOnly
                  variant="ghost"
                  aria-label="테마 전환"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                />
                {roomHeader?.actions}
              </div>
            </>
          ) : (
            <>
              <NavLink className={styles.brand} to="/">
                <span className={styles.brandMark}>N</span>
                NOMAT
              </NavLink>
              <div className={styles.actions}>
                <Button
                  icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  iconOnly
                  variant="ghost"
                  aria-label="테마 전환"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                />
                {auth.isBootstrapping ? (
                  <span className={styles.authStatusPlaceholder} aria-hidden="true" />
                ) : auth.isAuthenticated ? (
                  <div className={styles.profileMenu} ref={profileMenuRef}>
                    <button
                      className={styles.avatar}
                      onClick={() => setProfileMenuOpen((current) => !current)}
                      type="button"
                      aria-expanded={profileMenuOpen}
                      aria-label="프로필 메뉴"
                    >
                      <UserAvatar
                        nickname={auth.user?.nickname ?? 'N'}
                        imageUrl={auth.user?.profileImageUrl}
                        size="sm"
                        userType={auth.userType}
                      />
                    </button>
                    {profileMenuOpen && (
                      <div className={styles.profileDropdown}>
                        <div className={styles.profileIdentity}>
                          <span>{auth.isGuest ? '게스트' : '회원'}</span>
                          <strong>{auth.user?.nickname ?? (auth.isGuest ? '게스트' : '회원')}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            navigate('/me');
                          }}
                        >
                          {auth.isGuest ? <Pencil size={16} /> : <User size={16} />}
                          {auth.isGuest ? '닉네임 변경' : '내 정보 보기'}
                        </button>
                        {auth.isMember && (
                          <button
                            type="button"
                            onClick={() => {
                              setProfileMenuOpen(false);
                              navigate('/me/maps');
                            }}
                          >
                            <Map size={16} /> 내가 만든 맵
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setLogoutOpen(true);
                          }}
                        >
                          <LogOut size={16} /> 로그아웃
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => navigate('/login')}>
                      로그인
                    </Button>
                    <Button size="sm" icon={<User size={16} />} onClick={() => navigate('/login', { state: { mode: 'guest' } })}>
                      게스트 입장
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        {shouldShowReconnect && (
          <div className={styles.reconnectBar}>
            <span>아직 나가지 않은 방이 있습니다.</span>
            <div>
              <Button
                size="sm"
                onClick={() => runOnce('room-reconnect', reconnectToCurrentRoom)}
              >
                재접속
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={leaveStoredRoomMutation.isPending}
                onClick={() => runOnce('stored-room-leave', () => leaveStoredRoomMutation.mutateAsync())}
              >
                나가기
              </Button>
            </div>
            {reconnectNotice && <span>{reconnectNotice}</span>}
          </div>
        )}
      </header>
      <main className={`${styles.main} ${isRoomRoute ? styles.mainRoom : ''}`}>
        <RouteBoundary key={location.pathname}>
          <Outlet context={{ setRoomHeader } satisfies RoomHeaderOutletContext} />
        </RouteBoundary>
      </main>
      <Modal
        open={logoutOpen}
        title="로그아웃"
        onClose={() => setLogoutOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLogoutOpen(false)}>
              취소
            </Button>
            <Button
              onClick={async () => {
                setLogoutOpen(false);
                await auth.logout();
                navigate('/', { replace: true });
              }}
            >
              로그아웃
            </Button>
          </>
        }
      >
        <p className="muted">현재 계정에서 로그아웃합니다.</p>
      </Modal>
    </div>
  );
}
