import { AppError } from '../src/errors/AppError';

describe('AppError', () => {
  test('uses safe internal defaults and preserves context', () => {
    const error = new AppError('boom', undefined, undefined, {
      context: { operation: 'dispatch' },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.status).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.isOperational).toBe(false);
    expect(error.context).toEqual({ operation: 'dispatch' });
    expect(error.stack).toEqual(expect.any(String));
  });

  test.each([
    ['badRequest', AppError.badRequest('bad', 'BAD_INPUT'), 400, 'BAD_INPUT', true],
    ['unauthorized', AppError.unauthorized(), 401, 'UNAUTHORIZED', true],
    ['forbidden', AppError.forbidden(), 403, 'FORBIDDEN', true],
    ['notFound', AppError.notFound(), 404, 'NOT_FOUND', true],
    ['conflict', AppError.conflict('conflict'), 409, 'CONFLICT', true],
    ['internal', AppError.internal(), 500, 'INTERNAL_ERROR', false],
  ])('%s creates the expected structured error', (_name, error, status, code, operational) => {
    expect(error).toMatchObject({ status, code, isOperational: operational });
  });

  test('allows callers to override operational classification', () => {
    expect(new AppError('retry later', 503, 'DEPENDENCY_DOWN', {
      isOperational: true,
    })).toMatchObject({
      status: 503,
      code: 'DEPENDENCY_DOWN',
      isOperational: true,
    });
  });
});
