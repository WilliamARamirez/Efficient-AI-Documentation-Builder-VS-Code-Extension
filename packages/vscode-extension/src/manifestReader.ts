import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest, Summary } from './types';

/**
 * Manages loading and watching the documentation manifest
 */
export class ManifestReader {
  private manifest: Manifest | null = null;
  private watcher: vscode.FileSystemWatcher | null = null;
  private onChangeCallbacks: Array<() => void> = [];
  private workspaceRoot: string = '';

  /**
   * Loads the manifest from .docs/manifest.json
   */
  async load(workspaceRoot: string): Promise<Manifest | null> {
    this.workspaceRoot = workspaceRoot;
    const manifestPath = path.join(workspaceRoot, '.docs', 'manifest.json');

    try {
      if (!fs.existsSync(manifestPath)) {
        console.log('Manifest not found at', manifestPath);
        return null;
      }

      const content = fs.readFileSync(manifestPath, 'utf-8');
      this.manifest = JSON.parse(content);
      return this.manifest;
    } catch (error) {
      console.error('Failed to load manifest:', error);
      vscode.window.showErrorMessage(
        'Failed to load documentation manifest. Run `codebase-docs init` to initialize.'
      );
      return null;
    }
  }

  /**
   * Watches for changes to the manifest file and reloads it automatically
   */
  watchForChanges(workspaceRoot: string): void {
    if (this.watcher) {
      this.watcher.dispose();
    }

    const manifestPattern = new vscode.RelativePattern(
      vscode.Uri.file(workspaceRoot),
      '.docs/manifest.json'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(manifestPattern);

    this.watcher.onDidChange(async () => {
      console.log('Manifest changed, reloading...');
      await this.load(workspaceRoot);
      this.notifyChange();
    });

    this.watcher.onDidCreate(async () => {
      console.log('Manifest created, loading...');
      await this.load(workspaceRoot);
      this.notifyChange();
    });

    this.watcher.onDidDelete(() => {
      console.log('Manifest deleted');
      this.manifest = null;
      this.notifyChange();
    });
  }

  /**
   * Registers a callback to be called when manifest changes
   */
  onDidChange(callback: () => void): void {
    this.onChangeCallbacks.push(callback);
  }

  /**
   * Notifies all registered callbacks of changes
   */
  private notifyChange(): void {
    this.onChangeCallbacks.forEach(callback => callback());
  }

  /**
   * Gets the current manifest
   */
  getManifest(): Manifest | null {
    return this.manifest;
  }

  /**
   * Gets the engineering documentation for a specific file
   */
  getDocumentation(filePath: string): Summary | null {
    if (!this.manifest) {
      return null;
    }

    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    const node = this.manifest.nodes[normalizedPath];

    if (!node || !node.summaries || !node.summaries.engineering) {
      return null;
    }

    return node.summaries.engineering;
  }

  /**
   * Gets all documented paths (files and directories with summaries)
   */
  getDocumentedPaths(): string[] {
    if (!this.manifest) {
      return [];
    }

    return Object.keys(this.manifest.nodes)
      .filter(nodePath => {
        const node = this.manifest!.nodes[nodePath];
        return !!node.summaries?.engineering;
      });
  }

  /**
   * Gets all documented file paths (excludes directories)
   * @deprecated Use getDocumentedPaths() instead
   */
  getDocumentedFiles(): string[] {
    if (!this.manifest) {
      return [];
    }

    return Object.keys(this.manifest.nodes)
      .filter(nodePath => {
        const node = this.manifest!.nodes[nodePath];
        return node.type === 'file' && node.summaries?.engineering;
      });
  }

  /**
   * Gets children of a directory from the manifest
   */
  getDirectoryChildren(dirPath: string): string[] {
    if (!this.manifest) {
      return [];
    }

    const normalizedPath = dirPath.replace(/\\/g, '/');
    const node = this.manifest.nodes[normalizedPath];

    if (!node || node.type !== 'directory') {
      return [];
    }

    return node.children || [];
  }

  /**
   * Checks if a path has documentation
   */
  hasDocumentation(filePath: string): boolean {
    return this.getDocumentation(filePath) !== null;
  }

  /**
   * Disposes the watcher
   */
  dispose(): void {
    if (this.watcher) {
      this.watcher.dispose();
    }
  }
}
