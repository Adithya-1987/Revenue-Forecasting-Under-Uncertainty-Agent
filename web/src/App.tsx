import { Component, lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { RunProvider } from './lib'
import { Splash } from './components/Splash'
import { FullPageLoader, PageSkeleton, TopProgress } from './components/Loaders'
import { AppShell } from './components/AppShell'
import LandingPage from './pages/Landing'
import LoginPage from './pages/Login'
import NotFoundPage from './pages/NotFound'

// Signed-in screens load on demand; the shell stays up and shows a skeleton meanwhile.
const OnboardingPage = lazy(() => import('./pages/Onboarding'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const ForecastPage = lazy(() => import('./pages/Forecast'))
const ChangesPage = lazy(() => import('./pages/Changes'))
const RiskPage = lazy(() => import('./pages/Risk'))
const TrustPage = lazy(() => import('./pages/Trust'))
const DataPage = lazy(() => import('./pages/Data'))
const DesignPage = lazy(() => import('./pages/Design'))

/**
 * The flow, enforced: signed out -> /login; signed in with no workspace -> /onboarding;
 * workspace with no forecast yet -> /app/data. Everything else goes through.
 */
function Guard({ children, needWorkspace = true }: { children: ReactNode; needWorkspace?: boolean }) {
  const { session, me, loading, error, refresh } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />
  if (!me) return <FullPageLoader error={error} retry={refresh} />
  if (!needWorkspace) return me.workspace ? <Navigate to="/app" replace /> : <>{children}</>
  if (!me.workspace) return <Navigate to="/onboarding" replace />
  if (!me.workspace.runs && pathname !== '/app/data') return <Navigate to="/app/data" replace />
  return <>{children}</>
}

/**
 * Catches render errors and failed lazy-chunk loads (for example after a redeploy or a dev-server
 * restart), so the user sees a way forward instead of a blank page.
 */
class RouteErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunk = /dynamically imported module|Failed to fetch|Loading chunk/i.test(error.message)
    return (
      <FullPageLoader
        error={chunk ? 'A new version of this screen is available. Reload to continue.' : `Something went wrong on this screen. ${error.message}`}
        retry={() => window.location.reload()}
      />
    )
  }
}

const app = (el: ReactNode) => (
  <Guard>
    <AppShell>
      <Suspense fallback={<PageSkeleton label="Loading screen" />}>{el}</Suspense>
    </AppShell>
  </Guard>
)

function Intro() {
  const { loading } = useAuth()
  return <Splash ready={!loading} />
}

export default function App() {
  return (
    <AuthProvider>
      <RunProvider>
        <Intro />
        <TopProgress />
        <RouteErrorBoundary>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<Guard needWorkspace={false}><Suspense fallback={<FullPageLoader label="Preparing setup" />}><OnboardingPage /></Suspense></Guard>} />
          <Route path="/app" element={app(<DashboardPage />)} />
          <Route path="/app/forecast" element={app(<ForecastPage />)} />
          <Route path="/app/changes" element={app(<ChangesPage />)} />
          <Route path="/app/risk" element={app(<RiskPage />)} />
          <Route path="/app/trust" element={app(<TrustPage />)} />
          <Route path="/app/data" element={app(<DataPage />)} />
          <Route path="/design" element={<Suspense fallback={<FullPageLoader label="Loading parts" />}><DesignPage /></Suspense>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </RouteErrorBoundary>
      </RunProvider>
    </AuthProvider>
  )
}
