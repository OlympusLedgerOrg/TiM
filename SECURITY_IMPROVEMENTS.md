# Security Improvements - Socket.IO and Authentication

## Overview
This document describes the security improvements made to address critical vulnerabilities in the TiM application.

## Issues Addressed

### 1. Socket.IO CORS Vulnerability ✅ FIXED
**Problem**: Socket.IO was configured with `origin: '*'`, allowing any website to connect to the WebSocket server. In a factory setting with sensitive production data, this is a critical security risk.

**Solution**:
- Replaced wildcard CORS with environment-configured whitelist
- Added `SOCKET_IO_CORS_ORIGIN` environment variable for production configuration
- Implemented origin validation callback that:
  - Allows configured origins only in production
  - Falls back to permissive mode in dev/test if not configured
  - Enables `credentials: true` for secure cookie/auth header transmission

**Files Modified**:
- `backend/src/app.ts`: Updated Socket.IO CORS configuration
- `backend/.env.example`: Added SOCKET_IO_CORS_ORIGIN configuration

### 2. Socket.IO Authentication ✅ FIXED
**Problem**: Socket.IO connections were not authenticated, allowing any client to connect and join rooms without validation.

**Solution**:
- Added Socket.IO middleware to validate JWT tokens on connection
- Tokens can be passed via `socket.handshake.auth.token` or `Authorization` header
- User information (id, role, tenantId) is attached to `socket.data.user` for use in event handlers
- Unauthenticated connections are rejected with error message

**Files Modified**:
- `backend/src/app.ts`: Added authentication middleware to Socket.IO

### 3. Tenant Isolation in Socket.IO ✅ FIXED
**Problem**: The `joinTenant` Socket.IO event accepted any tenantId, allowing users to join other tenants' rooms and receive their real-time updates.

**Solution**:
- Added validation in `joinTenant` event handler
- Users can only join rooms for their own tenant (from JWT token)
- Attempts to join other tenant rooms are rejected with error event

**Files Modified**:
- `backend/src/app.ts`: Updated Socket.IO event handlers with tenant validation

### 4. Missing User Model ✅ FIXED
**Problem**:
- No User table in database
- Auth uses JWTs but nowhere to store user data
- `actorUserId` in audit logs is just a string with no foreign key
- `movedByUserId`, `submittedBy`, `managerId` are all strings without FK constraints

**Solution**:
- Added `User` model to Prisma schema with:
  - id, email, name, role fields
  - tenantId with FK to Tenant
  - isActive flag for soft deletion
  - Relations to AuditLog, Movement, LabReport, Signoff
- Updated all models to use FK relationships:
  - `AuditLog.actorUser` → User
  - `Movement.movedByUser` → User
  - `LabReport.submittedByUser` → User
  - `Signoff.manager` → User
- Tenant model updated to include users relation

**Files Modified**:
- `backend/prisma/schema.prisma`: Added User model and FK relationships

**Migration Required**:
Database migration needed to:
1. Create User table
2. Add foreign key constraints
3. Migrate existing string IDs to User references (requires data migration strategy)

### 5. Step Model Clarification ✅ DOCUMENTED
**Issue**: Both `Step` and `WorkOrderStep` models exist, causing potential confusion.

**Resolution**:
These models serve different architectural purposes and should NOT be merged:
- **Step**: Simple model for basic work order step tracking (existing system)
- **WorkOrderStep**: Advanced MES production layer with BOM steps, operator assignment, and data recording

Added documentation comments in schema to clarify this distinction.

**Files Modified**:
- `backend/prisma/schema.prisma`: Added clarifying comments

### 6. Offline Support Documentation ✅ FIXED
**Problem**: README claimed PWA/offline capability but no service worker exists in the code.

**Solution**: Updated README to reflect accurate status:
- Changed "✅ Progressive Web App (PWA)" to "🔄 PWA with manifest (offline support planned)"
- Moved "Offline mode with sync" to roadmap as in-progress item

**Files Modified**:
- `README.md`: Updated status indicators

## Configuration Required

### Production Deployment
Add to your production `.env`:
```bash
# Comma-separated list of allowed frontend origins
SOCKET_IO_CORS_ORIGIN="https://app.yourcompany.com,https://admin.yourcompany.com"
```

### Frontend Updates Required
Frontend Socket.IO clients must now pass authentication token:

```typescript
import { io } from 'socket.io-client';

const socket = io('https://api.yourcompany.com', {
  auth: {
    token: localStorage.getItem('token') // JWT token
  }
});

// Or via Authorization header:
const socket = io('https://api.yourcompany.com', {
  extraHeaders: {
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }
});
```

### Database Migration
Before deploying, run:
```bash
npx prisma migrate dev --name add-user-model
```

**Important**: This migration requires a data migration strategy for existing records:
1. Create User records for existing user IDs in audit logs, movements, etc.
2. Update foreign key references
3. Consider using a migration script to handle existing data

## Security Best Practices Implemented

1. **Principle of Least Privilege**: CORS only allows explicitly configured origins
2. **Defense in Depth**: Multiple layers of authentication (HTTP endpoints + WebSocket)
3. **Tenant Isolation**: Users cannot access other tenants' data via any channel
4. **Data Integrity**: Foreign key constraints ensure referential integrity
5. **Audit Trail**: User model enables proper audit logging with accountability

## Testing Recommendations

1. Test Socket.IO connection with valid/invalid tokens
2. Test tenant isolation in Socket.IO rooms
3. Test CORS with allowed/disallowed origins
4. Test User model relationships and cascade behavior
5. Load test with multiple concurrent authenticated connections

## Future Enhancements

1. Implement rate limiting for Socket.IO connections
2. Add Socket.IO room access control based on work order ownership
3. Implement session management for users
4. Add user password hashing for local authentication
5. Implement service worker for true offline support
