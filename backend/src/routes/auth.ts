import { Router } from 'express';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { timingSafeEqual } from 'crypto';
import { prisma } from '../prisma/client.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import type { Role } from '../middleware/auth.js';

const router = Router();

/**
 * Auth Routes — Login for supervisors/managers.
 *
 * Floor workers use badge scan (handled in equipment/shifts/clock-in).
 * This provides a proper email + password login for management users.
 *
 * BOOTSTRAP MODE: Uses env-based ADMIN_PASSWORD for initial setup.
 * TODO: Replace with bcrypt/argon2 password hashing and per-user stored hashes
 * once a user registration flow is implemented.
 */

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Both strings are padded to equal length before comparison.
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a.padEnd(256, '\0'));
  const bufB = Buffer.from(b.padEnd(256, '\0'));
  return timingSafeEqual(bufA, bufB);
}

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

  // Bootstrap mode: compare against env-based password using timing-safe comparison
  // TODO: Replace with bcrypt.compare(password, user.passwordHash) once per-user hashes exist
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!safeCompare(password, adminPassword)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Generate JWT
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me');
  const token = await new SignJWT({
    sub: user.id,
    role: user.role as Role,
    tenantId: user.tenantId,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h') // Shift-length token
    .sign(secret);

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
