import { createHash } from 'crypto';
import { readFileSync } from 'fs';

/**
 * Computes SHA-256 hash of file content
 */
export function computeFileHash(filePath: string): string {
  try {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    throw new Error(`Failed to compute hash for ${filePath}: ${error}`);
  }
}

/**
 * Computes hash of directory based on sorted children hashes
 */
export function computeDirectoryHash(childrenHashes: string[]): string {
  // Sort children hashes for consistent hashing
  const sortedHashes = [...childrenHashes].sort().join('');
  return createHash('sha256').update(sortedHashes).digest('hex');
}

/**
 * Computes hash of string content (for summaries, etc.)
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
