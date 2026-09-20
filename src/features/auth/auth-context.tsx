import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { CurrentUser, UserType } from '@/entities/user';
import { queryKeys } from '@/shared/api/query-keys';
import { userApi } from '@/features/user/user-api';
import { authApi, GuestLoginRequest, LoginRequest } from './auth-api';
import { tokenStorage } from './token-storage';

type AuthContextValue = {
  user: CurrentUser | null;
  userId: number | null;
  userType: UserType | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isMember: boolean;
  isBootstrapping: boolean;
  login: (body: LoginRequest) => Promise<void>;
  loginAsGuest: (body: GuestLoginRequest) => Promise<void>;
  changeGuestNickname: (body: GuestLoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearAuth: () => void;
  refreshMe: () => Promise<CurrentUser | undefined>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [storedAuth, setStoredAuth] = useState(() => tokenStorage.read());
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    return tokenStorage.subscribe(() => {
      const nextAuth = tokenStorage.read();
      setStoredAuth(nextAuth);
      if (nextAuth?.accessToken) setLoggedOut(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    });
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: userApi.me,
    retry: false,
  });

  const clearAuth = () => {
    tokenStorage.clear();
    setStoredAuth(null);
    setLoggedOut(true);
    queryClient.removeQueries({ queryKey: queryKeys.me });
  };

  const value = useMemo<AuthContextValue>(
    () => {
      const user = loggedOut ? null : meQuery.data ?? null;
      const userType = loggedOut ? null : meQuery.data?.userType ?? storedAuth?.userType ?? null;

      const storeSession = async (session: {
        accessToken: string;
        userId: number;
        userType: UserType;
        nickname: string | null;
      }) => {
        setLoggedOut(false);
        tokenStorage.write(session);
        setStoredAuth(session);
        await queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: userApi.me });
      };

      return {
        user,
        userId: loggedOut ? null : meQuery.data?.userId ?? storedAuth?.userId ?? null,
        userType,
        isAuthenticated: !loggedOut && Boolean(meQuery.data ?? storedAuth?.accessToken),
        isGuest: userType === 'GUEST',
        isMember: userType === 'MEMBER',
        isBootstrapping: meQuery.isLoading,
        async login(body) {
          const result = await authApi.login(body);
          await storeSession({
            accessToken: result.accessToken,
            userId: result.userId,
            userType: 'MEMBER',
            nickname: null,
          });
        },
        async loginAsGuest(body) {
          const result = await authApi.loginGuest(body);
          await storeSession({
            accessToken: result.accessToken,
            userId: result.userId,
            userType: result.userType,
            nickname: result.nickname,
          });
        },
        async changeGuestNickname(body) {
          const result = await authApi.changeGuestNickname(body);
          await storeSession({
            accessToken: result.accessToken,
            userId: result.userId,
            userType: result.userType,
            nickname: result.nickname,
          });
        },
        async logout() {
          try {
            await authApi.logout();
          } finally {
            tokenStorage.clear();
            setStoredAuth(null);
            setLoggedOut(true);
            queryClient.setQueryData(queryKeys.me, null);
            queryClient.removeQueries({ queryKey: queryKeys.me });
            await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
          }
        },
        clearAuth,
        refreshMe() {
          return queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: userApi.me });
        },
      };
    },
    [loggedOut, meQuery.data, meQuery.isLoading, queryClient, storedAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
