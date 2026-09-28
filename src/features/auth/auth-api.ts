import { jsonBody, apiRequest } from '@/shared/api/http-client';
import { UserType } from '@/entities/user';

export type LoginRequest = {
  loginId: string;
  password: string;
};

export type LoginResponse = {
  userId: number;
  accessToken: string;
};

export type GuestLoginRequest = {
  nickname: string;
};

export type GuestLoginResponse = {
  userId: number;
  userType: UserType;
  nickname: string;
  accessToken: string;
};

export type SignupRequest = {
  loginId: string;
  password: string;
  passwordConfirm: string;
  nickname: string;
  email?: string | null;
  emailVerificationToken?: string | null;
};

export type EmailVerificationSentResponse = {
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
};

export type EmailVerificationConfirmedResponse = {
  emailVerificationToken: string;
  expiresInSeconds: number;
};

export type LoginIdRecoveryResponse = {
  loginId: string;
};

export type PasswordResetConfirmedResponse = EmailVerificationConfirmedResponse & {
  loginId: string;
};

export type PasswordResetIdentity = {
  loginId: string;
  email: string;
};

export type ResetPasswordRequest = {
  loginId: string;
  email: string;
  emailVerificationToken: string;
  password: string;
  passwordConfirm: string;
};

export const authApi = {
  sendSignupEmailVerification(email: string) {
    return apiRequest<EmailVerificationSentResponse>('/api/auth/email-verifications', {
      method: 'POST',
      auth: 'none',
      body: jsonBody({ email }),
    });
  },
  confirmSignupEmailVerification(email: string, code: string) {
    return apiRequest<EmailVerificationConfirmedResponse>('/api/auth/email-verifications/confirm', {
      method: 'POST',
      auth: 'none',
      body: jsonBody({ email, code }),
    });
  },
  sendLoginIdRecoveryEmail(email: string) {
    return apiRequest<EmailVerificationSentResponse>('/api/auth/login-id-recovery/email-verifications', {
      method: 'POST',
      auth: 'none',
      body: jsonBody({ email }),
    });
  },
  confirmLoginIdRecoveryEmail(email: string, code: string) {
    return apiRequest<LoginIdRecoveryResponse>('/api/auth/login-id-recovery/email-verifications/confirm', {
      method: 'POST',
      auth: 'none',
      body: jsonBody({ email, code }),
    });
  },
  sendPasswordResetEmail(body: PasswordResetIdentity) {
    return apiRequest<EmailVerificationSentResponse>('/api/auth/password-reset/email-verifications', {
      method: 'POST',
      auth: 'none',
      body: jsonBody(body),
    });
  },
  confirmPasswordResetEmail(body: PasswordResetIdentity & { code: string }) {
    return apiRequest<PasswordResetConfirmedResponse>('/api/auth/password-reset/email-verifications/confirm', {
      method: 'POST',
      auth: 'none',
      body: jsonBody(body),
    });
  },
  resetPassword(body: ResetPasswordRequest) {
    return apiRequest<null>('/api/auth/password-reset', {
      method: 'POST',
      auth: 'none',
      body: jsonBody(body),
    });
  },
  signup(body: SignupRequest) {
    return apiRequest<null>('/api/auth/signup', {
      method: 'POST',
      auth: 'none',
      body: jsonBody(body),
    });
  },
  login(body: LoginRequest) {
    return apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      auth: 'none',
      credentials: 'include',
      body: jsonBody(body),
      retryOnUnauthorized: false,
    });
  },
  loginGuest(body: GuestLoginRequest) {
    return apiRequest<GuestLoginResponse>('/api/auth/guest', {
      method: 'POST',
      auth: 'none',
      credentials: 'include',
      body: jsonBody(body),
      retryOnUnauthorized: false,
    });
  },
  changeGuestNickname(body: GuestLoginRequest) {
    return apiRequest<GuestLoginResponse>('/api/auth/guest/nickname', {
      method: 'PATCH',
      auth: 'required',
      credentials: 'include',
      body: jsonBody(body),
      retryOnUnauthorized: false,
    });
  },
  logout() {
    return apiRequest<null>('/api/auth/logout', {
      method: 'POST',
      auth: 'required',
      credentials: 'include',
      retryOnUnauthorized: false,
    });
  },
};
