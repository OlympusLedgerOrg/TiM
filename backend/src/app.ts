import 'dotenv/config';
import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import workOrderRoutes from './routes/workOrders.js';
import healthRoutes from './routes/health.js';
import queueRoutes from './routes/queue.js';
import movementRoutes from './routes/movements.js';
import labReportRoutes from './routes/labReports.js';
import sapRoutes from './routes/sap.js';
import sapMiddlewareRoutes from './routes/sapMiddleware.js';
import { globalLimiter, sapLimiter } from './middleware/rateLimiter.js';
import { httpsRedirect } from './middleware/httpsRedirect.js';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
export const io = new Server(httpServer, {
  path: process.env.SOCKET_IO_PATH || '/socket.io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Security middleware
app.use(httpsRedirect);

// Rate limiting (recommended by CodeQL)
app.use(globalLimiter);

// Middleware
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/work-orders', workOrderRoutes);
app.use('/api/v1/queue', queueRoutes);
app.use('/api/v1/movements', movementRoutes);
app.use('/api/v1/lab-reports', labReportRoutes);
app.use('/api/v1/sap', sapLimiter, sapRoutes);
app.use('/api/v1/sap/middleware', sapLimiter, sapMiddlewareRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  socket.on('joinWorkOrder', (workOrderId: string) => {
    socket.join(`work-order:${workOrderId}`);
  });

  socket.on('leaveWorkOrder', (workOrderId: string) => {
    socket.leave(`work-order:${workOrderId}`);
  });

  socket.on('joinTenant', (tenantId: string) => {
    socket.join(`tenant:${tenantId}`);
  });

  socket.on('leaveTenant', (tenantId: string) => {
    socket.leave(`tenant:${tenantId}`);
  });
});

// Start server
const PORT = process.env.PORT || 4000;
export const server = httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export { app };
