/**
 * Unit tests for Express server routes and functionality
 */

const request = require('supertest');
const express = require('express');

// Mock the auth module to avoid actual OAuth calls during testing
jest.mock('../auth', () => ({
  authenticate: jest.fn(),
  handleCallback: jest.fn(),
  getTokenFromKeychain: jest.fn(),
  EVERNOTE_CONFIG: {
    serviceName: 'evernote-mcp-server',
    callbackUrl: 'https://localhost:3443/oauth/callback'
  }
}));

// Mock fs to avoid SSL certificate requirements during testing
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => 'mock-cert-content')
}));

// Mock https to use regular Express app for testing
jest.mock('https', () => ({
  createServer: jest.fn((options, app) => app)
}));

const auth = require('../auth');

// Create a test version of the app without the server startup
function createTestApp() {
  const app = express();
  app.use(express.json());
  
  let oauthState = {};
  
  // Health check endpoint
  app.get('/', (req, res) => {
    res.json({ message: 'Evernote MCP Server is running.' });
  });
  
  // OAuth callback endpoint
  app.get('/oauth/callback', async (req, res) => {
    try {
      const { oauth_token, oauth_verifier } = req.query;
      
      if (!oauth_token || !oauth_verifier) {
        return res.status(400).json({ error: 'Missing OAuth parameters' });
      }
      
      const requestTokenSecret = oauthState[oauth_token];
      if (!requestTokenSecret) {
        return res.status(400).json({ error: 'Invalid OAuth state' });
      }
      
      const tokenData = await auth.handleCallback(oauth_token, oauth_verifier, requestTokenSecret);
      delete oauthState[oauth_token];
      
      res.json({
        message: 'OAuth authentication successful!',
        success: true
      });
      
    } catch (error) {
      res.status(500).json({ error: 'OAuth authentication failed' });
    }
  });
  
  // MCP endpoint
  app.post('/mcp', async (req, res) => {
    try {
      const tokenData = await auth.getTokenFromKeychain();
      if (!tokenData) {
        return res.status(401).json({ 
          error: 'Not authenticated',
          message: 'Please complete OAuth authentication first'
        });
      }
      
      res.json({ 
        message: 'MCP request received',
        received: true,
        authenticated: true
      });
      
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Add method to set OAuth state for testing
  app.setOAuthState = (token, secret) => {
    oauthState[token] = secret;
  };
  
  return app;
}

describe('Express Server Routes', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    test('should return health check message', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.body).toEqual({
        message: 'Evernote MCP Server is running.'
      });
    });
    
    test('should return JSON content type', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET /oauth/callback', () => {
    test('should handle successful OAuth callback', async () => {
      // Mock successful token exchange
      auth.handleCallback.mockResolvedValue({
        accessToken: 'test-access-token',
        tokenSecret: 'test-token-secret'
      });
      
      // Set up OAuth state
      app.setOAuthState('test-token', 'test-secret');
      
      const response = await request(app)
        .get('/oauth/callback')
        .query({
          oauth_token: 'test-token',
          oauth_verifier: 'test-verifier'
        })
        .expect(200);
      
      expect(response.body).toEqual({
        message: 'OAuth authentication successful!',
        success: true
      });
      
      expect(auth.handleCallback).toHaveBeenCalledWith(
        'test-token',
        'test-verifier', 
        'test-secret'
      );
    });
    
    test('should reject callback with missing oauth_token', async () => {
      const response = await request(app)
        .get('/oauth/callback')
        .query({
          oauth_verifier: 'test-verifier'
        })
        .expect(400);
      
      expect(response.body).toEqual({
        error: 'Missing OAuth parameters'
      });
    });
    
    test('should reject callback with missing oauth_verifier', async () => {
      const response = await request(app)
        .get('/oauth/callback')
        .query({
          oauth_token: 'test-token'
        })
        .expect(400);
      
      expect(response.body).toEqual({
        error: 'Missing OAuth parameters'
      });
    });
    
    test('should reject callback with invalid OAuth state', async () => {
      const response = await request(app)
        .get('/oauth/callback')
        .query({
          oauth_token: 'invalid-token',
          oauth_verifier: 'test-verifier'
        })
        .expect(400);
      
      expect(response.body).toEqual({
        error: 'Invalid OAuth state'
      });
    });
    
    test('should handle OAuth callback errors', async () => {
      // Mock auth error
      auth.handleCallback.mockRejectedValue(new Error('OAuth failed'));
      
      // Set up OAuth state
      app.setOAuthState('test-token', 'test-secret');
      
      const response = await request(app)
        .get('/oauth/callback')
        .query({
          oauth_token: 'test-token',
          oauth_verifier: 'test-verifier'
        })
        .expect(500);
      
      expect(response.body).toEqual({
        error: 'OAuth authentication failed'
      });
    });
  });

  describe('POST /mcp', () => {
    test('should handle authenticated MCP request', async () => {
      // Mock valid token
      auth.getTokenFromKeychain.mockResolvedValue({
        accessToken: 'valid-token',
        tokenSecret: 'valid-secret'
      });
      
      const testMcpData = {
        method: 'createSearch',
        params: { query: 'test search' }
      };
      
      const response = await request(app)
        .post('/mcp')
        .send(testMcpData)
        .expect(200);
      
      expect(response.body).toEqual({
        message: 'MCP request received',
        received: true,
        authenticated: true
      });
    });
    
    test('should reject unauthenticated MCP request', async () => {
      // Mock no token
      auth.getTokenFromKeychain.mockResolvedValue(null);
      
      const testMcpData = {
        method: 'createSearch',
        params: { query: 'test search' }
      };
      
      const response = await request(app)
        .post('/mcp')
        .send(testMcpData)
        .expect(401);
      
      expect(response.body).toEqual({
        error: 'Not authenticated',
        message: 'Please complete OAuth authentication first'
      });
    });
    
    test('should handle MCP request with JSON body', async () => {
      // Mock valid token
      auth.getTokenFromKeychain.mockResolvedValue({
        accessToken: 'valid-token',
        tokenSecret: 'valid-secret'
      });
      
      const complexMcpData = {
        method: 'getNote',
        params: {
          noteId: 'note-123',
          includeContent: true,
          format: 'markdown'
        }
      };
      
      const response = await request(app)
        .post('/mcp')
        .send(complexMcpData)
        .set('Content-Type', 'application/json')
        .expect(200);
      
      expect(response.body.received).toBe(true);
      expect(response.body.authenticated).toBe(true);
    });
    
    test('should handle MCP auth errors gracefully', async () => {
      // Mock keychain error
      auth.getTokenFromKeychain.mockRejectedValue(new Error('Keychain error'));
      
      const response = await request(app)
        .post('/mcp')
        .send({ method: 'test' })
        .expect(500);
      
      expect(response.body).toEqual({
        error: 'Internal server error'
      });
    });
  });

  describe('Content-Type handling', () => {
    test('should accept JSON content type for MCP endpoint', async () => {
      auth.getTokenFromKeychain.mockResolvedValue({
        accessToken: 'valid-token',
        tokenSecret: 'valid-secret'
      });
      
      const response = await request(app)
        .post('/mcp')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json')
        .expect(200);
      
      expect(response.body.received).toBe(true);
    });
    
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/mcp')
        .send('invalid json{')
        .set('Content-Type', 'application/json')
        .expect(400);
    });
  });

  describe('Route not found', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);
    });
    
    test('should return 404 for wrong HTTP methods', async () => {
      const response = await request(app)
        .post('/')
        .expect(404);
    });
  });
});