import { PrismaClient } from '@prisma/client';

// Prefer CI/ENV DATABASE_URL; fall back to a local developer DB that exists in CI runs.
// This prevents surprise connections as "root" and keeps local+CI consistent.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://tim:tim@localhost:5432/tim_test';

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});
