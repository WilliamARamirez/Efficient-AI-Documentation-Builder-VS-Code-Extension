import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { hostname } from 'os';
import { LockFile } from '../types/index.js';

/**
 * Checks if a process with the given PID is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads lock file data from disk
 */
function loadLockFile(lockPath: string): LockFile | null {
  try {
    if (!existsSync(lockPath)) {
      return null;
    }
    const content = readFileSync(lockPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Checks if the lock file is stale (process no longer running)
 */
export function isLockStale(lockPath: string): boolean {
  const lockData = loadLockFile(lockPath);
  if (!lockData) {
    return true; // No lock file = stale
  }

  // Check if the process is still running
  return !isProcessRunning(lockData.pid);
}

/**
 * Checks if a lock exists and is active
 * Returns true if lock exists and is active, false if no lock or stale
 */
export function checkLock(lockPath: string): boolean {
  if (!existsSync(lockPath)) {
    return false;
  }

  // If lock is stale, remove it and return false
  if (isLockStale(lockPath)) {
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore errors when removing stale lock
    }
    return false;
  }

  return true;
}

/**
 * Gets the lock file data if it exists and is active
 */
export function getLockInfo(lockPath: string): LockFile | null {
  if (!checkLock(lockPath)) {
    return null;
  }
  return loadLockFile(lockPath);
}

/**
 * Acquires a lock by creating a lock file with PID, hostname, and timestamp
 * @throws Error if lock cannot be acquired
 */
export function acquireLock(lockPath: string): void {
  // First check if there's an active lock
  if (checkLock(lockPath)) {
    const lockInfo = loadLockFile(lockPath);
    throw new Error(
      `Another update is in progress (PID: ${lockInfo?.pid}, started: ${lockInfo?.startedAt})`
    );
  }

  // Create lock file
  const lockData: LockFile = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: hostname(),
  };

  try {
    // Ensure directory exists
    const dir = dirname(lockPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(lockData, null, 2);
    writeFileSync(lockPath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to acquire lock: ${error}`);
  }
}

/**
 * Releases the lock by removing the lock file
 */
export function releaseLock(lockPath: string): void {
  try {
    if (existsSync(lockPath)) {
      // Verify we own this lock before removing
      const lockData = loadLockFile(lockPath);
      if (lockData && lockData.pid === process.pid) {
        unlinkSync(lockPath);
      }
    }
  } catch {
    // Ignore errors when releasing lock
  }
}

/**
 * Creates a cleanup handler that releases the lock on process exit
 * Returns a function to remove the handler (useful for cleanup after normal completion)
 */
export function setupLockCleanup(lockPath: string): () => void {
  const cleanup = () => {
    releaseLock(lockPath);
  };

  // Handle various termination signals
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  // Return function to remove handlers
  return () => {
    process.removeListener('SIGINT', cleanup);
    process.removeListener('SIGTERM', cleanup);
    process.removeListener('exit', cleanup);
  };
}
