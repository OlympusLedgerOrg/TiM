🧰 TiM — Technician Work Order Management System

TiM is a full-stack industrial work-order management platform built for technicians, supervisors, and operations managers.
It tracks work orders, step completion, and audit logs — with real-time updates and robust role-based access control (RBAC).

## 🌟 SAP Integration & Mobile Support

**NEW**: SAP-compatible integration for **Trelleborg Rutherfordton NC**
- ✅ OData v4-compatible APIs for SAP ERP integration
- ✅ SAP Fiori UI5 responsive design
- ✅ Multi-platform support: **Android, iOS, Windows**
- ✅ Progressive Web App (PWA) for mobile installation

📖 **[SAP Integration Documentation](docs/SAP_INTEGRATION.md)**  
📱 **[Cross-Platform Deployment Guide](docs/CROSS_PLATFORM_DEPLOYMENT.md)**

🚀 Tech Stack

Backend

Node.js 22 + Express 5

PostgreSQL 17 + Prisma 6 ORM

Zod for request validation

jose for JWT authentication

Socket.IO for real-time work-order events

Jest + Supertest for integration testing

Frontend

React 18 + TypeScript

Vite (or Next.js — flexible)

TailwindCSS / shadcn-ui for styling

Fetch API for service calls

LocalStorage for JWT handling

🧩 Core Feature: Step Completion

Technicians and Supervisors can mark steps within a work order as completed, attach notes, and trigger real-time updates across connected clients.

Endpoint
POST /api/v1/work-orders/:workOrderId/steps/:stepId/complete

Auth

Requires valid JWT

Allowed roles: Tech, Supervisor

Request Body
{
  "notes": "Optional string notes here."
}

Response Codes
Code	Meaning
200	Step successfully completed
403	Unauthorized role
404	Work order or step not found
409	Step already completed
Side Effects

Updates the step’s status → COMPLETED

Persists technician notes

Creates an entry in the AuditLog

Emits stepCompleted event via Socket.IO to room work-order:{workOrderId}

🧪 Testing (Integration: Jest + Supertest)

File: tests/completeStep.test.ts

Coverage:

✅ Successful completion (Tech role → 200 OK)

🚫 Unauthorized role (Admin → 403 Forbidden)

🚫 Invalid IDs (→ 404 Not Found)

🚫 Already completed (→ 409 Conflict)

Mocks:

Prisma client

Socket.IO emit function

JWT generation handled via jose for role-based tokens.

💻 Frontend Service

File: src/services/workOrderService.ts

export async function completeWorkOrderStep({
  workOrderId,
  stepId,
  notes,
}: {
  workOrderId: string;
  stepId: string;
  notes?: string;
}): Promise<void> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `/api/v1/work-orders/${workOrderId}/steps/${stepId}/complete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to complete step: ${res.status} ${err}`);
  }
}

🧭 UI Component

File: src/components/CompleteStepForm.tsx

A simple, production-ready form for completing a step.
Includes state management, loading/error UX, and a success callback.

<CompleteStepForm
  workOrderId="abc123"
  stepId="step1"
  onSuccess={() => toast.success('Step completed!')}
/>

📚 User Documentation

See docs/how-to-complete-a-work-order-step.md

Technicians can:

Open a work order.

Locate the step to complete.

Add optional notes and click Complete Step.
Once submitted, the step locks and notifies your supervisor in real time.

⚙️ Local Development
1. Clone the Repo
git clone https://github.com/your-org/tim.git
cd tim

2. Backend Setup
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev

3. Frontend Setup
cd ../frontend
npm install
npm run dev

4. Run Tests
npm run test

🧾 License

MIT © 2025 — TiM Development Team

🔄 Roadmap

 ~~Step attachment uploads~~

 ~~Offline mode with sync~~

 Supervisor dashboards

 Work order analytics (completion time, bottlenecks)

 ~~Multi-tenant enterprise mode~~

✅ **SAP Integration** (Complete)
- OData v4 APIs for materials, batches, movements
- SAP Fiori UI5 design system
- Cross-platform PWA support

✅ **Multi-tenant Architecture** (Complete)
- Tenant isolation at database level
- JWT-based tenant identification
- Plant/work center management
