/**
 * Custom error class for rate limit (429) errors
 */
export class RateLimitError extends Error {
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly isRetryable: boolean;

  constructor(message: string, statusCode: number, isRetryable: boolean = false) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}
