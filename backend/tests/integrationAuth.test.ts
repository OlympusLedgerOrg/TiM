import type { NextFunction, Request, Response } from 'express';
import { requireCallGuardKey } from '../src/middleware/integrationAuth';

function harness(providedKey?: string) {
  const req = {
    header: jest.fn((name: string) => name.toLowerCase() === 'x-callguard-key' ? providedKey : undefined),
  } as unknown as Request;
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next, status, json };
}

describe('Call Guard integration authentication', () => {
  const originalKey = process.env.CALLGUARD_INTEGRATION_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CALLGUARD_INTEGRATION_KEY;
    else process.env.CALLGUARD_INTEGRATION_KEY = originalKey;
  });

  test('fails closed when the integration is not configured', () => {
    delete process.env.CALLGUARD_INTEGRATION_KEY;
    const context = harness('anything');

    requireCallGuardKey(context.req, context.res, context.next);

    expect(context.status).toHaveBeenCalledWith(503);
    expect(context.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CALLGUARD_NOT_CONFIGURED' }));
    expect(context.next).not.toHaveBeenCalled();
  });

  test('rejects missing, wrong, and different-length keys', () => {
    process.env.CALLGUARD_INTEGRATION_KEY = 'correct-secret';

    for (const provided of [undefined, 'wrong-secret', 'x']) {
      const context = harness(provided);
      requireCallGuardKey(context.req, context.res, context.next);
      expect(context.status).toHaveBeenCalledWith(401);
      expect(context.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_INTEGRATION_KEY' }));
      expect(context.next).not.toHaveBeenCalled();
    }
  });

  test('uses a timing-safe comparison and accepts the configured key', () => {
    process.env.CALLGUARD_INTEGRATION_KEY = 'correct-secret';
    const context = harness('correct-secret');

    requireCallGuardKey(context.req, context.res, context.next);

    expect(context.next).toHaveBeenCalledTimes(1);
    expect(context.status).not.toHaveBeenCalled();
  });
});
