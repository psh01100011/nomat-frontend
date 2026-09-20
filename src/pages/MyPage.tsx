import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, KeyRound, Mail, Save, Shield, Trash2, UserRound } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { ApiClientError } from '@/entities/common';
import { assetApi } from '@/features/assets/asset-api';
import { CropSettings, cropImageToBlob } from '@/features/assets/crop-image';
import { useAuth } from '@/features/auth/auth-context';
import { userApi } from '@/features/user/user-api';
import { queryKeys } from '@/shared/api/query-keys';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { UserAvatar } from '@/shared/ui/FallbackMedia';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Panel } from '@/shared/ui/Panel';
import { ImageCropPicker } from '@/shared/ui/ImageCropPicker';
import { Modal } from '@/shared/ui/Modal';
import styles from './mypage.module.css';

export function MyPage() {
  const auth = useAuth();

  return auth.isGuest ? <GuestMyPage /> : <MemberMyPage />;
}

function MemberMyPage() {
  const auth = useAuth();
  const runOnce = useSingleFlight();
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState(auth.user?.nickname ?? '');
  const [email, setEmail] = useState(auth.user?.email ?? '');
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [checkedNickname, setCheckedNickname] = useState<{ value: string; available: boolean } | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [profileImageCleared, setProfileImageCleared] = useState(false);
  const [cropSettings, setCropSettings] = useState<CropSettings>({ x: 50, y: 50, zoom: 1 });
  const [currentPassword, setCurrentPassword] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ nickname?: string; email?: string; currentPassword?: string; newPassword?: string }>({});
  const [emailCode, setEmailCode] = useState('');
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<{ email: string; token: string } | null>(null);
  const [emailResendSeconds, setEmailResendSeconds] = useState(0);
  const [emailResendAddress, setEmailResendAddress] = useState<string | null>(null);
  const [profileEmailInputEnabled, setProfileEmailInputEnabled] = useState(false);
  const [currentPasswordInputEnabled, setCurrentPasswordInputEnabled] = useState(false);
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const emailCodeRef = useRef<HTMLInputElement | null>(null);
  const currentPasswordRef = useRef<HTMLInputElement | null>(null);
  const newPasswordRef = useRef<HTMLInputElement | null>(null);
  const trimmedNickname = nickname.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const nicknameChanged = trimmedNickname !== (auth.user?.nickname ?? '');
  const emailChanged = trimmedEmail !== (auth.user?.email ?? '');
  const hasProfileChanges = nicknameChanged || emailChanged || Boolean(file) || profileImageCleared;
  const hasUnsavedChanges =
    (isProfileEditing && (hasProfileChanges || Boolean(sentEmail) || Boolean(verifiedEmail) || Boolean(emailCode))) ||
    Boolean(currentPassword) ||
    Boolean(verificationToken) ||
    Boolean(newPassword);
  const navigationBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      `${currentLocation.pathname}${currentLocation.search}` !== `${nextLocation.pathname}${nextLocation.search}`,
  );

  const handleEnter = (event: KeyboardEvent<HTMLInputElement>, action: () => void) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    action();
  };

  const resetProfileDraft = () => {
    setNickname(auth.user?.nickname ?? '');
    setEmail(auth.user?.email ?? '');
    setCheckedNickname(null);
    setFile(null);
    setProfileImageCleared(false);
    setCropSettings({ x: 50, y: 50, zoom: 1 });
    setSentEmail(null);
    setVerifiedEmail(null);
    setEmailCode('');
    setEmailResendSeconds(0);
    setEmailResendAddress(null);
    setProfileEmailInputEnabled(false);
    setFieldErrors((current) => ({ ...current, nickname: undefined, email: undefined }));
  };

  useEffect(() => {
    setNickname(auth.user?.nickname ?? '');
    setEmail(auth.user?.email ?? '');
    setCheckedNickname(null);
    setSentEmail(null);
    setVerifiedEmail(null);
    setEmailCode('');
    setEmailResendSeconds(0);
    setEmailResendAddress(null);
    setProfileEmailInputEnabled(false);
    setFieldErrors({});
  }, [auth.user?.email, auth.user?.nickname]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const nicknameError = getNicknameError(nickname);
      if (nicknameError) {
        setFieldErrors((current) => ({ ...current, nickname: nicknameError }));
        nicknameRef.current?.focus();
        throw new Error('form:nickname');
      }
      if (!hasProfileChanges) {
        setNotice({ title: '변경된 내용이 없습니다', message: '수정한 프로필 정보가 있을 때 저장할 수 있습니다.' });
        throw new Error('form:noChanges');
      }
      const emailError = getEmailError(email);
      if (emailError) {
        setFieldErrors((current) => ({ ...current, email: emailError }));
        emailRef.current?.focus();
        throw new Error('form:email');
      }
      if (emailChanged && !trimmedEmail && auth.user?.email) {
        setFieldErrors((current) => ({ ...current, email: '등록된 이메일은 삭제할 수 없습니다.' }));
        emailRef.current?.focus();
        throw new Error('form:email');
      }
      if (emailChanged && trimmedEmail && verifiedEmail?.email !== trimmedEmail) {
        setFieldErrors((current) => ({ ...current, email: '새 이메일 인증을 완료해주세요.' }));
        if (sentEmail === trimmedEmail) emailCodeRef.current?.focus();
        else emailRef.current?.focus();
        throw new Error('form:email');
      }
      if (nicknameChanged && (!checkedNickname || checkedNickname.value !== trimmedNickname || !checkedNickname.available)) {
        setFieldErrors((current) => ({ ...current, nickname: '닉네임 중복 확인을 완료해주세요.' }));
        nicknameRef.current?.focus();
        throw new Error('form:nickname');
      }
      let profileImageAssetId: number | undefined;
      if (file) {
        const blob = await cropImageToBlob(file, 1, cropSettings);
        const uploaded = await assetApi.uploadImage(blob, 'profile.webp', 'PROFILE');
        profileImageAssetId = uploaded.assetId;
      }
      const requests: Promise<unknown>[] = [];
      if (nicknameChanged || emailChanged || profileImageAssetId !== undefined) {
        requests.push(
          userApi.updateProfile({
            nickname: nicknameChanged ? trimmedNickname : undefined,
            email: emailChanged ? trimmedEmail : undefined,
            emailVerificationToken: emailChanged && trimmedEmail ? verifiedEmail?.token : undefined,
            profileImageAssetId,
          }),
        );
      }
      if (profileImageCleared && !file) {
        requests.push(userApi.deleteProfileImage());
      }
      await Promise.all(requests);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setFile(null);
      setProfileImageCleared(false);
      setIsProfileEditing(false);
      setNotice({ title: '프로필 저장 완료', message: '변경한 프로필 정보를 저장했습니다.' });
      setCheckedNickname({ value: nickname.trim(), available: true });
    },
    onError: (error) => {
      if (error instanceof Error && error.message.startsWith('form:')) return;
      const messageCode = toApiErrorMessage(error);
      setNotice({
        title: '프로필 저장 실패',
        message: messageCode === 'duplicate_nickname' ? '이미 사용 중인 닉네임입니다.' : '프로필 저장에 실패했습니다.',
      });
    },
  });

  const nicknameCheckMutation = useMutation({
    mutationFn: userApi.checkNickname,
    onSuccess: (data, value) => {
      setCheckedNickname({ value, available: data.available });
      setFieldErrors((current) => ({ ...current, nickname: data.available ? undefined : '이미 사용 중인 닉네임입니다.' }));
    },
  });

  const emailSendMutation = useMutation({
    mutationFn: userApi.sendEmailVerification,
    onSuccess: (response, requestedEmail) => {
      setSentEmail(requestedEmail);
      setVerifiedEmail(null);
      setEmailCode('');
      setEmailResendSeconds(response.resendAvailableInSeconds);
      setEmailResendAddress(requestedEmail);
      setFieldErrors((current) => ({ ...current, email: undefined }));
      window.requestAnimationFrame(() => emailCodeRef.current?.focus());
    },
    onError: (error, requestedEmail) => {
      const retryAfterSeconds = getRetryAfterSeconds(error);
      if (retryAfterSeconds > 0) {
        setEmailResendAddress(requestedEmail);
        setEmailResendSeconds(retryAfterSeconds);
      }
    },
  });

  const emailConfirmMutation = useMutation({
    mutationFn: ({ requestedEmail, code }: { requestedEmail: string; code: string }) =>
      userApi.confirmEmailVerification(requestedEmail, code),
    onSuccess: (response, variables) => {
      setVerifiedEmail({ email: variables.requestedEmail, token: response.emailVerificationToken });
      setFieldErrors((current) => ({ ...current, email: undefined }));
    },
  });

  useEffect(() => {
    setCheckedNickname(null);
    setFieldErrors((current) => ({ ...current, nickname: undefined }));
    if (!isProfileEditing || !nicknameChanged || getNicknameError(nickname)) return;
    const timeoutId = window.setTimeout(() => {
      nicknameCheckMutation.mutate(trimmedNickname);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [isProfileEditing, nickname, nicknameChanged, trimmedNickname]);

  useEffect(() => {
    setFieldErrors((current) => ({ ...current, email: undefined }));
    if (verifiedEmail && verifiedEmail.email !== trimmedEmail) setVerifiedEmail(null);
    if (sentEmail && sentEmail !== trimmedEmail) {
      setSentEmail(null);
      setEmailCode('');
      emailSendMutation.reset();
      emailConfirmMutation.reset();
    }
  }, [email, isProfileEditing, sentEmail, trimmedEmail, verifiedEmail]);

  useEffect(() => {
    if (emailResendSeconds <= 0) return;
    const intervalId = window.setInterval(() => {
      setEmailResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [emailResendSeconds > 0]);

  const sendEmailVerification = () => {
    const emailError = getEmailError(trimmedEmail);
    if (!trimmedEmail || emailError) {
      setFieldErrors((current) => ({ ...current, email: emailError || '이메일을 입력해주세요.' }));
      emailRef.current?.focus();
      return;
    }
    runOnce('profile-email-send', () => emailSendMutation.mutateAsync(trimmedEmail));
  };

  const confirmEmailVerification = () => {
    if (!sentEmail || !/^\d{6}$/.test(emailCode)) return;
    runOnce('profile-email-confirm', () => emailConfirmMutation.mutateAsync({ requestedEmail: sentEmail, code: emailCode }));
  };

  const verifyMutation = useMutation({
    mutationFn: (password: string) => {
      if (!password.trim()) {
        setFieldErrors((current) => ({ ...current, currentPassword: '현재 비밀번호를 입력해주세요.' }));
        currentPasswordRef.current?.focus();
        throw new Error('form:currentPassword');
      }
      return userApi.verifyPassword(password);
    },
    onSuccess: (data) => {
      setVerificationToken(data.passwordVerificationToken);
      setFieldErrors((current) => ({ ...current, currentPassword: undefined }));
      window.requestAnimationFrame(() => newPasswordRef.current?.focus());
    },
    onError: (error) => {
      if (error instanceof Error && error.message.startsWith('form:')) return;
      setFieldErrors((current) => ({ ...current, currentPassword: '현재 비밀번호를 다시 확인해주세요.' }));
      currentPasswordRef.current?.focus();
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => {
      const passwordError = getPasswordError(newPassword);
      if (passwordError) {
        setFieldErrors((current) => ({ ...current, newPassword: passwordError }));
        newPasswordRef.current?.focus();
        throw new Error('form:newPassword');
      }
      return userApi.updatePassword({ passwordVerificationToken: verificationToken, password: newPassword });
    },
    onSuccess: () => {
      setCurrentPassword('');
      setCurrentPasswordInputEnabled(false);
      setVerificationToken('');
      setNewPassword('');
      setNotice({ title: '비밀번호 변경 완료', message: '새 비밀번호로 변경했습니다.' });
    },
    onError: (error) => {
      if (error instanceof Error && error.message.startsWith('form:')) return;
      setNotice({ title: '비밀번호 변경 실패', message: '비밀번호 조건을 확인한 뒤 다시 시도해주세요.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: userApi.deleteMe,
    onSuccess: () => void auth.logout(),
  });

  return (
    <section className={styles.shell}>
      <PageHeader title="내 정보" />
      <div className={styles.grid}>
        <Panel className={styles.cardPanel}>
          <div className={styles.sectionTitle}>
            <div className={styles.sectionHeading}>
              <UserRound size={20} />
              <div>
                <h2>프로필</h2>
              </div>
            </div>
            {isProfileEditing ? (
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetProfileDraft();
                    setIsProfileEditing(false);
                  }}
                >
                  취소
                </Button>
                <Button
                  icon={<Save size={17} />}
                  onClick={() => runOnce('profile-save', () => profileMutation.mutateAsync())}
                  disabled={!hasProfileChanges || profileMutation.isPending}
                >
                  저장
                </Button>
              </div>
            ) : (
              <Button onClick={() => {
                setProfileEmailInputEnabled(false);
                setIsProfileEditing(true);
              }}>
                수정
              </Button>
            )}
          </div>
          <div className={styles.profileLayout}>
            <div className={styles.profileImageField}>
              {isProfileEditing ? (
                <ImageCropPicker
                  aspectRatio={1}
                  file={file}
                  imageUrl={profileImageCleared ? null : auth.user?.profileImageUrl}
                  label="프로필 이미지"
                  previewClassName={styles.circleImagePreview}
                  settings={cropSettings}
                  onFileChange={(nextFile) => {
                    setFile(nextFile);
                    if (nextFile) setProfileImageCleared(false);
                  }}
                  onExistingImageClear={() => setProfileImageCleared(true)}
                  onSettingsChange={setCropSettings}
                />
              ) : (
                <UserAvatar
                  nickname={auth.user?.nickname ?? nickname}
                  imageUrl={auth.user?.profileImageUrl}
                  size="lg"
                />
              )}
            </div>
            <div className={`${styles.form} ${styles.profileForm}`}>
              {isProfileEditing ? (
                <>
                  <FormField
                    label="닉네임"
                    errorText={fieldErrors.nickname}
                    helperText={profileNicknameHelperText(checkedNickname, trimmedNickname, nicknameChanged, nicknameCheckMutation.isPending)}
                    helperTone={profileNicknameHelperTone(checkedNickname, trimmedNickname, nicknameChanged)}
                    counterText={remainingText(nickname, 12)}
                    reserveMessage
                  >
                  <input
                    ref={nicknameRef}
                    maxLength={12}
                    value={nickname}
                    onKeyDown={(event) => handleEnter(event, () => runOnce('profile-save', () => profileMutation.mutateAsync()))}
                    onChange={(event) => {
                      setNickname(event.target.value);
                      setCheckedNickname(null);
                      setFieldErrors((current) => ({ ...current, nickname: undefined }));
                    }}
                  />
                  </FormField>
                  <FormField
                    label="이메일"
                    labelMeta="새 주소는 인증 후 저장됩니다"
                    errorText={fieldErrors.email}
                    helperText={profileEmailHelperText(
                      email,
                      trimmedEmail,
                      emailChanged,
                      sentEmail,
                      verifiedEmail,
                      emailSendMutation.isPending,
                      emailSendMutation.error,
                    )}
                    helperTone={profileEmailHelperTone(email, trimmedEmail, emailChanged, verifiedEmail, emailSendMutation.isError)}
                    counterText={remainingText(email, 254)}
                    reserveMessage
                  >
                    <div className={styles.inlineField}>
                      <input
                        ref={emailRef}
                        autoComplete="off"
                        name="profile-contact-email"
                        readOnly={!profileEmailInputEnabled}
                        maxLength={254}
                        value={email}
                        onFocus={() => setProfileEmailInputEnabled(true)}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setFieldErrors((current) => ({ ...current, email: undefined }));
                        }}
                        placeholder="선택 입력"
                      />
                      <Button
                        variant="secondary"
                        icon={verifiedEmail?.email === trimmedEmail ? <BadgeCheck size={17} /> : <Mail size={17} />}
                        disabled={
                          !emailChanged ||
                          !trimmedEmail ||
                          Boolean(getEmailError(trimmedEmail)) ||
                          emailSendMutation.isPending ||
                          (emailResendAddress === trimmedEmail && emailResendSeconds > 0) ||
                          verifiedEmail?.email === trimmedEmail
                        }
                        onClick={sendEmailVerification}
                      >
                        {verifiedEmail?.email === trimmedEmail
                          ? '인증 완료'
                          : emailResendAddress === trimmedEmail && emailResendSeconds > 0
                            ? formatWaitTime(emailResendSeconds)
                            : sentEmail === trimmedEmail
                              ? '재발송'
                              : '인증번호 발송'}
                      </Button>
                    </div>
                  </FormField>
                  {sentEmail === trimmedEmail && verifiedEmail?.email !== trimmedEmail && (
                    <FormField
                      label="이메일 인증번호"
                      errorText={emailConfirmMutation.isError ? emailConfirmError(emailConfirmMutation.error) : undefined}
                      helperText="인증번호가 발송되었습니다. 메일로 받은 6자리 숫자를 입력해주세요."
                      reserveMessage
                    >
                      <div className={styles.inlineField}>
                        <input
                          ref={emailCodeRef}
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          maxLength={6}
                          value={emailCode}
                          onChange={(event) => {
                            setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                            emailConfirmMutation.reset();
                          }}
                          onKeyDown={(event) => handleEnter(event, confirmEmailVerification)}
                          placeholder="000000"
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
                </>
              ) : (
                <div className={styles.readOnlyFields}>
                  <div className={styles.readOnlyItem}>
                    <span className={styles.readOnlyLabel}>닉네임</span>
                    <strong className={styles.readOnlyValue}>{nickname}</strong>
                  </div>
                  <div className={styles.readOnlyItem}>
                    <span className={styles.readOnlyLabel}>
                      이메일
                      <span>비밀번호 찾기에 사용될 수 있습니다</span>
                    </span>
                    <strong className={`${styles.readOnlyValue} ${email ? '' : styles.emptyValue}`}>
                      {email || '등록되지 않았습니다'}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>
        <Panel className={styles.cardPanel}>
          <div className={styles.sectionTitle}>
            <div className={styles.sectionHeading}>
              <KeyRound size={20} />
              <div>
                <h2>비밀번호</h2>
              </div>
            </div>
          </div>
          <div className={styles.form}>
            <FormField label="현재 비밀번호" errorText={fieldErrors.currentPassword}>
              <div className={styles.inlineField}>
                <input
                  autoComplete="off"
                  ref={currentPasswordRef}
                  maxLength={64}
                  name="password-verification-input"
                  readOnly={!currentPasswordInputEnabled}
                  type="password"
                  value={currentPassword}
                  onFocus={() => setCurrentPasswordInputEnabled(true)}
                  onKeyDown={(event) => handleEnter(event, () => runOnce('password-verify', () => verifyMutation.mutateAsync(currentPassword)))}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, currentPassword: undefined }));
                  }}
                  disabled={Boolean(verificationToken)}
                />
                <Button
                  variant="secondary"
                  onClick={() => runOnce('password-verify', () => verifyMutation.mutateAsync(currentPassword))}
                  disabled={Boolean(verificationToken) || verifyMutation.isPending}
                >
                  비밀번호 확인
                </Button>
              </div>
            </FormField>
            {!verificationToken ? (
              null
            ) : (
              <>
                <FormField label="새 비밀번호" errorText={fieldErrors.newPassword}>
                  <input
                    autoComplete="new-password"
                    ref={newPasswordRef}
                    maxLength={64}
                    name="new-password"
                    type="password"
                    value={newPassword}
                    onKeyDown={(event) => handleEnter(event, () => runOnce('password-change', () => passwordMutation.mutateAsync()))}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setFieldErrors((current) => ({ ...current, newPassword: undefined }));
                    }}
                  />
                </FormField>
                <div className={styles.actions}>
                  <Button onClick={() => runOnce('password-change', () => passwordMutation.mutateAsync())} disabled={passwordMutation.isPending}>
                    확인
                  </Button>
                </div>
              </>
            )}
          </div>
        </Panel>
        <Panel className={styles.dangerPanel}>
          <div className={styles.sectionTitle}>
            <div className={styles.sectionHeading}>
              <Shield size={20} />
              <div>
                <h2>계정 관리</h2>
                <p>
                  탈퇴하면 계정 이용이 종료되며 다시 복구할 수 없습니다.
                  {'\n'}작성한 맵과 댓글은 남을 수 있고, 작성자 정보는 탈퇴한 사용자로 표시됩니다.
                </p>
              </div>
            </div>
          </div>
          <div className={styles.actions}>
            <Button
              icon={<Trash2 size={17} />}
              variant="danger"
              onClick={() => setDeleteOpen(true)}
            >
              회원 탈퇴
            </Button>
          </div>
        </Panel>
      </div>
      <Modal
        open={navigationBlocker.state === 'blocked'}
        title="수정 중인 내용 버리기"
        onClose={() => navigationBlocker.reset?.()}
        footer={
          <>
            <Button variant="secondary" onClick={() => navigationBlocker.reset?.()}>
              계속 수정
            </Button>
            <Button variant="danger" onClick={() => navigationBlocker.proceed?.()}>
              나가기
            </Button>
          </>
        }
      >
        <p className="muted">저장하지 않은 변경 내용은 사라집니다.</p>
      </Modal>
      <Modal
        open={deleteOpen}
        title="회원 탈퇴"
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              취소
            </Button>
            <Button icon={<Trash2 size={17} />} variant="danger" disabled={deleteMutation.isPending} onClick={() => runOnce('account-delete', () => deleteMutation.mutateAsync())}>
              탈퇴
            </Button>
          </>
        }
      >
        <p className="muted">
          탈퇴하면 계정 이용이 종료되며 다시 복구할 수 없습니다.
          {'\n'}작성한 맵과 댓글은 남을 수 있고, 작성자 정보는 탈퇴한 사용자로 표시됩니다.
        </p>
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

function GuestMyPage() {
  const auth = useAuth();
  const runOnce = useSingleFlight();
  const [nickname, setNickname] = useState(auth.user?.nickname ?? '');
  const [nicknameError, setNicknameError] = useState('');
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const trimmedNickname = nickname.trim();
  const nicknameChanged = trimmedNickname !== (auth.user?.nickname ?? '');

  useEffect(() => {
    setNickname(auth.user?.nickname ?? '');
    setNicknameError('');
  }, [auth.user?.nickname]);

  const nicknameMutation = useMutation({
    mutationFn: async () => {
      const error = getNicknameError(nickname);
      if (error) {
        setNicknameError(error);
        nicknameRef.current?.focus();
        throw new Error('form:nickname');
      }
      await auth.changeGuestNickname({ nickname: trimmedNickname });
    },
    onSuccess: () => {
      setNotice({ title: '닉네임 변경 완료', message: '새 게스트 닉네임을 적용했습니다.' });
    },
    onError: (error) => {
      if (error instanceof Error && error.message.startsWith('form:')) return;
      setNotice({ title: '닉네임 변경 실패', message: '닉네임 조건을 확인한 뒤 다시 시도해주세요.' });
    },
  });

  return (
    <section className={styles.shell}>
      <PageHeader title="내 정보" />
      <div className={styles.grid}>
        <Panel className={styles.cardPanel}>
          <div className={styles.sectionTitle}>
            <div className={styles.sectionHeading}>
              <UserRound size={20} />
              <div>
                <h2>게스트 프로필</h2>
                <p>게스트는 닉네임만 변경할 수 있습니다.</p>
              </div>
            </div>
            <span className={styles.guestLabel}>게스트</span>
          </div>
          <div className={styles.profileLayout}>
            <div className={styles.profileImageField}>
              <UserAvatar nickname={auth.user?.nickname ?? nickname} imageUrl={null} size="lg" userType={auth.userType} />
            </div>
            <div className={`${styles.form} ${styles.profileForm}`}>
              <FormField
                label="닉네임"
                errorText={nicknameError}
                helperText="다른 게스트와 같은 닉네임을 사용할 수 있습니다."
                counterText={remainingText(nickname, 12)}
                reserveMessage
              >
                <input
                  ref={nicknameRef}
                  maxLength={12}
                  value={nickname}
                  onKeyDown={(event) => handleGuestNicknameEnter(event, () => runOnce('guest-nickname-save', () => nicknameMutation.mutateAsync()))}
                  onChange={(event) => {
                    setNickname(event.target.value);
                    setNicknameError('');
                  }}
                />
              </FormField>
              <div className={styles.actions}>
                <Button
                  icon={<Save size={17} />}
                  disabled={!nicknameChanged || nicknameMutation.isPending}
                  onClick={() => runOnce('guest-nickname-save', () => nicknameMutation.mutateAsync())}
                >
                  닉네임 저장
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
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

function handleGuestNicknameEnter(event: KeyboardEvent<HTMLInputElement>, action: () => void) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  action();
}

function getNicknameError(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return '닉네임은 2자 이상 입력해주세요.';
  if (trimmed.length > 12) return '닉네임은 12자 이하로 입력해주세요.';
  if (!/^[가-힣A-Za-z0-9_]+$/.test(trimmed)) return '한글, 영문, 숫자, 언더스코어만 사용할 수 있습니다.';
  return '';
}

function getPasswordError(value: string) {
  if (value.length < 8) return '8자 이상 입력해주세요.';
  if (value.length > 64) return '64자 이하로 입력해주세요.';
  if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).+$/.test(value)) return '영문, 숫자, 특수문자를 포함해주세요.';
  return '';
}

function getEmailError(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 254) return '이메일은 254자 이하로 입력해주세요.';
  if (!EMAIL_PATTERN.test(trimmed)) return '이메일 형식을 확인해주세요.';
  return '';
}

function profileNicknameHelperText(
  checked: { value: string; available: boolean } | null,
  value: string,
  changed: boolean,
  pending: boolean,
) {
  if (!changed) return undefined;
  const formatError = getNicknameError(value);
  if (formatError) return formatError;
  if (pending && checked?.value !== value) return '확인 중입니다.';
  if (checked?.value !== value) return undefined;
  return checked.available ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.';
}

function profileNicknameHelperTone(
  checked: { value: string; available: boolean } | null,
  value: string,
  changed: boolean,
) {
  if (!changed) return 'neutral';
  if (getNicknameError(value)) return 'danger';
  if (checked?.value !== value) return 'neutral';
  return checked.available ? 'success' : 'danger';
}

function profileEmailHelperText(
  currentEmail: string,
  normalizedEmail: string,
  changed: boolean,
  sentEmail: string | null,
  verifiedEmail: { email: string; token: string } | null,
  sending: boolean,
  sendError: unknown,
) {
  if (!changed) return '현재 등록된 이메일입니다.';
  if (!currentEmail.trim()) return '등록된 이메일은 삭제할 수 없습니다.';
  const error = getEmailError(currentEmail);
  if (error) return error;
  if (verifiedEmail?.email === normalizedEmail) return '새 이메일 인증이 완료되었습니다.';
  if (sending) return '인증번호를 발송하고 있습니다.';
  if (sendError) return emailSendError(sendError);
  if (sentEmail === normalizedEmail) return '인증번호를 발송했습니다. 재발송하면 이전 번호는 사용할 수 없습니다.';
  return '새 이메일은 인증번호 확인이 필요합니다.';
}

function profileEmailHelperTone(
  currentEmail: string,
  normalizedEmail: string,
  changed: boolean,
  verifiedEmail: { email: string; token: string } | null,
  sendFailed: boolean,
) {
  if (!changed) return 'neutral';
  if (!currentEmail.trim()) return 'danger';
  if (getEmailError(currentEmail) || sendFailed) return 'danger';
  return verifiedEmail?.email === normalizedEmail ? 'success' : 'neutral';
}

function emailSendError(error: unknown) {
  const message = toApiErrorMessage(error);
  if (message === 'duplicate_email') return '이미 사용 중인 이메일입니다.';
  if (message === 'email_already_verified') return '이미 인증된 이메일입니다.';
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function remainingText(value: string, max: number) {
  return `${value.length}/${max}`;
}
