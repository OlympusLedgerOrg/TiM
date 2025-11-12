#!/usr/bin/env ts-node
/**
 * JWT Token Generator for TiM Backend
 *
 * Usage:
 *   npm run gen-token -- --role Tech --subject user123 --expires 7d
 *   npm run gen-token -- --role Supervisor --subject admin456 --expires 30d
 *   npm run gen-token -- --role Admin --subject superadmin --expires 365d
 */

import { SignJWT } from 'jose';

type Role = 'Tech' | 'Supervisor' | 'Admin';

interface TokenOptions {
  role: Role;
  subject: string;
  expires: string; // e.g., '1h', '7d', '30d', '365d'
}

function parseArgs(): TokenOptions {
  const args = process.argv.slice(2);
  const options: Partial<TokenOptions> = {
    role: 'Tech',
    subject: 'test-user',
    expires: '7d',
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    if (key === 'role' && ['Tech', 'Supervisor', 'Admin'].includes(value)) {
      options.role = value as Role;
    } else if (key === 'subject') {
      options.subject = value;
    } else if (key === 'expires') {
      options.expires = value;
    }
  }

  return options as TokenOptions;
}

function parseExpiration(expires: string): string {
  const match = expires.match(/^(\d+)([hdwmy])$/);
  if (!match) {
    throw new Error(
      `Invalid expiration format: ${expires}. Use format like '1h', '7d', '30d', '365d'`
    );
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case 'h':
      return `${num}h`;
    case 'd':
      return `${num * 24}h`;
    case 'w':
      return `${num * 7 * 24}h`;
    case 'm':
      return `${num * 30 * 24}h`;
    case 'y':
      return `${num * 365 * 24}h`;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
}

async function generateToken(options: TokenOptions): Promise<string> {
  const jwtSecret = process.env.JWT_SECRET || 'change-me';
  const secret = new TextEncoder().encode(jwtSecret);

  const expirationTime = parseExpiration(options.expires);

  const token = await new SignJWT({ role: options.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(options.subject)
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(secret);

  return token;
}

async function main() {
  try {
    const options = parseArgs();

    console.log('\n🔐 Generating JWT Token...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Role:     ${options.role}`);
    console.log(`Subject:  ${options.subject}`);
    console.log(`Expires:  ${options.expires}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const token = await generateToken(options);

    console.log('✅ Token generated successfully!\n');
    console.log(token);
    console.log('\n📋 Usage example:');
    console.log(
      `   curl -H "Authorization: Bearer ${token}" http://localhost:4000/api/v1/work-orders/...\n`
    );
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
