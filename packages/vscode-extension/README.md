# Codebase Documentation - VS Code Extension

View AI-generated code documentation directly in VS Code alongside your code.

## Features

- **📚 Documentation Sidebar**: Browse all documented files in a tree view
- **📖 Quick Documentation Panel**: View full engineering documentation in a side panel
- **🔄 Auto-Refresh**: Automatically reload documentation when manifest changes
- **⌨️ Keyboard Shortcut**: Open docs with `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)
- **🔁 CLI Integration**: Run documentation updates from the IDE

## Installation

1. Build the extension from source:
```bash
cd packages/vscode-extension
npm install
npm run build
```

2. Open VS Code extension development mode:
   - Press `Ctrl+Shift+D` and run the "Run Extension" launch configuration
   - Or from the CLI: `code --extensionDevelopmentPath=packages/vscode-extension examples/sample-codebase`

## Usage

### Initial Setup

First, initialize documentation in your project:
```bash
codebase-docs init
codebase-docs update
```

### Viewing Documentation

**In VS Code:**

1. Open a folder with `.docs/manifest.json` (created by `codebase-docs init`)
2. Look for the **"Documentation"** panel in the Explorer sidebar
3. Click any file to view its documentation in the side panel
4. Use `Ctrl+Shift+D` (`Cmd+Shift+D` on Mac) to show docs for the current file

### Refreshing Documentation

**Option 1: From VS Code**
- Run the command: `Codebase Docs: Refresh Documentation`
- A terminal will open and run `codebase-docs update`

**Option 2: From Terminal**
```bash
codebase-docs update
```

The documentation will automatically reload in VS Code when the manifest changes.

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Show Documentation | `Ctrl+Shift+D` | Show docs for current file |
| Refresh Documentation | — | Run `codebase-docs update` |
| Show in Documentation Sidebar | — | Reveal current file in sidebar |

## Architecture

The extension reads documentation from `.docs/manifest.json` created by the CLI tool. It:

1. **Loads the manifest** at startup
2. **Watches for changes** to automatically reload
3. **Shows a tree view** of all documented files
4. **Displays full documentation** in a Markdown-formatted panel
5. **Always shows engineering documentation** (not audience-specific)

## Data Source

Documentation comes from the CLI's two-stage LLM process:
- **Stage 1**: Code is analyzed to create engineering summary
- **Stage 2**: Engineering summary is translated for other audiences

The extension displays **engineering documentation** which is the most detailed and technical.

## Keyboard Shortcuts

- `Ctrl+Shift+D` (Windows/Linux) or `Cmd+Shift+D` (Mac): Show documentation for current file

## Troubleshooting

### "No documentation found"

1. Make sure you've run `codebase-docs init` in your workspace
2. Run `codebase-docs update` to generate documentation
3. Check that `.docs/manifest.json` exists
4. Reload VS Code with `Ctrl+R` (or `Cmd+R` on Mac)

### Documentation doesn't appear

1. Check the "Documentation" sidebar panel exists
2. Verify `.docs/manifest.json` is in your workspace root
3. Try running the "Refresh Documentation" command
4. Check VS Code's "Output" panel for debug messages

### Extension won't activate

1. Make sure the extension is installed
2. Open a workspace folder (not a single file)
3. Check that `codebase-docs init` has been run in this folder

## Development

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run dev
```

### Run Extension
1. Press `F5` to launch the extension development host
2. Or open the Run and Debug view (`Ctrl+Shift+D`) and select "Run Extension"

### Debug
1. Set breakpoints in VS Code
2. Press `F5` to start debugging
3. Open a workspace with `.docs/manifest.json`
4. Interact with the extension

## Testing with Sample Codebase

1. Generate documentation for the sample codebase:
```bash
cd examples/sample-codebase
codebase-docs update
```

2. Launch the extension in that folder:
```bash
code --extensionDevelopmentPath=packages/vscode-extension examples/sample-codebase
```

3. Look for the "Documentation" sidebar panel
4. Click files to view their documentation

## Files

- `src/extension.ts` - Extension entry point
- `src/manifestReader.ts` - Loads and watches manifest
- `src/treeProvider.ts` - Sidebar tree view
- `src/webviewProvider.ts` - Documentation panel
- `src/commands.ts` - VS Code command handlers
- `src/types.ts` - Type definitions

## Future Enhancements

- Hover previews on files
- Search/filter documentation
- Jump to file from documentation
- Audience switching (product/executive docs)
- Diff view showing what changed
- Integration with git to show historical documentation
