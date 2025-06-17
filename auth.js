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
 * Sandbox has been decommissioned - using production URLs
 */
const EVERNOTE_CONFIG = {
  // Production URLs (sandbox is no longer available)
  requestTokenUrl: 'https://www.evernote.com/oauth',
  authorizeUrl: 'https://www.evernote.com/OAuth.action',
  accessTokenUrl: 'https://www.evernote.com/oauth',
  
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
    
    // Debug logging (uncomment for troubleshooting)
    // console.log('🌐 Making OAuth request to:', requestUrl);
    // console.log('📝 Full URL:', fullUrl);
    // console.log('📝 Token secret for signature:', tokenSecret ? '[PRESENT]' : '[EMPTY]');
    
    https.get(fullUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Debug logging (uncomment for troubleshooting)
        // console.log('📨 HTTP Response Status:', res.statusCode);
        // console.log('📨 Raw response data:', data);
        
        if (res.statusCode === 200) {
          const parsed = querystring.parse(data);
          // console.log('📨 Parsed response:', parsed);
          resolve(parsed);
        } else {
          console.error('❌ HTTP Error Response:', data);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (err) => {
      console.error('❌ Network error:', err.message);
      reject(err);
    });
  });
}

/**
 * Store access token and Evernote data in macOS Keychain
 * @param {Object} tokenData - Complete token data from Evernote
 */
async function storeTokenInKeychain(tokenData) {
  try {
    await keytar.setPassword(EVERNOTE_CONFIG.serviceName, 'access_token', tokenData.accessToken);
    // Store empty token secret as a placeholder string (Keychain requires non-empty password)
    await keytar.setPassword(EVERNOTE_CONFIG.serviceName, 'token_secret', tokenData.tokenSecret || 'EMPTY_TOKEN_SECRET');
    
    // Store Evernote-specific data as JSON
    const edamData = {
      shard: tokenData.edamShard,
      userId: tokenData.edamUserId,
      expires: tokenData.edamExpires,
      noteStoreUrl: tokenData.edamNoteStoreUrl,
      webApiUrlPrefix: tokenData.edamWebApiUrlPrefix
    };
    await keytar.setPassword(EVERNOTE_CONFIG.serviceName, 'edam_data', JSON.stringify(edamData));
    
    console.error('✅ Access token and Evernote data stored in Keychain');
  } catch (error) {
    console.error('❌ Failed to store token in Keychain:', error.message);
    throw error;
  }
}

/**
 * Retrieve access token and Evernote data from macOS Keychain
 * @returns {Promise<Object>} Token object or null
 */
async function getTokenFromKeychain() {
  try {
    const accessToken = await keytar.getPassword(EVERNOTE_CONFIG.serviceName, 'access_token');
    const tokenSecret = await keytar.getPassword(EVERNOTE_CONFIG.serviceName, 'token_secret');
    const edamDataJson = await keytar.getPassword(EVERNOTE_CONFIG.serviceName, 'edam_data');
    
    if (accessToken) {
      const result = { 
        accessToken, 
        tokenSecret: (tokenSecret === 'EMPTY_TOKEN_SECRET') ? '' : (tokenSecret || '')
      };
      
      // Include Evernote-specific data if available
      if (edamDataJson) {
        try {
          const edamData = JSON.parse(edamDataJson);
          result.edamShard = edamData.shard;
          result.edamUserId = edamData.userId;
          result.edamExpires = edamData.expires;
          result.edamNoteStoreUrl = edamData.noteStoreUrl;
          result.edamWebApiUrlPrefix = edamData.webApiUrlPrefix;
        } catch (parseError) {
          console.error('⚠️ Failed to parse Evernote data from Keychain');
        }
      }
      
      return result;
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
      console.error('📋 Please manually open this URL in your browser:');
      console.error(url);
    } else {
      console.error('🌐 Browser opened for Evernote authorization');
    }
  });
}

/**
 * Step 1: Get request token from Evernote
 * @returns {Promise<Object>} Request token data
 */
async function getRequestToken() {
  console.error('📝 Requesting temporary token from Evernote...');
  
  const params = generateOAuthParams();
  const response = await makeOAuthRequest(EVERNOTE_CONFIG.requestTokenUrl, params);
  
  if (!response.oauth_token || !response.oauth_token_secret) {
    throw new Error('Invalid response from Evernote: missing token data');
  }
  
  console.error('✅ Temporary token received');
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
  console.error('🔐 Redirecting to Evernote for authorization...');
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
  console.error('🔄 Exchanging request token for access token...');
  // Debug logging (uncomment for troubleshooting)
  // console.log('📝 Request token:', requestToken);
  // console.log('📝 Verifier:', verifier);
  
  const params = generateOAuthParams(requestToken, verifier);
  // console.log('📝 OAuth params for access token:', params);
  
  const response = await makeOAuthRequest(EVERNOTE_CONFIG.accessTokenUrl, params, requestTokenSecret);
  // console.log('📝 Raw response from Evernote:', response);
  
  if (!response.oauth_token) {
    console.error('❌ Missing required oauth_token in response');
    console.error('📝 Received keys:', Object.keys(response));
    throw new Error('Invalid response from Evernote: missing access token');
  }
  
  // Note: Evernote may return empty oauth_token_secret for access tokens - this is normal
  if (response.oauth_token_secret === undefined) {
    console.error('❌ Missing oauth_token_secret field in response');
    console.error('📝 Received keys:', Object.keys(response));
    throw new Error('Invalid response from Evernote: missing token secret field');
  }
  
  console.error('✅ Access token received');
  
  return {
    accessToken: response.oauth_token,
    tokenSecret: response.oauth_token_secret || '', // Handle empty token secret
    // Include Evernote-specific data for future API calls
    edamShard: response.edam_shard,
    edamUserId: response.edam_userId,
    edamExpires: response.edam_expires,
    edamNoteStoreUrl: response.edam_noteStoreUrl,
    edamWebApiUrlPrefix: response.edam_webApiUrlPrefix
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
    console.error('✅ Using existing access token from Keychain');
    return existingToken;
  }
  
  console.error('🚀 Starting Evernote OAuth flow...');
  
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
  await storeTokenInKeychain(tokenData);
  return tokenData;
}

module.exports = {
  authenticate,
  handleCallback,
  getTokenFromKeychain,
  EVERNOTE_CONFIG
};