/**
 * Structured application error with HTTP status code, error code, and
 * optional context for downstream logging / client responses.
 *
 * Throwing an AppError from any route handler or service will be caught
 * by the global error handler which serialises it into a consistent
 * JSON envelope:
 *
 * ```json
 * {
 *   "message": "Work order not found",
 *   "code": "WORK_ORDER_NOT_FOUND",
 *   "requestId": "abc-123"
 * }
 * ```
 */
export class AppError extends Error {
  /** HTTP status code (e.g. 400, 404, 409, 500) */
  public readonly status: number;

  /** Machine-readable error code for client consumption */
  public readonly code: string;

  /** Whether this error represents an operational (expected) failure */
  public readonly isOperational: boolean;

  /** Optional extra context (never leaked to clients in production) */
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    status = 500,
    code = 'INTERNAL_ERROR',
    options?: { isOperational?: boolean; context?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.isOperational = options?.isOperational ?? (status < 500);
    this.context = options?.context;

    // Maintains proper stack trace for V8 (only available in V8 engines)
    Error.captureStackTrace?.(this, AppError);
  }

  /* ── Convenience factory methods ───────────────────────────── */

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(message, 400, code, { isOperational: true });
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new AppError(message, 401, code, { isOperational: true });
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new AppError(message, 403, code, { isOperational: true });
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(message, 404, code, { isOperational: true });
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(message, 409, code, { isOperational: true });
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new AppError(message, 500, code, { isOperational: false });
  }
}
