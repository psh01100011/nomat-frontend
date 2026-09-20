import { UserType } from '@/entities/user';

const ACCESS_TOKEN_KEY = 'nomat.accessToken';
const REFRESH_TOKEN_KEY = 'nomat.refreshToken';
const USER_ID_KEY = 'nomat.userId';
const AUTH_CHANGED_EVENT = 'nomat:auth-changed';

export type StoredAuth = {
  accessToken: string;
  userId: number | null;
  userType: UserType | null;
  nickname: string | null;
};

let memoryAuth: StoredAuth | null = null;

export const tokenStorage = {
  read(): StoredAuth | null {
    clearLegacyLocalStorageTokens();
    return memoryAuth;
  },
  write(auth: StoredAuth) {
    clearLegacyLocalStorageTokens();
    memoryAuth = auth;
    notifyAuthChanged();
  },
  updateAccessToken(accessToken: string) {
    memoryAuth = memoryAuth
      ? { ...memoryAuth, accessToken }
      : { accessToken, userId: null, userType: null, nickname: null };
    notifyAuthChanged();
  },
  clear() {
    memoryAuth = null;
    clearLegacyLocalStorageTokens();
    notifyAuthChanged();
  },
  subscribe(listener: () => void) {
    window.addEventListener(AUTH_CHANGED_EVENT, listener);
    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, listener);
      window.removeEventListener('storage', listener);
    };
  },
};

function clearLegacyLocalStorageTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
