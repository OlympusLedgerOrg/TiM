# TiM — Field Service Operations Platform

TiM is being rebuilt as the operational system of record for liquid-waste and environmental field service.

**Call Guard protects the front door. TiM runs everything after the call.**

```text
Customer call
    ↓
Call Guard — screening, triage, transcript, urgency
    ↓
TiM — customer, site, work order, schedule, route, truck, gallons
    ↓
Technician — photos, comments, actual gallons, completion
    ↓
TiM — disposal ledger, billing-ready record, reporting, audit trail
```

The field-service product is designed to replace fragmented CRM, dispatch, route, fleet-load, work-order, and evidence workflows while continuing to use Paylocity as the source of truth for employment, payroll, and approved time data.

## What this rebuild adds

- Call Guard intake endpoint with idempotent call IDs
- Customer and multi-location service records
- Field work orders with service type, priority, schedule, and gallon estimates
- Truck records with rated tank capacity, current onboard gallons, and remaining capacity
- Capacity-aware assignment and route validation
- Ordered route plans with truck and driver ownership
- Required work-order photo evidence and technician comments
- Immutable truck-load events for pumping, disposal, and corrections
- Disposal facility, ticket, and ticket-photo capture
- Dispatcher dashboard for calls, jobs, fleet capacity, and exceptions
- Tenant isolation, JWT RBAC, request IDs, structured logging, and audit-ready records

## Core operating invariants

1. **A truck is a constrained resource.** TiM will not assign estimated work beyond its available capacity.
2. **Gallons are ledgered, not overwritten.** Pumping, disposal, and adjustments append a `TruckLoadEvent` and update the truck using optimistic concurrency.
3. **Completion requires evidence.** A field work order cannot complete without actual gallons, technician comments, and every configured photo category.
4. **Disposal requires proof.** Disposal events require a facility and disposal-ticket photo.
5. **Calls are triaged before conversion.** Call Guard creates an intake record; dispatch converts it to a customer work order.
6. **Legacy modules remain isolated during migration.** Existing manufacturing screens live under `/legacy/production` while the field-service product becomes the default application.

## Field-service API

Authenticated operations are under `/api/v1/field-service`:

```text
GET    /dispatch-board
GET    /trucks
POST   /trucks
POST   /trucks/:truckId/load-events
GET    /customers?query=
POST   /customers
GET    /customers/:customerId
POST   /customers/:customerId/locations
GET    /work-orders
POST   /work-orders
PUT    /work-orders/:workOrderId/assignment
POST   /work-orders/:workOrderId/photos
POST   /work-orders/:workOrderId/complete
POST   /call-intakes/:intakeId/convert
GET    /routes
POST   /routes
POST   /routes/:routePlanId/publish
```

Call Guard posts normalized calls to:

```text
POST /api/v1/intake/callguard/calls
X-CallGuard-Key: <CALLGUARD_INTEGRATION_KEY>
```

The server assigns the configured `CALLGUARD_TENANT_ID`; callers cannot select another tenant.

## Truck gallon model

```text
availableGallons = tankCapacityGallons - onboardGallons

dispatchableGallons = availableGallons - reservedGallons
```

A route or assignment is rejected when its estimated gallons exceed `dispatchableGallons`. Completion performs the same check using actual gallons, preventing an unexpected field total from silently overfilling the truck record.

## Required evidence

Default completion evidence:

- `BEFORE_SERVICE`
- `AFTER_SERVICE`

Additional supported categories:

- `ACCESS_POINT`
- `CONDITION`
- `DISPOSAL_TICKET`
- `CUSTOMER_SIGNATURE`
- `OTHER`

Photo records store an object-storage key and SHA-256 digest. The API registers evidence metadata; binary upload should use a dedicated object-storage upload flow rather than placing large image bodies in the JSON API.

## Enterprise CI

The repository uses one authoritative `CI` workflow and a stable `CI / required` branch-protection gate.

The pipeline enforces:

- Locked dependency installation on Node.js 22
- Prisma generation, schema validation, clean migration replay, and drift detection on PostgreSQL 17
- Strict backend and frontend TypeScript checks
- Backend and frontend production builds
- A global backend coverage minimum of 75% for statements and lines
- Independent 75% statement and line gates for field-service orchestration, gallon rules, and Call Guard authentication
- Full high-severity npm audits for both dependency graphs
- CycloneDX SBOM generation and artifact retention
- Hardened backend and frontend production-image builds with smoke checks
- Coverage, test-result, frontend-build, and SBOM artifacts
- Stale-run cancellation and least-privilege workflow permissions

Current validated backend coverage is **76.32% statements** and **77.11% lines**, with **249 tests passing**.

## Local development

Requirements:

- Node.js 22+
- PostgreSQL
- npm

Backend:

```bash
cd backend
npm ci
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

Validation:

```bash
cd backend
npx prisma validate
npm run typecheck
npm run build
npm run test:coverage

cd ../frontend
npm run typecheck
npm run build
```

## Product boundary

TiM should own customer records, service locations, call-intake conversion, work orders, scheduling, dispatch, route plans, truck/load state, field evidence, disposal records, billing-ready service facts, and operational reporting.

Call Guard should own first-contact call protection and structured intake. Paylocity should remain authoritative for employee/payroll data and later integrate through a narrow adapter rather than being duplicated.

## License

MIT
