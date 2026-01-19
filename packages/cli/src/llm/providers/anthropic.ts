import Anthropic from '@anthropic-ai/sdk';
import {
  RateLimitError as AnthropicRateLimitError,
  APIError as AnthropicAPIError,
} from '@anthropic-ai/sdk';
import { Summary } from '../../types/index.js';
import { computeContentHash } from '../../core/hash.js';
import { RateLimitError, ApiError } from '../errors.js';

export class AnthropicProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(
    apiKey: string,
    model: string = 'claude-3-5-haiku-20241022',
    maxTokens: number = 4000,
    temperature: number = 0.3
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
    this.temperature = temperature;
  }

  /**
   * Generates a summary using Claude
   */
  async generateSummary(prompt: string, derivedFrom?: 'engineering'): Promise<Summary> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const summaryText = content.text;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const totalTokens = inputTokens + outputTokens;

      return {
        content: summaryText,
        hash: computeContentHash(summaryText),
        tokens: totalTokens,
        model: this.model,
        generatedAt: new Date().toISOString(),
        ...(derivedFrom && { derivedFrom }),
      };
    } catch (error) {
      // Handle Anthropic-specific errors
      if (error instanceof AnthropicRateLimitError) {
        // Extract retry-after header if available
        const retryAfter = this.extractRetryAfter(error);
        throw new RateLimitError(
          `Rate limit exceeded: ${error.message}`,
          retryAfter
        );
      }

      if (error instanceof AnthropicAPIError) {
        const statusCode = error.status ?? 500;
        const isRetryable = statusCode >= 500 || statusCode === 408;
        throw new ApiError(
          `API error: ${error.message}`,
          statusCode,
          isRetryable
        );
      }

      throw new Error(`Failed to generate summary: ${error}`);
    }
  }

  /**
   * Batch generates summaries (can be parallelized)
   */
  async generateSummaries(prompts: string[]): Promise<Summary[]> {
    return Promise.all(prompts.map(prompt => this.generateSummary(prompt)));
  }

  /**
   * Extracts retry-after header from Anthropic error if available
   */
  private extractRetryAfter(error: AnthropicRateLimitError): number | undefined {
    // Anthropic SDK exposes headers on the error object
    const headers = error.headers;
    if (headers) {
      const retryAfter = headers['retry-after'];
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }
}
