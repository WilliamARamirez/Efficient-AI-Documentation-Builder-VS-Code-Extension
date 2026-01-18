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

  return excludePatterns.some(pattern => {
    // Exact path match (e.g., "src/foo/bar.ts")
    if (relativePath === pattern) {
      return true;
    }

    // Glob pattern matching (e.g., "*.test.ts", "src/**/*.spec.js")
    if (pattern.includes('*')) {
      // Simple glob matching for file extensions
      const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
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
