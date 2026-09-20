export type UserType = 'MEMBER' | 'GUEST';

export type UserSummary = {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  deleted?: boolean;
};

export type CurrentUser = UserSummary & {
  userType: UserType;
  email: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
};

export type AvailabilityResponse = {
  available: boolean;
};

export type PasswordVerificationResponse = {
  passwordVerificationToken: string;
};
