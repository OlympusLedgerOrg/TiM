# TiM Field-Service Architecture

## Objective

Replace separate call/CRM/dispatch products with a single TiM field-service system while using Call Guard as the first line of defense and Paylocity as the workforce/payroll authority.

## Bounded contexts

### Call intake

Call Guard sends a normalized, idempotent event to TiM. TiM stores the transcript and triage summary as a `CallIntake`, but it does not automatically dispatch the request. A dispatcher links or creates the customer and service location, then converts the intake to a field work order.

### Customer and service location

A customer may own multiple service locations. Site-specific access instructions, hazard notes, service history, coordinates, and estimated tank size belong to the location—not the customer account.

### Work execution

`FieldWorkOrder` owns the covered integrity claim for the service visit: who, where, what service, priority, schedule, assignment, estimated/actual gallons, required evidence, technician comments, and final status.

### Fleet and gallons

`Truck.onboardGallons` is a fast current-state projection. `TruckLoadEvent` is the append-only source for how that state changed. Updates use the truck's current volume and version as optimistic-concurrency guards.

### Route planning

A `RoutePlan` is truck-and-driver specific for one service date. Stops are explicitly ordered. The initial rule rejects a route whose estimated pickups exceed the truck's current remaining capacity. A later optimizer can insert disposal stops and solve multi-trip vehicle-routing constraints without changing the work-order or load-ledger model.

### Evidence

Photos are typed records with SHA-256 digests and object-storage keys. Work-order completion validates required categories. Disposal requires a disposal-ticket photo. Binary image upload should use short-lived signed object-storage URLs.

## Security boundaries

- JWT and tenant claims protect employee-facing endpoints.
- Call Guard uses a dedicated integration key and server-configured tenant ID.
- Tenant ID is never accepted from an authenticated request body.
- All customer, location, truck, work-order, and route lookups include tenant scope.
- Truck volume updates use optimistic concurrency.
- Integration and JWT secrets must come from a secret manager in production.

## Migration path

1. Run TiM in parallel and import customers, sites, trucks, open jobs, recurring schedules, and service history.
2. Feed new calls through Call Guard into TiM's intake queue.
3. Dispatch one yard or route group from TiM while existing systems remain read-only for that group.
4. Reconcile jobs, gallons, photos, disposal tickets, invoices, and payroll hours daily.
5. Cut over additional yards after reconciliation meets agreed thresholds.
6. Retain legacy exports and a reversible rollback window before final retirement.

## Next implementation phases

- Signed photo uploads and retention policies
- Map provider abstraction, geocoding, travel-time matrix, and route optimization
- Recurring service agreements and automatic work-order generation
- Estimates, price books, taxes, invoices, payments, and accounting exports
- Driver mobile workflow with offline queue and background location updates
- Paylocity employee, availability, and time export adapter
- Customer notifications, portal, and electronic signatures
- Data import/reconciliation tooling for the systems being retired
