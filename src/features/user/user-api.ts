import {
  AvailabilityResponse,
  CurrentUser,
  PasswordVerificationResponse,
  UserSummary,
} from '@/entities/user';
import { apiRequest, jsonBody } from '@/shared/api/http-client';

export const userApi = {
  me() {
    return apiRequest<CurrentUser>('/api/users/me');
  },
  getUser(userId: number) {
    return apiRequest<UserSummary>(`/api/users/${userId}`, { auth: 'optional' });
  },
  checkLoginId(loginId: string) {
    return apiRequest<AvailabilityResponse>(
      `/api/users/login-id/availability?loginId=${encodeURIComponent(loginId)}`,
      { auth: 'none' },
    );
  },
  checkNickname(nickname: string) {
    return apiRequest<AvailabilityResponse>(
      `/api/users/nickname/availability?nickname=${encodeURIComponent(nickname)}`,
      { auth: 'none' },
    );
  },
  verifyPassword(password: string) {
    return apiRequest<PasswordVerificationResponse>('/api/users/me/password/verification', {
      method: 'POST',
      body: jsonBody({ password }),
    });
  },
  sendEmailVerification(email: string) {
    return apiRequest<{ expiresInSeconds: number; resendAvailableInSeconds: number }>(
      '/api/users/me/email-verifications',
      { method: 'POST', body: jsonBody({ email }) },
    );
  },
  confirmEmailVerification(email: string, code: string) {
    return apiRequest<{ emailVerificationToken: string; expiresInSeconds: number }>(
      '/api/users/me/email-verifications/confirm',
      { method: 'POST', body: jsonBody({ email, code }) },
    );
  },
  updateProfile(body: {
    nickname?: string | null;
    profileImageAssetId?: number | null;
    email?: string | null;
    emailVerificationToken?: string | null;
  }) {
    return apiRequest<null>('/api/users/me', {
      method: 'PATCH',
      body: jsonBody(body),
    });
  },
  deleteProfileImage() {
    return apiRequest<null>('/api/users/me/profile-image', {
      method: 'DELETE',
    });
  },
  updatePassword(body: { passwordVerificationToken: string; password: string }) {
    return apiRequest<null>('/api/users/me/password', {
      method: 'PATCH',
      body: jsonBody(body),
    });
  },
  deleteMe() {
    return apiRequest<null>('/api/users/me', {
      method: 'DELETE',
    });
  },
};
