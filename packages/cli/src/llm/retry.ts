import { RateLimitError, ApiError } from './errors.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

/**
 * Sleeps for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determines if an error should be retried
 */
function shouldRetry(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }
  if (error instanceof ApiError) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Calculates the delay for the next retry attempt
 */
function calculateDelay(
  attempt: number,
  options: Required<RetryOptions>,
  error: unknown
): number {
  // Honor retryAfter from RateLimitError when present
  if (error instanceof RateLimitError && error.retryAfter) {
    return Math.min(error.retryAfter * 1000, options.maxDelayMs);
  }

  // Exponential backoff with jitter
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

/**
 * Wraps an async function with retry logic using exponential backoff
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts: Required<RetryOptions> = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this isn't a retryable error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't retry if we've exhausted all attempts
      if (attempt >= opts.maxRetries) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts, error);
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}
