import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/features/auth/auth-context';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { toApiErrorMessage } from '@/shared/api/http-client';
import styles from './auth-pages.module.css';

const schema = z.object({
  loginId: z.string().regex(/^[A-Za-z0-9_]{4,20}$/, '4-20자 영문, 숫자, 언더스코어만 가능합니다.'),
  password: z.string().min(8, '비밀번호를 입력해주세요.').max(64),
});

const guestSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, '닉네임은 2자 이상 입력해주세요.')
    .max(12, '닉네임은 12자 이하로 입력해주세요.')
    .regex(/^[가-힣A-Za-z0-9_]+$/, '한글, 영문, 숫자, 언더스코어만 가능합니다.'),
});

type LoginForm = z.infer<typeof schema>;
type GuestLoginForm = z.infer<typeof guestSchema>;

export function LoginPage() {
  const runOnce = useSingleFlight();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: string; mode?: 'member' | 'guest'; loginId?: string } | null;
  const [mode, setMode] = useState<'member' | 'guest'>(locationState?.mode ?? 'member');
  const from = locationState?.from ?? '/';

  useEffect(() => {
    if (locationState?.mode) setMode(locationState.mode);
  }, [locationState?.mode]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { loginId: locationState?.loginId ?? '', password: '' },
  });
  const guestForm = useForm<GuestLoginForm>({
    resolver: zodResolver(guestSchema),
    defaultValues: { nickname: '' },
  });

  useEffect(() => {
    if (locationState?.loginId) form.setValue('loginId', locationState.loginId);
  }, [form, locationState?.loginId]);

  const loginMutation = useMutation({
    mutationFn: (body: LoginForm) => auth.login(body),
    onSuccess: () => navigate(from, { replace: true }),
  });
  const guestLoginMutation = useMutation({
    mutationFn: (body: GuestLoginForm) => auth.loginAsGuest(body),
    onSuccess: () => navigate(from, { replace: true }),
  });

  return (
    <section className={styles.authShell}>
      <div className={styles.authPanel}>
        <h1 className={styles.title}>로그인</h1>
        <div className={styles.authMode} role="tablist" aria-label="로그인 방식">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'member'}
            className={mode === 'member' ? styles.authModeActive : ''}
            onClick={() => setMode('member')}
          >
            회원 로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'guest'}
            className={mode === 'guest' ? styles.authModeActive : ''}
            onClick={() => setMode('guest')}
          >
            게스트 입장
          </button>
        </div>
        {mode === 'member' ? (
          <>
            {loginMutation.isError && (
              <Alert tone="danger">
                {toApiErrorMessage(loginMutation.error) === 'invalid_id_or_password'
                  ? '아이디 또는 비밀번호가 올바르지 않습니다.'
                  : '로그인에 실패했습니다.'}
              </Alert>
            )}
            <form
              className={styles.form}
              onSubmit={form.handleSubmit(
                (values) => runOnce('member-login', () => loginMutation.mutateAsync(values)),
                (errors) => {
                  const firstError = Object.keys(errors)[0] as keyof LoginForm | undefined;
                  if (firstError) form.setFocus(firstError);
                },
              )}
            >
              <FormField label="아이디" required errorText={form.formState.errors.loginId?.message}>
                <input autoComplete="username" maxLength={20} {...form.register('loginId')} />
              </FormField>
              <FormField label="비밀번호" required errorText={form.formState.errors.password?.message}>
                <input autoComplete="current-password" maxLength={64} type="password" {...form.register('password')} />
              </FormField>
              <Button icon={<LogIn size={18} />} size="lg" type="submit" disabled={loginMutation.isPending}>
                로그인
              </Button>
            </form>
            <div className={styles.recoveryLinks}>
              <Link to="/account-recovery?mode=login-id">아이디 찾기</Link>
              <span aria-hidden="true" />
              <Link to="/account-recovery?mode=password">비밀번호 재설정</Link>
            </div>
            <Link className={styles.switchLink} to="/signup">
              계정이 없나요? 회원가입
            </Link>
          </>
        ) : (
          <>
            {guestLoginMutation.isError && <Alert tone="danger">게스트 입장에 실패했습니다.</Alert>}
            <div className={styles.guestGuide}>
              <strong>게스트로 이용할 수 있어요</strong>
              <ul>
                <li><CircleCheck aria-hidden="true" size={16} /> 공개 맵 둘러보기</li>
                <li><CircleCheck aria-hidden="true" size={16} /> 게임방 만들기, 입장 및 플레이</li>
                <li><CircleCheck aria-hidden="true" size={16} /> 내 정보에서 닉네임 변경</li>
              </ul>
              <p>
                <LockKeyhole aria-hidden="true" size={16} />
                게임 기록은 저장되지 않으며 맵 제작, 댓글, 좋아요, 즐겨찾기와 신고는 회원 전용입니다.
              </p>
            </div>
            <form
              className={styles.form}
              onSubmit={guestForm.handleSubmit(
                (values) => runOnce('guest-login', () => guestLoginMutation.mutateAsync(values)),
                () => guestForm.setFocus('nickname'),
              )}
            >
              <FormField
                label="닉네임"
                required
                errorText={guestForm.formState.errors.nickname?.message}
                helperText="다른 게스트와 같은 닉네임을 사용할 수 있습니다."
                counterText={`${guestForm.watch('nickname').length}/12`}
              >
                <input autoComplete="nickname" maxLength={12} {...guestForm.register('nickname')} />
              </FormField>
              <Button
                icon={<UserRound size={18} />}
                size="lg"
                type="submit"
                disabled={guestLoginMutation.isPending}
              >
                게스트로 입장
              </Button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
