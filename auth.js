/**
 * Evernote OAuth 1.0a Authentication Module
 * Handles the complete OAuth flow including token storage in macOS Keychain
 */

const crypto = require('crypto');
const https = require('https');
const url = require('url');
const querystring = require('querystring');
const keytar = require('keytar');
const { exec } = require('child_process');

/**
 * Configuration for Evernote OAuth
 * Note: You'll need to register your app at https://dev.evernote.com/
 */
const EVERNOTE_CONFIG = {
  // Sandbox URLs for development
  requestTokenUrl: 'https://sandbox.evernote.com/oauth',
  authorizeUrl: 'https://sandbox.evernote.com/OAuth.action',
  accessTokenUrl: 'https://sandbox.evernote.com/oauth',
  
  // Production URLs (uncomment when ready for production)
  // requestTokenUrl: 'https://www.evernote.com/oauth',
  // authorizeUrl: 'https://www.evernote.com/OAuth.action', 
  // accessTokenUrl: 'https://www.evernote.com/oauth',
  
  callbackUrl: 'https://localhost:3443/oauth/callback',
  serviceName: 'evernote-mcp-server',
  
  // These should be set via environment variables
  consumerKey: process.env.EVERNOTE_CONSUMER_KEY || 'your-consumer-key',
  consumerSecret: process.env.EVERNOTE_CONSUMER_SECRET || 'your-consumer-secret'
};

/**
 * Generate OAuth 1.0a signature using HMAC-SHA1
 * @param {string} method - HTTP method (GET/POST)
 * @param {string} baseUrl - Base URL without query parameters
 * @param {Object} params - OAuth parameters
 * @param {string} tokenSecret - Token secret (empty string for request token)
 * @returns {string} Base64 encoded signature
 */
function generateSignature(method, baseUrl, params, tokenSecret = '') {
  // Create signature base string
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(baseUrl),
    encodeURIComponent(sortedParams)
  ].join('&');
  
  // Create signing key
  const signingKey = `${encodeURIComponent(EVERNOTE_CONFIG.consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  
  // Generate signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBaseString)
    .digest('base64');
  
  return signature;
}

/**
 * Generate OAuth 1.0a parameters
 * @param {string} token - OAuth token (optional)
 * @param {string} verifier - OAuth verifier (optional)
 * @returns {Object} OAuth parameters
 */
function generateOAuthParams(token = null, verifier = null) {
  const params = {
    oauth_consumer_key: EVERNOTE_CONFIG.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    oauth_callback: EVERNOTE_CONFIG.callbackUrl
  };
  
  if (token) {
    params.oauth_token = token;
    delete params.oauth_callback; // Not needed for access token request
  }
  
  if (verifier) {
    params.oauth_verifier = verifier;
  }
  
  return params;
}

/**
 * Make OAuth HTTP request
 * @param {string} url - Request URL
 * @param {Object} params - Request parameters
 * @param {string} tokenSecret - Token secret for signature
 * @returns {Promise<Object>} Parsed response
 */
function makeOAuthRequest(requestUrl, params, tokenSecret = '') {
  return new Promise((resolve, reject) => {
    const urlParts = new URL(requestUrl);
    const signature = generateSignature('GET', `${urlParts.protocol}//${urlParts.host}${urlParts.pathname}`, params, tokenSecret);
    params.oauth_signature = signature;
    
    const queryString = querystring.stringify(params);
    const fullUrl = `${requestUrl}?${queryString}`;
    
    https.get(fullUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const parsed = querystring.parse(data);
          resolve(parsed);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Store access token in macOS Keychain
 * @param {string} token - Access token
 * @param {string} tokenSecret - Token secret
 */
async function storeTokenInKeychain(token, tokenSecret) {
  try {
    await keytar.setPassword(EVERNOTE_CONFIG.serviceName, 'access_token', token);
    await keytar.setPassword(EVERNOTE_CONFIG.serviceName, 'token_secret', tokenSecret);
    console.log('✅ Access token stored in Keychain');
  } catch (error) {
    console.error('❌ Failed to store token in Keychain:', error.message);
    throw error;
  }
}

/**
 * Retrieve access token from macOS Keychain
 * @returns {Promise<Object>} Token object or null
 */
async function getTokenFromKeychain() {
  try {
    const accessToken = await keytar.getPassword(EVERNOTE_CONFIG.serviceName, 'access_token');
    const tokenSecret = await keytar.getPassword(EVERNOTE_CONFIG.serviceName, 'token_secret');
    
    if (accessToken && tokenSecret) {
      return { accessToken, tokenSecret };
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to retrieve token from Keychain:', error.message);
    return null;
  }
}

/**
 * Launch system browser to open URL
 * @param {string} url - URL to open
 */
function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : 
                 process.platform === 'win32' ? 'start' : 'xdg-open';
  
  exec(`${command} "${url}"`, (error) => {
    if (error) {
      console.error('❌ Failed to open browser:', error.message);
      console.log('📋 Please manually open this URL in your browser:');
      console.log(url);
    } else {
      console.log('🌐 Browser opened for Evernote authorization');
    }
  });
}

/**
 * Step 1: Get request token from Evernote
 * @returns {Promise<Object>} Request token data
 */
async function getRequestToken() {
  console.log('📝 Requesting temporary token from Evernote...');
  
  const params = generateOAuthParams();
  const response = await makeOAuthRequest(EVERNOTE_CONFIG.requestTokenUrl, params);
  
  if (!response.oauth_token || !response.oauth_token_secret) {
    throw new Error('Invalid response from Evernote: missing token data');
  }
  
  console.log('✅ Temporary token received');
  return {
    token: response.oauth_token,
    tokenSecret: response.oauth_token_secret
  };
}

/**
 * Step 2: Redirect user to Evernote for authorization
 * @param {string} requestToken - Request token
 */
function redirectToAuthorization(requestToken) {
  const authUrl = `${EVERNOTE_CONFIG.authorizeUrl}?oauth_token=${requestToken}`;
  console.log('🔐 Redirecting to Evernote for authorization...');
  openBrowser(authUrl);
}

/**
 * Step 3: Exchange request token for access token
 * @param {string} requestToken - Request token
 * @param {string} requestTokenSecret - Request token secret
 * @param {string} verifier - OAuth verifier from callback
 * @returns {Promise<Object>} Access token data
 */
async function getAccessToken(requestToken, requestTokenSecret, verifier) {
  console.log('🔄 Exchanging request token for access token...');
  
  const params = generateOAuthParams(requestToken, verifier);
  const response = await makeOAuthRequest(EVERNOTE_CONFIG.accessTokenUrl, params, requestTokenSecret);
  
  if (!response.oauth_token || !response.oauth_token_secret) {
    throw new Error('Invalid response from Evernote: missing access token data');
  }
  
  console.log('✅ Access token received');
  return {
    accessToken: response.oauth_token,
    tokenSecret: response.oauth_token_secret
  };
}

/**
 * Complete OAuth flow - checks for existing token or initiates new flow
 * @returns {Promise<Object>} Access token data
 */
async function authenticate() {
  // Check if we already have a valid token
  const existingToken = await getTokenFromKeychain();
  if (existingToken) {
    console.log('✅ Using existing access token from Keychain');
    return existingToken;
  }
  
  console.log('🚀 Starting Evernote OAuth flow...');
  
  // Validate configuration
  if (EVERNOTE_CONFIG.consumerKey === 'your-consumer-key') {
    throw new Error('❌ Please set EVERNOTE_CONSUMER_KEY environment variable');
  }
  if (EVERNOTE_CONFIG.consumerSecret === 'your-consumer-secret') {
    throw new Error('❌ Please set EVERNOTE_CONSUMER_SECRET environment variable');
  }
  
  // Step 1: Get request token
  const requestTokenData = await getRequestToken();
  
  // Step 2: Redirect to authorization
  redirectToAuthorization(requestTokenData.token);
  
  // Return request token data - the callback will handle step 3
  return {
    requestToken: requestTokenData.token,
    requestTokenSecret: requestTokenData.tokenSecret,
    needsCallback: true
  };
}

/**
 * Handle OAuth callback and complete token exchange
 * @param {string} token - OAuth token from callback
 * @param {string} verifier - OAuth verifier from callback
 * @param {string} requestTokenSecret - Stored request token secret
 * @returns {Promise<Object>} Access token data
 */
async function handleCallback(token, verifier, requestTokenSecret) {
  const tokenData = await getAccessToken(token, requestTokenSecret, verifier);
  await storeTokenInKeychain(tokenData.accessToken, tokenData.tokenSecret);
  return tokenData;
}

module.exports = {
  authenticate,
  handleCallback,
  getTokenFromKeychain,
  EVERNOTE_CONFIG
};