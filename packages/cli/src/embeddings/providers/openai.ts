import OpenAI from 'openai';
import { EmbeddingProvider } from '../types.js';
import { EmbeddingResult } from '../../types/index.js';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(
    apiKey: string,
    model: string = 'text-embedding-3-small',
    dimensions: number = 1536
  ) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
    });

    return {
      vector: response.data[0].embedding,
      model: this.model,
      dimensions: this.dimensions,
      tokens: response.usage.total_tokens,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });

    const tokensPerText = Math.floor(response.usage.total_tokens / texts.length);

    return response.data.map((item) => ({
      vector: item.embedding,
      model: this.model,
      dimensions: this.dimensions,
      tokens: tokensPerText,
    }));
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}
