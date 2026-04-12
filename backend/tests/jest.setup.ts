// Ensure NODE_ENV is 'test' before any module is loaded.
// This prevents app.ts from binding to port 4000 during test runs.
process.env.NODE_ENV = 'test';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
