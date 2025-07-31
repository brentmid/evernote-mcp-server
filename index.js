/**
 * Load environment variables from .env file
 */
require('dotenv').config();

/**
 * Import the Express web framework for creating HTTP servers
 */
const express = require('express');

/**
 * Import Node.js built-in modules for HTTPS and file system operations
 */
const https = require('https');
const fs = require('fs');

/**
 * Import authentication module for Evernote OAuth flow
 */
const auth = require('./auth');

/**
 * Import MCP tools
 */
const { createSearch } = require('./tools/createSearch');
const { getSearch } = require('./tools/getSearch');
const { getNote } = require('./tools/getNote');
const { getNoteContent } = require('./tools/getNoteContent');

/**
 * Create an Express application instance
 */
const app = express();

/**
 * Set the server port - use environment variable PORT if available, otherwise default to 3443 for HTTPS
 */
const port = process.env.PORT || 3443;

/**
 * Configure middleware to automatically parse JSON request bodies
 * This allows us to access JSON data sent in POST requests via req.body
 */
app.use(express.json());

/**
 * Store OAuth state for token exchange
 */
let oauthState = {};

/**
 * Health check endpoint - GET request to root path
 * Returns a simple JSON response to confirm the server is running
 */
app.get('/', (req, res) => {
  res.json({ message: 'Evernote MCP Server is running.' });
});

/**
 * MCP manifest endpoint - GET request to /mcp.json
 * Serves the MCP tool manifest file for Claude Desktop integration
 */
app.get('/mcp.json', (req, res) => {
  try {
    const mcpManifest = fs.readFileSync('./mcp.json', 'utf8');
    const manifestData = JSON.parse(mcpManifest);
    res.json(manifestData);
  } catch (error) {
    console.error('❌ Error serving MCP manifest:', error.message);
    res.status(500).json({ error: 'Failed to load MCP manifest' });
  }
});

/**
 * OAuth callback endpoint - handles Evernote authorization response
 * Completes the OAuth token exchange process
 */
app.get('/oauth/callback', async (req, res) => {
  try {
    console.error('🔄 OAuth callback received');
    // Debug logging (uncomment for troubleshooting)
    // console.log('📝 Query parameters:', req.query);
    // console.log('📝 Current OAuth state keys:', Object.keys(oauthState));
    
    const { oauth_token, oauth_verifier } = req.query;
    
    if (!oauth_token || !oauth_verifier) {
      console.error('❌ Missing OAuth parameters');
      return res.status(400).json({ error: 'Missing OAuth parameters' });
    }
    
    // Retrieve stored request token secret
    const requestTokenSecret = oauthState[oauth_token];
    if (!requestTokenSecret) {
      console.error('❌ Invalid OAuth state - token not found');
      return res.status(400).json({ error: 'Invalid OAuth state' });
    }
    
    // Complete token exchange
    const tokenData = await auth.handleCallback(oauth_token, oauth_verifier, requestTokenSecret);
    
    // Clean up OAuth state
    delete oauthState[oauth_token];
    
    res.json({
      message: 'OAuth authentication successful!',
      success: true
    });
    
    console.error('🎉 OAuth authentication completed successfully');
    
  } catch (error) {
    console.error('❌ OAuth callback error:', error.message);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

// All MCP tools are now imported from their respective files

/**
 * MCP (Model Context Protocol) endpoint - POST request to /mcp
 * Dispatches requests based on command field and routes to appropriate functions
 */
// MCP endpoint supporting both JSON-RPC 2.0 and legacy formats
app.post('/mcp', async (req, res) => {
  // Set CORS headers for remote MCP server support
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    const request = req.body;
    
    // Detect format: JSON-RPC 2.0 vs Legacy
    const isJsonRpc = request && request.jsonrpc === '2.0';
    const isLegacy = request && request.command && typeof request.command === 'string';
    
    if (isJsonRpc) {
      // Handle JSON-RPC 2.0 format for remote MCP servers
      return await handleJsonRpcRequest(request, res);
    } else if (isLegacy) {
      // Handle legacy format for backward compatibility  
      return await handleLegacyRequest(request, res);
    } else {
      // Invalid request format
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request must be either JSON-RPC 2.0 format or legacy format with command field'
      });
    }
  } catch (error) {
    console.error('MCP endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Handle JSON-RPC 2.0 requests
async function handleJsonRpcRequest(request, res) {
  try {
    // Handle MCP protocol messages
    if (request.method === 'initialize') {
      return res.json({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "evernote-mcp-server",
            version: "2.0.0"
          }
        }
      });
    }
    
    if (request.method === 'listTools') {
      const tools = [
        {
          type: 'tool',
          name: 'createSearch',
          description: 'Search for notes in Evernote using natural language queries',
          parameters: {
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
            required: ['query'],
          },
        },
        {
          type: 'tool',
          name: 'getSearch',
          description: 'Get details about a previously executed search by its ID',
          parameters: {
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
          type: 'tool',
          name: 'getNote',
          description: 'Retrieve metadata and basic information for a specific note by its GUID',
          parameters: {
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
          type: 'tool',
          name: 'getNoteContent',
          description: 'Retrieve the full content of a specific note in a readable format',
          parameters: {
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
      ];

      return res.json({
        jsonrpc: "2.0",
        id: request.id,
        result: { tools }
      });
    }
    
    if (request.method === 'callTool') {
      const { name, arguments: args } = request.params;

      // Get authentication token
      const tokenData = await auth.getTokenFromEnv();
      if (!tokenData) {
        return res.json({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32001,
            message: 'Evernote authentication required. Please run the server standalone first to complete OAuth flow.'
          }
        });
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
          return res.json({
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          });
      }

      // Human-readable text summary
      let summary = '';
      try {
        if (typeof result === 'string') {
          summary = result;
        } else if (result && typeof result === 'object') {
          // Try to provide a short summary for common result shapes
          if ('notes' in result && Array.isArray(result.notes)) {
            summary = `Found ${result.notes.length} notes.`;
          } else if ('note' in result && result.note && typeof result.note.title === 'string') {
            summary = `Note: "${result.note.title}" (${result.note.guid || ''})`;
          } else if ('content' in result && typeof result.content === 'string') {
            summary = `Note content (${result.content.length} chars).`;
          } else {
            summary = JSON.stringify(result, null, 2);
          }
        } else {
          summary = JSON.stringify(result, null, 2);
        }
      } catch (err) {
        summary = JSON.stringify(result, null, 2);
      }

      return res.json({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
        }
      });
    }
    
    // Unknown method
    res.json({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${request.method}`
      }
    });
    
  } catch (error) {
    console.error('MCP HTTP Error:', error);
    res.json({
      jsonrpc: "2.0",
      id: request?.id || null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    });
  }
}

// Handle legacy format requests
async function handleLegacyRequest(request, res) {
  try {
    // Check if we have valid authentication
    const tokenData = await auth.getTokenFromEnv();
    if (!tokenData) {
      return res.status(401).json({ 
        error: 'Not authenticated',
        message: 'Please complete OAuth authentication first'
      });
    }
    
    console.error('🔄 Legacy MCP request received:', request);
    
    const { command, args = {} } = request;
    
    // Dispatch to appropriate function based on command
    let result;
    switch (command) {
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
        return res.status(400).json({
          error: 'Unknown command',
          message: `Unsupported command: ${command}. Supported commands: createSearch, getSearch, getNote, getNoteContent`
        });
    }
    
    console.error('✅ MCP command completed successfully');
    res.json(result);
    
  } catch (error) {
    console.error('❌ MCP command failed:', error);
    res.status(500).json({
      error: 'Command execution failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Handle CORS preflight requests for MCP endpoint
app.options('/mcp', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});


/**
 * Load SSL certificate and private key for HTTPS
 */
const sslOptions = {
  key: fs.readFileSync('./cert/localhost.key'),
  cert: fs.readFileSync('./cert/localhost.crt')
};

/**
 * Global error handlers to prevent process crashes
 */
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('📍 Stack:', error.stack);
  console.error('📍 Timestamp:', new Date().toISOString());
  console.error('📍 Process PID:', process.pid);
  // Don't exit the process - log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('📍 Reason:', reason);
  console.error('📍 Timestamp:', new Date().toISOString());
  console.error('📍 Process PID:', process.pid);
  // Don't exit the process - log and continue
});

// Keep essential signal handlers for production debugging
process.on('SIGTERM', (signal) => {
  console.error('🛑 Received SIGTERM signal:', signal);
  console.error('📍 Timestamp:', new Date().toISOString());
});

process.on('SIGINT', (signal) => {
  console.error('🛑 Received SIGINT signal:', signal);
  console.error('📍 Timestamp:', new Date().toISOString());
});

process.on('SIGQUIT', (signal) => {
  console.error('🛑 Received SIGQUIT signal:', signal);
  console.error('📍 Timestamp:', new Date().toISOString());
});

// Minimal keepalive to prevent event loop from becoming inactive
setInterval(() => {
  // Empty function - just keeps event loop active
  // Optional: minimal logging only in DEV_MODE
  if (process.env.DEV_MODE === 'true') {
    console.error('❤️ Process keepalive');
  }
}, 30000);

/**
 * Initialize authentication and start the HTTPS server
 * Checks for existing tokens, validates expiration, and initiates OAuth flow if needed
 */
async function startServer() {
  try {
    console.error('🚀 Starting Evernote MCP Server...');
    
    // First, check if existing tokens are expired
    const tokenStatus = await auth.checkTokenExpiration();
    console.error(`🔍 Token status: ${tokenStatus.message}`);
    
    let authResult;
    
    if (tokenStatus.isExpired) {
      // Tokens are expired - ask user if they want to re-authenticate
      console.error('⚠️  Your Evernote authentication tokens have expired.');
      
      const shouldReauth = await auth.askUserConfirmation('Would you like to re-authenticate now?');
      
      if (shouldReauth) {
        console.error('🧹 Re-authenticating with Evernote...');
        
        // Clear expired tokens
        await auth.clearStoredTokens();
        
        // Start fresh authentication
        authResult = await auth.authenticate();
      } else {
        console.error('❌ Server cannot start without valid authentication.');
        console.error('💡 Run the server again and choose "y" to re-authenticate.');
        console.error('⚠️ Server will continue running but authentication is required for API calls.');
        // Don't exit - allow server to run but API calls will fail gracefully
      }
    } else if (!tokenStatus.hasToken) {
      // No tokens at all - start authentication flow
      console.error('🔐 No authentication tokens found. Starting OAuth flow...');
      authResult = await auth.authenticate();
    } else {
      // Tokens are valid - continue with existing authentication
      console.error('✅ Using existing valid authentication tokens');
      authResult = { needsCallback: false };
    }
    
    if (authResult.needsCallback) {
      // Store request token secret for callback
      oauthState[authResult.requestToken] = authResult.requestTokenSecret;
      console.error('⏳ Waiting for OAuth callback...');
    } else {
      console.error('✅ Authentication ready');
    }
    
    // Start HTTPS server
    https.createServer(sslOptions, app).listen(port, () => {
      console.error(`🌐 Evernote MCP Server listening on HTTPS port ${port}`);
      console.error(`📋 Health check: https://localhost:${port}/`);
      
      if (authResult.needsCallback) {
        console.error('🔐 Complete authentication in your browser, then the server will be ready');
      }
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    console.error('📍 Error details:', error.stack || error);
    console.error('⚠️ Server startup encountered an error but will continue running.');
    // Don't exit - log the error and let the server continue
  }
}

// Start the server
startServer();
