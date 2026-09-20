import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { useAuth } from './auth-context';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const outletContext = useOutletContext();

  if (auth.isBootstrapping) return null;

  if (!auth.isAuthenticated) {
    const from = location.pathname + location.search;
    return (
      <Modal
        open
        title="로그인이 필요합니다"
        onClose={() => navigate(-1)}
        footer={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              취소
            </Button>
            <Button onClick={() => navigate('/login', { replace: true, state: { from } })}>
              로그인
            </Button>
          </>
        }
      >
        <p className="muted">로그인 후 이용할 수 있는 메뉴입니다. 로그인하시겠습니까?</p>
      </Modal>
    );
  }

  return <Outlet context={outletContext} />;
}

export function MemberRoute() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const outletContext = useOutletContext();

  if (auth.isBootstrapping || (auth.isAuthenticated && !auth.userType)) return null;

  if (!auth.isMember) {
    const from = location.pathname + location.search;
    return (
      <Modal
        open
        title="회원 전용 기능입니다"
        onClose={() => navigate(-1)}
        footer={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              돌아가기
            </Button>
            <Button onClick={() => navigate('/login', { replace: true, state: { from } })}>
              회원 로그인
            </Button>
          </>
        }
      >
        <p className="muted">게스트는 맵 제작과 관리 기능을 이용할 수 없습니다.</p>
      </Modal>
    );
  }

  return <Outlet context={outletContext} />;
}

export function VerifiedEmailRoute() {
  const auth = useAuth();
  const navigate = useNavigate();
  const outletContext = useOutletContext();

  if (auth.isBootstrapping || !auth.user) return null;

  if (!auth.user.emailVerified) {
    return (
      <Modal
        open
        title="이메일 인증이 필요합니다"
        onClose={() => navigate(-1)}
        footer={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              돌아가기
            </Button>
            <Button onClick={() => navigate('/me', { replace: true })}>
              내 정보에서 인증
            </Button>
          </>
        }
      >
        <p className="muted">맵을 제작하려면 먼저 사용할 이메일을 인증해주세요.</p>
      </Modal>
    );
  }

  return <Outlet context={outletContext} />;
}
