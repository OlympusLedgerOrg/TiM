export async function completeWorkOrderStep(params: {
  workOrderId: string;
  stepId: string;
  notes?: string;
}): Promise<void> {
  const { workOrderId, stepId, notes } = params;
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Not authenticated. Please sign in.');
  }

  const res = await fetch(
    `/api/v1/work-orders/${encodeURIComponent(workOrderId)}/steps/${encodeURIComponent(stepId)}/complete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes }),
    }
  );

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}
