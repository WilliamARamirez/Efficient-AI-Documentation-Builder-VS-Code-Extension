import * as vscode from 'vscode';
import { ManifestReader } from './manifestReader';
import { DocumentationPanel } from './webviewProvider';
import { DocumentationTreeProvider } from './treeProvider';

/**
 * Registers all VS Code commands for the extension
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  manifestReader: ManifestReader,
  panel: DocumentationPanel,
  treeProvider: DocumentationTreeProvider,
  treeView: vscode.TreeView<any>
): void {
  // Show documentation command
  context.subscriptions.push(
    vscode.commands.registerCommand('codebase-docs.showDocumentation', (filePath: string) => {
      panel.show(filePath, context);
    })
  );

  // Refresh documentation command
  context.subscriptions.push(
    vscode.commands.registerCommand('codebase-docs.refresh', async () => {
      await refreshDocumentation();
    })
  );

  // Show file in sidebar command
  context.subscriptions.push(
    vscode.commands.registerCommand('codebase-docs.showInSidebar', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (!workspaceFolder) {
        return;
      }

      const filePath = vscode.workspace.asRelativePath(editor.document.uri);

      // Focus the tree view
      await treeView.reveal(
        { path: filePath, name: '', type: 'file', hasDocumentation: true },
        { focus: true, select: true }
      );
    })
  );

  /**
   * Refreshes documentation by running the CLI command
   */
  async function refreshDocumentation(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const terminal =
      vscode.window.activeTerminal || vscode.window.createTerminal('Codebase Docs');
    terminal.show();

    // Run the update command
    terminal.sendText(`cd "${workspaceFolder.uri.fsPath}" && codebase-docs update`, true);

    vscode.window.showInformationMessage('Running documentation update...');
  }
}
