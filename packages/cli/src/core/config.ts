import { cosmiconfigSync } from 'cosmiconfig';
import { Config } from '../types/index.js';

const DEFAULT_CONFIG: Config = {
  exclude: [
    '.docs',
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '.cache',
    '.vscode',
    '.idea',
    '*.log',
    '*.test.ts',
    '*.test.js',
    '*.spec.ts',
    '*.spec.js',
  ],
  llm: {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    maxTokens: 4000,
    temperature: 0.3,
  },
  audiences: {
    engineering: { enabled: true },
    product: { enabled: true },
    executive: { enabled: true },
  },
  costTracking: {
    enabled: true,
    monthlyBudget: 50.0,
    alertThreshold: 0.8,
  },
  embeddings: {
    enabled: false,
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
};

/**
 * Loads configuration from .codedocsrc.json or other supported formats
 */
export function loadConfig(searchFrom?: string): Config {
  const explorer = cosmiconfigSync('codedocs');
  const result = explorer.search(searchFrom);

  if (result && result.config) {
    // Merge with defaults
    return mergeConfig(DEFAULT_CONFIG, result.config);
  }

  return DEFAULT_CONFIG;
}

/**
 * Deep merges user config with default config
 */
function mergeConfig(defaults: Config, user: Partial<Config>): Config {
  return {
    exclude: user.exclude || defaults.exclude,
    llm: {
      ...defaults.llm,
      ...user.llm,
    },
    audiences: {
      engineering: {
        enabled: user.audiences?.engineering?.enabled ?? defaults.audiences?.engineering?.enabled ?? true,
        prompt: user.audiences?.engineering?.prompt || defaults.audiences?.engineering?.prompt,
      },
      product: {
        enabled: user.audiences?.product?.enabled ?? defaults.audiences?.product?.enabled ?? true,
        prompt: user.audiences?.product?.prompt || defaults.audiences?.product?.prompt,
      },
      executive: {
        enabled: user.audiences?.executive?.enabled ?? defaults.audiences?.executive?.enabled ?? true,
        prompt: user.audiences?.executive?.prompt || defaults.audiences?.executive?.prompt,
      },
    },
    confluence: {
      ...defaults.confluence,
      ...user.confluence,
    },
    costTracking: {
      ...defaults.costTracking,
      ...user.costTracking,
    },
    embeddings: {
      ...defaults.embeddings,
      ...user.embeddings,
    },
  };
}

/**
 * Gets default config (useful for init command)
 */
export function getDefaultConfig(): Config {
  return DEFAULT_CONFIG;
}
