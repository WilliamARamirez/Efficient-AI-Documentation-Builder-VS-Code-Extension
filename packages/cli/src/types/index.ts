export interface Summary {
  content: string;
  hash: string;
  tokens: number;
  model: string;
  generatedAt: string;
  derivedFrom?: 'engineering';
}

export interface Summaries {
  engineering?: Summary;
  product?: Summary;
  executive?: Summary;
}

export interface MerkleNode {
  path: string;
  type: 'file' | 'directory';
  fileHash?: string;
  childrenHash?: string;
  children?: string[];
  lastAnalyzed?: string;
  summaries?: Summaries;
}

export interface Manifest {
  version: string;
  generatedAt: string;
  codeRootHash: string;
  gitCommit?: string;
  nodes: Record<string, MerkleNode>;
  stats: {
    totalFiles: number;
    totalTokensUsed: number;
    totalCost: number;
    lastFullGeneration?: string;
  };
  confluencePages?: Record<string, Record<string, string>>;
}

export interface Config {
  exclude?: string[];
  llm?: {
    provider?: 'anthropic' | 'openai';
    model?: string;
    maxTokens?: number;
    temperature?: number;
    apiKey?: string;
  };
  audiences?: {
    engineering?: { enabled: boolean; prompt?: string };
    product?: { enabled: boolean; prompt?: string };
    executive?: { enabled: boolean; prompt?: string };
  };
  confluence?: {
    url?: string;
    spaceKey?: string;
    parentPageId?: string;
  };
  costTracking?: {
    enabled?: boolean;
    monthlyBudget?: number;
    alertThreshold?: number;
  };
  embeddings?: EmbeddingConfig;
}

export interface UpdateResult {
  node: MerkleNode;
  summaries: Summaries;
  isNew: boolean;
  isChanged: boolean;
}

export type AudienceType = 'engineering' | 'product' | 'executive';

// Embedding types
export interface EmbeddingConfig {
  enabled?: boolean;
  provider?: 'openai' | 'voyage';
  model?: string;
  apiKey?: string;
  dimensions?: number;
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
  dimensions: number;
  tokens: number;
}

// Vector storage types
export interface VectorDocument {
  id: string;
  vector: number[];
  path: string;
  content: string;
  audience: AudienceType;
  fileHash: string;
  embeddedAt: string;
}

export interface SearchResult {
  path: string;
  content: string;
  audience: AudienceType;
  score: number;
}

export interface VectorSearchOptions {
  limit?: number;
  audience?: AudienceType;
  minScore?: number;
}
