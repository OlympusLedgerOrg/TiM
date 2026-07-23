export type LoadEventType = 'PUMP_IN' | 'DISPOSAL' | 'ADJUSTMENT';

export class FieldServiceRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FieldServiceRuleError';
  }
}

function assertWholeGallons(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new FieldServiceRuleError('INVALID_GALLONS', `${field} must be a whole number of gallons`);
  }
}

export function calculateAvailableGallons(capacityGallons: number, onboardGallons: number): number {
  assertWholeGallons(capacityGallons, 'capacityGallons');
  assertWholeGallons(onboardGallons, 'onboardGallons');

  if (capacityGallons <= 0) {
    throw new FieldServiceRuleError('INVALID_CAPACITY', 'Truck capacity must be greater than zero');
  }

  if (onboardGallons < 0 || onboardGallons > capacityGallons) {
    throw new FieldServiceRuleError(
      'INVALID_LOAD_STATE',
      'Truck onboard gallons must be between zero and tank capacity',
    );
  }

  return capacityGallons - onboardGallons;
}

export function assertAssignmentCapacity(input: {
  capacityGallons: number;
  onboardGallons: number;
  reservedGallons: number;
  estimatedGallons: number;
}): void {
  const { capacityGallons, onboardGallons, reservedGallons, estimatedGallons } = input;
  const availableGallons = calculateAvailableGallons(capacityGallons, onboardGallons);

  assertWholeGallons(reservedGallons, 'reservedGallons');
  assertWholeGallons(estimatedGallons, 'estimatedGallons');

  if (reservedGallons < 0 || estimatedGallons < 0) {
    throw new FieldServiceRuleError('INVALID_RESERVATION', 'Reserved and estimated gallons cannot be negative');
  }

  if (reservedGallons + estimatedGallons > availableGallons) {
    throw new FieldServiceRuleError(
      'TRUCK_CAPACITY_EXCEEDED',
      `Assignment requires ${reservedGallons + estimatedGallons} gallons but only ${availableGallons} gallons remain`,
    );
  }
}

export function applyLoadEvent(input: {
  type: LoadEventType;
  gallons: number;
  capacityGallons: number;
  onboardGallons: number;
}): { deltaGallons: number; resultingOnboardGallons: number } {
  const { type, gallons, capacityGallons, onboardGallons } = input;
  calculateAvailableGallons(capacityGallons, onboardGallons);
  assertWholeGallons(gallons, 'gallons');

  if (type !== 'ADJUSTMENT' && gallons <= 0) {
    throw new FieldServiceRuleError('INVALID_GALLONS', 'Pump and disposal gallons must be greater than zero');
  }

  if (type === 'ADJUSTMENT' && gallons === 0) {
    throw new FieldServiceRuleError('INVALID_GALLONS', 'Adjustment gallons cannot be zero');
  }

  const deltaGallons = type === 'DISPOSAL' ? -gallons : gallons;
  const resultingOnboardGallons = onboardGallons + deltaGallons;

  if (resultingOnboardGallons < 0) {
    throw new FieldServiceRuleError(
      'DISPOSAL_EXCEEDS_LOAD',
      `Cannot dispose ${gallons} gallons when the truck contains ${onboardGallons}`,
    );
  }

  if (resultingOnboardGallons > capacityGallons) {
    throw new FieldServiceRuleError(
      'TRUCK_CAPACITY_EXCEEDED',
      `Load would reach ${resultingOnboardGallons} gallons on a ${capacityGallons}-gallon truck`,
    );
  }

  return { deltaGallons, resultingOnboardGallons };
}

export function assertCompletionEvidence(input: {
  actualGallons: number;
  technicianComments: string;
  requiredEvidence: string[];
  capturedEvidence: string[];
}): void {
  const { actualGallons, technicianComments, requiredEvidence, capturedEvidence } = input;
  assertWholeGallons(actualGallons, 'actualGallons');

  if (actualGallons <= 0) {
    throw new FieldServiceRuleError('INVALID_ACTUAL_GALLONS', 'Actual gallons must be greater than zero');
  }

  if (technicianComments.trim().length < 3) {
    throw new FieldServiceRuleError(
      'TECHNICIAN_COMMENTS_REQUIRED',
      'Technician comments are required before completing a work order',
    );
  }

  const captured = new Set(capturedEvidence);
  const missing = [...new Set(requiredEvidence)].filter((type) => !captured.has(type));
  if (missing.length > 0) {
    throw new FieldServiceRuleError(
      'REQUIRED_EVIDENCE_MISSING',
      `Missing required work-order evidence: ${missing.join(', ')}`,
    );
  }
}
