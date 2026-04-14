import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FioriDashboard from './components/FioriDashboard';
import CompleteStepForm from './components/CompleteStepForm';
import StationDashboard from './components/StationDashboard';
import AndonBoard from './components/AndonBoard';
import SupervisorDashboard from './components/SupervisorDashboard';
import InstallPromptBanner from './components/InstallPromptBanner';
import './styles/fiori.css';

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
 * Supervisors → /supervisor
 * Admins → all routes
 * Andon → public, no auth required
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
  if (!role) return <Navigate to="/station" replace />;
  if (!allowed.includes(role)) return <Navigate to="/station" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
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

        {/* Dashboard: Fiori overview */}
        <Route path="/dashboard" element={<FioriDashboard />} />

        {/* Home: redirect to dashboard */}
        <Route path="/" element={<FioriDashboard />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* PWA install prompt — shown on all routes */}
      <InstallPromptBanner />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

