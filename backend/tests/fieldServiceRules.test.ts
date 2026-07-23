import {
  applyLoadEvent,
  assertAssignmentCapacity,
  assertCompletionEvidence,
  calculateAvailableGallons,
  FieldServiceRuleError,
} from '../src/services/fieldServiceRules';

function expectRule(code: string) {
  return expect.objectContaining({ code });
}

describe('field-service gallon and evidence rules', () => {
  test('calculates remaining truck capacity', () => {
    expect(calculateAvailableGallons(3000, 1250)).toBe(1750);
  });

  test('rejects invalid truck capacity and load projections', () => {
    expect(() => calculateAvailableGallons(0, 0)).toThrow(expectRule('INVALID_CAPACITY'));
    expect(() => calculateAvailableGallons(3000, -1)).toThrow(expectRule('INVALID_LOAD_STATE'));
    expect(() => calculateAvailableGallons(3000, 3001)).toThrow(expectRule('INVALID_LOAD_STATE'));
    expect(() => calculateAvailableGallons(3000.5, 0)).toThrow(expectRule('INVALID_GALLONS'));
  });

  test('accepts a capacity-safe assignment', () => {
    expect(() => assertAssignmentCapacity({
      capacityGallons: 3000,
      onboardGallons: 1000,
      reservedGallons: 500,
      estimatedGallons: 1000,
    })).not.toThrow();
  });

  test('rejects an assignment that overbooks remaining truck capacity', () => {
    expect(() => assertAssignmentCapacity({
      capacityGallons: 3000,
      onboardGallons: 1500,
      reservedGallons: 900,
      estimatedGallons: 700,
    })).toThrow(expectRule('TRUCK_CAPACITY_EXCEEDED'));
  });

  test('rejects negative or fractional reservation inputs', () => {
    expect(() => assertAssignmentCapacity({
      capacityGallons: 3000,
      onboardGallons: 0,
      reservedGallons: -1,
      estimatedGallons: 100,
    })).toThrow(expectRule('INVALID_RESERVATION'));
    expect(() => assertAssignmentCapacity({
      capacityGallons: 3000,
      onboardGallons: 0,
      reservedGallons: 0,
      estimatedGallons: 1.5,
    })).toThrow(expectRule('INVALID_GALLONS'));
  });

  test('records pumped gallons as a positive load event', () => {
    expect(applyLoadEvent({
      type: 'PUMP_IN',
      gallons: 850,
      capacityGallons: 3000,
      onboardGallons: 1200,
    })).toEqual({
      deltaGallons: 850,
      resultingOnboardGallons: 2050,
    });
  });

  test('records disposal as a negative load event', () => {
    expect(applyLoadEvent({
      type: 'DISPOSAL',
      gallons: 1800,
      capacityGallons: 3000,
      onboardGallons: 2200,
    })).toEqual({
      deltaGallons: -1800,
      resultingOnboardGallons: 400,
    });
  });

  test('supports signed adjustments while rejecting zero adjustments', () => {
    expect(applyLoadEvent({
      type: 'ADJUSTMENT',
      gallons: -200,
      capacityGallons: 3000,
      onboardGallons: 1000,
    })).toEqual({ deltaGallons: -200, resultingOnboardGallons: 800 });

    expect(() => applyLoadEvent({
      type: 'ADJUSTMENT',
      gallons: 0,
      capacityGallons: 3000,
      onboardGallons: 1000,
    })).toThrow(expectRule('INVALID_GALLONS'));
  });

  test('rejects invalid pump, disposal, underflow, and overfill events', () => {
    expect(() => applyLoadEvent({
      type: 'PUMP_IN',
      gallons: 0,
      capacityGallons: 3000,
      onboardGallons: 1000,
    })).toThrow(expectRule('INVALID_GALLONS'));

    expect(() => applyLoadEvent({
      type: 'DISPOSAL',
      gallons: 1600,
      capacityGallons: 3000,
      onboardGallons: 1200,
    })).toThrow(expectRule('DISPOSAL_EXCEEDS_LOAD'));

    expect(() => applyLoadEvent({
      type: 'PUMP_IN',
      gallons: 500,
      capacityGallons: 3000,
      onboardGallons: 2800,
    })).toThrow(expectRule('TRUCK_CAPACITY_EXCEEDED'));
  });

  test('requires positive actual gallons and meaningful technician comments', () => {
    expect(() => assertCompletionEvidence({
      actualGallons: 0,
      technicianComments: 'Done',
      requiredEvidence: [],
      capturedEvidence: [],
    })).toThrow(expectRule('INVALID_ACTUAL_GALLONS'));

    expect(() => assertCompletionEvidence({
      actualGallons: 100,
      technicianComments: '  ',
      requiredEvidence: [],
      capturedEvidence: [],
    })).toThrow(expectRule('TECHNICIAN_COMMENTS_REQUIRED'));
  });

  test('requires every configured photo type and accepts complete evidence', () => {
    expect(() => assertCompletionEvidence({
      actualGallons: 900,
      technicianComments: 'Pumped and inspected both compartments.',
      requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
      capturedEvidence: ['BEFORE_SERVICE'],
    })).toThrow(expectRule('REQUIRED_EVIDENCE_MISSING'));

    expect(() => assertCompletionEvidence({
      actualGallons: 900,
      technicianComments: 'Pumped and inspected both compartments.',
      requiredEvidence: ['BEFORE_SERVICE', 'BEFORE_SERVICE', 'AFTER_SERVICE'],
      capturedEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
    })).not.toThrow();
  });
});
