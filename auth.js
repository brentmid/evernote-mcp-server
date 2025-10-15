/**
 * Evernote OAuth 1.0a Authentication Module
 * Handles the complete OAuth flow with environment variable token storage
 */

const crypto = require('crypto');
const https = require('https');
const url = require('url');
const querystring = require('querystring');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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
 * Update .env file with token data
 * @param {Object} tokenData - Token data object
 */
async function updateEnvFile(tokenData) {
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Define token variables to add/update
    const tokenVars = {
      'EVERNOTE_ACCESS_TOKEN': tokenData.accessToken,
      'EVERNOTE_TOKEN_SECRET': tokenData.tokenSecret || '',
      'EVERNOTE_EDAM_SHARD': tokenData.edamShard || '',
      'EVERNOTE_EDAM_USER_ID': tokenData.edamUserId || '',
      'EVERNOTE_EDAM_EXPIRES': tokenData.edamExpires || '',
      'EVERNOTE_EDAM_NOTE_STORE_URL': tokenData.edamNoteStoreUrl || '',
      'EVERNOTE_EDAM_WEB_API_URL_PREFIX': tokenData.edamWebApiUrlPrefix || ''
    };
    
    // Update or add each token variable
    for (const [key, value] of Object.entries(tokenVars)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${value}`;
      
      if (regex.test(envContent)) {
        // Update existing line
        envContent = envContent.replace(regex, line);
      } else {
        // Add new line
        envContent += `\n${line}`;
      }
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent.trim() + '\n');
    console.error('✅ Tokens saved to .env file for persistent storage');
    
  } catch (error) {
    console.error('❌ Failed to update .env file:', error.message);
    // Don't throw error - we can still continue with in-memory tokens
  }
}

/**
 * Store access token and Evernote data in environment variables
 * @param {Object} tokenData - Complete token data from Evernote
 */
async function storeTokenInEnv(tokenData) {
  try {
    // Set environment variables
    process.env.EVERNOTE_ACCESS_TOKEN = tokenData.accessToken;
    process.env.EVERNOTE_TOKEN_SECRET = tokenData.tokenSecret || '';
    process.env.EVERNOTE_EDAM_SHARD = tokenData.edamShard || '';
    process.env.EVERNOTE_EDAM_USER_ID = tokenData.edamUserId || '';
    process.env.EVERNOTE_EDAM_EXPIRES = tokenData.edamExpires || '';
    process.env.EVERNOTE_EDAM_NOTE_STORE_URL = tokenData.edamNoteStoreUrl || '';
    process.env.EVERNOTE_EDAM_WEB_API_URL_PREFIX = tokenData.edamWebApiUrlPrefix || '';
    
    console.error('✅ Access token and Evernote data stored in environment variables');
    
    // Also persist to .env file for future runs
    await updateEnvFile(tokenData);
  } catch (error) {
    console.error('❌ Failed to store token in environment variables:', error.message);
    throw error;
  }
}

/**
 * Retrieve access token and Evernote data from environment variables
 * @returns {Promise<Object>} Token object or null
 */
async function getTokenFromEnv() {
  try {
    const accessToken = process.env.EVERNOTE_ACCESS_TOKEN;
    
    if (accessToken) {
      const result = {
        accessToken,
        tokenSecret: process.env.EVERNOTE_TOKEN_SECRET || '',
        edamShard: process.env.EVERNOTE_EDAM_SHARD || '',
        edamUserId: process.env.EVERNOTE_EDAM_USER_ID || '',
        edamExpires: process.env.EVERNOTE_EDAM_EXPIRES || '',
        edamNoteStoreUrl: process.env.EVERNOTE_EDAM_NOTE_STORE_URL || '',
        edamWebApiUrlPrefix: process.env.EVERNOTE_EDAM_WEB_API_URL_PREFIX || ''
      };
      
      return result;
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to retrieve token from environment variables:', error.message);
    return null;
  }
}

/**
 * Check if stored authentication tokens are expired
 * @returns {Promise<Object>} Object with expiration status and details
 */
async function checkTokenExpiration() {
  try {
    const tokenData = await getTokenFromEnv();
    
    if (!tokenData) {
      return {
        hasToken: false,
        isExpired: false,
        message: 'No stored authentication tokens found'
      };
    }
    
    if (!tokenData.edamExpires) {
      return {
        hasToken: true,
        isExpired: false,
        message: 'Token expiration date not available (assuming valid)',
        tokenData
      };
    }
    
    const now = Date.now();
    // edamExpires is already in milliseconds, don't multiply by 1000
    const expirationDate = new Date(parseInt(tokenData.edamExpires));
    const isExpired = now > expirationDate.getTime();
    const timeUntilExpiration = expirationDate.getTime() - now;
    
    return {
      hasToken: true,
      isExpired,
      expirationDate: expirationDate.toISOString(),
      timeUntilExpiration: isExpired ? 0 : timeUntilExpiration,
      message: isExpired 
        ? `Token expired on ${expirationDate.toLocaleString()}`
        : `Token valid until ${expirationDate.toLocaleString()}`,
      tokenData: isExpired ? null : tokenData
    };
    
  } catch (error) {
    console.error('❌ Error checking token expiration:', error.message);
    return {
      hasToken: false,
      isExpired: false,
      error: error.message,
      message: 'Error checking token status'
    };
  }
}

/**
 * Interactive prompt for user confirmation
 * @param {string} question - Question to ask the user
 * @returns {Promise<boolean>} True if user confirms, false otherwise
 */
function askUserConfirmation(question) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr // Use stderr to avoid interfering with stdout logs
    });
    
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
      resolve(confirmed);
    });
  });
}

/**
 * Clear expired tokens from environment variables
 * @returns {Promise<void>}
 */
async function clearStoredTokens() {
  try {
    console.error('🧹 Clearing expired tokens from environment variables...');
    
    // Delete all stored authentication data
    delete process.env.EVERNOTE_ACCESS_TOKEN;
    delete process.env.EVERNOTE_TOKEN_SECRET;
    delete process.env.EVERNOTE_EDAM_SHARD;
    delete process.env.EVERNOTE_EDAM_USER_ID;
    delete process.env.EVERNOTE_EDAM_EXPIRES;
    delete process.env.EVERNOTE_EDAM_NOTE_STORE_URL;
    delete process.env.EVERNOTE_EDAM_WEB_API_URL_PREFIX;
    
    console.error('✅ Expired tokens cleared from environment variables');
    console.error('💡 Remember to also remove these from your .env file if they exist');
  } catch (error) {
    console.error('❌ Error clearing tokens:', error.message);
    throw error;
  }
}

/**
 * Launch system browser to open URL
 * SECURITY: Uses spawn() instead of exec() to prevent command injection
 * @param {string} url - URL to open
 */
function openBrowser(url) {
  let command, args;

  if (process.platform === 'darwin') {
    // macOS: open <url>
    command = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    // Windows: cmd /c start "" <url>
    // The empty string "" is the window title parameter for start command
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    // Linux: xdg-open <url>
    command = 'xdg-open';
    args = [url];
  }

  // Use spawn() with array arguments - does NOT invoke shell, preventing injection
  const child = spawn(command, args, {
    stdio: 'ignore',  // Don't pipe stdio
    detached: true    // Allow parent to exit independently
  });

  child.on('error', (error) => {
    console.error('❌ Failed to open browser:', error.message);
    console.error('📋 Please manually open this URL in your browser:');
    console.error(url);
  });

  // Allow the parent process to exit independently of the child
  child.unref();

  console.error('🌐 Browser opened for Evernote authorization');
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
  const existingToken = await getTokenFromEnv();
  if (existingToken) {
    console.error('✅ Using existing access token from environment variables');
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
  await storeTokenInEnv(tokenData);
  return tokenData;
}

module.exports = {
  authenticate,
  handleCallback,
  getTokenFromEnv,
  checkTokenExpiration,
  askUserConfirmation,
  clearStoredTokens,
  EVERNOTE_CONFIG
};