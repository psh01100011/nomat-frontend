import { useMutation } from '@tanstack/react-query';
import { DoorOpen, LogIn, UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getAlreadyJoinedRoomId } from '@/features/rooms/room-error';
import { roomApi } from '@/features/rooms/room-api';
import { currentRoomStorage } from '@/features/rooms/current-room-storage';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Panel } from '@/shared/ui/Panel';
import styles from './room-pages.module.css';

export function RoomInvitePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { inviteToken = '' } = useParams();
  const attemptedTokenRef = useRef<string | null>(null);
  const validToken = /^[a-f0-9]{32}$/.test(inviteToken);

  const joinMutation = useMutation({
    mutationFn: () => roomApi.joinByInvite(inviteToken),
    onSuccess: (room) => {
      currentRoomStorage.write(room.roomId);
      navigate('/room', { replace: true });
    },
  });

  useEffect(() => {
    if (auth.isBootstrapping || !auth.isAuthenticated || !validToken) return;
    if (attemptedTokenRef.current === inviteToken) return;
    attemptedTokenRef.current = inviteToken;
    joinMutation.mutate();
  }, [auth.isAuthenticated, auth.isBootstrapping, inviteToken, validToken]);

  if (auth.isBootstrapping) return <EmptyState title="초대 링크를 확인하는 중입니다." />;

  if (!validToken) {
    return (
      <section className={styles.inviteShell}>
        <Panel className={styles.invitePanel}>
          <Alert tone="danger">유효하지 않은 초대 링크입니다.</Alert>
          <Button onClick={() => navigate('/rooms', { replace: true })}>게임방 목록</Button>
        </Panel>
      </section>
    );
  }

  if (!auth.isAuthenticated) {
    const from = location.pathname + location.search;
    return (
      <section className={styles.inviteShell}>
        <Panel className={styles.invitePanel}>
          <DoorOpen size={30} aria-hidden="true" />
          <h1>게임방 초대</h1>
          <p className="muted">로그인하거나 게스트로 입장하면 초대받은 방으로 자동 이동합니다.</p>
          <div className={styles.inviteActions}>
            <Button icon={<LogIn size={17} />} onClick={() => navigate('/login', { state: { from, mode: 'member' } })}>
              회원 로그인
            </Button>
            <Button
              variant="secondary"
              icon={<UserRound size={17} />}
              onClick={() => navigate('/login', { state: { from, mode: 'guest' } })}
            >
              게스트 입장
            </Button>
          </div>
        </Panel>
      </section>
    );
  }

  if (joinMutation.isError) {
    const messageCode = toApiErrorMessage(joinMutation.error);
    const joinedRoomId = getAlreadyJoinedRoomId(joinMutation.error);
    return (
      <section className={styles.inviteShell}>
        <Panel className={styles.invitePanel}>
          <Alert tone="danger">{inviteErrorMessage(messageCode)}</Alert>
          <div className={styles.inviteActions}>
            {joinedRoomId && (
              <Button
                onClick={() => {
                  currentRoomStorage.write(joinedRoomId);
                  navigate('/room', { replace: true });
                }}
              >
                참여 중인 방으로 이동
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/rooms', { replace: true })}>
              게임방 목록
            </Button>
          </div>
        </Panel>
      </section>
    );
  }

  return <EmptyState title="초대받은 방에 입장하는 중입니다." />;
}

function inviteErrorMessage(messageCode: string) {
  if (messageCode === 'room_invite_invalid' || messageCode === 'room_not_found') {
    return '초대 링크가 만료되었거나 방이 종료되었습니다.';
  }
  if (messageCode === 'cannot_join_room') return '게임이 시작되었거나 정원이 가득 차 입장할 수 없습니다.';
  if (messageCode === 'room_access_denied') return '이 방에 다시 입장할 수 없습니다.';
  if (messageCode === 'already_joined_room') return '이미 다른 게임방에 참여 중입니다.';
  return '초대받은 방에 입장하지 못했습니다. 잠시 후 다시 시도해주세요.';
}
