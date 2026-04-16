const INSECURE_DEFAULT_JWT_SECRET = 'change-me';

export function validateJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret === INSECURE_DEFAULT_JWT_SECRET)) {
    throw new Error('JWT_SECRET must be set to a non-default value in production');
  }
}

export function getJwtSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || INSECURE_DEFAULT_JWT_SECRET);
}
