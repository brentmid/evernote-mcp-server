/**
 * Jest setup file for global test configuration
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.EVERNOTE_CONSUMER_KEY = 'test-consumer-key';
process.env.EVERNOTE_CONSUMER_SECRET = 'test-consumer-secret';

// Suppress console.log during tests unless explicitly needed
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  // Optionally suppress console output during tests
  // Uncomment these lines if you want quieter test output
  // console.log = jest.fn();
  // console.error = jest.fn();
});

afterEach(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Global test utilities
global.testUtils = {
  // Helper to create mock OAuth response
  createMockOAuthResponse: (token, secret) => ({
    oauth_token: token,
    oauth_token_secret: secret
  }),
  
  // Helper to create mock HTTP response
  createMockHttpResponse: (statusCode, data) => ({
    statusCode,
    on: jest.fn((event, handler) => {
      if (event === 'data') {
        handler(data);
      } else if (event === 'end') {
        handler();
      }
    })
  }),
  
  // Helper to create mock error response
  createMockErrorResponse: (error) => ({
    on: jest.fn((event, handler) => {
      if (event === 'error') {
        handler(error);
      }
    })
  })
};