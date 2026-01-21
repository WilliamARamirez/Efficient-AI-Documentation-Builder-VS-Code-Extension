import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MerkleNode } from '../types/index.js';
import { computeFileHash, computeDirectoryHash } from './hash.js';

const DEFAULT_EXCLUDE = [
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
  // macOS system files
  '.DS_Store',
  // Images
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.webp',
  '*.bmp',
  '*.tiff',
  // Fonts
  '*.ttf',
  '*.otf',
  '*.woff',
  '*.woff2',
  '*.eot',
];

/**
 * Checks if a path should be excluded from the tree
 */
function shouldExclude(relativePath: string, excludePatterns: string[]): boolean {
  const pathParts = relativePath.split('/');
  const fileName = pathParts[pathParts.length - 1];

  return excludePatterns.some(pattern => {
    // Exact path match (e.g., "src/foo/bar.ts")
    if (relativePath === pattern) {
      return true;
    }

    // Exact filename match (e.g., ".DS_Store" matches "foo/bar/.DS_Store")
    if (!pattern.includes('/') && !pattern.includes('*') && fileName === pattern) {
      return true;
    }

    // Simple extension pattern (e.g., "*.png" matches any .png file at any depth)
    if (pattern.startsWith('*.') && !pattern.includes('/')) {
      const extension = pattern.slice(1); // ".png"
      return fileName.endsWith(extension);
    }

    // Glob pattern matching with path (e.g., "src/**/*.spec.js")
    if (pattern.includes('*')) {
      // Escape special regex chars except * and convert globs
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/{{GLOBSTAR}}/g, '.*');
      const regex = new RegExp('^' + escaped + '$');
      return regex.test(relativePath);
    }

    // Directory name matching (e.g., "node_modules", ".git")
    // Check if pattern matches any directory in the path or if path is inside that directory
    return pathParts.some(part => part === pattern) || relativePath.startsWith(pattern + '/');
  });
}

/**
 * Recursively builds a Merkle tree from the file system
 */
export function buildCodeMerkleTree(
  rootPath: string,
  excludePatterns: string[] = DEFAULT_EXCLUDE
): { tree: Record<string, MerkleNode>; rootHash: string } {
  const nodes: Record<string, MerkleNode> = {};

  function traverse(currentPath: string, rootDir: string): MerkleNode | null {
    const relativePath = relative(rootDir, currentPath) || '.';

    // Skip if excluded
    if (relativePath !== '.' && shouldExclude(relativePath, excludePatterns)) {
      return null;
    }

    const stats = statSync(currentPath);

    if (stats.isFile()) {
      // Leaf node - compute file hash
      const fileHash = computeFileHash(currentPath);
      const node: MerkleNode = {
        path: relativePath,
        type: 'file',
        fileHash,
        lastAnalyzed: new Date().toISOString(),
      };

      nodes[relativePath] = node;
      return node;
    } else if (stats.isDirectory()) {
      // Parent node - compute hash from children
      const entries = readdirSync(currentPath);
      const childNodes: MerkleNode[] = [];
      const childPaths: string[] = [];

      for (const entry of entries) {
        const entryPath = join(currentPath, entry);
        const childNode = traverse(entryPath, rootDir);

        if (childNode) {
          childNodes.push(childNode);
          childPaths.push(childNode.path);
        }
      }

      // Compute directory hash from children hashes
      const childrenHashes = childNodes.map(
        child => child.fileHash || child.childrenHash || ''
      );
      const childrenHash = computeDirectoryHash(childrenHashes);

      const node: MerkleNode = {
        path: relativePath,
        type: 'directory',
        childrenHash,
        children: childPaths.sort(),
        lastAnalyzed: new Date().toISOString(),
      };

      nodes[relativePath] = node;
      return node;
    }

    return null;
  }

  const rootNode = traverse(rootPath, rootPath);
  const rootHash = rootNode?.childrenHash || '';

  return { tree: nodes, rootHash };
}

/**
 * Traverses tree nodes in depth-first order
 */
export function* traverseTree(
  tree: Record<string, MerkleNode>,
  startPath: string = '.'
): Generator<MerkleNode> {
  const node = tree[startPath];
  if (!node) return;

  yield node;

  if (node.type === 'directory' && node.children) {
    for (const childPath of node.children) {
      yield* traverseTree(tree, childPath);
    }
  }
}

/**
 * Gets all file nodes from the tree (excludes directories)
 */
export function getFileNodes(tree: Record<string, MerkleNode>): MerkleNode[] {
  return Object.values(tree).filter(node => node.type === 'file');
}

/**
 * Gets all directory nodes from the tree
 */
export function getDirectoryNodes(tree: Record<string, MerkleNode>): MerkleNode[] {
  return Object.values(tree).filter(node => node.type === 'directory');
}

/**
 * Calculates the depth of a path (number of directory levels)
 */
function getPathDepth(path: string): number {
  if (path === '.') return 0;
  return path.split('/').length;
}

/**
 * Sorts nodes by their path depth
 * @param nodes - Array of MerkleNodes to sort
 * @param deepestFirst - If true (default), deepest paths come first; if false, shallowest first
 */
export function sortByDepth(nodes: MerkleNode[], deepestFirst: boolean = true): MerkleNode[] {
  return [...nodes].sort((a, b) => {
    const depthA = getPathDepth(a.path);
    const depthB = getPathDepth(b.path);
    return deepestFirst ? depthB - depthA : depthA - depthB;
  });
}
