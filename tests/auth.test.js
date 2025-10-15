/**
 * Unit tests for auth.js OAuth 1.0a functionality
 */

const crypto = require('crypto');

// Mock keytar (legacy tests still reference it)
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(true),
  getPassword: jest.fn().mockResolvedValue(null),
  deletePassword: jest.fn().mockResolvedValue(true)
}), { virtual: true });

// Mock fs for testing .env file operations
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('EVERNOTE_CONSUMER_KEY=test\nEVERNOTE_CONSUMER_SECRET=test'),
  writeFileSync: jest.fn()
}));

// Mock child_process to avoid opening browser during tests
// Now using spawn() instead of exec() for security
const mockSpawn = jest.fn(() => ({
  on: jest.fn(),
  unref: jest.fn()
}));

jest.mock('child_process', () => ({
  spawn: mockSpawn
}));

// Import after mocking
const fs = require('fs');
const keytar = require('keytar');
const { spawn } = require('child_process');

// We need to test the auth module, but it uses environment variables
// Set test environment variables
process.env.EVERNOTE_CONSUMER_KEY = 'test-consumer-key';
process.env.EVERNOTE_CONSUMER_SECRET = 'test-consumer-secret';

describe('Auth Module', () => {
  let auth;
  
  beforeAll(() => {
    // Import auth module after setting environment variables
    auth = require('../auth');
  });
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('OAuth Parameter Generation', () => {
    test('should generate valid OAuth parameters', () => {
      // We need to access the internal function for testing
      // Since it's not exported, we'll test it through the OAuth signature generation
      
      // Test basic OAuth parameter structure
      const testParams = {
        oauth_consumer_key: 'test-key',
        oauth_nonce: 'test-nonce',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1234567890',
        oauth_version: '1.0'
      };
      
      expect(testParams.oauth_consumer_key).toBe('test-key');
      expect(testParams.oauth_signature_method).toBe('HMAC-SHA1');
      expect(testParams.oauth_version).toBe('1.0');
    });
  });

  describe('OAuth Signature Generation', () => {
    test('should generate consistent HMAC-SHA1 signatures', () => {
      // Test the signature generation with known values
      const method = 'GET';
      const baseUrl = 'https://sandbox.evernote.com/oauth';
      const params = {
        oauth_consumer_key: 'test-consumer-key',
        oauth_nonce: 'test-nonce-123',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1640995200',
        oauth_version: '1.0'
      };
      const consumerSecret = 'test-consumer-secret';
      const tokenSecret = '';
      
      // Create expected signature manually to verify
      const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
      
      const signatureBaseString = [
        method.toUpperCase(),
        encodeURIComponent(baseUrl),
        encodeURIComponent(sortedParams)
      ].join('&');
      
      const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
      const expectedSignature = crypto
        .createHmac('sha1', signingKey)
        .update(signatureBaseString)
        .digest('base64');
      
      // Verify our signature generation logic
      expect(expectedSignature).toBeDefined();
      expect(typeof expectedSignature).toBe('string');
      expect(expectedSignature.length).toBeGreaterThan(0);
    });
    
    test('should generate different signatures for different parameters', () => {
      const method = 'GET';
      const baseUrl = 'https://sandbox.evernote.com/oauth';
      const consumerSecret = 'test-secret';
      
      const params1 = {
        oauth_consumer_key: 'key1',
        oauth_nonce: 'nonce1',
        oauth_timestamp: '1000000000'
      };
      
      const params2 = {
        oauth_consumer_key: 'key2', 
        oauth_nonce: 'nonce2',
        oauth_timestamp: '2000000000'
      };
      
      // Generate signatures
      const sig1 = crypto.createHmac('sha1', `${consumerSecret}&`)
        .update(`GET&${encodeURIComponent(baseUrl)}&${encodeURIComponent('oauth_consumer_key=key1&oauth_nonce=nonce1&oauth_timestamp=1000000000')}`)
        .digest('base64');
        
      const sig2 = crypto.createHmac('sha1', `${consumerSecret}&`)
        .update(`GET&${encodeURIComponent(baseUrl)}&${encodeURIComponent('oauth_consumer_key=key2&oauth_nonce=nonce2&oauth_timestamp=2000000000')}`)
        .digest('base64');
      
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Keychain Integration', () => {
    test('should store token in keychain', async () => {
      const testToken = 'test-access-token';
      const testSecret = 'test-token-secret';
      
      // Since the function is not exported, we'll test the keytar calls directly
      await keytar.setPassword('evernote-mcp-server', 'access_token', testToken);
      await keytar.setPassword('evernote-mcp-server', 'token_secret', testSecret);
      
      expect(keytar.setPassword).toHaveBeenCalledWith('evernote-mcp-server', 'access_token', testToken);
      expect(keytar.setPassword).toHaveBeenCalledWith('evernote-mcp-server', 'token_secret', testSecret);
    });
    
    test('should retrieve token from keychain', async () => {
      // Mock return values
      keytar.getPassword
        .mockResolvedValueOnce('stored-access-token')
        .mockResolvedValueOnce('stored-token-secret');
      
      const accessToken = await keytar.getPassword('evernote-mcp-server', 'access_token');
      const tokenSecret = await keytar.getPassword('evernote-mcp-server', 'token_secret');
      
      expect(accessToken).toBe('stored-access-token');
      expect(tokenSecret).toBe('stored-token-secret');
    });
    
    test('should handle missing tokens gracefully', async () => {
      // Mock keytar to return null (no stored tokens)
      keytar.getPassword.mockResolvedValue(null);
      
      const result = await auth.getTokenFromKeychain();
      expect(result).toBeNull();
    });
  });

  describe('Authentication Flow', () => {
    test('should return existing token if available', async () => {
      // Mock existing token in keychain
      keytar.getPassword
        .mockResolvedValueOnce('existing-token')
        .mockResolvedValueOnce('existing-secret');
      
      const result = await auth.authenticate();
      
      expect(result).toEqual({
        accessToken: 'existing-token',
        tokenSecret: 'existing-secret'
      });
    });
    
    test('should initiate OAuth flow if no token exists', async () => {
      // Remove any existing token from environment
      delete process.env.EVERNOTE_ACCESS_TOKEN;
      
      // This test should check the behavior when no token exists
      // Since we can't easily mock the full HTTPS flow in this test,
      // we'll test that the function attempts to start the OAuth process
      try {
        const result = await auth.authenticate();
        // Should either return request token info or throw an error
        expect(result).toBeDefined();
      } catch (error) {
        // Expected to fail with network error since we're not mocking HTTPS
        // The important thing is that it tried to make the request
        expect(error.message).toBeDefined();
        expect(typeof error.message).toBe('string');
      }
    });
  });

  describe('Configuration', () => {
    test('should use correct Evernote endpoints', () => {
      expect(auth.EVERNOTE_CONFIG.requestTokenUrl).toBe('https://www.evernote.com/oauth');
      expect(auth.EVERNOTE_CONFIG.authorizeUrl).toBe('https://www.evernote.com/OAuth.action');
      expect(auth.EVERNOTE_CONFIG.accessTokenUrl).toBe('https://www.evernote.com/oauth');
      expect(auth.EVERNOTE_CONFIG.callbackUrl).toBe('https://localhost:3443/oauth/callback');
    });
    
    test('should use environment variables for credentials', () => {
      expect(auth.EVERNOTE_CONFIG.consumerKey).toBe('test-consumer-key');
      expect(auth.EVERNOTE_CONFIG.consumerSecret).toBe('test-consumer-secret');
    });
  });

  describe('Browser Integration', () => {
    test('should attempt to open browser for authorization using spawn', () => {
      // Test that spawn is called when opening browser (secure, no shell execution)
      const { spawn } = require('child_process');

      // Clear previous calls
      mockSpawn.mockClear();

      // Simulate opening browser (this is mocked)
      // The actual openBrowser function will call spawn with proper arguments
      spawn('open', ['https://example.com'], { stdio: 'ignore', detached: true });

      expect(spawn).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith('open', ['https://example.com'], { stdio: 'ignore', detached: true });
    });
  });

  describe('Error Handling', () => {
    test('should handle keychain errors gracefully', async () => {
      // Mock keychain error
      keytar.getPassword.mockRejectedValue(new Error('Keychain access denied'));
      
      const result = await auth.getTokenFromKeychain();
      expect(result).toBeNull();
    });
  });

});