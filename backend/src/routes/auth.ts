import { Router } from 'express';
import { z } from 'zod';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma/client.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import type { Role } from '../middleware/auth.js';
import { getJwtSecret } from '../config/jwt.js';

const router = Router();

/**
 * Auth Routes — Login for supervisors/managers.
 *
 * Floor workers use badge scan (handled in equipment/shifts/clock-in).
 * This provides email + password login with bcrypt-hashed passwords
 * for management users (Supervisor, Admin).
 */

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/v1/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid credentials format' });
  }

  const { email, password } = parse.data;

  // Look up user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Verify bcrypt password hash — users without a passwordHash cannot log in via email
  if (!user.passwordHash) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Generate JWT with sub, role, tenantId, and name claims
  const token = await new SignJWT({
    sub: user.id,
    role: user.role as Role,
    tenantId: user.tenantId,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h') // Shift-length token
    .sign(getJwtSecret());

  return res.status(200).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

export default router;
