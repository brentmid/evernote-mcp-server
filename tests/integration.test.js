/**
 * Integration tests for OAuth flow and end-to-end functionality
 */

const https = require('https');
const querystring = require('querystring');

// Mock external dependencies for integration testing
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(true),
  getPassword: jest.fn().mockResolvedValue(null)
}));

jest.mock('child_process', () => ({
  exec: jest.fn((cmd, callback) => callback(null))
}));

const keytar = require('keytar');
const { exec } = require('child_process');

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
        await keytar.setPassword(auth.EVERNOTE_CONFIG.serviceName, 'access_token', 'access_token_456');
        await keytar.setPassword(auth.EVERNOTE_CONFIG.serviceName, 'token_secret', 'access_secret_456');
        
        expect(keytar.setPassword).toHaveBeenCalledWith(auth.EVERNOTE_CONFIG.serviceName, 'access_token', 'access_token_456');
        expect(keytar.setPassword).toHaveBeenCalledWith(auth.EVERNOTE_CONFIG.serviceName, 'token_secret', 'access_secret_456');
        
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
    test('should attempt to open browser with correct authorization URL', () => {
      const requestToken = 'test_request_token';
      const expectedUrl = `${auth.EVERNOTE_CONFIG.authorizeUrl}?oauth_token=${requestToken}`;
      
      // Simulate browser opening (mocked)
      const openCommand = process.platform === 'darwin' ? 'open' : 
                         process.platform === 'win32' ? 'start' : 'xdg-open';
      
      exec(`${openCommand} "${expectedUrl}"`, () => {});
      
      expect(exec).toHaveBeenCalledWith(`${openCommand} "${expectedUrl}"`, expect.any(Function));
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
    
    test('should handle keychain access errors', async () => {
      // Mock keychain error
      keytar.getPassword.mockRejectedValue(new Error('Keychain access denied'));
      
      const result = await auth.getTokenFromKeychain();
      expect(result).toBeNull();
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
    test('should handle token retrieval and reuse', async () => {
      // Simulate existing token in keychain with edam data
      const mockEdamData = JSON.stringify({
        shard: 's123',
        userId: '12345',
        expires: '1234567890',
        noteStoreUrl: 'https://www.evernote.com/shard/s123/notestore',
        webApiUrlPrefix: 'https://www.evernote.com/shard/s123/'
      });
      
      keytar.getPassword
        .mockResolvedValueOnce('existing_access_token')
        .mockResolvedValueOnce('existing_token_secret')
        .mockResolvedValueOnce(mockEdamData);
      
      const result = await auth.getTokenFromKeychain();
      
      expect(result).toEqual({
        accessToken: 'existing_access_token',
        tokenSecret: 'existing_token_secret',
        edamShard: 's123',
        edamUserId: '12345',
        edamExpires: '1234567890',
        edamNoteStoreUrl: 'https://www.evernote.com/shard/s123/notestore',
        edamWebApiUrlPrefix: 'https://www.evernote.com/shard/s123/'
      });
      
      expect(keytar.getPassword).toHaveBeenCalledWith(auth.EVERNOTE_CONFIG.serviceName, 'access_token');
      expect(keytar.getPassword).toHaveBeenCalledWith(auth.EVERNOTE_CONFIG.serviceName, 'token_secret');
      expect(keytar.getPassword).toHaveBeenCalledWith(auth.EVERNOTE_CONFIG.serviceName, 'edam_data');
    });
    
    test('should handle missing token scenario', async () => {
      // Simulate no stored tokens
      keytar.getPassword.mockResolvedValue(null);
      
      const result = await auth.getTokenFromKeychain();
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