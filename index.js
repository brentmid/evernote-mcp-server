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
 * OAuth callback endpoint - handles Evernote authorization response
 * Completes the OAuth token exchange process
 */
app.get('/oauth/callback', async (req, res) => {
  try {
    const { oauth_token, oauth_verifier } = req.query;
    
    if (!oauth_token || !oauth_verifier) {
      return res.status(400).json({ error: 'Missing OAuth parameters' });
    }
    
    // Retrieve stored request token secret
    const requestTokenSecret = oauthState[oauth_token];
    if (!requestTokenSecret) {
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
    
    console.log('🎉 OAuth authentication completed successfully');
    
  } catch (error) {
    console.error('❌ OAuth callback error:', error.message);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

/**
 * MCP (Model Context Protocol) endpoint - POST request to /mcp
 * Logs the incoming request body and returns a confirmation response
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
    
    console.log('MCP request received:', req.body);
    res.json({ 
      message: 'MCP request received',
      received: true,
      authenticated: true
    });
    
  } catch (error) {
    console.error('❌ MCP request error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
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
 * Checks for existing tokens or initiates OAuth flow
 */
async function startServer() {
  try {
    console.log('🚀 Starting Evernote MCP Server...');
    
    // Check authentication status
    const authResult = await auth.authenticate();
    
    if (authResult.needsCallback) {
      // Store request token secret for callback
      oauthState[authResult.requestToken] = authResult.requestTokenSecret;
      console.log('⏳ Waiting for OAuth callback...');
    } else {
      console.log('✅ Authentication ready');
    }
    
    // Start HTTPS server
    https.createServer(sslOptions, app).listen(port, () => {
      console.log(`🌐 Evernote MCP Server listening on HTTPS port ${port}`);
      console.log(`📋 Health check: https://localhost:${port}/`);
      
      if (authResult.needsCallback) {
        console.log('🔐 Complete authentication in your browser, then the server will be ready');
      }
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();
