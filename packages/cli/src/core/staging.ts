import { readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { StagingFile, StagingEntry, FailedEntry, Summaries } from '../types/index.js';

const STAGING_VERSION = '1.0.0';

/**
 * Loads existing staging file or returns null
 */
export function loadStaging(stagingPath: string): StagingFile | null {
  try {
    if (!existsSync(stagingPath)) {
      return null;
    }
    const content = readFileSync(stagingPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load staging file: ${error}`);
    return null;
  }
}

/**
 * Saves staging file atomically using temp file + rename
 */
export function saveStaging(stagingPath: string, staging: StagingFile): void {
  try {
    // Ensure directory exists
    const dir = dirname(stagingPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(staging, null, 2);
    const tempPath = `${stagingPath}.tmp`;

    // Write to temp file first
    writeFileSync(tempPath, content, 'utf-8');

    // Atomic rename
    renameSync(tempPath, stagingPath);
  } catch (error) {
    throw new Error(`Failed to save staging file: ${error}`);
  }
}

/**
 * Creates a new staging file
 */
export function createStaging(rootHash: string): StagingFile {
  return {
    version: STAGING_VERSION,
    startedAt: new Date().toISOString(),
    rootHash,
    completed: [],
    failed: [],
  };
}

/**
 * Adds a completed entry to staging
 */
export function addCompletedEntry(
  staging: StagingFile,
  path: string,
  fileHash: string,
  summaries: Summaries,
  tokensUsed: number
): StagingFile {
  const entry: StagingEntry = {
    path,
    fileHash,
    summaries,
    completedAt: new Date().toISOString(),
    tokensUsed,
  };

  return {
    ...staging,
    completed: [...staging.completed, entry],
  };
}

/**
 * Adds a failed entry to staging
 */
export function addFailedEntry(
  staging: StagingFile,
  path: string,
  fileHash: string,
  error: string,
  retryCount: number,
  isRateLimited: boolean
): StagingFile {
  // Check if we already have a failed entry for this path
  const existingIndex = staging.failed.findIndex(f => f.path === path);

  const entry: FailedEntry = {
    path,
    fileHash,
    error,
    failedAt: new Date().toISOString(),
    retryCount,
    isRateLimited,
  };

  if (existingIndex >= 0) {
    // Update existing entry
    const newFailed = [...staging.failed];
    newFailed[existingIndex] = entry;
    return {
      ...staging,
      failed: newFailed,
    };
  }

  return {
    ...staging,
    failed: [...staging.failed, entry],
  };
}

/**
 * Clears (deletes) the staging file
 */
export function clearStaging(stagingPath: string): void {
  try {
    if (existsSync(stagingPath)) {
      unlinkSync(stagingPath);
    }
  } catch (error) {
    console.warn(`Failed to clear staging file: ${error}`);
  }
}

/**
 * Gets the set of completed paths from staging
 */
export function getCompletedPaths(staging: StagingFile): Set<string> {
  return new Set(staging.completed.map(entry => entry.path));
}

/**
 * Gets the set of failed paths from staging
 */
export function getFailedPaths(staging: StagingFile): Set<string> {
  return new Set(staging.failed.map(entry => entry.path));
}

/**
 * Gets the total tokens used in completed entries
 */
export function getTotalTokensUsed(staging: StagingFile): number {
  return staging.completed.reduce((sum, entry) => sum + entry.tokensUsed, 0);
}
