import { MCPServer } from '../mcp/index.js';
import { validateInitialized } from '../core/validation.js';

export async function serveCommand(): Promise<void> {
  const cwd = process.cwd();

  // Validate project is initialized
  validateInitialized(cwd);

  // Note: We use stderr for logging since stdout is used for MCP protocol
  console.error('Starting codebase-docs MCP server...');

  try {
    const server = new MCPServer(cwd);
    await server.start();
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}
