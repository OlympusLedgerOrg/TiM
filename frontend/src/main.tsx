import React from 'react';
import { createRoot } from 'react-dom/client';
import FioriDashboard from './components/FioriDashboard';
import CompleteStepForm from './components/CompleteStepForm';
import StationDashboard from './components/StationDashboard';
import './styles/fiori.css';

// Set SAP Fiori theme
import '@ui5/webcomponents/dist/Assets.js';
import '@ui5/webcomponents-fiori/dist/Assets.js';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

// Use SAP Horizon theme (modern Fiori look)
setTheme('sap_horizon');

function App() {
  const path = window.location.pathname;

  // Station dashboard for operator view — supports /station and /station?wc=MIX-01
  if (path === '/station' || path.startsWith('/station')) {
    return <StationDashboard />;
  }

  // Check if we should show the Fiori dashboard
  const showFioriDashboard = path === '/' || path === '/dashboard';

  return (
    <div className="app">
      {showFioriDashboard ? (
        <FioriDashboard />
      ) : (
        <div className="container">
          <h1>TiM</h1>
          <CompleteStepForm
            workOrderId="demo-wo"
            stepId="demo-step"
            onSuccess={() => alert('Step completed')}
          />
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
