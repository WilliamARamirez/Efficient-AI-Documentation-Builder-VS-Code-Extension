import { Config } from '../types/index.js';
import { EmbeddingProvider } from './types.js';
import { OpenAIEmbeddingProvider } from './providers/openai.js';

export function createEmbeddingProvider(config: Config): EmbeddingProvider {
  const embeddingConfig = config.embeddings;

  if (!embeddingConfig?.enabled) {
    throw new Error('Embeddings are not enabled in configuration.');
  }

  const apiKey = embeddingConfig.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OpenAI API key not found. Add OPENAI_API_KEY to your .env file, set it as an environment variable, or add embeddings.apiKey to .codedocsrc.json'
    );
  }

  switch (embeddingConfig.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(
        apiKey,
        embeddingConfig.model,
        embeddingConfig.dimensions
      );
    default:
      throw new Error(`Unknown embedding provider: ${embeddingConfig.provider}`);
  }
}

export { EmbeddingProvider } from './types.js';
