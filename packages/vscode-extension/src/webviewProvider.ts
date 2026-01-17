import * as vscode from 'vscode';
import * as path from 'path';
import { ManifestReader } from './manifestReader';
import { Summary } from './types';

/**
 * Manages the documentation webview panel
 */
export class DocumentationPanel {
  private panel: vscode.WebviewPanel | null = null;
  private currentFilePath: string | null = null;

  constructor(private manifestReader: ManifestReader) {}

  /**
   * Shows documentation for a file
   */
  show(filePath: string, context: vscode.ExtensionContext): void {
    const summary = this.manifestReader.getDocumentation(filePath);

    if (!summary) {
      vscode.window.showWarningMessage(`No documentation found for ${path.basename(filePath)}`);
      return;
    }

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'codebaseDocs',
        'Documentation',
        vscode.ViewColumn.Two,
        {}
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
      });
    }

    this.currentFilePath = filePath;
    this.panel.title = `${path.basename(filePath)} - Documentation`;
    this.panel.webview.html = this.getHtmlContent(summary, filePath);
    this.panel.reveal(vscode.ViewColumn.Two);
  }

  /**
   * Generates the HTML content for the webview
   */
  private getHtmlContent(summary: Summary, filePath: string): string {
    // Convert Markdown to HTML with improved converter
    const htmlContent = this.markdownToHtml(summary.content);

    const generatedDate = new Date(summary.generatedAt).toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${path.basename(filePath)} - Documentation</title>
  <style>
    :root {
      --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      --vscode-foreground: #d4d4d4;
      --vscode-editor-background: #1e1e1e;
      --vscode-panel-border: #3e3e42;
      --vscode-descriptionForeground: #858585;
      --vscode-textLink-foreground: #3b8eea;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
      line-height: 1.6;
    }

    .container {
      max-width: 100%;
      padding: 20px;
    }

    .metadata {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }

    .metadata-item {
      display: flex;
      gap: 6px;
    }

    .metadata-label {
      font-weight: 500;
    }

    .content {
      font-size: 14px;
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 12px;
      line-height: 1.25;
    }

    h1 {
      font-size: 2em;
      margin-top: 0;
      font-weight: 600;
    }

    h2 {
      font-size: 1.5em;
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }

    h3 {
      font-size: 1.25em;
      font-weight: 600;
    }

    p {
      margin: 0 0 12px 0;
    }

    code {
      background-color: rgba(255, 255, 255, 0.05);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.9em;
    }

    pre {
      background-color: rgba(0, 0, 0, 0.3);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 12px 0;
    }

    pre code {
      background-color: transparent;
      padding: 0;
    }

    ul, ol {
      margin: 12px 0;
      padding-left: 2em;
    }

    li {
      margin: 6px 0;
    }

    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    blockquote {
      margin: 12px 0;
      padding-left: 12px;
      border-left: 3px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="metadata">
      <div class="metadata-item">
        <span class="metadata-label">Generated:</span>
        <span>${generatedDate}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Tokens:</span>
        <span>${summary.tokens.toLocaleString()}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Model:</span>
        <span>${summary.model}</span>
      </div>
    </div>
    <div class="content">
      ${htmlContent}
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Improved Markdown to HTML converter
   */
  private markdownToHtml(markdown: string): string {
    let html = markdown;

    // Store code blocks and inline code BEFORE escaping
    const codeBlocks: string[] = [];
    const inlineCodes: string[] = [];

    // Extract code blocks
    html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (match, code) => {
      codeBlocks.push(code);
      return `___CODEBLOCK${codeBlocks.length - 1}___`;
    });

    // Extract inline code
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
      inlineCodes.push(code);
      return `___INLINECODE${inlineCodes.length - 1}___`;
    });

    // Now escape HTML in the remaining text
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold (use non-greedy matching)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic (use non-greedy matching)
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]+?<\/li>\n?)+/g, '<ul>$&</ul>');

    // Paragraphs (split on double newlines)
    const parts = html.split(/\n\n+/);
    html = parts.map(part => {
      part = part.trim();
      if (!part) return '';
      if (part.match(/^<(h[1-6]|ul|pre)/)) return part;
      return `<p>${part.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restore inline code
    inlineCodes.forEach((code, i) => {
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      html = html.replace(`___INLINECODE${i}___`, `<code>${escaped}</code>`);
    });

    // Restore code blocks
    codeBlocks.forEach((code, i) => {
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      html = html.replace(`___CODEBLOCK${i}___`, `<pre><code>${escaped}</code></pre>`);
    });

    return html;
  }

  /**
   * Disposes the panel
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}
