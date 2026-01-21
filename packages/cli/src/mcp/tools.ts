import { z } from 'zod';
import { VectorStore } from '../vector/index.js';
import { Manifest, AudienceType } from '../types/index.js';
import { EmbeddingProvider } from '../embeddings/index.js';

// Tool input schemas
export const SearchDocsSchema = z.object({
  query: z.string().describe('Natural language search query'),
  limit: z.number().optional().default(5).describe('Maximum results to return'),
  audience: z
    .enum(['engineering', 'product', 'executive'])
    .optional()
    .describe('Filter by audience type'),
});

export const GetFileDocSchema = z.object({
  path: z.string().describe('File path to get documentation for'),
  audience: z
    .enum(['engineering', 'product', 'executive'])
    .optional()
    .default('engineering')
    .describe('Audience type for the documentation'),
});

export const ListFilesSchema = z.object({
  pattern: z.string().optional().describe('Glob pattern to filter files'),
});

// Tool implementations
export async function searchDocs(
  input: z.infer<typeof SearchDocsSchema>,
  vectorStore: VectorStore | null,
  embeddingProvider: EmbeddingProvider | null
): Promise<string> {
  if (!vectorStore || !embeddingProvider) {
    return 'Semantic search is not available. Embeddings are not enabled in the configuration. Enable embeddings in .codedocsrc.json and run `codebase-docs update` to generate embeddings.';
  }

  if (!vectorStore.hasData()) {
    return 'No embeddings found. Run `codebase-docs update` with embeddings enabled to generate them.';
  }

  try {
    const queryEmbedding = await embeddingProvider.embed(input.query);

    const results = await vectorStore.search(queryEmbedding.vector, {
      limit: input.limit,
      audience: input.audience as AudienceType | undefined,
    });

    if (results.length === 0) {
      return 'No matching documentation found.';
    }

    return results
      .map(
        (r, i) =>
          `## ${i + 1}. ${r.path} (${r.audience})\n` +
          `Score: ${(r.score * 100).toFixed(1)}%\n\n` +
          `${r.content}`
      )
      .join('\n\n---\n\n');
  } catch (error) {
    return `Error searching documentation: ${error}`;
  }
}

export function getFileDoc(
  input: z.infer<typeof GetFileDocSchema>,
  manifest: Manifest
): string {
  const node = manifest.nodes[input.path];

  if (!node) {
    // Try to find partial matches
    const matchingPaths = Object.keys(manifest.nodes).filter(
      (p) => p.includes(input.path) || input.path.includes(p)
    );

    if (matchingPaths.length > 0) {
      return (
        `No exact match for path: ${input.path}\n\n` +
        `Did you mean one of these?\n` +
        matchingPaths.slice(0, 5).map((p) => `  - ${p}`).join('\n')
      );
    }

    return `No documentation found for path: ${input.path}`;
  }

  if (node.type === 'directory') {
    const children = node.children || [];
    const audience = input.audience || 'engineering';
    const summary = node.summaries?.[audience];

    if (summary) {
      // Directory has a summary - display it like we do for files
      return (
        `# ${input.path} (directory)\n\n` +
        `**Audience:** ${audience}\n` +
        `**Last Updated:** ${summary.generatedAt}\n` +
        `**Model:** ${summary.model}\n\n` +
        `${summary.content}\n\n` +
        `---\n\n` +
        `**Contains ${children.length} items:**\n` +
        children.map((c) => `  - ${c}`).join('\n')
      );
    }

    // No summary available - show children list
    return (
      `# ${input.path} (directory)\n\n` +
      `Contains ${children.length} items:\n` +
      children.map((c) => `  - ${c}`).join('\n') +
      `\n\nUse list_files to explore contents or get_file_doc on a specific file.`
    );
  }

  const audience = input.audience || 'engineering';
  const summary = node.summaries?.[audience];

  if (!summary) {
    const availableAudiences = Object.keys(node.summaries || {});
    if (availableAudiences.length > 0) {
      return (
        `No ${audience} documentation available for ${input.path}.\n` +
        `Available audiences: ${availableAudiences.join(', ')}`
      );
    }
    return `No documentation available for ${input.path}. Run \`codebase-docs update\` to generate it.`;
  }

  return (
    `# ${input.path}\n\n` +
    `**Audience:** ${audience}\n` +
    `**Last Updated:** ${summary.generatedAt}\n` +
    `**Model:** ${summary.model}\n\n` +
    `${summary.content}`
  );
}

export function listFiles(
  input: z.infer<typeof ListFilesSchema>,
  manifest: Manifest
): string {
  const files = Object.values(manifest.nodes)
    .filter((node) => node.type === 'file')
    .map((node) => node.path)
    .sort();

  if (files.length === 0) {
    return 'No documented files found. Run `codebase-docs update` to generate documentation.';
  }

  let filteredFiles = files;

  if (input.pattern) {
    try {
      // Convert glob pattern to regex
      const regexPattern = input.pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.');
      const regex = new RegExp(regexPattern);
      filteredFiles = files.filter((f) => regex.test(f));
    } catch {
      return `Invalid pattern: ${input.pattern}`;
    }
  }

  if (filteredFiles.length === 0) {
    return `No files match pattern: ${input.pattern}`;
  }

  return (
    `Found ${filteredFiles.length} documented files:\n\n` +
    filteredFiles.map((f) => `- ${f}`).join('\n')
  );
}
