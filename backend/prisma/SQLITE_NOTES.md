# SQLite Compatibility Notes for TiM Desktop

This document describes the considerations for running TiM with SQLite instead of PostgreSQL.

## Schema Compatibility

The main Prisma schema (`schema.prisma`) is designed for PostgreSQL but is **mostly compatible** with SQLite.

### Changes Required for SQLite

1. **Datasource Provider**: Change `postgresql` to `sqlite`
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. **Date Types**: SQLite doesn't have a native Date type
   - `@db.Date` annotation must be removed
   - Dates are stored as TEXT (ISO 8601 strings)
   - The ShiftAssignment.date field uses `@db.Date` in PostgreSQL

3. **Decimal vs Float**: SQLite doesn't support Decimal
   - Consider using Float or storing as INTEGER (cents)
   - Batch.quantity uses Decimal - works but may lose precision

### Automatic Handling

When running in desktop mode with SQLite:
- Prisma automatically handles most type conversions
- The `@db.Date` annotation is ignored for SQLite
- JSON fields are stored as TEXT

### Migration Strategy

For desktop mode:
1. Create a copy of migrations without `@db.Date` annotations
2. Or use `prisma db push` for development (skips migrations)
3. Production: Use pre-built migrations

## Functional Differences

### What Works the Same
- All CRUD operations
- Relations and joins
- Unique constraints
- Default values
- DateTime handling

### What's Different
- No concurrent write support (SQLite locks entire database)
- No array columns (use JSON instead)
- Case-sensitive string comparisons by default
- Limited transaction isolation levels

## Performance Considerations

SQLite is suitable for:
- Single-user desktop applications
- Small to medium data sets (< 10GB)
- Read-heavy workloads

Consider PostgreSQL for:
- Multi-user server deployments
- High write concurrency
- Large datasets

## Data Migration

To migrate data from PostgreSQL to SQLite:
1. Export data using `pg_dump` or Prisma
2. Transform for SQLite compatibility
3. Import using SQLite tools or Prisma seeding

## Configuration

Desktop mode automatically:
- Sets `DATABASE_URL` to SQLite file path
- Stores database in app data directory
- Handles migrations on startup
