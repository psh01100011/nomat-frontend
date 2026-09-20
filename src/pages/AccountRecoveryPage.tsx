import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, KeyRound, LogIn, Mail } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '@/entities/common';
import { authApi } from '@/features/auth/auth-api';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import styles from './auth-pages.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type RecoveryMode = 'login-id' | 'password';

export function AccountRecoveryPage() {
  const runOnce = useSingleFlight();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode: RecoveryMode = searchParams.get('mode') === 'password' ? 'password' : 'login-id';
  const [mode, setMode] = useState<RecoveryMode>(initialMode);
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentSignature, setSentSignature] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [recoveredLoginId, setRecoveredLoginId] = useState('');
  const [passwordResetLoginId, setPasswordResetLoginId] = useState('');
  const [accountNotFound, setAccountNotFound] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const codeRef = useRef<HTMLInputElement | null>(null);
  const normalizedEmail = email.trim().toLowerCase();
  const currentSignature = `${mode}:${mode === 'password' ? loginId : ''}:${normalizedEmail}`;
  const verificationSent = sentSignature === currentSignature;

  const sendMutation = useMutation({
    mutationFn: async (variables: { mode: RecoveryMode; loginId: string; email: string }) => {
      if (variables.mode === 'login-id') return authApi.sendLoginIdRecoveryEmail(variables.email);
      return authApi.sendPasswordResetEmail({ loginId: variables.loginId, email: variables.email });
    },
    onSuccess: (response, variables) => {
      setSentSignature(`${variables.mode}:${variables.mode === 'password' ? variables.loginId : ''}:${variables.email}`);
      setCode('');
      setVerificationToken('');
      setRecoveredLoginId('');
      setPasswordResetLoginId('');
      setAccountNotFound(false);
      setRetryAfterSeconds(response.resendAvailableInSeconds);
      setFieldErrors({});
      window.requestAnimationFrame(() => codeRef.current?.focus());
    },
    onError: (error) => setRetryAfterSeconds(getRetryAfterSeconds(error)),
  });

  const confirmMutation = useMutation({
    mutationFn: async (variables: { mode: RecoveryMode; loginId: string; email: string; code: string }) => {
      if (variables.mode === 'login-id') {
        const response = await authApi.confirmLoginIdRecoveryEmail(variables.email, variables.code);
        return { mode: variables.mode, loginId: response.loginId, token: '' } as const;
      }
      const response = await authApi.confirmPasswordResetEmail({
        loginId: variables.loginId,
        email: variables.email,
        code: variables.code,
      });
      return { mode: variables.mode, loginId: response.loginId, token: response.emailVerificationToken } as const;
    },
    onSuccess: (response) => {
      if (response.mode === 'login-id') setRecoveredLoginId(response.loginId);
      else {
        setPasswordResetLoginId(response.loginId);
        setVerificationToken(response.token);
      }
    },
    onError: (error) => {
      if (toApiErrorMessage(error) === 'recoverable_account_not_found') {
        setAccountNotFound(true);
      }
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => authApi.resetPassword({
      loginId,
      email: normalizedEmail,
      emailVerificationToken: verificationToken,
      password,
      passwordConfirm,
    }),
    onSuccess: () => setResetComplete(true),
  });

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const intervalId = window.setInterval(() => {
      setRetryAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [retryAfterSeconds > 0]);

  const changeMode = (nextMode: RecoveryMode) => {
    setMode(nextMode);
    setSearchParams({ mode: nextMode });
    setLoginId('');
    setEmail('');
    setCode('');
    setSentSignature(null);
    setVerificationToken('');
    setRecoveredLoginId('');
    setPasswordResetLoginId('');
    setAccountNotFound(false);
    setPassword('');
    setPasswordConfirm('');
    setResetComplete(false);
    setRetryAfterSeconds(0);
    setFieldErrors({});
    sendMutation.reset();
    confirmMutation.reset();
    resetMutation.reset();
  };

  const invalidateVerification = () => {
    setSentSignature(null);
    setCode('');
    setVerificationToken('');
    setRecoveredLoginId('');
    setPasswordResetLoginId('');
    setAccountNotFound(false);
    setRetryAfterSeconds(0);
    sendMutation.reset();
    confirmMutation.reset();
  };

  const sendCode = () => {
    const nextErrors: Record<string, string> = {};
    if (mode === 'password') nextErrors.loginId = getLoginIdError(loginId);
    nextErrors.email = getEmailError(normalizedEmail);
    Object.keys(nextErrors).forEach((key) => {
      if (!nextErrors[key]) delete nextErrors[key];
    });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    runOnce('account-recovery-send', () => sendMutation.mutateAsync({ mode, loginId, email: normalizedEmail }));
  };

  const confirmCode = () => {
    if (!verificationSent || !/^\d{6}$/.test(code)) return;
    runOnce('account-recovery-confirm', () => confirmMutation.mutateAsync({
      mode,
      loginId,
      email: normalizedEmail,
      code,
    }));
  };

  const resetPassword = (event: FormEvent) => {
    event.preventDefault();
    const passwordError = getPasswordError(password);
    const nextErrors: Record<string, string> = {};
    if (passwordError) nextErrors.password = passwordError;
    if (password !== passwordConfirm) nextErrors.passwordConfirm = '비밀번호가 일치하지 않습니다.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    runOnce('password-reset', () => resetMutation.mutateAsync());
  };

  const goToLogin = (resolvedLoginId: string) => {
    navigate('/login', { replace: true, state: { mode: 'member', loginId: resolvedLoginId } });
  };

  return (
    <section className={styles.authShell}>
      <div className={styles.authPanel}>
        <h1 className={styles.title}>계정 찾기</h1>
        <div className={styles.authMode} role="tablist" aria-label="계정 복구 방식">
          <button type="button" role="tab" aria-selected={mode === 'login-id'} className={mode === 'login-id' ? styles.authModeActive : ''} onClick={() => changeMode('login-id')}>
            아이디 찾기
          </button>
          <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? styles.authModeActive : ''} onClick={() => changeMode('password')}>
            비밀번호 재설정
          </button>
        </div>

        {recoveredLoginId ? (
          <>
            <Alert tone="success">이메일 인증이 완료되었습니다.</Alert>
            <div className={styles.recoveryResult}>
              <span>가입한 아이디</span>
              <strong>{recoveredLoginId}</strong>
            </div>
            <Button icon={<LogIn size={18} />} size="lg" onClick={() => goToLogin(recoveredLoginId)}>로그인</Button>
          </>
        ) : accountNotFound ? (
          <>
            <Alert>이메일 인증이 완료되었습니다.</Alert>
            <div className={styles.recoveryResult}>
              <span>확인 결과</span>
              <strong>아이디가 존재하지 않거나, 이메일이 일치하지 않습니다.</strong>
            </div>
            <Button variant="secondary" size="lg" onClick={() => changeMode(mode)}>다시 입력</Button>
          </>
        ) : resetComplete ? (
          <>
            <Alert tone="success">비밀번호를 변경했습니다. 새 비밀번호로 로그인해주세요.</Alert>
            <Button icon={<LogIn size={18} />} size="lg" onClick={() => goToLogin(passwordResetLoginId)}>로그인</Button>
          </>
        ) : (
          <>
            {sendMutation.isSuccess && verificationSent && !verificationToken && (
              <Alert>인증번호를 발송했습니다. 이메일을 확인해주세요.</Alert>
            )}
            {sendMutation.isError && (
              <Alert tone="danger">{sendErrorMessage(sendMutation.error)}</Alert>
            )}
            {confirmMutation.isError && (
              <Alert tone="danger">{confirmErrorMessage(confirmMutation.error)}</Alert>
            )}
            {resetMutation.isError && (
              <Alert tone="danger">{resetErrorMessage(resetMutation.error)}</Alert>
            )}

            {!verificationToken ? (
              <div className={styles.form}>
                {mode === 'password' && (
                  <FormField label="아이디" required errorText={fieldErrors.loginId}>
                    <input
                      autoComplete="username"
                      maxLength={20}
                      value={loginId}
                      onChange={(event) => {
                        const value = event.target.value;
                        setLoginId(value);
                        setFieldErrors((current) => ({
                          ...current,
                          loginId: current.loginId ? getLoginIdError(value) : '',
                        }));
                        invalidateVerification();
                      }}
                      onBlur={() => setFieldErrors((current) => ({
                        ...current,
                        loginId: getLoginIdError(loginId),
                      }))}
                    />
                  </FormField>
                )}
                <FormField
                  label="인증 이메일"
                  required
                  errorText={fieldErrors.email}
                  helperText="가입 후 인증을 완료한 이메일을 입력해주세요."
                  reserveMessage
                >
                  <div className={styles.verificationRow}>
                    <input
                      autoComplete="email"
                      maxLength={254}
                      value={email}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEmail(value);
                        setFieldErrors((current) => ({
                          ...current,
                          email: current.email ? getEmailError(value.trim().toLowerCase()) : '',
                        }));
                        invalidateVerification();
                      }}
                      onBlur={() => setFieldErrors((current) => ({
                        ...current,
                        email: getEmailError(normalizedEmail),
                      }))}
                    />
                    <Button
                      variant="secondary"
                      icon={<Mail size={17} />}
                      disabled={sendMutation.isPending || retryAfterSeconds > 0}
                      onClick={sendCode}
                    >
                      {retryAfterSeconds > 0 ? formatWaitTime(retryAfterSeconds) : verificationSent ? '재발송' : '인증번호 발송'}
                    </Button>
                  </div>
                </FormField>
                {verificationSent && (
                  <FormField label="인증번호" helperText="인증번호가 발송되었습니다. 메일로 받은 6자리 숫자를 입력해주세요." reserveMessage>
                    <div className={styles.verificationRow}>
                      <input
                        ref={codeRef}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={code}
                        onChange={(event) => {
                          setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                          confirmMutation.reset();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            confirmCode();
                          }
                        }}
                      />
                      <Button variant="secondary" icon={<BadgeCheck size={17} />} disabled={code.length !== 6 || confirmMutation.isPending} onClick={confirmCode}>
                        확인
                      </Button>
                    </div>
                  </FormField>
                )}
              </div>
            ) : (
              <form className={styles.form} onSubmit={resetPassword}>
                <Alert tone="success">이메일 인증이 완료되었습니다. 새 비밀번호를 설정해주세요.</Alert>
                <FormField label="새 비밀번호" required errorText={fieldErrors.password} helperText="8자 이상, 영문·숫자·특수문자를 포함해주세요." reserveMessage>
                  <input autoComplete="new-password" maxLength={64} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </FormField>
                <FormField label="새 비밀번호 확인" required errorText={fieldErrors.passwordConfirm}>
                  <input autoComplete="new-password" maxLength={64} type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
                </FormField>
                <Button icon={<KeyRound size={18} />} size="lg" type="submit" disabled={resetMutation.isPending}>비밀번호 변경</Button>
              </form>
            )}
          </>
        )}
        <Link className={styles.switchLink} to="/login"><ArrowLeft size={16} /> 로그인으로 돌아가기</Link>
      </div>
    </section>
  );
}

function getPasswordError(value: string) {
  if (value.length < 8) return '8자 이상 입력해주세요.';
  if (value.length > 64) return '64자 이하로 입력해주세요.';
  if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).+$/.test(value)) return '영문, 숫자, 특수문자를 포함해주세요.';
  return '';
}

function getLoginIdError(value: string) {
  if (!value) return '아이디를 입력해주세요.';
  if (!/^[A-Za-z0-9_]{4,20}$/.test(value)) return '4-20자 영문, 숫자, 언더스코어로 입력해주세요.';
  return '';
}

function getEmailError(value: string) {
  if (!value) return '이메일을 입력해주세요.';
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return '이메일 형식을 확인해주세요.';
  return '';
}

function getRetryAfterSeconds(error: unknown) {
  if (!(error instanceof ApiClientError)) return 0;
  const value = error.data?.retryAfterSeconds;
  return typeof value === 'number' ? value : 0;
}

function sendErrorMessage(error: unknown) {
  if (toApiErrorMessage(error) === 'email_verification_rate_limited') {
    return '발송 횟수를 초과했습니다. 표시된 시간이 지난 뒤 다시 시도해주세요.';
  }
  return '인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.';
}

function confirmErrorMessage(error: unknown) {
  const message = toApiErrorMessage(error);
  if (message === 'email_verification_expired') return '인증번호가 만료되었습니다. 다시 발송해주세요.';
  if (message === 'invalid_email_verification_code') return '인증번호가 일치하지 않습니다.';
  if (message === 'recoverable_account_not_found') return '아이디가 존재하지 않거나, 이메일이 일치하지 않습니다.';
  return '인증번호를 확인하지 못했습니다.';
}

function resetErrorMessage(error: unknown) {
  if (toApiErrorMessage(error) === 'invalid_email_verification_token') {
    return '인증 시간이 만료되어 비밀번호를 변경하지 못했습니다. 다시 시도해주세요.';
  }
  return '비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

function formatWaitTime(seconds: number) {
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)}시간 후 가능`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}분 후 가능`;
  return `${seconds}초 후 가능`;
}
