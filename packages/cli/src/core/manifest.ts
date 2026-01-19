import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Manifest, MerkleNode, StagingFile } from '../types/index.js';

/**
 * Loads manifest from disk
 */
export function loadManifest(manifestPath: string): Manifest | null {
  try {
    if (!existsSync(manifestPath)) {
      return null;
    }

    const content = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load manifest: ${error}`);
    return null;
  }
}

/**
 * Saves manifest to disk
 */
export function saveManifest(manifestPath: string, manifest: Manifest): void {
  try {
    // Ensure directory exists
    const dir = dirname(manifestPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(manifest, null, 2);
    writeFileSync(manifestPath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save manifest: ${error}`);
  }
}

/**
 * Creates a new empty manifest
 */
export function createManifest(rootHash: string, gitCommit?: string): Manifest {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    codeRootHash: rootHash,
    gitCommit,
    nodes: {},
    stats: {
      totalFiles: 0,
      totalTokensUsed: 0,
      totalCost: 0,
    },
  };
}

/**
 * Updates manifest with new tree data
 */
export function updateManifest(
  manifest: Manifest,
  tree: Record<string, MerkleNode>,
  rootHash: string,
  gitCommit?: string
): Manifest {
  return {
    ...manifest,
    generatedAt: new Date().toISOString(),
    codeRootHash: rootHash,
    gitCommit,
    nodes: tree,
  };
}

/**
 * Compares current tree against manifest to find changes
 */
export interface ChangeDetection {
  new: MerkleNode[];
  changed: MerkleNode[];
  unchanged: MerkleNode[];
  deleted: string[];
}

export function detectChanges(
  currentTree: Record<string, MerkleNode>,
  manifest: Manifest | null
): ChangeDetection {
  const result: ChangeDetection = {
    new: [],
    changed: [],
    unchanged: [],
    deleted: [],
  };

  if (!manifest) {
    // Everything is new
    result.new = Object.values(currentTree);
    return result;
  }

  // Check for new and changed nodes
  for (const [path, currentNode] of Object.entries(currentTree)) {
    const storedNode = manifest.nodes[path];

    if (!storedNode) {
      result.new.push(currentNode);
    } else {
      const currentHash = currentNode.fileHash || currentNode.childrenHash;
      const storedHash = storedNode.fileHash || storedNode.childrenHash;

      if (currentHash !== storedHash) {
        result.changed.push(currentNode);
      } else {
        // Copy existing summaries to unchanged node
        currentNode.summaries = storedNode.summaries;
        currentNode.lastAnalyzed = storedNode.lastAnalyzed;
        result.unchanged.push(currentNode);
      }
    }
  }

  // Check for deleted nodes
  for (const path of Object.keys(manifest.nodes)) {
    if (!currentTree[path]) {
      result.deleted.push(path);
    }
  }

  return result;
}

/**
 * Calculates statistics from the tree
 */
export function calculateStats(tree: Record<string, MerkleNode>): Manifest['stats'] {
  let totalFiles = 0;
  let totalTokensUsed = 0;
  let totalCost = 0;

  for (const node of Object.values(tree)) {
    if (node.type === 'file') {
      totalFiles++;
    }

    if (node.summaries) {
      for (const summary of Object.values(node.summaries)) {
        if (summary) {
          totalTokensUsed += summary.tokens;
        }
      }
    }
  }

  // Claude 3.5 Haiku: $1/M input, $5/M output
  // Rough estimate: assume 50/50 input/output ratio
  totalCost = (totalTokensUsed / 1_000_000) * 3; // Average of $1 and $5

  return {
    totalFiles,
    totalTokensUsed,
    totalCost: Math.round(totalCost * 100) / 100, // Round to cents
  };
}

/**
 * Merges completed entries from staging into manifest
 * For each staging.completed entry, copies summaries to the corresponding node
 * Files in staging.failed are NOT updated (preserve old data or leave undocumented)
 */
export function mergeStaging(
  manifest: Manifest,
  tree: Record<string, MerkleNode>,
  staging: StagingFile
): Manifest {
  // Clone the tree to avoid mutating the original
  const updatedTree = { ...tree };

  // Process each completed entry from staging
  for (const entry of staging.completed) {
    const node = updatedTree[entry.path];
    if (node) {
      // Update the node with summaries from staging
      updatedTree[entry.path] = {
        ...node,
        summaries: entry.summaries,
        lastAnalyzed: entry.completedAt,
      };
    }
  }

  return {
    ...manifest,
    generatedAt: new Date().toISOString(),
    nodes: updatedTree,
  };
}
