import React from 'react';
import { createRoot } from 'react-dom/client';
import CompleteStepForm from './components/CompleteStepForm';

function App() {
  return (
    <div className="container">
      <h1>TiM</h1>
      <CompleteStepForm
        workOrderId="demo-wo"
        stepId="demo-step"
        onSuccess={() => alert('Step completed')}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
