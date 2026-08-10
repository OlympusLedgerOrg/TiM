-- CreateTable: spill table for the Socket.IO Postgres adapter.
--
-- The adapter fans events out over NOTIFY, which caps a payload at 8000 bytes;
-- anything larger or binary is written here and referenced by id. The adapter
-- owns the rows at runtime — this migration only creates the table so it exists
-- before the first oversized emit.
--
-- Column names and types must match what @socket.io/postgres-adapter expects.
-- The adapter's own DDL declares `id bigserial UNIQUE`; a primary key satisfies
-- that uniqueness requirement and is what Prisma models.
CREATE TABLE "socket_io_attachments" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" BYTEA,

    CONSTRAINT "socket_io_attachments_pkey" PRIMARY KEY ("id")
);
