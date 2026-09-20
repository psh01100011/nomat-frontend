import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, Mail, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiClientError } from '@/entities/common';
import { authApi } from '@/features/auth/auth-api';
import { userApi } from '@/features/user/user-api';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { toApiErrorMessage } from '@/shared/api/http-client';
import styles from './auth-pages.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z
  .object({
    loginId: z.string().regex(/^[A-Za-z0-9_]{4,20}$/, '4-20자 영문, 숫자, 언더스코어만 가능합니다.'),
    password: z
      .string()
      .min(8, '8자 이상 입력해주세요.')
      .max(64)
      .regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).+$/, '영문, 숫자, 특수문자를 포함해주세요.'),
    passwordConfirm: z.string(),
    nickname: z.string().regex(/^[가-힣A-Za-z0-9_]{2,12}$/, '2-12자 한글, 영문, 숫자, 언더스코어만 가능합니다.'),
    email: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(254, '이메일은 254자 이하로 입력해주세요.').regex(EMAIL_PATTERN, '이메일 형식을 확인해주세요.').or(z.literal('')),
    ),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    path: ['passwordConfirm'],
    message: '비밀번호가 일치하지 않습니다.',
  });

type SignupForm = z.infer<typeof schema>;

export function SignupPage() {
  const runOnce = useSingleFlight();
  const navigate = useNavigate();
  const [checkedLoginId, setCheckedLoginId] = useState<{ value: string; available: boolean } | null>(null);
  const [checkedNickname, setCheckedNickname] = useState<{ value: string; available: boolean } | null>(null);
  const [settledPassword, setSettledPassword] = useState('');
  const [settledPasswordPair, setSettledPasswordPair] = useState<{ password: string; confirm: string } | null>(null);
  const [emailCode, setEmailCode] = useState('');
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<{ email: string; token: string } | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendEmail, setResendEmail] = useState<string | null>(null);
  const emailCodeRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<SignupForm>({
    resolver: zodResolver(schema),
    defaultValues: { loginId: '', password: '', passwordConfirm: '', nickname: '', email: '' },
  });
  const loginIdValue = form.watch('loginId');
  const nicknameValue = form.watch('nickname');
  const emailValue = form.watch('email');
  const passwordValue = form.watch('password');
  const passwordConfirmValue = form.watch('passwordConfirm');
  const normalizedEmail = emailValue.trim().toLowerCase();

  const signupMutation = useMutation({
    mutationFn: authApi.signup,
    onSuccess: () => navigate('/login', { replace: true }),
  });

  const emailSendMutation = useMutation({
    mutationFn: authApi.sendSignupEmailVerification,
    onSuccess: (response, email) => {
      setSentEmail(email);
      setVerifiedEmail(null);
      setEmailCode('');
      setResendSeconds(response.resendAvailableInSeconds);
      setResendEmail(email);
      form.clearErrors('email');
      window.requestAnimationFrame(() => emailCodeRef.current?.focus());
    },
    onError: (error, email) => {
      const retryAfterSeconds = getRetryAfterSeconds(error);
      if (retryAfterSeconds > 0) {
        setResendEmail(email);
        setResendSeconds(retryAfterSeconds);
      }
    },
  });

  const emailConfirmMutation = useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      authApi.confirmSignupEmailVerification(email, code),
    onSuccess: (response, variables) => {
      setVerifiedEmail({ email: variables.email, token: response.emailVerificationToken });
      form.clearErrors('email');
    },
  });

  const loginIdCheck = useMutation({
    mutationFn: userApi.checkLoginId,
    onSuccess: (data, value) => setCheckedLoginId({ value, available: data.available }),
  });
  const nicknameCheck = useMutation({
    mutationFn: userApi.checkNickname,
    onSuccess: (data, value) => setCheckedNickname({ value, available: data.available }),
  });

  useEffect(() => {
    setCheckedLoginId(null);
    if (!/^[A-Za-z0-9_]{4,20}$/.test(loginIdValue)) return;
    const timeoutId = window.setTimeout(() => loginIdCheck.mutate(loginIdValue), 500);
    return () => window.clearTimeout(timeoutId);
  }, [loginIdValue]);

  useEffect(() => {
    setCheckedNickname(null);
    if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(nicknameValue)) return;
    const timeoutId = window.setTimeout(() => nicknameCheck.mutate(nicknameValue), 500);
    return () => window.clearTimeout(timeoutId);
  }, [nicknameValue]);

  useEffect(() => {
    setSettledPasswordPair(null);
    if (!passwordValue || !passwordConfirmValue) return;
    const timeoutId = window.setTimeout(() => {
      setSettledPasswordPair({ password: passwordValue, confirm: passwordConfirmValue });
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [passwordValue, passwordConfirmValue]);

  useEffect(() => {
    setSettledPassword('');
    if (!passwordValue) return;
    const timeoutId = window.setTimeout(() => setSettledPassword(passwordValue), 400);
    return () => window.clearTimeout(timeoutId);
  }, [passwordValue]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const intervalId = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [resendSeconds > 0]);

  useEffect(() => {
    if (verifiedEmail && verifiedEmail.email !== normalizedEmail) {
      setVerifiedEmail(null);
    }
    if (sentEmail && sentEmail !== normalizedEmail) {
      setSentEmail(null);
      setEmailCode('');
      emailSendMutation.reset();
      emailConfirmMutation.reset();
    }
  }, [normalizedEmail, sentEmail, verifiedEmail]);

  const sendEmailVerification = () => {
    const error = getEmailError(normalizedEmail);
    if (!normalizedEmail || error) {
      form.setError('email', { message: error || '이메일을 입력해주세요.' });
      form.setFocus('email');
      return;
    }
    runOnce('signup-email-send', () => emailSendMutation.mutateAsync(normalizedEmail));
  };

  const confirmEmailVerification = () => {
    if (!sentEmail || !/^\d{6}$/.test(emailCode)) return;
    runOnce('signup-email-confirm', () => emailConfirmMutation.mutateAsync({ email: sentEmail, code: emailCode }));
  };

  const submitSignup = (values: SignupForm) => {
    if (!checkedLoginId || checkedLoginId.value !== values.loginId || !checkedLoginId.available) {
      form.setError('loginId', { message: '아이디 중복 확인을 완료해주세요.' });
      form.setFocus('loginId');
      return;
    }
    if (!checkedNickname || checkedNickname.value !== values.nickname || !checkedNickname.available) {
      form.setError('nickname', { message: '닉네임 중복 확인을 완료해주세요.' });
      form.setFocus('nickname');
      return;
    }
    const email = values.email.trim().toLowerCase();
    if (email && verifiedEmail?.email !== email) {
      form.setError('email', { message: '이메일 인증을 완료해주세요.' });
      if (sentEmail === email) emailCodeRef.current?.focus();
      else form.setFocus('email');
      return;
    }
    runOnce('signup', () => signupMutation.mutateAsync({
      ...values,
      email: email || undefined,
      emailVerificationToken: email ? verifiedEmail?.token : undefined,
    }));
  };

  return (
    <section className={styles.authShell}>
      <div className={styles.authPanel}>
        <h1 className={styles.title}>회원가입</h1>
        {signupMutation.isError && (
          <Alert tone="danger">
            {toApiErrorMessage(signupMutation.error) === 'duplicate_login_id'
              ? '이미 사용 중인 아이디입니다.'
              : toApiErrorMessage(signupMutation.error) === 'duplicate_nickname'
                ? '이미 사용 중인 닉네임입니다.'
                : '회원가입에 실패했습니다.'}
          </Alert>
        )}
        <form
          className={styles.form}
          onSubmit={form.handleSubmit(
            submitSignup,
            (errors) => {
              const firstError = Object.keys(errors)[0] as keyof SignupForm | undefined;
              if (firstError) form.setFocus(firstError);
            },
          )}
        >
          <FormField
            label="아이디"
            required
            errorText={form.formState.errors.loginId?.message}
            counterText={remainingText(form.watch('loginId'), 20)}
            helperText={loginIdHelperText(checkedLoginId, loginIdValue, loginIdCheck.isPending)}
            helperTone={loginIdHelperTone(checkedLoginId, loginIdValue)}
            reserveMessage
          >
            <input autoComplete="username" maxLength={20} {...form.register('loginId')} />
          </FormField>
          <FormField
            label="비밀번호"
            required
            errorText={form.formState.errors.password?.message}
            helperText={passwordRuleHelperText(settledPassword, passwordValue)}
            helperTone={passwordRuleTone(settledPassword, passwordValue)}
            reserveMessage
          >
            <input autoComplete="new-password" maxLength={64} type="password" {...form.register('password')} />
          </FormField>
          <FormField
            label="비밀번호 확인"
            required
            errorText={form.formState.errors.passwordConfirm?.message}
            helperText={passwordConfirmHelperText(settledPasswordPair, passwordValue, passwordConfirmValue)}
            helperTone={
              settledPasswordPair?.password === passwordValue &&
              settledPasswordPair.confirm === passwordConfirmValue &&
              passwordValue === passwordConfirmValue
                ? 'success'
                : settledPasswordPair?.password === passwordValue && settledPasswordPair.confirm === passwordConfirmValue
                  ? 'danger'
                  : 'neutral'
            }
            reserveMessage
          >
            <input autoComplete="new-password" maxLength={64} type="password" {...form.register('passwordConfirm')} />
          </FormField>
          <FormField
            label="닉네임"
            required
            errorText={form.formState.errors.nickname?.message}
            counterText={remainingText(form.watch('nickname'), 12)}
            helperText={nicknameHelperText(checkedNickname, nicknameValue, nicknameCheck.isPending)}
            helperTone={nicknameHelperTone(checkedNickname, nicknameValue)}
            reserveMessage
          >
            <input maxLength={12} {...form.register('nickname')} />
          </FormField>
          <FormField
            label="이메일"
            errorText={form.formState.errors.email?.message}
            helperText={emailVerificationHelperText(
              emailValue,
              normalizedEmail,
              sentEmail,
              verifiedEmail,
              emailSendMutation.isPending,
              emailSendMutation.error,
            )}
            helperTone={emailVerificationHelperTone(
              emailValue,
              normalizedEmail,
              verifiedEmail,
              emailSendMutation.isError,
            )}
            counterText={remainingText(form.watch('email'), 254)}
            reserveMessage
          >
            <div className={styles.verificationRow}>
              <input
                autoComplete="email"
                maxLength={254}
                placeholder="선택 입력"
                {...form.register('email')}
              />
              <Button
                variant="secondary"
                icon={verifiedEmail?.email === normalizedEmail ? <BadgeCheck size={17} /> : <Mail size={17} />}
                disabled={
                  !normalizedEmail ||
                  Boolean(getEmailError(normalizedEmail)) ||
                  emailSendMutation.isPending ||
                  (resendEmail === normalizedEmail && resendSeconds > 0) ||
                  verifiedEmail?.email === normalizedEmail
                }
                onClick={sendEmailVerification}
              >
                {verifiedEmail?.email === normalizedEmail
                  ? '인증 완료'
                  : resendEmail === normalizedEmail && resendSeconds > 0
                    ? formatWaitTime(resendSeconds)
                    : sentEmail === normalizedEmail
                      ? '재발송'
                      : '인증번호 발송'}
              </Button>
            </div>
          </FormField>
          {sentEmail === normalizedEmail && verifiedEmail?.email !== normalizedEmail && (
            <FormField
              label="인증번호"
              errorText={emailConfirmMutation.isError ? emailConfirmError(emailConfirmMutation.error) : undefined}
              helperText="인증번호가 발송되었습니다. 메일로 받은 6자리 숫자를 입력해주세요."
              reserveMessage
            >
              <div className={styles.verificationRow}>
                <input
                  ref={emailCodeRef}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={emailCode}
                  onChange={(event) => {
                    setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    emailConfirmMutation.reset();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      confirmEmailVerification();
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={emailCode.length !== 6 || emailConfirmMutation.isPending}
                  onClick={confirmEmailVerification}
                >
                  확인
                </Button>
              </div>
            </FormField>
          )}
          <Button icon={<UserPlus size={18} />} size="lg" type="submit" disabled={signupMutation.isPending}>
            가입하기
          </Button>
        </form>
        <Link className={styles.switchLink} to="/login">
          이미 계정이 있나요? 로그인
        </Link>
      </div>
    </section>
  );
}

function passwordRuleHelperText(settledPassword: string, currentPassword: string) {
  if (!settledPassword || settledPassword !== currentPassword) return undefined;
  return getPasswordError(settledPassword) || '사용 가능한 비밀번호입니다.';
}

function passwordRuleTone(settledPassword: string, currentPassword: string) {
  if (!settledPassword || settledPassword !== currentPassword) return 'neutral';
  return getPasswordError(settledPassword) ? 'danger' : 'success';
}

function getPasswordError(value: string) {
  if (value.length < 8) return '8자 이상 입력해주세요.';
  if (value.length > 64) return '64자 이하로 입력해주세요.';
  if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).+$/.test(value)) return '영문, 숫자, 특수문자를 포함해주세요.';
  return '';
}

function loginIdHelperText(
  checked: { value: string; available: boolean } | null,
  value: string,
  pending: boolean,
) {
  if (!value) return undefined;
  const formatError = getLoginIdError(value);
  if (formatError) return formatError;
  if (pending && checked?.value !== value) return '확인 중입니다.';
  if (checked?.value !== value) return undefined;
  return checked.available ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.';
}

function loginIdHelperTone(checked: { value: string; available: boolean } | null, value: string) {
  if (!value) return 'neutral';
  if (getLoginIdError(value)) return 'danger';
  if (checked?.value !== value) return 'neutral';
  return checked.available ? 'success' : 'danger';
}

function nicknameHelperText(
  checked: { value: string; available: boolean } | null,
  value: string,
  pending: boolean,
) {
  if (!value) return undefined;
  const formatError = getNicknameError(value);
  if (formatError) return formatError;
  if (pending && checked?.value !== value) return '확인 중입니다.';
  if (checked?.value !== value) return undefined;
  return checked.available ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.';
}

function nicknameHelperTone(checked: { value: string; available: boolean } | null, value: string) {
  if (!value) return 'neutral';
  if (getNicknameError(value)) return 'danger';
  if (checked?.value !== value) return 'neutral';
  return checked.available ? 'success' : 'danger';
}

function passwordConfirmHelperText(
  settledPair: { password: string; confirm: string } | null,
  password: string,
  confirm: string,
) {
  if (!settledPair || settledPair.password !== password || settledPair.confirm !== confirm) return undefined;
  return password === confirm ? '비밀번호가 일치합니다.' : '비밀번호가 일치하지 않습니다.';
}

function getLoginIdError(value: string) {
  if (value.length < 4) return '4자 이상 입력해주세요.';
  if (value.length > 20) return '20자 이하로 입력해주세요.';
  if (!/^[A-Za-z0-9_]+$/.test(value)) return '영문, 숫자, _만 사용할 수 있습니다.';
  return '';
}

function getNicknameError(value: string) {
  if (value.length < 2) return '2자 이상 입력해주세요.';
  if (value.length > 12) return '12자 이하로 입력해주세요.';
  if (!/^[가-힣A-Za-z0-9_]+$/.test(value)) return '한글, 영문, 숫자, _만 사용할 수 있습니다.';
  return '';
}

function emailVerificationHelperText(
  value: string,
  normalizedEmail: string,
  sentEmail: string | null,
  verifiedEmail: { email: string; token: string } | null,
  sending: boolean,
  sendError: unknown,
) {
  const trimmed = value.trim();
  if (!trimmed) return '선택 사항이며, 입력하면 인증이 필요합니다.';
  const error = getEmailError(trimmed);
  if (error) return error;
  if (verifiedEmail?.email === normalizedEmail) return '이메일 인증이 완료되었습니다.';
  if (sending) return '인증번호를 발송하고 있습니다.';
  if (sendError) return emailSendError(sendError);
  if (sentEmail === normalizedEmail) return '인증번호를 발송했습니다. 재발송하면 이전 번호는 사용할 수 없습니다.';
  return '인증번호 발송 후 확인이 필요합니다.';
}

function emailVerificationHelperTone(
  value: string,
  normalizedEmail: string,
  verifiedEmail: { email: string; token: string } | null,
  sendFailed: boolean,
) {
  const trimmed = value.trim();
  if (!trimmed) return 'neutral';
  if (getEmailError(trimmed) || sendFailed) return 'danger';
  return verifiedEmail?.email === normalizedEmail ? 'success' : 'neutral';
}

function emailSendError(error: unknown) {
  const message = toApiErrorMessage(error);
  if (message === 'duplicate_email') return '이미 사용 중인 이메일입니다.';
  if (message === 'email_verification_resend_too_soon') return '잠시 후 다시 발송해주세요.';
  if (message === 'email_verification_rate_limited') return '발송 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.';
  if (message === 'email_verification_delivery_failed') return '인증 메일을 보내지 못했습니다.';
  return '인증번호 발송에 실패했습니다.';
}

function emailConfirmError(error: unknown) {
  const message = toApiErrorMessage(error);
  if (message === 'email_verification_expired') return '인증번호가 만료되었습니다. 다시 발송해주세요.';
  if (message === 'invalid_email_verification_code') return '인증번호가 일치하지 않습니다.';
  return '인증번호 확인에 실패했습니다.';
}

function getRetryAfterSeconds(error: unknown) {
  if (!(error instanceof ApiClientError)) return 0;
  const retryAfterSeconds = error.data?.retryAfterSeconds;
  return typeof retryAfterSeconds === 'number' ? retryAfterSeconds : 0;
}

function formatWaitTime(seconds: number) {
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)}시간 후 가능`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}분 후 가능`;
  return `${seconds}초 후 가능`;
}

function getEmailError(value: string) {
  if (value.length > 254) return '254자 이하로 입력해주세요.';
  if (!EMAIL_PATTERN.test(value)) return '이메일 형식을 확인해주세요.';
  return '';
}

function remainingText(value: string, max: number) {
  return `${value.length}/${max}`;
}
