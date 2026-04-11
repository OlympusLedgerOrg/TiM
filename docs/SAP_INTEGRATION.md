# SAP Integration for Trelleborg Rutherfordton NC

## Overview

TiM now provides SAP-compatible integration APIs and a SAP Fiori-style user interface optimized for Android, iOS, and Windows devices.

## Features

### Backend: OData v4-Compatible APIs

All SAP integration endpoints follow OData v4 conventions and return data in SAP-compatible formats.

#### Available Endpoints

**Base URL:** `/api/v1/sap`

##### 1. Plant Information
```
GET /api/v1/sap/plant
```
Returns plant/tenant information including work centers.

**Response:**
```json
{
  "PlantCode": "US01",
  "PlantName": "Trelleborg Rutherfordton",
  "PlantID": "tenant-trelleborg",
  "WorkCenters": [
    {
      "WorkCenter": "MIX-01",
      "WorkCenterName": "Mixing",
      "Description": ""
    }
  ]
}
```

##### 2. Materials Master Data
```
GET /api/v1/sap/materials
```
Returns material master data in OData format.

**Response:**
```json
{
  "@odata.context": "http://localhost:4000/api/v1/sap/$metadata#Materials",
  "value": [
    {
      "MaterialNumber": "MAT-7823",
      "Description": "EPDM Compound 70A",
      "UnitOfMeasure": "KG",
      "MaterialID": "cm...",
      "CreatedAt": "2026-04-11T22:41:31.000Z"
    }
  ]
}
```

##### 3. Production Batches
```
GET /api/v1/sap/batches?status={status}&workCenter={code}
```
Returns production batch/lot information.

**Query Parameters:**
- `status` (optional): Filter by batch status (IN_QUEUE, IN_PROGRESS, COMPLETE, FLAGGED)
- `workCenter` (optional): Filter by work center code

**Response:**
```json
{
  "@odata.context": "http://localhost:4000/api/v1/sap/$metadata#Batches",
  "value": [
    {
      "LotNumber": "LOT-2024-001",
      "MaterialNumber": "MAT-7823",
      "MaterialDescription": "EPDM Compound 70A",
      "Quantity": "500",
      "UnitOfMeasure": "KG",
      "Status": "IN_QUEUE",
      "WorkCenter": "MIX-01",
      "WorkCenterName": "Mixing",
      "CreatedAt": "2026-04-11T22:41:31.000Z",
      "UpdatedAt": "2026-04-11T22:41:31.000Z",
      "BatchID": "cm..."
    }
  ]
}
```

##### 4. Goods Movements
```
GET /api/v1/sap/movements?fromDate={ISO8601}
```
Returns goods movement history.

**Query Parameters:**
- `fromDate` (optional): ISO 8601 timestamp to filter movements from a specific date

**Response:**
```json
{
  "@odata.context": "http://localhost:4000/api/v1/sap/$metadata#Movements",
  "value": [
    {
      "MovementID": "cm...",
      "LotNumber": "LOT-2024-001",
      "MaterialNumber": "MAT-7823",
      "Quantity": "250",
      "UnitOfMeasure": "KG",
      "FromWorkCenter": "MIX-01",
      "ToWorkCenter": "EXT-01",
      "MovedBy": "user-123",
      "MovedAt": "2026-04-11T22:41:31.000Z",
      "Notes": "Quality check passed",
      "OlympusCommitID": "blake3:..."
    }
  ]
}
```

##### 5. Material Sync from SAP
```
POST /api/v1/sap/materials/sync
```
Synchronizes material master data from SAP to TiM.

**Request Body:**
```json
{
  "materialNumber": "MAT-9999",
  "description": "New Material from SAP",
  "unitOfMeasure": "EA"
}
```

**Response:**
```json
{
  "material": {
    "id": "cm...",
    "sapMaterialNumber": "MAT-9999",
    "description": "New Material from SAP",
    "unitOfMeasure": "EA",
    "tenantId": "tenant-trelleborg",
    "createdAt": "2026-04-11T22:41:31.000Z"
  },
  "created": true
}
```

**Roles Required:** Admin or Supervisor

### Frontend: SAP Fiori UI5 Design

#### Features

1. **SAP Fiori Horizon Theme**: Modern, responsive design following SAP's latest design guidelines
2. **Mobile-First**: Optimized for touch interactions on Android and iOS
3. **Responsive Layout**: Adapts to phone, tablet, and desktop screens
4. **Progressive Web App (PWA)**: Installable on all platforms

#### Components

- **ShellBar**: Top navigation with branding and quick actions
- **Cards**: Overview tiles showing key metrics (batches in queue, in progress, flagged)
- **Tables**: Data display for work centers and batches
- **Responsive Grid**: Auto-adjusts columns based on screen size

#### Platform Support

##### Android
- Access via Chrome, Samsung Internet, or other modern browsers
- Install as PWA via "Add to Home Screen"
- Supports Android 8.0+

##### iOS / iPadOS
- Access via Safari or Chrome
- Install via "Add to Home Screen"
- Supports iOS 14+

##### Windows
- Access via Edge, Chrome, or Firefox
- Install as PWA via browser menu
- Supports Windows 10+

#### Color Scheme

- **Primary Brand Color**: `#0a6ed1` (SAP Blue)
- **Shell Background**: `#354a5f` (SAP Dark Blue)
- **Background**: `#f5f6f7` (SAP Gray)
- **Highlight**: `#0854a0` (SAP Blue Dark)

#### Dark Mode

Automatically adapts to system preferences using `prefers-color-scheme` media query.

#### High Contrast Mode

Supports Windows High Contrast mode for accessibility.

## Authentication

All SAP integration endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

The JWT must include:
- `tenantId`: The tenant identifier (e.g., "tenant-trelleborg")
- `role`: User role (Tech, Supervisor, or Admin)

## Multi-Tenant Support

All APIs are tenant-aware. Data is automatically filtered by the `tenantId` extracted from the JWT token.

## Integration with SAP ERP

### Recommended Integration Patterns

#### 1. Material Master Sync (SAP → TiM)
- Use `/api/v1/sap/materials/sync` endpoint
- Schedule periodic sync (e.g., hourly) via SAP PI/PO or middleware
- Handle create and update operations

#### 2. Production Data Export (TiM → SAP)
- Query `/api/v1/sap/batches` and `/api/v1/sap/movements`
- Use `fromDate` parameter for incremental updates
- Map TiM data to SAP production orders and confirmations

#### 3. Plant Data Validation
- Query `/api/v1/sap/plant` to verify work center mappings
- Ensure SAP plant codes match TiM tenant configuration

### SAP Integration Middleware

Compatible with:
- **SAP PI/PO** (Process Integration / Process Orchestration)
- **SAP Cloud Integration** (CPI)
- **Dell Boomi**, **MuleSoft**, **Informatica**
- Custom REST API clients

### OData Compatibility

Endpoints return data in OData v4-compatible format with:
- `@odata.context` metadata
- `value` array for collections
- ISO 8601 timestamps
- SAP naming conventions (PascalCase field names)

## Deployment

### Backend

```bash
cd backend
npm install
npx prisma migrate deploy
npm run build
npm start
```

Environment variables:
```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
PORT=4000
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

Serve the `dist` folder with:
- Nginx (recommended for production)
- Apache HTTP Server
- Any static file server

### Docker

Use the provided Docker Compose configuration:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Security Considerations

1. **HTTPS Required**: Always use HTTPS in production for API and frontend
2. **JWT Expiration**: Configure appropriate token expiration times
3. **CORS**: Configure CORS policies for your domain
4. **Rate Limiting**: Implement rate limiting on SAP endpoints
5. **Data Validation**: All inputs are validated with Zod schemas

## Testing

Run backend tests:
```bash
cd backend
npm test
```

Test SAP endpoints with tools like:
- Postman (collection available in `/docs/TiM.postman_collection.json`)
- curl
- SAP API Management test console

## Monitoring

Monitor the following metrics:
- API response times (target: < 200ms)
- Error rates on SAP endpoints
- Material sync success/failure rates
- Mobile app installation rates

## Support

For issues or questions about SAP integration:
1. Check application logs
2. Verify JWT token contains correct `tenantId` and `role`
3. Confirm database contains Trelleborg tenant data
4. Test endpoints with valid authentication

## Changelog

### Version 1.0.0 (2026-04-11)
- Initial SAP integration APIs
- OData v4-compatible endpoints
- SAP Fiori UI5 responsive dashboard
- PWA support for Android, iOS, Windows
- Material sync capability
- Multi-tenant architecture
