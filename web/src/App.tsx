import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { RunProvider } from './lib'
import { Splash } from './components/Splash'
import LandingPage from './pages/Landing'
import LoginPage from './pages/Login'
import OnboardingPage from './pages/Onboarding'
import DashboardPage from './pages/Dashboard'
import ForecastPage from './pages/Forecast'
import ChangesPage from './pages/Changes'
import RiskPage from './pages/Risk'
import TrustPage from './pages/Trust'
import DataPage from './pages/Data'
import DesignPage from './pages/Design'

function Waiting({ error, retry }: { error?: string; retry?: () => void }) {
  return (
    <div role={error ? 'alert' : 'status'} className="grid min-h-screen place-items-center bg-lime px-4 text-center text-sm text-forest">
      {error ? (
        <div className="space-y-3">
          <p>Your workspace did not load. {error}</p>
          <button type="button" onClick={retry} className="btn-lift">Try again</button>
        </div>
      ) : (
        'Opening your workspace'
      )}
    </div>
  )
}

/**
 * The flow, enforced: signed out -> /login; signed in with no workspace -> /onboarding;
 * workspace with no forecast yet -> /app/data. Everything else goes through.
 */
function Guard({ children, needWorkspace = true }: { children: ReactNode; needWorkspace?: boolean }) {
  const { session, me, loading, error, refresh } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <Waiting />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />
  if (!me) return <Waiting error={error} retry={refresh} />
  if (!needWorkspace) return me.workspace ? <Navigate to="/app" replace /> : <>{children}</>
  if (!me.workspace) return <Navigate to="/onboarding" replace />
  if (!me.workspace.runs && pathname !== '/app/data') return <Navigate to="/app/data" replace />
  return <>{children}</>
}

const app = (el: ReactNode) => <Guard>{el}</Guard>

function Intro() {
  const { loading } = useAuth()
  return <Splash ready={!loading} />
}

export default function App() {
  return (
    <AuthProvider>
      <RunProvider>
        <Intro />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<Guard needWorkspace={false}><OnboardingPage /></Guard>} />
          <Route path="/app" element={app(<DashboardPage />)} />
          <Route path="/app/forecast" element={app(<ForecastPage />)} />
          <Route path="/app/changes" element={app(<ChangesPage />)} />
          <Route path="/app/risk" element={app(<RiskPage />)} />
          <Route path="/app/trust" element={app(<TrustPage />)} />
          <Route path="/app/data" element={app(<DataPage />)} />
          <Route path="/design" element={<DesignPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RunProvider>
    </AuthProvider>
  )
}
