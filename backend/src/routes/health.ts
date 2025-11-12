import { Router, Request, Response } from 'express';
import { prisma } from '../prisma/client.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const responseTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: true,
        responseTime: `${responseTime}ms`
      },
      service: 'TiM Backend API',
      version: '1.0.0'
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: false,
        responseTime: `${responseTime}ms`,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      service: 'TiM Backend API',
      version: '1.0.0'
    });
  }
});

export default router;
