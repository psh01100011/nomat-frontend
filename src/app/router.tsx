import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MemberRoute, ProtectedRoute, VerifiedEmailRoute } from '@/features/auth/ProtectedRoute';
import { AppLayout } from '@/widgets/AppLayout';

const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import('@/pages/SignupPage').then((module) => ({ default: module.SignupPage })));
const AccountRecoveryPage = lazy(() =>
  import('@/pages/AccountRecoveryPage').then((module) => ({ default: module.AccountRecoveryPage })),
);
const MapListPage = lazy(() =>
  import('@/pages/MapListPage').then((module) => ({ default: module.MapListPage })),
);
const RoomListPage = lazy(() =>
  import('@/pages/RoomListPage').then((module) => ({ default: module.RoomListPage })),
);
const RoomInvitePage = lazy(() =>
  import('@/pages/RoomInvitePage').then((module) => ({ default: module.RoomInvitePage })),
);
const MyPage = lazy(() => import('@/pages/MyPage').then((module) => ({ default: module.MyPage })));
const RoomPage = lazy(() => import('@/pages/RoomPage').then((module) => ({ default: module.RoomPage })));
const PlayPage = lazy(() => import('@/pages/PlayPage').then((module) => ({ default: module.PlayPage })));
const MyMapsPage = lazy(() =>
  import('@/pages/MyMapsPage').then((module) => ({ default: module.MyMapsPage })),
);
const MapEditorPage = lazy(() =>
  import('@/pages/MapEditorPage').then((module) => ({ default: module.MapEditorPage })),
);

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/maps" replace /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/account-recovery', element: <AccountRecoveryPage /> },
      { path: '/maps', element: <MapListPage /> },
      { path: '/rooms', element: <RoomListPage /> },
      { path: '/rooms/invite/:inviteToken', element: <RoomInvitePage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/me', element: <MyPage /> },
          { path: '/room', element: <RoomPage /> },
          { path: '/play', element: <PlayPage /> },
          {
            element: <MemberRoute />,
            children: [
              { path: '/me/maps', element: <MyMapsPage /> },
              { path: '/maps/:mapId/edit', element: <MapEditorPage /> },
              {
                element: <VerifiedEmailRoute />,
                children: [
                  { path: '/maps/new', element: <MapEditorPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
