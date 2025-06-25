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
app.post('/mcp', async (req, res) => {
  try {
    // Check if we have valid authentication
    const tokenData = await auth.getTokenFromKeychain();
    if (!tokenData) {
      return res.status(401).json({ 
        error: 'Not authenticated',
        message: 'Please complete OAuth authentication first'
      });
    }
    
    console.error('🔄 MCP request received:', req.body);
    
    // Validate request structure
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request body must be a JSON object'
      });
    }
    
    const { command, args = {} } = req.body;
    
    // Validate command field
    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Missing or invalid "command" field'
      });
    }
    
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
          message: `Command "${command}" is not supported`,
          supportedCommands: ['createSearch', 'getSearch', 'getNote', 'getNoteContent']
        });
    }
    
    // Return successful response
    res.json({
      success: true,
      command: command,
      data: result
    });
    
    console.error(`✅ MCP command "${command}" completed successfully`);
    
  } catch (error) {
    console.error('❌ MCP request error:', error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Load SSL certificate and private key for HTTPS
 */
const sslOptions = {
  key: fs.readFileSync('./cert/localhost.key'),
  cert: fs.readFileSync('./cert/localhost.crt')
};

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
        process.exit(1);
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
    process.exit(1);
  }
}

// Start the server
startServer();
