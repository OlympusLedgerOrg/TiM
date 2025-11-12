import 'dotenv/config';
import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import workOrderRoutes from './routes/workOrders.js';
import healthRoutes from './routes/health.js';

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

// Middleware
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/work-orders', workOrderRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  socket.on('joinWorkOrder', (workOrderId: string) => {
    socket.join(`work-order:${workOrderId}`);
  });

  socket.on('leaveWorkOrder', (workOrderId: string) => {
    socket.leave(`work-order:${workOrderId}`);
  });
});

// Start server
const PORT = process.env.PORT || 4000;
export const server = httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export { app };
