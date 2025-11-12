import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import workOrderRoutes from './routes/workOrders.js';
import healthRoutes from './routes/health.js';

export const app = express();
const httpServer = createServer(app);

// Socket.IO setup
export const io = new Server(httpServer, {
  path: process.env.SOCKET_IO_PATH || '/socket.io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  socket.on('joinWorkOrder', (workOrderId: string) => {
    socket.join(`work-order:${workOrderId}`);
  });

  socket.on('leaveWorkOrder', (workOrderId: string) => {
    socket.leave(`work-order:${workOrderId}`);
  });
});

// Middleware
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/work-orders', workOrderRoutes);

// Start server (only if this file is run directly)
const PORT = process.env.PORT || 4000;
export const server = httpServer.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`🚀 TiM Backend running on port ${PORT}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
  });
});
