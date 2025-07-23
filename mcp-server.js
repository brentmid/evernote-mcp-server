#!/usr/bin/env node

/**
 * Evernote MCP Server
 * Implements the Model Context Protocol for Claude Desktop integration
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Import authentication and tool modules
const auth = require('./auth');
const { createSearch } = require('./tools/createSearch');
const { getSearch } = require('./tools/getSearch');
const { getNote } = require('./tools/getNote');
const { getNoteContent } = require('./tools/getNoteContent');

/**
 * Main MCP server implementation
 */
class EvernoteMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'evernote-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  /**
   * Set up tool handlers for MCP protocol
   */
  setupToolHandlers() {
    // Handle initialization
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      return {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "evernote-mcp-server",
          version: "2.0.0"
        }
      };
    });

    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'createSearch',
            description: 'Search for notes in Evernote using natural language queries',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query (e.g., "boat repair notes", "meeting notes from last week")',
                },
                maxResults: {
                  type: 'integer',
                  description: 'Maximum number of search results to return (default: 20, max: 100)',
                  minimum: 1,
                  maximum: 100,
                  default: 20,
                },
                offset: {
                  type: 'integer',
                  description: 'Number of results to skip for pagination (default: 0)',
                  minimum: 0,
                  default: 0,
                },
                notebookName: {
                  type: 'string',
                  description: 'Optional: Name of specific notebook to search within',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional: Array of tag names to filter by',
                },
                createdAfter: {
                  type: 'string',
                  format: 'date',
                  description: 'Optional: Only return notes created after this date (YYYY-MM-DD)',
                },
                updatedAfter: {
                  type: 'string',
                  format: 'date',
                  description: 'Optional: Only return notes updated after this date (YYYY-MM-DD)',
                },
              },
              required: [],
            },
          },
          {
            name: 'getSearch',
            description: 'Get details about a previously executed search by its ID',
            inputSchema: {
              type: 'object',
              properties: {
                searchId: {
                  type: 'string',
                  description: 'Unique identifier of the search to retrieve',
                },
              },
              required: ['searchId'],
            },
          },
          {
            name: 'getNote',
            description: 'Retrieve metadata and basic information for a specific note by its GUID',
            inputSchema: {
              type: 'object',
              properties: {
                noteGuid: {
                  type: 'string',
                  description: 'The unique identifier (GUID) of the note to retrieve',
                },
              },
              required: ['noteGuid'],
            },
          },
          {
            name: 'getNoteContent',
            description: 'Retrieve the full content of a specific note in a readable format',
            inputSchema: {
              type: 'object',
              properties: {
                noteGuid: {
                  type: 'string',
                  description: 'The unique identifier (GUID) of the note to retrieve content for',
                },
                format: {
                  type: 'string',
                  enum: ['text', 'html', 'enml'],
                  description: 'Format to return the content in (default: text)',
                  default: 'text',
                },
              },
              required: ['noteGuid'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Get authentication token
        const tokenData = await auth.getTokenFromEnv();
        if (!tokenData) {
          throw new Error('Evernote authentication required. Please run the server standalone first to complete OAuth flow.');
        }

        // Call appropriate tool
        let result;
        switch (name) {
          case 'createSearch':
            result = await createSearch(args, tokenData);
            break;
          case 'getSearch':
            result = await getSearch(args, tokenData);
            break;
          case 'getNote':
            result = await getNote(args, tokenData);
            break;
          case 'getNoteContent':
            result = await getNoteContent(args, tokenData);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`Error in tool ${name}:`, error.message);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString(),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Set up error handling
   */
  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Start the MCP server
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Evernote MCP Server started'); // Log to stderr so it appears in Claude Desktop logs
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new EvernoteMCPServer();
  server.start().catch((error) => {
    console.error('Failed to start MCP server:', error);
    console.error('❌ MCP server will continue running but may not function properly');
    // Don't exit the process - log error and continue
  });
}

module.exports = EvernoteMCPServer;