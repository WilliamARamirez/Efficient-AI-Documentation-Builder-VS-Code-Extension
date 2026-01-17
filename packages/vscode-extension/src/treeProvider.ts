import * as vscode from 'vscode';
import * as path from 'path';
import { ManifestReader } from './manifestReader';
import { DocTreeItem, MerkleNode } from './types';

/**
 * Provides documentation tree view for the sidebar
 */
export class DocumentationTreeProvider implements vscode.TreeDataProvider<DocTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DocTreeItem | undefined | null | void> =
    new vscode.EventEmitter<DocTreeItem | undefined | null | void>();

  onDidChangeTreeData: vscode.Event<DocTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(private manifestReader: ManifestReader) {
    // Listen for manifest changes and refresh tree
    this.manifestReader.onDidChange(() => this.refresh());
  }

  /**
   * Refreshes the entire tree
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  /**
   * Gets child items for a tree item
   */
  getChildren(element?: DocTreeItem): Thenable<DocTreeItem[]> {
    const manifest = this.manifestReader.getManifest();
    if (!manifest) {
      return Promise.resolve([]);
    }

    const parentPath = element?.path || '.';

    // Get children from manifest
    const childPaths = this.manifestReader.getDirectoryChildren(parentPath);

    const children: DocTreeItem[] = childPaths
      .map(childPath => {
        const node = manifest.nodes[childPath];
        if (!node) return null;

        const name = this.getDisplayName(childPath);
        return {
          path: childPath,
          name: name,
          type: node.type,
          hasDocumentation: node.type === 'file' && !!node.summaries?.engineering,
        };
      })
      .filter((item): item is DocTreeItem => item !== null)
      .sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        // Alphabetically
        return a.name.localeCompare(b.name);
      });

    return Promise.resolve(children);
  }

  /**
   * Gets the tree item representation
   */
  getTreeItem(element: DocTreeItem): vscode.TreeItem {
    const collapsibleState =
      element.type === 'directory' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;

    const treeItem = new vscode.TreeItem(element.name, collapsibleState);

    if (element.type === 'file') {
      treeItem.iconPath = new vscode.ThemeIcon('file');
      treeItem.command = {
        command: 'codebase-docs.showDocumentation',
        title: 'Show Documentation',
        arguments: [element.path],
      };
    } else {
      treeItem.iconPath = new vscode.ThemeIcon('folder');
    }

    treeItem.tooltip = element.path;
    treeItem.contextValue = element.type;

    return treeItem;
  }

  /**
   * Gets the display name for a path (just the last component)
   */
  private getDisplayName(filePath: string): string {
    return path.basename(filePath);
  }
}
