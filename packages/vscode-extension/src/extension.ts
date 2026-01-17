import * as vscode from 'vscode';
import { ManifestReader } from './manifestReader';
import { DocumentationPanel } from './webviewProvider';
import { DocumentationTreeProvider } from './treeProvider';
import { registerCommands } from './commands';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  try {
    console.log('Codebase Docs extension activated');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.log('No workspace folder found');
      return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    console.log('Workspace root:', workspaceRoot);

    // Initialize manifest reader
    const manifestReader = new ManifestReader();
    console.log('Loading manifest...');
    const manifest = await manifestReader.load(workspaceRoot);

    if (!manifest) {
      console.log('No manifest found. Extension will wait for initialization.');
      vscode.window.showInformationMessage(
        'Run `codebase-docs init` in this folder to enable documentation features.'
      );
    } else {
      console.log('Manifest loaded successfully with', Object.keys(manifest.nodes).length, 'nodes');
    }

    // Start watching for manifest changes
    console.log('Setting up file watcher...');
    manifestReader.watchForChanges(workspaceRoot);

    // Create documentation panel
    const panel = new DocumentationPanel(manifestReader);
    context.subscriptions.push(panel);
    console.log('Documentation panel created');

    // Create and register tree view
    const treeProvider = new DocumentationTreeProvider(manifestReader);
    console.log('Creating tree view...');
    const treeView = vscode.window.createTreeView('codebaseDocs', {
      treeDataProvider: treeProvider,
    });

    context.subscriptions.push(treeView);
    console.log('Tree view created');

    // Register all commands
    console.log('Registering commands...');
    registerCommands(context, manifestReader, panel, treeProvider, treeView);

    // Register cleanup
    context.subscriptions.push({
      dispose: () => {
        manifestReader.dispose();
        panel.dispose();
      },
    });

    console.log('Codebase Docs extension fully initialized');
  } catch (error) {
    console.error('Error activating Codebase Docs extension:', error);
    vscode.window.showErrorMessage(
      `Failed to activate Codebase Docs extension: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('Codebase Docs extension deactivated');
}
