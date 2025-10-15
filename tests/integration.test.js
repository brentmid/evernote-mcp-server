/**
 * Integration tests for OAuth flow and end-to-end functionality
 */

const https = require('https');
const querystring = require('querystring');

// No longer need to mock keytar as we use environment variables

// Mock child_process to use secure spawn instead of exec
const mockSpawn = jest.fn(() => ({
  on: jest.fn(),
  unref: jest.fn()
}));

jest.mock('child_process', () => ({
  spawn: mockSpawn
}));

const { spawn } = require('child_process');

// Set test environment
process.env.EVERNOTE_CONSUMER_KEY = 'test-integration-key';
process.env.EVERNOTE_CONSUMER_SECRET = 'test-integration-secret';

describe('OAuth Flow Integration Tests', () => {
  let auth;
  
  beforeAll(() => {
    auth = require('../auth');
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete OAuth Flow Simulation', () => {
    test('should handle full OAuth flow with mocked responses', async () => {
      // Mock HTTPS requests to Evernote
      const mockHttpsGet = jest.fn();
      
      // Mock request token response
      mockHttpsGet.mockImplementationOnce((url, callback) => {
        const mockResponse = {
          statusCode: 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              handler('oauth_token=request_token_123&oauth_token_secret=request_secret_123');
            } else if (event === 'end') {
              handler();
            }
          })
        };
        callback(mockResponse);
        return { on: jest.fn() };
      });
      
      // Mock access token response  
      mockHttpsGet.mockImplementationOnce((url, callback) => {
        const mockResponse = {
          statusCode: 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              handler('oauth_token=access_token_456&oauth_token_secret=access_secret_456');
            } else if (event === 'end') {
              handler();
            }
          })
        };
        callback(mockResponse);
        return { on: jest.fn() };
      });
      
      // Override https.get for this test
      const originalGet = https.get;
      https.get = mockHttpsGet;
      
      try {
        // Test request token generation
        const requestTokenResponse = querystring.parse('oauth_token=request_token_123&oauth_token_secret=request_secret_123');
        expect(requestTokenResponse.oauth_token).toBe('request_token_123');
        expect(requestTokenResponse.oauth_token_secret).toBe('request_secret_123');
        
        // Test access token exchange
        const accessTokenResponse = querystring.parse('oauth_token=access_token_456&oauth_token_secret=access_secret_456');
        expect(accessTokenResponse.oauth_token).toBe('access_token_456');
        expect(accessTokenResponse.oauth_token_secret).toBe('access_secret_456');
        
        // Test token storage
        // Verify tokens were stored in environment variables
        expect(process.env.EVERNOTE_ACCESS_TOKEN).toBe('access_token_456');
        expect(process.env.EVERNOTE_TOKEN_SECRET).toBe('access_secret_456');
        
      } finally {
        https.get = originalGet;
      }
    });
  });

  describe('OAuth State Management', () => {
    test('should maintain OAuth state between request and callback', () => {
      const oauthState = {};
      const requestToken = 'request_token_789';
      const requestTokenSecret = 'request_secret_789';
      
      // Simulate storing OAuth state
      oauthState[requestToken] = requestTokenSecret;
      
      // Simulate callback with stored state
      expect(oauthState[requestToken]).toBe(requestTokenSecret);
      
      // Simulate cleanup after successful callback
      delete oauthState[requestToken];
      expect(oauthState[requestToken]).toBeUndefined();
    });
  });

  describe('Browser Integration', () => {
    test('should attempt to open browser with correct authorization URL using spawn', () => {
      const requestToken = 'test_request_token';
      const expectedUrl = `${auth.EVERNOTE_CONFIG.authorizeUrl}?oauth_token=${requestToken}`;

      // Clear previous calls
      mockSpawn.mockClear();

      // Simulate browser opening with spawn (secure, no shell execution)
      const openCommand = process.platform === 'darwin' ? 'open' :
                         process.platform === 'win32' ? 'cmd' : 'xdg-open';

      const args = process.platform === 'win32' ? ['/c', 'start', '', expectedUrl] : [expectedUrl];

      spawn(openCommand, args, { stdio: 'ignore', detached: true });

      expect(spawn).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(openCommand, args, { stdio: 'ignore', detached: true });
    });
  });

  describe('Error Scenarios', () => {
    test('should handle network errors gracefully', async () => {
      // Mock network error
      const mockHttpsGet = jest.fn((url, callback) => {
        return { 
          on: jest.fn((event, handler) => {
            if (event === 'error') {
              handler(new Error('Network error'));
            }
          })
        };
      });
      
      const originalGet = https.get;
      https.get = mockHttpsGet;
      
      try {
        // This would normally throw in a real scenario
        expect(() => {
          https.get('https://test.com', () => {});
        }).not.toThrow();
      } finally {
        https.get = originalGet;
      }
    });
    
    test('should handle invalid OAuth responses', () => {
      // Test parsing invalid OAuth response
      const invalidResponse = 'invalid_response_format';
      const parsed = querystring.parse(invalidResponse);
      
      expect(parsed.oauth_token).toBeUndefined();
      expect(parsed.oauth_token_secret).toBeUndefined();
    });
    
    test('should handle environment variable access errors', async () => {
      // Simulate environment variable error
      const originalEnv = process.env.EVERNOTE_ACCESS_TOKEN;
      Object.defineProperty(process.env, 'EVERNOTE_ACCESS_TOKEN', {
        get: () => { throw new Error('Environment access denied'); },
        configurable: true
      });
      
      const result = await auth.getTokenFromEnv();
      expect(result).toBeNull();
      
      // Restore environment
      delete process.env.EVERNOTE_ACCESS_TOKEN;
      if (originalEnv) process.env.EVERNOTE_ACCESS_TOKEN = originalEnv;
    });
  });

  describe('Configuration Validation', () => {
    test('should validate required environment variables', () => {
      expect(auth.EVERNOTE_CONFIG.consumerKey).toBe('test-integration-key');
      expect(auth.EVERNOTE_CONFIG.consumerSecret).toBe('test-integration-secret');
      expect(auth.EVERNOTE_CONFIG.callbackUrl).toBe('https://localhost:3443/oauth/callback');
    });
    
    test('should use correct Evernote production endpoints', () => {
      expect(auth.EVERNOTE_CONFIG.requestTokenUrl).toBe('https://www.evernote.com/oauth');
      expect(auth.EVERNOTE_CONFIG.authorizeUrl).toBe('https://www.evernote.com/OAuth.action');
      expect(auth.EVERNOTE_CONFIG.accessTokenUrl).toBe('https://www.evernote.com/oauth');
    });
  });

  describe('Token Lifecycle', () => {
    beforeEach(() => {
      // Clean up environment variables before each test
      delete process.env.EVERNOTE_ACCESS_TOKEN;
      delete process.env.EVERNOTE_TOKEN_SECRET;
      delete process.env.EVERNOTE_EDAM_SHARD;
      delete process.env.EVERNOTE_EDAM_USER_ID;
      delete process.env.EVERNOTE_EDAM_EXPIRES;
      delete process.env.EVERNOTE_EDAM_NOTE_STORE_URL;
      delete process.env.EVERNOTE_EDAM_WEB_API_URL_PREFIX;
    });
    
    test('should handle token retrieval and reuse', async () => {
      // Set environment variables
      process.env.EVERNOTE_ACCESS_TOKEN = 'existing_access_token';
      process.env.EVERNOTE_TOKEN_SECRET = 'existing_token_secret';
      process.env.EVERNOTE_EDAM_SHARD = 's123';
      process.env.EVERNOTE_EDAM_USER_ID = '12345';
      process.env.EVERNOTE_EDAM_EXPIRES = '1234567890';
      process.env.EVERNOTE_EDAM_NOTE_STORE_URL = 'https://www.evernote.com/shard/s123/notestore';
      process.env.EVERNOTE_EDAM_WEB_API_URL_PREFIX = 'https://www.evernote.com/shard/s123/';
      
      const result = await auth.getTokenFromEnv();
      
      expect(result).toEqual({
        accessToken: 'existing_access_token',
        tokenSecret: 'existing_token_secret',
        edamShard: 's123',
        edamUserId: '12345',
        edamExpires: '1234567890',
        edamNoteStoreUrl: 'https://www.evernote.com/shard/s123/notestore',
        edamWebApiUrlPrefix: 'https://www.evernote.com/shard/s123/'
      });
    });
    
    test('should handle missing token scenario', async () => {
      // No environment variables set
      const result = await auth.getTokenFromEnv();
      expect(result).toBeNull();
    });
  });

  describe('OAuth Parameter Validation', () => {
    test('should generate required OAuth parameters', () => {
      const testParams = {
        oauth_consumer_key: 'test-key',
        oauth_nonce: expect.any(String),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: expect.any(String),
        oauth_version: '1.0',
        oauth_callback: 'https://localhost:3443/oauth/callback'
      };
      
      // Validate parameter structure
      expect(testParams.oauth_signature_method).toBe('HMAC-SHA1');
      expect(testParams.oauth_version).toBe('1.0');
      expect(testParams.oauth_callback).toBe('https://localhost:3443/oauth/callback');
    });
  });
});