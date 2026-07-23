import {
  applyLoadEvent,
  assertAssignmentCapacity,
  assertCompletionEvidence,
  calculateAvailableGallons,
  FieldServiceRuleError,
} from '../src/services/fieldServiceRules';

describe('field-service gallon and evidence rules', () => {
  test('calculates remaining truck capacity', () => {
    expect(calculateAvailableGallons(3000, 1250)).toBe(1750);
  });

  test('rejects an assignment that overbooks remaining truck capacity', () => {
    expect(() => assertAssignmentCapacity({
      capacityGallons: 3000,
      onboardGallons: 1500,
      reservedGallons: 900,
      estimatedGallons: 700,
    })).toThrow(expect.objectContaining({ code: 'TRUCK_CAPACITY_EXCEEDED' }));
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

  test('rejects disposing more gallons than are onboard', () => {
    expect(() => applyLoadEvent({
      type: 'DISPOSAL',
      gallons: 1600,
      capacityGallons: 3000,
      onboardGallons: 1200,
    })).toThrow(FieldServiceRuleError);
  });

  test('requires technician comments and every configured photo type', () => {
    expect(() => assertCompletionEvidence({
      actualGallons: 900,
      technicianComments: 'Pumped and inspected both compartments.',
      requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
      capturedEvidence: ['BEFORE_SERVICE'],
    })).toThrow(expect.objectContaining({ code: 'REQUIRED_EVIDENCE_MISSING' }));

    expect(() => assertCompletionEvidence({
      actualGallons: 900,
      technicianComments: 'Pumped and inspected both compartments.',
      requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
      capturedEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
    })).not.toThrow();
  });
});
