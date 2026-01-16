import { extname } from 'path';

/**
 * Gets the language from file extension
 */
export function getLanguageFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript React',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript React',
    '.py': 'Python',
    '.java': 'Java',
    '.go': 'Go',
    '.rs': 'Rust',
    '.cpp': 'C++',
    '.c': 'C',
    '.cs': 'C#',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.scala': 'Scala',
    '.json': 'JSON',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.md': 'Markdown',
    '.sql': 'SQL',
    '.sh': 'Shell',
    '.bash': 'Bash',
  };

  return languageMap[ext] || 'Unknown';
}

/**
 * Engineering summary prompt - analyzes code to create technical documentation
 */
export function getEngineeringPrompt(filePath: string, fileContent: string): string {
  const language = getLanguageFromPath(filePath);

  return `You are analyzing a source code file to generate technical documentation.

File: ${filePath}
Language: ${language}

Code:
\`\`\`${language.toLowerCase()}
${fileContent}
\`\`\`

Generate a comprehensive technical summary including:
1. Primary purpose and functionality
2. Key dependencies and imports
3. Public API surface (exported functions/classes/types)
4. Important implementation details
5. Edge cases or gotchas
6. Performance considerations (if applicable)

Keep it concise but complete - target 200-400 words.`;
}

/**
 * Product translation prompt - translates technical docs for product managers
 */
export function getProductPrompt(engineeringSummary: string): string {
  return `You are translating technical documentation for a product manager audience.

Technical Summary:
${engineeringSummary}

Rewrite this for product managers, focusing on:
1. What user problems this solves
2. What features/capabilities it enables
3. What product decisions are reflected
4. Any user-facing behavior

Remove implementation details. Target 100-200 words.`;
}

/**
 * Executive translation prompt - translates technical docs for executives
 */
export function getExecutivePrompt(engineeringSummary: string): string {
  return `You are translating technical documentation for executive leadership.

Technical Summary:
${engineeringSummary}

Rewrite this for executives, focusing on:
1. Business value and impact
2. Strategic technical decisions
3. Risk and maintenance considerations
4. Resource implications

High-level only. Target 50-100 words.`;
}

/**
 * Directory summary prompt - summarizes a directory based on its children
 */
export function getDirectorySummaryPrompt(
  directoryPath: string,
  childrenSummaries: string[]
): string {
  return `You are summarizing a code directory based on its contents.

Directory: ${directoryPath}

Child Components:
${childrenSummaries.map((summary, i) => `${i + 1}. ${summary}`).join('\n')}

Generate a concise summary of this directory that captures:
1. Overall purpose and organization
2. Key patterns or themes across components
3. How components relate to each other

Target 100-200 words.`;
}
