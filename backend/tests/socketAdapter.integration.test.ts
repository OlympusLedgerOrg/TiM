// Proves cross-instance Socket.IO fan-out against a REAL PostgreSQL.
//
// This is the test the change exists for: two independent Socket.IO servers
// (standing in for two backend instances behind a load balancer), a client on
// each, and an emit on one that must reach the client on the other. With the
// default in-memory adapter it cannot, because rooms live in process memory.
//
// Requires DATABASE_URL and a database with the schema applied
// (`npx prisma db push`). Skips loudly when DATABASE_URL is unset.

import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Written straight to stderr: Jest suppresses console output for a suite in
  // which every test is skipped, which would hide this gap entirely.
  process.stderr.write(
    '\n[integration] DATABASE_URL is not set — SKIPPING the Socket.IO cross-instance tests.\n' +
      '[integration] Multi-instance fan-out is NOT covered by this run.\n\n',
  );
}

jest.mock('../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { attachSocketAdapter, type SocketAdapter } from '../src/sockets/adapter';

interface Instance {
  io: SocketIOServer;
  http: HttpServer;
  port: number;
  adapter: SocketAdapter | undefined;
}

async function startInstance(): Promise<Instance> {
  const http = createServer();
  const io = new SocketIOServer(http, { cors: { origin: true } });
  const adapter = attachSocketAdapter(io);

  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as AddressInfo).port;

  return { io, http, port, adapter };
}

async function stopInstance(instance: Instance): Promise<void> {
  await new Promise<void>((resolve) => instance.io.close(() => resolve()));
  await new Promise<void>((resolve) => {
    if (!instance.http.listening) return resolve();
    instance.http.close(() => resolve());
  });
  await instance.adapter?.close();
}

function connectClient(port: number): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = createClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

/** Resolves with the first payload for `event`, or rejects after `timeoutMs`. */
function nextEvent(socket: ClientSocket, event: string, timeoutMs = 5_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}" after ${timeoutMs}ms`)),
      timeoutMs,
    );
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('Socket.IO cross-instance fan-out', () => {
  let a: Instance;
  let b: Instance;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    process.env.SOCKET_IO_ADAPTER = 'postgres';
    a = await startInstance();
    b = await startInstance();
    // Both adapters must have their LISTEN connections established before the
    // first cross-instance emit, or it races the subscription.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, 30_000);

  afterEach(() => {
    while (clients.length) clients.pop()?.disconnect();
  });

  afterAll(async () => {
    if (a) await stopInstance(a);
    if (b) await stopInstance(b);
    delete process.env.SOCKET_IO_ADAPTER;
  }, 30_000);

  test('both instances attached a real adapter', () => {
    expect(a.adapter).toBeDefined();
    expect(b.adapter).toBeDefined();
  });

  // The headline case: a step completed on instance A must reach a technician
  // whose socket happens to live on instance B.
  test('a room emit on one instance reaches a client on the other', async () => {
    const clientOnB = await connectClient(b.port);
    clients.push(clientOnB);

    await new Promise<void>((resolve) => {
      b.io.on('connection', (socket) => {
        socket.join('work-order:123');
        resolve();
      });
      // The handler may already have fired for this socket.
      if (b.io.sockets.sockets.size > 0) {
        for (const socket of b.io.sockets.sockets.values()) socket.join('work-order:123');
        resolve();
      }
    });

    const received = nextEvent(clientOnB, 'stepCompleted');
    a.io.to('work-order:123').emit('stepCompleted', { stepId: 'step-1' });

    await expect(received).resolves.toEqual({ stepId: 'step-1' });
  }, 20_000);

  test('a broadcast to all clients on one instance reaches the other', async () => {
    const clientOnB = await connectClient(b.port);
    clients.push(clientOnB);

    const received = nextEvent(clientOnB, 'queueUpdated');
    a.io.emit('queueUpdated', { tenantId: 'default' });

    await expect(received).resolves.toEqual({ tenantId: 'default' });
  }, 20_000);

  // Payloads over the 8000-byte NOTIFY limit spill through
  // socket_io_attachments; if that table is missing or misshapen, only large
  // emits break — exactly the kind of failure that hides until production.
  test('an oversized payload crosses instances via the attachments table', async () => {
    const clientOnB = await connectClient(b.port);
    clients.push(clientOnB);

    const received = nextEvent(clientOnB, 'bigPayload', 10_000);
    const big = { blob: 'x'.repeat(64_000) };
    a.io.emit('bigPayload', big);

    await expect(received).resolves.toEqual(big);
  }, 20_000);

  test('SOCKET_IO_ADAPTER=memory opts out and reports no adapter', async () => {
    process.env.SOCKET_IO_ADAPTER = 'memory';
    try {
      const http = createServer();
      const io = new SocketIOServer(http);
      expect(attachSocketAdapter(io)).toBeUndefined();
      io.close();
    } finally {
      process.env.SOCKET_IO_ADAPTER = 'postgres';
    }
  });

  test('SOCKET_IO_ADAPTER=postgres without DATABASE_URL throws rather than degrading', () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const http = createServer();
      const io = new SocketIOServer(http);
      expect(() => attachSocketAdapter(io)).toThrow(/requires DATABASE_URL/);
      io.close();
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
