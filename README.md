# Codebase Documentation Tool

An intelligent documentation system that uses Merkle trees and LLMs to automatically generate and maintain code documentation. Only regenerates documentation for files that have changed, minimizing costs and time. This project includes a VS Code extention used to explore the documentation.

## Features

- **Merkle Tree Change Detection**: Uses cryptographic hashing (like Git) to detect exactly which files changed
- **Cost Optimized**: Only analyzes changed files, reducing LLM costs by 90-95% on incremental updates
- **Multi-Audience Documentation**: Generates three types of docs from a single analysis:
  - **Engineering**: Detailed technical documentation
  - **Product**: Feature-focused documentation for PMs
  - **Executive**: High-level business impact summaries
- **Two-Stage LLM Approach**: Analyzes code once, then translates for different audiences (cheaper than re-analyzing)
- **No Circular Dependencies**: Documentation lives in your repo without triggering infinite regeneration loops
- **MCP Server**: Expose documentation to LLMs via Model Context Protocol for AI-assisted development
- **Semantic Search** (optional): Query documentation by concept using vector embeddings with LanceDB
- **Directory Summaries**: Automatically generate aggregated documentation for entire directories
- **Crash Recovery**: Staging mechanism preserves progress if the process is interrupted
- **Retry with Backoff**: Automatic retries for transient API failures with exponential backoff
- **VS Code Extension**: Browse and view documentation directly in your IDE

## Architecture

### How It Works

1. **Build Merkle Tree**: Scans your codebase and creates a hash tree
   - Files get SHA-256 hashes of their content
   - Directories get hashes of their children's hashes

2. **Detect Changes**: Compares current tree against saved manifest
   - Only files with different hashes are marked for analysis
   - Unchanged files reuse existing documentation

3. **Generate Documentation** (Two-Stage):
   - **Stage 1**: LLM analyzes source code → Engineering summary
   - **Stage 2**: LLM translates engineering summary → Product & Executive summaries

4. **Save Manifest**: Persists the tree with all documentation for next run

### Why Merkle Trees?

The same data structure Git uses internally. Benefits:

- **Precise Change Detection**: Know exactly which files changed, not just "something changed"
- **O(log n) Comparison**: Don't need to read every file to detect changes
- **Hash Propagation**: File change automatically updates parent directory hashes up to root

### Avoiding Circular Dependencies

The tool computes a "code hash" that **excludes** the `.docs/` directory. This means:

- Documentation can live in your repository (`.docs/manifest.json`)
- Updating docs doesn't trigger re-hashing
- No infinite regeneration loops

## Reliability Features

The tool includes several mechanisms to ensure reliable documentation generation, especially for large codebases.

### Retry Logic with Exponential Backoff

All LLM API calls are wrapped with automatic retry logic to handle transient failures:

- **Exponential backoff**: Starts at 1 second, doubles each retry, caps at 60 seconds
- **Jitter**: Adds 10% random variation to prevent thundering herd problems
- **Smart retries**: Only retries on recoverable errors (rate limits, server errors, timeouts)
- **Rate limit awareness**: Honors `retry-after` headers from the API for precise timing
- **Configurable**: Default 3 retries, customizable via code

### Error Handling

Custom error classification ensures appropriate handling:

| Error Type | Status Codes | Behavior |
|------------|--------------|----------|
| Rate Limit | 429 | Retry with backoff, honor retry-after header |
| Server Error | 5xx | Retry with backoff |
| Timeout | 408 | Retry with backoff |
| Client Error | 4xx (except 408, 429) | Fail immediately (not retryable) |

Failed files are tracked in staging with retry counts and error details for manual review.

### Staging Mechanism

Progress is tracked incrementally in `.docs/staging.json`:

- **Crash recovery**: If the process is interrupted, resume from where you left off
- **Completed tracking**: Successfully processed files are saved immediately
- **Failed tracking**: Errors are recorded with retry counts and rate-limit status
- **Stale detection**: Automatically detects if code changed since staging was created
- **Atomic writes**: Uses temp file + rename pattern to prevent corruption

### Locking Mechanism

Prevents concurrent documentation updates via `.docs/.update.lock`:

- **Process tracking**: Stores PID, hostname, and start time
- **Stale lock detection**: Checks if the locking process is still running
- **Auto-cleanup**: Releases lock on process exit, SIGINT, or SIGTERM
- **Clear error messages**: Tells you which process holds the lock if blocked

### Incremental Bundling

Large codebases are processed in batches to minimize data loss and memory usage:

- **Batch size**: Every 5 files (configurable via `bundleThreshold` in config), progress is saved to the manifest
- **Memory efficient**: Doesn't hold entire documentation set in memory during long runs
- **Crash resilient**: Loses at most one batch of work if the process crashes
- **Automatic merging**: Completed work is merged from staging into the manifest periodically

**How it works:**

1. Files are processed one at a time with retry logic
2. Successfully processed files accumulate in staging
3. When the threshold is reached (default: 5 files):
   - Staging is merged into the manifest
   - Manifest is saved to disk
   - Staging is cleared (failed entries preserved)
4. After all files complete, any remaining staged work is merged

This means a 1000-file codebase saves progress 200 times during processing, not just once at the end.

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd auto-docs

# Install dependencies
npm install

# Build the CLI
npm run build

# Link CLI globally (optional)
cd packages/cli
npm link
```

## Usage

### 1. Initialize Documentation

```bash
cd examples/sample-codebase
codebase-docs init
```

This creates:
- `.docs/manifest.json` - Stores the Merkle tree and all documentation
- `.codedocsrc.json` - Configuration file
- `.mcp.json` - MCP server configuration for Claude Code integration
- Updates `.gitignore` to include `.docs/` and `.mcp.json`

### 2. Set API Keys

**Recommended:** Create a `.env` file in your project root:

```bash
# Copy the example file
cp /path/to/auto-docs/.env.example .env

# Edit .env and add your API keys
```

`.env` file contents:
```bash
# Required - for documentation generation
ANTHROPIC_API_KEY=your-anthropic-key-here

# Optional - only needed if you enable semantic search
OPENAI_API_KEY=your-openai-key-here
```

**Alternative options:**

Export as environment variables:
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
export OPENAI_API_KEY="your-openai-key-here"  # optional
```

**Important:** The `.env` file is already in `.gitignore` to prevent accidentally committing your API keys.

### 3. Generate Documentation

```bash
# First run - analyzes all files
codebase-docs update

# Subsequent runs - only analyzes changed files
codebase-docs update

# Force regenerate everything
codebase-docs update --force
```

### 4. Check Status

```bash
codebase-docs status
```

Shows:
- How many files changed
- Which files need updating
- Cost statistics
- Last generation time

## CLI Commands

### `init`

Initialize documentation in the current project.

```bash
codebase-docs init [--force]
```

Options:
- `--force`: Reinitialize even if already initialized

### `status`

Check documentation status and show what needs updating.

```bash
codebase-docs status
```

### `update`

Update documentation for changed files.

```bash
codebase-docs update [--force] [--quiet]
```

Options:
- `--force`: Regenerate all documentation (ignores cache)
- `--quiet`: Minimal output (useful for git hooks)

### `serve`

Start the MCP server to expose documentation to LLMs.

```bash
codebase-docs serve
```

The server uses stdio transport for integration with Claude Code and other MCP clients. See [MCP Server Integration](#mcp-server-integration) for setup details.

## Configuration

Create a `.codedocsrc.json` file in your project root:

```json
{
  "exclude": [
    "node_modules/",
    "dist/",
    "*.test.ts"
  ],

  "llm": {
    "provider": "anthropic",
    "model": "claude-3-5-haiku-20241022",
    "maxTokens": 4000,
    "temperature": 0.3
  },

  "audiences": {
    "engineering": { "enabled": true },
    "product": { "enabled": true },
    "executive": { "enabled": true }
  },

  "costTracking": {
    "enabled": true,
    "monthlyBudget": 50.00,
    "alertThreshold": 0.8
  },

  "embeddings": {
    "enabled": false,
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimensions": 1536
  }
}
```

**Note:** Do NOT put your API keys in `.codedocsrc.json`. Use a `.env` file instead (see setup instructions above).

### Embeddings Configuration

Embeddings enable semantic search over your documentation. When enabled:
- Requires `OPENAI_API_KEY` in your `.env` file
- Creates `.docs/vectors.lance/` directory for vector storage
- Allows the MCP server's `search_docs` tool to find documentation by concept

Set `"embeddings": { "enabled": true }` to activate this feature.

## MCP Server Integration

The MCP (Model Context Protocol) server allows LLMs like Claude to query your codebase documentation directly.

### How MCP Discovery Works

The `codebase-docs serve` command uses **stdio transport**, which means Claude Code must spawn the server process itself to communicate with it. Running `codebase-docs serve` manually in a terminal won't work—Claude needs to be configured to launch it.

Claude Code reads MCP server configurations from `.mcp.json` files in these locations:
- **Project-level**: `.mcp.json` in your project root (recommended for project-specific setups)
- **Global**: `~/.mcp.json` in your home directory (for servers you want available everywhere)

**Important:** After adding or modifying `.mcp.json`, you must **restart Claude Code** for the changes to take effect.

### Setup with Claude Code

**Automatic setup (recommended)**

The `codebase-docs init` command automatically creates a `.mcp.json` file in your project directory. Just restart Claude Code after running init, and the MCP server will be available.

**Option 1: Project-level configuration (manual)**

If you need to create the config manually, add a `.mcp.json` file in the root of your project:

```json
{
  "mcpServers": {
    "codebase-docs": {
      "command": "npx",
      "args": ["codebase-docs", "serve"]
    }
  }
}
```

**Option 2: Global configuration with full path**

If you haven't published the package to npm, add to `~/.mcp.json` with the full path to the CLI:

```json
{
  "mcpServers": {
    "codebase-docs": {
      "command": "node",
      "args": ["/path/to/auto-docs/packages/cli/dist/index.js", "serve"],
      "cwd": "/path/to/your/initialized/project"
    }
  }
}
```

The `cwd` field is required when using a global configuration—it tells the server which project's `.docs/manifest.json` to load.

**Option 3: If installed globally**

```json
{
  "mcpServers": {
    "codebase-docs": {
      "command": "codebase-docs",
      "args": ["serve"]
    }
  }
}
```

### Verifying the Server is Connected

After restarting Claude Code, you can verify the server is connected by asking Claude to use one of the tools (e.g., "list all documented files using codebase-docs"). If configured correctly, you'll see the MCP tools available in Claude's responses.

### Available Tools

| Tool | Description | Requires Embeddings |
|------|-------------|---------------------|
| `search_docs` | Semantic search - find docs by concept | Yes |
| `get_file_doc` | Get documentation for a specific file | No |
| `list_files` | List all documented files | No |

### Available Resources

| Resource URI | Description |
|--------------|-------------|
| `docs://overview` | High-level codebase summary |
| `docs://stats` | Documentation generation statistics |
| `docs://manifest` | Summarized manifest with file list |

### Example Queries

Once connected, an LLM can ask:
- "What files handle authentication?" → `search_docs`
- "Show me the documentation for src/utils/validators.ts" → `get_file_doc`
- "List all documented files in the components folder" → `list_files`

## VS Code Extension

View documentation directly in your IDE while browsing and editing code.

### Features

- **Documentation Sidebar**: Browse all documented files and directories in a hierarchical tree view
- **Directory Summaries**: View aggregated documentation for entire directories, not just individual files
- **Quick Documentation Panel**: View full documentation side-by-side with code
- **Keyboard Shortcut**: Open docs with `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)
- **Live Reload**: File watcher automatically refreshes when `.docs/manifest.json` changes
- **Multi-Audience Views**: Switch between Engineering, Product, and Executive documentation
- **CLI Integration**: Run `codebase-docs update` directly from the IDE terminal

### Getting Started

1. **Build the extension**:
```bash
cd packages/vscode-extension
npm install
npm run build
```

2. **Launch in VS Code**:
```bash
code --extensionDevelopmentPath=packages/vscode-extension /path/to/your/project
```

3. **View documentation**:
   - Look for "Documentation" in the Explorer sidebar
   - Click any file or directory to view its documentation
   - Press `Ctrl+Shift+D` to show docs for the current file

### Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Show Documentation | `Ctrl+Shift+D` / `Cmd+Shift+D` | View docs for the file you're editing |
| Refresh Documentation | - | Reload documentation from manifest |
| Show in Sidebar | - | Reveal current file in documentation tree |

### Architecture

The extension consists of several components:

- **Manifest Reader**: Loads and watches `.docs/manifest.json` for changes
- **Tree Provider**: Renders the hierarchical documentation structure in the sidebar
- **Webview Provider**: Displays formatted documentation in a panel
- **Command Handlers**: Integrates with VS Code's command palette

For detailed instructions, see [VS Code Extension README](packages/vscode-extension/README.md).

## Example Output

### First Run (All New Files)

```
🔍 Scanning codebase...

✓ Found 4 files

Files to process: 4
  New: 4
  Changed: 0
  Unchanged: 0 (skipping)

[1/4] new src/components/Button.tsx (850 tokens)
[2/4] new src/components/Input.tsx (920 tokens)
[3/4] new src/utils/validators.ts (780 tokens)
[4/4] new src/utils/formatters.ts (690 tokens)

💾 Saving manifest...

✅ Documentation updated!

Statistics:
  Files processed: 4
  Tokens used: 3,240
  Total tokens (all time): 3,240
  Estimated cost this run: $0.03
  Total cost (all time): $0.03
```

### Incremental Update (1 Changed File)

```
🔍 Scanning codebase...

✓ Found 4 files

Files to process: 1
  New: 0
  Changed: 1
  Unchanged: 3 (skipping)

[1/1] changed src/components/Button.tsx (870 tokens)

💾 Saving manifest...

✅ Documentation updated!

Statistics:
  Files processed: 1
  Tokens used: 870
  Total tokens (all time): 4,110
  Estimated cost this run: $0.01
  Total cost (all time): $0.04
  💡 Saved ~$0.03 by skipping 3 unchanged files!
```

## Cost Analysis

Using Claude 3.5 Haiku ($1/M input, $5/M output):

| Project Size | Initial Cost | Weekly Updates* | Monthly Cost |
|--------------|--------------|-----------------|--------------|
| Small (50 files) | $0.27 | $0.03 | $0.11 |
| Medium (200 files) | $1.07 | $0.11 | $0.43 |
| Large (1000 files) | $5.33 | $0.53 | $2.13 |

*Assumes 5% of files change per week

**Note:** Haiku is 3x cheaper than Sonnet 4 while still providing excellent documentation quality. You can switch to a more powerful model in `.codedocsrc.json` if needed.

## Manifest Structure

The `.docs/manifest.json` file contains:

```json
{
  "version": "1.0.0",
  "generatedAt": "2025-01-16T15:30:00Z",
  "codeRootHash": "abc123...",
  "gitCommit": "def456...",

  "nodes": {
    "src/components/Button.tsx": {
      "type": "file",
      "fileHash": "hash_of_content",
      "lastAnalyzed": "2025-01-16T15:30:00Z",

      "summaries": {
        "engineering": {
          "content": "Detailed technical summary...",
          "hash": "summary_hash",
          "tokens": 450,
          "model": "claude-3-5-haiku-20241022",
          "generatedAt": "2025-01-16T15:30:00Z"
        },
        "product": {
          "derivedFrom": "engineering",
          "content": "Product-focused summary...",
          "tokens": 200
        },
        "executive": {
          "derivedFrom": "engineering",
          "content": "Executive summary...",
          "tokens": 150
        }
      }
    }
  },

  "stats": {
    "totalFiles": 4,
    "totalTokensUsed": 3240,
    "totalCost": 0.03
  }
}
```

## Project Structure

```
auto-docs/
├── packages/
│   ├── cli/                    # Core CLI tool
│   │   ├── src/
│   │   │   ├── commands/       # CLI commands (init, update, status, serve)
│   │   │   ├── core/           # Core logic (Merkle tree, manifest, config)
│   │   │   ├── embeddings/     # Embedding providers (OpenAI)
│   │   │   ├── llm/            # LLM integration (Anthropic provider, prompts)
│   │   │   ├── mcp/            # MCP server (tools, resources)
│   │   │   ├── vector/         # Vector storage (LanceDB)
│   │   │   ├── types/          # TypeScript type definitions
│   │   │   └── index.ts        # CLI entry point
│   │   └── package.json
│   │
│   └── vscode-extension/       # VS Code extension
│
├── examples/
│   └── sample-codebase/        # Example project to test with
│
├── .env.example                # API key template
├── README.md
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (auto-rebuild)
cd packages/cli
npm run dev

# Run CLI locally
cd packages/cli
node dist/index.js init
```

## Future Enhancements

- **Confluence Integration**: Auto-publish docs to Confluence
- **Git Integration**: Track documentation changes across git history
- **CI/CD Integration**: GitHub Actions workflow for automated documentation updates


## License

MIT

## Author

Built as a portfolio project demonstrating deep technical skills and practical system design.
