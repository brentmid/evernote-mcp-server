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
 * Health check endpoint - GET request to root path
 * Returns a simple JSON response to confirm the server is running
 */
app.get('/', (req, res) => {
  res.json({ message: 'Evernote MCP Server is running.' });
});

/**
 * MCP (Model Context Protocol) endpoint - POST request to /mcp
 * Logs the incoming request body and returns a confirmation response
 */
app.post('/mcp', (req, res) => {
  console.log('MCP request received:', req.body);
  res.json({ 
    message: 'MCP request received',
    received: true
  });
});

/**
 * Load SSL certificate and private key for HTTPS
 */
const sslOptions = {
  key: fs.readFileSync('./cert/localhost.key'),
  cert: fs.readFileSync('./cert/localhost.crt')
};

/**
 * Start the HTTPS server and listen for incoming connections
 * Logs a confirmation message when the server starts successfully
 */
https.createServer(sslOptions, app).listen(port, () => {
  console.log(`Evernote MCP Server listening on HTTPS port ${port}`);
});
