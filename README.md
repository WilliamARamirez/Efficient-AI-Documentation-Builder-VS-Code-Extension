# Codebase Documentation Tool

An intelligent documentation system that uses Merkle trees and LLMs to automatically generate and maintain code documentation. Only regenerates documentation for files that have changed, minimizing costs and time.

## Features

- **Merkle Tree Change Detection**: Uses cryptographic hashing (like Git) to detect exactly which files changed
- **Cost Optimized**: Only analyzes changed files, reducing LLM costs by 90-95% on incremental updates
- **Multi-Audience Documentation**: Generates three types of docs from a single analysis:
  - **Engineering**: Detailed technical documentation
  - **Product**: Feature-focused documentation for PMs
  - **Executive**: High-level business impact summaries
- **Two-Stage LLM Approach**: Analyzes code once, then translates for different audiences (cheaper than re-analyzing)
- **No Circular Dependencies**: Documentation lives in your repo without triggering infinite regeneration loops

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
- `.codedocs.json` - Configuration file
- Updates `.gitignore` to include `.docs/`

### 2. Set API Key

**Recommended:** Create a `.env` file in your project root:

```bash
# Copy the example file
cp /path/to/auto-docs/.env.example .env

# Edit .env and add your API key
# .env file:
ANTHROPIC_API_KEY=your-api-key-here
```

**Alternative options:**

Export as environment variable:
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

Or add to `.codedocs.json` (not recommended for security):
```json
{
  "llm": {
    "apiKey": "your-api-key-here"
  }
}
```

**Important:** The `.env` file is already in `.gitignore` to prevent accidentally committing your API key.

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
codebase-docs update [--force]
```

Options:
- `--force`: Regenerate all documentation (ignores cache)

## Configuration

Create a `.codedocs.json` file in your project root:

```json
{
  "exclude": [
    "node_modules/",
    "dist/",
    "*.test.ts"
  ],

  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
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
  }
}
```

**Note:** Do NOT put your API key in `.codedocs.json`. Use a `.env` file instead (see setup instructions above).

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

Using Claude Sonnet 4 ($3/M input, $15/M output):

| Project Size | Initial Cost | Weekly Updates* | Monthly Cost |
|--------------|--------------|-----------------|--------------|
| Small (50 files) | $0.80 | $0.08 | $0.32 |
| Medium (200 files) | $3.20 | $0.32 | $1.28 |
| Large (1000 files) | $16.00 | $1.60 | $6.40 |

*Assumes 5% of files change per week

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
          "model": "claude-sonnet-4",
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
│   └── cli/                    # Core CLI tool
│       ├── src/
│       │   ├── commands/       # CLI commands (init, update, status)
│       │   ├── core/           # Core logic (Merkle tree, manifest, config)
│       │   ├── llm/            # LLM integration (Anthropic provider, prompts)
│       │   ├── types/          # TypeScript type definitions
│       │   └── index.ts        # CLI entry point
│       └── package.json
│
├── examples/
│   └── sample-codebase/        # Example project to test with
│       └── src/
│           ├── components/
│           └── utils/
│
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

## Future Enhancements (Phase 2+)

- **VS Code Extension**: Browse documentation in your IDE
- **Confluence Integration**: Auto-publish docs to Confluence
- **Directory Summaries**: Summarize entire directories, not just files
- **Smart Context**: Include related files in analysis (imports, etc.)
- **Custom Audiences**: Define your own audience types
- **Git Integration**: Track docs across git history

## How This Demonstrates Technical Skills

This project showcases:

1. **Data Structures**: Deep understanding of Merkle trees and hash-based change detection
2. **System Design**: Solving circular dependencies, optimizing for cost
3. **LLM Integration**: Two-stage approach for cost optimization
4. **TypeScript/Node.js**: Full-stack CLI tool with proper types
5. **Developer Experience**: Clean CLI, helpful output, good error handling
6. **Production Quality**: Configuration, cost tracking, incremental updates

## License

MIT

## Author

Built as a portfolio project demonstrating deep technical skills and practical system design.
