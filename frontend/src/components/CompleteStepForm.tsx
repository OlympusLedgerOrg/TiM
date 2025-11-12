import React, { useState } from 'react';
import { completeWorkOrderStep } from '../services/workOrderService';

type Props = {
  workOrderId: string;
  stepId: string;
  onSuccess?: () => void;
};

export default function CompleteStepForm({ workOrderId, stepId, onSuccess }: Props) {
  const [notes, setNotes] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;

    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      await completeWorkOrderStep({ workOrderId, stepId, notes: notes.trim() || undefined });
      setSuccess(true);
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="step-form" onSubmit={handleSubmit}>
      <label htmlFor="notes" className="step-form__label">
        Notes (optional)
      </label>
      <textarea
        id="notes"
        className="step-form__textarea"
        placeholder="Add context for the next person…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
      />
      {error && <div className="step-form__alert step-form__alert--error">{error}</div>}
      {success && <div className="step-form__alert step-form__alert--success">Step completed.</div>}
      <button
        type="submit"
        className={`step-form__submit-button ${isLoading ? 'step-form__submit-button--loading' : ''}`}
        disabled={isLoading}
      >
        {isLoading ? 'Completing…' : 'Complete Step'}
      </button>
    </form>
  );
}
