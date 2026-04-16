import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import InstallPromptBanner from './components/InstallPromptBanner';
import OfflineBanner from './components/OfflineBanner';
import './styles/fiori.css';

// ─── Lazy-loaded route components (code splitting) ──────────────────────────
const FioriDashboard = lazy(() => import('./components/FioriDashboard'));
const StationDashboard = lazy(() => import('./components/StationDashboard'));
const AndonBoard = lazy(() => import('./components/AndonBoard'));
const SupervisorDashboard = lazy(() => import('./components/SupervisorDashboard'));
const ManagementDashboard = lazy(() => import('./components/ManagementDashboard'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const ShiftReportViewer = lazy(() => import('./components/ShiftReportViewer'));

// Set SAP Fiori theme
import '@ui5/webcomponents/dist/Assets.js';
import '@ui5/webcomponents-fiori/dist/Assets.js';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

// Use SAP Horizon theme (modern Fiori look)
setTheme('sap_horizon');

/**
 * Role-based route guard
 * Reads the JWT role from localStorage to determine access.
 * Floor workers (Tech) → /station
 * Supervisors → /supervisor, /management
 * Admins → all routes including /admin
 * Andon → public, no auth required
 * Login → public, for supervisors/managers
 */
function getRole(): string | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

function RequireRole({ allowed, children }: { allowed: string[]; children: React.ReactNode }) {
  const role = getRole();
  if (!role) return <Navigate to="/login" replace />;
  if (!allowed.includes(role)) return <Navigate to="/station" replace />;
  return <>{children}</>;
}

/** Loading spinner for lazy-loaded route transitions */
function RouteLoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
      fontFamily: "'72', Arial, sans-serif",
      color: '#6a6d70',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
        <div>Loading…</div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            {/* Public: Login page for supervisors/managers */}
            <Route path="/login" element={<LoginPage />} />

            {/* Public: Andon board — no auth, read-only for wall-mounted TVs */}
            <Route path="/andon" element={<AndonBoard />} />

            {/* Operator: Station dashboard — Tech, Supervisor, Admin */}
            <Route path="/station" element={<StationDashboard />} />
            <Route path="/station/:workCenter" element={<StationDashboard />} />

            {/* Supervisor: Shift lead dashboard */}
            <Route
              path="/supervisor"
              element={
                <RequireRole allowed={['Supervisor', 'Admin']}>
                  <SupervisorDashboard />
                </RequireRole>
              }
            />

            {/* Management: Plant-wide analytics dashboard (Admin only) */}
            <Route
              path="/management"
              element={
                <RequireRole allowed={['Admin']}>
                  <ManagementDashboard />
                </RequireRole>
              }
            />

            {/* Shift Reports: Auto-generated shift summaries */}
            <Route
              path="/shift-report"
              element={
                <RequireRole allowed={['Supervisor', 'Admin']}>
                  <ShiftReportViewer />
                </RequireRole>
              }
            />

            {/* Admin: Operator management panel */}
            <Route
              path="/admin"
              element={
                <RequireRole allowed={['Admin']}>
                  <AdminPanel />
                </RequireRole>
              }
            />

            {/* Dashboard: Fiori overview */}
            <Route path="/dashboard" element={<FioriDashboard />} />

            {/* Home: redirect to dashboard */}
            <Route path="/" element={<FioriDashboard />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>

        {/* Global offline indicator — shown on all routes */}
        <OfflineBanner />

        {/* PWA install prompt — shown on all routes */}
        <InstallPromptBanner />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
