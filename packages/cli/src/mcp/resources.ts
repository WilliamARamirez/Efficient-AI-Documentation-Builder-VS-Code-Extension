import { Manifest } from '../types/index.js';

export function getOverviewResource(manifest: Manifest): string {
  const files = Object.values(manifest.nodes).filter((n) => n.type === 'file');
  const dirs = Object.values(manifest.nodes).filter((n) => n.type === 'directory');

  // Build high-level summary
  let overview = `# Codebase Documentation Overview\n\n`;
  overview += `**Generated:** ${manifest.generatedAt}\n`;
  overview += `**Version:** ${manifest.version}\n`;
  overview += `**Total Files:** ${files.length}\n`;
  overview += `**Total Directories:** ${dirs.length}\n`;
  overview += `**Git Commit:** ${manifest.gitCommit || 'N/A'}\n\n`;

  // Stats
  overview += `## Statistics\n\n`;
  overview += `- Total Tokens Used: ${manifest.stats.totalTokensUsed.toLocaleString()}\n`;
  overview += `- Estimated Cost: $${manifest.stats.totalCost.toFixed(2)}\n`;
  if (manifest.stats.lastFullGeneration) {
    overview += `- Last Full Generation: ${manifest.stats.lastFullGeneration}\n`;
  }
  overview += '\n';

  // Group by top-level directories
  const topLevelDirs = dirs
    .filter((d) => !d.path.includes('/') && d.path !== '.')
    .map((d) => d.path)
    .sort();

  overview += `## Structure\n\n`;
  for (const dir of topLevelDirs) {
    const dirFiles = files.filter((f) => f.path.startsWith(dir + '/'));
    overview += `- **${dir}/** (${dirFiles.length} files)\n`;
  }

  // Root-level files
  const rootFiles = files.filter((f) => !f.path.includes('/'));
  if (rootFiles.length > 0) {
    overview += `- *(root)* (${rootFiles.length} files)\n`;
  }

  return overview;
}

export function getStatsResource(manifest: Manifest): string {
  return JSON.stringify(manifest.stats, null, 2);
}

export function getManifestResource(manifest: Manifest): string {
  // Return a summarized version without the full content to avoid overwhelming the LLM
  const summarized = {
    version: manifest.version,
    generatedAt: manifest.generatedAt,
    codeRootHash: manifest.codeRootHash,
    gitCommit: manifest.gitCommit,
    stats: manifest.stats,
    files: Object.values(manifest.nodes)
      .filter((n) => n.type === 'file')
      .map((n) => ({
        path: n.path,
        lastAnalyzed: n.lastAnalyzed,
        hasEngineering: !!n.summaries?.engineering,
        hasProduct: !!n.summaries?.product,
        hasExecutive: !!n.summaries?.executive,
      })),
  };

  return JSON.stringify(summarized, null, 2);
}
