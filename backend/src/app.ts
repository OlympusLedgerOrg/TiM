import 'dotenv/config';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { jwtVerify } from 'jose';
import path from 'path';
import workOrderRoutes from './routes/workOrders.js';
import healthRoutes from './routes/health.js';
import queueRoutes from './routes/queue.js';
import movementRoutes from './routes/movements.js';
import labReportRoutes from './routes/labReports.js';
import sapRoutes from './routes/sap.js';
import sapMiddlewareRoutes from './routes/sapMiddleware.js';
import stationRoutes from './routes/station.js';
import allocationRoutes from './routes/allocation.js';
import equipmentRoutes from './routes/equipment.js';
import teamsRoutes from './routes/teamsNotifications.js';
import plantAreaRoutes from './routes/plantAreas.js';
import andonRoutes from './routes/andon.js';
import analyticsRoutes from './routes/analytics.js';
import operatorRoutes from './routes/operators.js';
import authRoutes from './routes/auth.js';
import bomRoutes from './routes/bom.js';
import materialRoutes from './routes/materials.js';
import { globalLimiter, sapLimiter } from './middleware/rateLimiter.js';
import { httpsRedirect } from './middleware/httpsRedirect.js';
import type { Role } from './middleware/auth.js';
import { getJwtSecret, validateJwtSecret } from './config/jwt.js';

validateJwtSecret();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO with secure CORS configuration
const allowedOrigins = process.env.SOCKET_IO_CORS_ORIGIN
  ? process.env.SOCKET_IO_CORS_ORIGIN.split(',').map(o => o.trim())
  : [];

export const io = new Server(httpServer, {
  path: process.env.SOCKET_IO_PATH || '/socket.io',
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // In test/dev environments, allow any origin if not explicitly configured
      if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security middleware
app.use(httpsRedirect);

// Rate limiting (recommended by CodeQL)
app.use(globalLimiter);

// Middleware
app.use(express.json());

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const { payload } = await jwtVerify(token, getJwtSecret());

    // Attach user info to socket for later use
    socket.data.user = {
      id: String(payload.sub),
      role: payload.role as Role,
      tenantId: String(payload.tenantId ?? 'default'),
    };

    next();
  } catch (error) {
    next(new Error('Invalid authentication token'));
  }
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/work-orders', workOrderRoutes);
app.use('/api/v1/queue', queueRoutes);
app.use('/api/v1/movements', movementRoutes);
app.use('/api/v1/lab-reports', labReportRoutes);
app.use('/api/v1/sap', sapLimiter, sapRoutes);
app.use('/api/v1/sap/middleware', sapLimiter, sapMiddlewareRoutes);
app.use('/api/v1/station', stationRoutes);
app.use('/api/v1/allocation', allocationRoutes);
app.use('/api/v1/equipment', equipmentRoutes);
app.use('/api/v1/teams', teamsRoutes);
app.use('/api/v1/plant-areas', plantAreaRoutes);
app.use('/api/v1/andon', andonRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/operators', operatorRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bom', bomRoutes);
app.use('/api/v1/materials', materialRoutes);

// Desktop Mode: Serve static frontend files when STATIC_FILES_PATH is set
// This allows the backend to serve the built frontend in the Electron app
const staticFilesPath = process.env.STATIC_FILES_PATH;
if (staticFilesPath) {
  // Serve static files from the frontend build
  app.use(express.static(staticFilesPath));

  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes and health endpoint
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
      return next();
    }
    const indexPath = path.join(staticFilesPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error(`Failed to serve index.html: ${err.message}`);
        res.status(500).send('Application files not found. Please reinstall the application.');
      }
    });
  });

  console.log(`📦 Desktop mode: serving frontend from ${staticFilesPath}`);
}

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const isInvalidJson =
    err instanceof SyntaxError &&
    'status' in err &&
    req.is('application/json');
  const status =
    isInvalidJson
      ? 400
      : typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          typeof err.status === 'number' &&
          err.status >= 400 &&
          err.status < 600
        ? err.status
        : 500;
  const message =
    status >= 500
      ? 'Internal server error'
      : isInvalidJson
        ? 'Invalid JSON body'
        : err instanceof Error
          ? err.message
          : 'Unexpected error';

  if (status >= 500) {
    console.error(err);
  }

  return res.status(status).json({ message });
};

app.use(errorHandler);

// Socket.IO connection handling with tenant validation
io.on('connection', (socket) => {
  const userTenantId = socket.data.user?.tenantId;

  socket.on('joinWorkOrder', (workOrderId: string) => {
    socket.join(`work-order:${workOrderId}`);
  });

  socket.on('leaveWorkOrder', (workOrderId: string) => {
    socket.leave(`work-order:${workOrderId}`);
  });

  socket.on('joinTenant', (tenantId: string) => {
    // Validate that user is only joining their own tenant room
    if (tenantId !== userTenantId) {
      socket.emit('error', { message: 'Cannot join tenant room: access denied' });
      return;
    }
    socket.join(`tenant:${tenantId}`);
  });

  socket.on('leaveTenant', (tenantId: string) => {
    socket.leave(`tenant:${tenantId}`);
  });
});

// Start server
const PORT = process.env.PORT || 4000;

// Only bind to the port outside of test runs.
// Supertest creates its own ephemeral server binding — listening here
// during tests causes EADDRINUSE when multiple test files import this module.
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

export const server = httpServer;

export { app };
