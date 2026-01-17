/**
 * Type definitions for the Codebase Docs VS Code Extension
 * Copied from packages/cli/src/types/index.ts
 */

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

export interface DocTreeItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
  hasDocumentation: boolean;
}
