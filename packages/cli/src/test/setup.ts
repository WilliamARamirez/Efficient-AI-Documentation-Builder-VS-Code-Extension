/**
 * MSW Test Setup
 *
 * This file provides utilities for setting up MSW (Mock Service Worker) for tests.
 *
 * Prerequisites:
 * 1. Install msw: npm install --save-dev msw
 * 2. Configure your test runner (vitest, jest, etc.)
 *
 * Usage in test files:
 *
 * ```typescript
 * import { createServer, createRateLimitHandler } from '../test/setup.js';
 *
 * const server = createServer();
 *
 * describe('my test', () => {
 *   beforeAll(() => server.listen());
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 *
 *   it('handles rate limit', () => {
 *     // Override with rate limit handler for this test
 *     server.use(createRateLimitHandler(5));
 *
 *     // ... test code
 *   });
 * });
 * ```
 */

// Re-export handlers for use in tests
export * from './mocks/handlers.js';

/**
 * Creates and returns an MSW server instance
 * This function is designed to be called in test files
 */
export async function createServer() {
  const { setupServer } = await import('msw/node');
  const { handlers } = await import('./mocks/handlers.js');
  return setupServer(...handlers);
}

/**
 * Type for the MSW server (for use in test files)
 */
export type MswServer = Awaited<ReturnType<typeof createServer>>;
