import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/Layouts'
import { Loading } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import { ProgressProvider } from './lib/progress'
import Admin from './pages/Admin'
import Dashboard from './pages/Dashboard'
import Genuinity from './pages/Genuinity'
import Home from './pages/Home'
import Host from './pages/Host'
import Label from './pages/Label'
import Leaderboard from './pages/Leaderboard'
import Login from './pages/Login'
import { AuthConfirm, ForgotPassword, ResetPassword } from './pages/Password'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Signup from './pages/Signup'
import Welcome from './pages/Welcome'

/** Signed in and onboarded, or sent to the step that's missing. `admin` also needs the admin flag. */
function RequireUser({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <AppLayout><Loading /></AppLayout>
  if (!session) return <Navigate to="/login" replace />
  if (!profile?.onboarded) return <Navigate to="/welcome" replace />
  if (admin && !profile.is_admin) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <ProgressProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/confirm" element={<AuthConfirm />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<RequireUser><Dashboard /></RequireUser>} />
            <Route path="/label" element={<RequireUser><Label /></RequireUser>} />
            <Route path="/host" element={<RequireUser><Host /></RequireUser>} />
            <Route path="/settings" element={<RequireUser><Settings /></RequireUser>} />
            <Route path="/admin" element={<RequireUser admin><Admin /></RequireUser>} />
            <Route path="/genuinity" element={<RequireUser><Genuinity /></RequireUser>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/u/:username" element={<Profile />} />
            <Route path="/profile" element={<RequireUser><MyProfile /></RequireUser>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ProgressProvider>
    </AuthProvider>
  )
}

function MyProfile() {
  const { profile } = useAuth()
  return <Navigate to={`/u/${profile?.username}`} replace />
}
