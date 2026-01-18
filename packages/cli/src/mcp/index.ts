import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { VectorStore } from '../vector/index.js';
import { createEmbeddingProvider, EmbeddingProvider } from '../embeddings/index.js';
import { loadManifest } from '../core/manifest.js';
import { loadConfig } from '../core/config.js';
import { Manifest, Config } from '../types/index.js';
import {
  searchDocs,
  getFileDoc,
  listFiles,
  SearchDocsSchema,
  GetFileDocSchema,
  ListFilesSchema,
} from './tools.js';
import { getOverviewResource, getStatsResource, getManifestResource } from './resources.js';

export class MCPServer {
  private server: Server;
  private vectorStore: VectorStore | null = null;
  private embeddingProvider: EmbeddingProvider | null = null;
  private manifest: Manifest;
  private config: Config;
  private cwd: string;
  private embeddingsEnabled: boolean;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.config = loadConfig(cwd);
    this.embeddingsEnabled = this.config.embeddings?.enabled ?? false;

    const manifest = loadManifest(`${cwd}/.docs/manifest.json`);
    if (!manifest) {
      throw new Error(
        'No manifest found. Run `codebase-docs init` and `codebase-docs update` first.'
      );
    }
    this.manifest = manifest;

    this.server = new Server(
      {
        name: 'codebase-docs',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_docs',
          description:
            'Semantic search over codebase documentation. Use this to find relevant code based on concepts or functionality.' +
            (this.embeddingsEnabled
              ? ''
              : ' (Note: Requires embeddings to be enabled in configuration)'),
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: { type: 'string', description: 'Natural language search query' },
              limit: { type: 'number', description: 'Max results (default: 5)' },
              audience: {
                type: 'string',
                enum: ['engineering', 'product', 'executive'],
                description: 'Filter by audience type',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_file_doc',
          description: 'Get documentation for a specific file path.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              path: { type: 'string', description: 'File path' },
              audience: {
                type: 'string',
                enum: ['engineering', 'product', 'executive'],
                description: 'Audience type (default: engineering)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'list_files',
          description: 'List all documented files, optionally filtered by glob pattern.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              pattern: { type: 'string', description: 'Glob pattern to filter (e.g., "src/**/*.ts")' },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_docs': {
            const input = SearchDocsSchema.parse(args);
            const result = await searchDocs(input, this.vectorStore, this.embeddingProvider);
            return { content: [{ type: 'text' as const, text: result }] };
          }
          case 'get_file_doc': {
            const input = GetFileDocSchema.parse(args);
            const result = getFileDoc(input, this.manifest);
            return { content: [{ type: 'text' as const, text: result }] };
          }
          case 'list_files': {
            const input = ListFilesSchema.parse(args);
            const result = listFiles(input, this.manifest);
            return { content: [{ type: 'text' as const, text: result }] };
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'docs://overview',
          name: 'Codebase Overview',
          description: 'High-level summary of the documented codebase',
          mimeType: 'text/markdown',
        },
        {
          uri: 'docs://stats',
          name: 'Documentation Stats',
          description: 'Statistics about documentation generation',
          mimeType: 'application/json',
        },
        {
          uri: 'docs://manifest',
          name: 'Documentation Manifest',
          description: 'Summarized manifest with file list and metadata',
          mimeType: 'application/json',
        },
      ],
    }));

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'docs://overview':
          return {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: getOverviewResource(this.manifest),
              },
            ],
          };
        case 'docs://stats':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: getStatsResource(this.manifest),
              },
            ],
          };
        case 'docs://manifest':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: getManifestResource(this.manifest),
              },
            ],
          };
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  async start(): Promise<void> {
    // Initialize vector store and embedding provider if embeddings are enabled
    if (this.embeddingsEnabled) {
      try {
        this.embeddingProvider = createEmbeddingProvider(this.config);
        this.vectorStore = new VectorStore(`${this.cwd}/.docs`);
        await this.vectorStore.initialize(this.embeddingProvider.getDimensions());
      } catch (error) {
        // Log to stderr since stdout is used for MCP protocol
        console.error(`Warning: Could not initialize embeddings: ${error}`);
        console.error('Semantic search will not be available.');
        this.embeddingProvider = null;
        this.vectorStore = null;
      }
    }

    // Start stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
