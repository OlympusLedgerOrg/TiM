import { getJwtSecret, validateJwtSecret } from '../src/config/jwt';

describe('JWT configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws in production when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    expect(() => validateJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET uses the insecure default', () => {
    process.env.JWT_SECRET = 'change-me';
    process.env.NODE_ENV = 'production';

    expect(() => validateJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('allows test environments to use the test secret', () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';

    expect(() => validateJwtSecret()).not.toThrow();
    expect(getJwtSecret()).toBeInstanceOf(Uint8Array);
  });
});
