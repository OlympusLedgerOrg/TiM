import { Request, Response, NextFunction } from 'express';
import { httpsRedirect } from '../src/middleware/httpsRedirect';

function mockReqResNext(overrides: Partial<Request> = {}) {
  const req = {
    headers: {},
    protocol: 'http',
    originalUrl: '/test',
    ...overrides,
  } as unknown as Request;

  const res = {
    redirect: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  } as unknown as Response;

  const next = jest.fn() as NextFunction;

  return { req, res, next };
}

describe('httpsRedirect middleware', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalDisable = process.env.DISABLE_HTTPS_REDIRECT;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalDisable !== undefined) {
      process.env.DISABLE_HTTPS_REDIRECT = originalDisable;
    } else {
      delete process.env.DISABLE_HTTPS_REDIRECT;
    }
  });

  test('skips redirect in non-production environment', () => {
    process.env.NODE_ENV = 'test';
    const { req, res, next } = mockReqResNext();
    httpsRedirect(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('skips redirect when DISABLE_HTTPS_REDIRECT is true', () => {
    process.env.NODE_ENV = 'production';
    process.env.DISABLE_HTTPS_REDIRECT = 'true';
    const { req, res, next } = mockReqResNext();
    httpsRedirect(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('redirects HTTP to HTTPS in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DISABLE_HTTPS_REDIRECT;
    const { req, res, next } = mockReqResNext({
      headers: { host: 'example.com' } as any,
      protocol: 'http',
      originalUrl: '/api/test',
    });
    httpsRedirect(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/api/test');
    expect(next).not.toHaveBeenCalled();
  });

  test('redirects based on x-forwarded-proto header', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DISABLE_HTTPS_REDIRECT;
    const { req, res, next } = mockReqResNext({
      headers: { host: 'example.com', 'x-forwarded-proto': 'http' } as any,
      protocol: 'https', // protocol is https but forwarded proto says http
      originalUrl: '/test',
    });
    httpsRedirect(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/test');
  });

  test('sets HSTS header for HTTPS requests in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DISABLE_HTTPS_REDIRECT;
    const { req, res, next } = mockReqResNext({
      headers: { 'x-forwarded-proto': 'https' } as any,
      protocol: 'https',
    });
    httpsRedirect(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  });
});
