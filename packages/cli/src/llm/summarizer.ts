import { readFileSync } from 'fs';
import { MerkleNode, Summaries, Config } from '../types/index.js';
import { AnthropicProvider } from './providers/anthropic.js';
import {
  getEngineeringPrompt,
  getProductPrompt,
  getExecutivePrompt,
} from './prompts.js';

export class Summarizer {
  private provider: AnthropicProvider;
  private enabledAudiences: Set<string>;

  constructor(config: Config) {
    const apiKey = config.llm?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or configure in .codedocs.json'
      );
    }

    this.provider = new AnthropicProvider(
      apiKey,
      config.llm?.model,
      config.llm?.maxTokens,
      config.llm?.temperature
    );

    // Determine which audiences are enabled
    this.enabledAudiences = new Set<string>();
    if (config.audiences?.engineering?.enabled !== false) {
      this.enabledAudiences.add('engineering');
    }
    if (config.audiences?.product?.enabled !== false) {
      this.enabledAudiences.add('product');
    }
    if (config.audiences?.executive?.enabled !== false) {
      this.enabledAudiences.add('executive');
    }
  }

  /**
   * Two-stage summarization for a file node:
   * Stage 1: Generate engineering summary from code
   * Stage 2: Derive product and executive summaries from engineering summary
   */
  async generateAllSummaries(node: MerkleNode, rootPath: string): Promise<Summaries> {
    const summaries: Summaries = {};

    // Only process file nodes (directories handled separately)
    if (node.type !== 'file') {
      return summaries;
    }

    // Stage 1: Generate engineering summary from source code
    if (this.enabledAudiences.has('engineering')) {
      const filePath = `${rootPath}/${node.path}`;
      const fileContent = readFileSync(filePath, 'utf-8');
      const engineeringPrompt = getEngineeringPrompt(node.path, fileContent);

      summaries.engineering = await this.provider.generateSummary(engineeringPrompt);
    }

    // Stage 2: Derive other summaries from engineering summary
    if (summaries.engineering) {
      const derivedPromises: Promise<void>[] = [];

      if (this.enabledAudiences.has('product')) {
        derivedPromises.push(
          (async () => {
            const productPrompt = getProductPrompt(summaries.engineering!.content);
            summaries.product = await this.provider.generateSummary(
              productPrompt,
              'engineering'
            );
          })()
        );
      }

      if (this.enabledAudiences.has('executive')) {
        derivedPromises.push(
          (async () => {
            const executivePrompt = getExecutivePrompt(summaries.engineering!.content);
            summaries.executive = await this.provider.generateSummary(
              executivePrompt,
              'engineering'
            );
          })()
        );
      }

      // Run derived summaries in parallel
      await Promise.all(derivedPromises);
    }

    return summaries;
  }

  /**
   * Regenerate only derived summaries (product/executive) from existing engineering summary
   * Useful when you want to refresh audience-specific docs without re-analyzing code
   */
  async refreshDerivedSummaries(engineeringSummary: string): Promise<Summaries> {
    const summaries: Summaries = {};
    const promises: Promise<void>[] = [];

    if (this.enabledAudiences.has('product')) {
      promises.push(
        (async () => {
          const productPrompt = getProductPrompt(engineeringSummary);
          summaries.product = await this.provider.generateSummary(productPrompt, 'engineering');
        })()
      );
    }

    if (this.enabledAudiences.has('executive')) {
      promises.push(
        (async () => {
          const executivePrompt = getExecutivePrompt(engineeringSummary);
          summaries.executive = await this.provider.generateSummary(
            executivePrompt,
            'engineering'
          );
        })()
      );
    }

    await Promise.all(promises);
    return summaries;
  }
}
