import { http, HttpResponse } from 'msw';

/**
 * Default mock response for Anthropic API
 */
function createMockAnthropicResponse(text: string = 'Mocked summary response') {
  return {
    id: 'msg_mock_12345',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'claude-3-5-haiku-20241022',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  };
}

/**
 * Default MSW handlers for mocking Anthropic API
 */
export const handlers = [
  // Mock Anthropic API success
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json(createMockAnthropicResponse());
  }),
];

/**
 * Handler that returns a rate limit (429) error
 * Use with server.use() for specific test scenarios
 */
export function createRateLimitHandler(retryAfterSeconds: number = 5) {
  return http.post('https://api.anthropic.com/v1/messages', () => {
    return new HttpResponse(
      JSON.stringify({
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded',
        },
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'retry-after': String(retryAfterSeconds),
        },
      }
    );
  });
}

/**
 * Handler that returns a server error (500)
 * Use with server.use() for specific test scenarios
 */
export function createServerErrorHandler() {
  return http.post('https://api.anthropic.com/v1/messages', () => {
    return new HttpResponse(
      JSON.stringify({
        type: 'error',
        error: {
          type: 'internal_server_error',
          message: 'Internal server error',
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  });
}

/**
 * Handler that returns an API error (400)
 * Use with server.use() for specific test scenarios
 */
export function createApiErrorHandler(statusCode: number = 400, message: string = 'Bad request') {
  return http.post('https://api.anthropic.com/v1/messages', () => {
    return new HttpResponse(
      JSON.stringify({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message,
        },
      }),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  });
}

/**
 * Handler that returns a timeout error
 * Use with server.use() for specific test scenarios
 */
export function createTimeoutHandler() {
  return http.post('https://api.anthropic.com/v1/messages', () => {
    return new HttpResponse(null, {
      status: 408,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
}

/**
 * Creates a handler that succeeds after N failures
 * Useful for testing retry logic
 */
export function createFailThenSuccessHandler(failCount: number, failStatus: number = 429) {
  let callCount = 0;

  return http.post('https://api.anthropic.com/v1/messages', () => {
    callCount++;

    if (callCount <= failCount) {
      if (failStatus === 429) {
        return new HttpResponse(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'rate_limit_error',
              message: 'Rate limit exceeded',
            },
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'retry-after': '1',
            },
          }
        );
      }

      return new HttpResponse(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'internal_server_error',
            message: 'Server error',
          },
        }),
        {
          status: failStatus,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return HttpResponse.json(createMockAnthropicResponse());
  });
}

/**
 * Creates a handler with custom response
 */
export function createCustomResponseHandler(text: string) {
  return http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json(createMockAnthropicResponse(text));
  });
}
