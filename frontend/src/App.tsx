import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom'
import * as authApi from './api/auth'
import { FullPageLoading } from './components/Loading'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import AppLayout from './layouts/AppLayout'
import { useAuthStore } from './store/authStore'

// 路由级懒加载（按页面分包）
const SetupPage = lazy(() => import('./pages/setup'))
const LoginPage = lazy(() => import('./pages/login'))
const HomePage = lazy(() => import('./pages/app/Home'))
const FavoritesPage = lazy(() => import('./pages/app/Favorites'))
const SpacePage = lazy(() => import('./pages/app/SpacePage'))
const PageViewPage = lazy(() => import('./pages/app/PageView'))
const EmbedEditorPage = lazy(() => import('./pages/app/EmbedEditor'))
const StatsPage = lazy(() => import('./pages/app/StatsPage'))
const TrashPage = lazy(() => import('./pages/app/TrashPage'))
const DraftsPage = lazy(() => import('./pages/app/DraftsPage'))
const TemplatesPage = lazy(() => import('./pages/app/TemplatesPage'))
const AdminUsersPage = lazy(() => import('./pages/admin/Users'))
const AdminGroupsPage = lazy(() => import('./pages/admin/Groups'))
const AdminOperationsPage = lazy(() => import('./pages/admin/Operations'))
const AdminLicensePage = lazy(() => import('./pages/admin/LicensePage'))
const AdminWebhooksPage = lazy(() => import('./pages/admin/WebhooksPage'))
const AdminApiKeysPage = lazy(() => import('./pages/admin/ApiKeysPage'))

/** 已登录访问登录页时重定向到 /app */
function GuestOnly({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  if (token) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** 未登录访问受保护路由时重定向到 /login（记录来源以便登录后回跳） */
function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  const location = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}

/** 仅管理员（role=1）可访问管理后台，否则回 /app */
function RequireAdmin({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role)
  if (role !== 1) return <Navigate to="/app" replace />
  return <>{children}</>
}

/**
 * 顶层门卫：
 * - 系统未初始化时，任何路由都跳转 /setup
 * - 已初始化后，/setup 不再可达
 */
function AppGate() {
  const [ready, setReady] = useState(false)
  const [initialized, setInitialized] = useState(true)
  const { pathname } = useLocation()

  useEffect(() => {
    let alive = true
    authApi
      .getSetupStatus()
      .then((s) => {
        if (!alive) return
        setInitialized(s.initialized)
        setReady(true)
      })
      .catch(() => {
        // 后端不可达时按已初始化处理，避免卡死在加载页
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  if (!ready) return <FullPageLoading />
  if (!initialized && pathname !== '/setup') return <Navigate to="/setup" replace />
  if (initialized && pathname === '/setup') return <Navigate to="/app" replace />

  return (
    <>
      <ToastHost />
      <UpdateBanner />
      <Suspense fallback={<FullPageLoading />}>
        <Outlet />
      </Suspense>
    </>
  )
}

// 路由表集中定义
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppGate />,
    children: [
      { index: true, element: <Navigate to="/app" replace /> },
      { path: 'setup', element: <SetupPage /> },
      {
        path: 'login',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: 'app',
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: 'favorites', element: <FavoritesPage /> },
          { path: 'drafts', element: <DraftsPage /> },
          { path: 'templates', element: <TemplatesPage /> },
          { path: 'space/:spaceId', element: <SpacePage /> },
          { path: 'space/:spaceId/stats', element: <StatsPage /> },
          { path: 'space/:spaceId/trash', element: <TrashPage /> },
          // 阅读态与编辑态分路径：…/page/:nodeId 为阅读（预览），…/page/:nodeId/edit 为编辑
          { path: 'space/:spaceId/page/:nodeId', element: <PageViewPage /> },
          { path: 'space/:spaceId/page/:nodeId/edit', element: <PageViewPage /> },
          {
            path: 'space/:spaceId/page/:nodeId/embed/:embedId',
            element: <EmbedEditorPage />,
          },
        ],
      },
      {
        path: 'admin/users',
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          </RequireAuth>
        ),
      },
      {
        path: 'admin/groups',
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminGroupsPage />
            </RequireAdmin>
          </RequireAuth>
        ),
      },
      {
        path: 'admin/operations',
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminOperationsPage />
            </RequireAdmin>
          </RequireAuth>
        ),
      },
      {
        path: 'admin/license',
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminLicensePage />
            </RequireAdmin>
          </RequireAuth>
        ),
      },
      {
        path: 'admin/webhooks',
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminWebhooksPage />
            </RequireAdmin>
          </RequireAuth>
        ),
      },
      {
        path: 'admin/apikeys',
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminApiKeysPage />
            </RequireAdmin>
          </RequireAuth>
        ),
      },
      { path: '*', element: <Navigate to="/app" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
