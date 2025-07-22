/**
 * Evernote MCP Tool: Create Search
 * Searches for notes in Evernote using the NoteStore API
 */

const https = require('https');
const querystring = require('querystring');
const { createNoteStoreClient, callThriftMethod, closeConnection } = require('../thrift/evernote-client');

// Check if development mode is enabled
const DEV_MODE = process.env.DEV_MODE === 'true' || process.env.NODE_ENV === 'development';

/**
 * Build Evernote search query string using search grammar
 * @param {Object} args - Search arguments
 * @returns {string} Formatted search query
 */
function buildSearchQuery(args) {
  let searchTerms = [];
  
  // Add main query if provided
  if (args.query) {
    searchTerms.push(args.query);
  }
  
  // Add notebook filter
  if (args.notebookName) {
    searchTerms.push(`notebook:"${args.notebookName}"`);
  }
  
  // Add tag filters
  if (args.tags && Array.isArray(args.tags)) {
    args.tags.forEach(tag => {
      searchTerms.push(`tag:"${tag}"`);
    });
  }
  
  // Add date range filters
  if (args.createdAfter) {
    const date = new Date(args.createdAfter).toISOString().split('T')[0];
    searchTerms.push(`created:${date}`);
  }
  
  if (args.updatedAfter) {
    const date = new Date(args.updatedAfter).toISOString().split('T')[0];
    searchTerms.push(`updated:${date}`);
  }
  
  return searchTerms.join(' ');
}

/**
 * Make authenticated request to Evernote NoteStore API using Thrift protocol
 * @param {string} method - Thrift method name (e.g., 'findNotesMetadata')
 * @param {Object} data - Request data containing auth token and parameters
 * @param {Object} tokenData - OAuth token data
 * @returns {Promise<Object>} API response
 */
async function makeNoteStoreRequest(method, data, tokenData) {
  // Use the note store URL from the token data
  const noteStoreUrl = tokenData.edamNoteStoreUrl;
  if (!noteStoreUrl) {
    throw new Error('Note store URL not available in token data');
  }
  
  console.error(`🔧 Thrift API call: ${method}`);
  logEvernoteRequest(method, data);
  
  let connection = null;
  
  try {
    // Create Thrift client connection
    connection = createNoteStoreClient(noteStoreUrl);
    
    // Prepare parameters for Thrift call
    // First parameter is always the authentication token
    const params = [data.authenticationToken];
    
    // Add method-specific parameters
    switch (method) {
      case 'findNotesMetadata':
        params.push(data.filter, data.offset, data.maxNotes, data.resultSpec);
        break;
      case 'getNote':
        params.push(data.guid, data.withContent, data.withResourcesData, 
                   data.withResourcesRecognition, data.withResourcesAlternateData);
        break;
      case 'getNoteContent':
        params.push(data.guid);
        break;
      case 'listTags':
        // No additional parameters needed
        break;
      case 'getNotebook':
        params.push(data.guid);
        break;
      default:
        // For other methods, pass all data fields as parameters
        Object.keys(data).forEach(key => {
          if (key !== 'authenticationToken') {
            params.push(data[key]);
          }
        });
    }
    
    // Make the Thrift method call
    const response = await callThriftMethod(connection, method, params);
    
    logEvernoteResponse(method, response, 200);
    console.error(`✅ Thrift call ${method} completed successfully`);
    
    return response;
    
  } catch (error) {
    console.error(`❌ Thrift call ${method} failed:`, error.message);
    // Always log basic error details to prevent silent failures
    console.error(`📍 Error type: ${error.name || 'Unknown'}`);
    
    if (DEV_MODE) {
      console.error(`❌ Full error details:`, error);
      logEvernoteResponse(method, { error: error.message }, 500);
    } else {
      // In production, still log essential error info
      console.error(`📍 Error code: ${error.errorCode || 'none'}`);
      console.error(`📍 Error parameter: ${error.parameter || 'none'}`);
    }
    
    // Handle EDAMUserException with specific error codes
    if (error.name === 'EDAMUserException' && error.errorCode) {
      const errorCodeNames = {
        1: 'UNKNOWN',
        2: 'BAD_DATA_FORMAT', 
        3: 'PERMISSION_DENIED',
        4: 'INTERNAL_ERROR',
        5: 'DATA_REQUIRED',
        6: 'LIMIT_REACHED',
        7: 'QUOTA_REACHED',
        8: 'INVALID_AUTH',
        9: 'AUTH_EXPIRED',
        10: 'DATA_CONFLICT',
        11: 'ENML_VALIDATION',
        12: 'SHARD_UNAVAILABLE',
        13: 'LEN_TOO_SHORT',
        14: 'LEN_TOO_LONG',
        15: 'TOO_FEW',
        16: 'TOO_MANY',
        17: 'UNSUPPORTED_OPERATION',
        18: 'TAKEN_DOWN',
        19: 'RATE_LIMIT_REACHED',
        20: 'BUSINESS_SECURITY_LOGIN_REQUIRED',
        21: 'DEVICE_LIMIT_REACHED',
        22: 'OPENID_ALREADY_TAKEN',
        23: 'INVALID_OPENID_TOKEN',
        24: 'USER_NOT_ASSOCIATED',
        25: 'USER_NOT_REGISTERED',
        26: 'USER_ALREADY_ASSOCIATED',
        27: 'ACCOUNT_CLEAR',
        28: 'SSO_AUTHENTICATION_REQUIRED'
      };
      
      const errorCodeName = errorCodeNames[error.errorCode] || `UNKNOWN_CODE_${error.errorCode}`;
      const parameter = error.parameter ? ` (${error.parameter})` : '';
      throw new Error(`EDAMUserException: ${errorCodeName}${parameter}`);
    }
    
    throw new Error(`Thrift API Error: ${error.message}`);
  } finally {
    // Always close the connection
    if (connection) {
      closeConnection(connection);
    }
  }
}

/**
 * Redact sensitive information from objects for logging
 * @param {Object} obj - Object to redact
 * @returns {Object} Redacted object
 */
function redactSensitiveInfo(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const redacted = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Redact sensitive fields
    if (lowerKey.includes('token') || 
        lowerKey.includes('secret') || 
        lowerKey.includes('key') || 
        lowerKey.includes('password') || 
        lowerKey.includes('auth')) {
      redacted[key] = value ? `[REDACTED:${value.toString().length}chars]` : value;
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveInfo(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Log tool invocation for debugging
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Tool arguments
 */
function logToolInvocation(toolName, args) {
  const timestamp = new Date().toISOString();
  console.error(`🔧 [${timestamp}] MCP Tool Invocation: ${toolName}`);
  
  if (DEV_MODE) {
    console.error(`📥 Args:`, JSON.stringify(redactSensitiveInfo(args), null, 2));
  } else {
    console.error(`📥 Args: [${Object.keys(args || {}).join(', ')}]`);
  }
}

/**
 * Log Evernote API request for debugging
 * @param {string} endpoint - API endpoint
 * @param {Object} requestData - Request data
 */
function logEvernoteRequest(endpoint, requestData) {
  if (!DEV_MODE) return;
  
  const timestamp = new Date().toISOString();
  console.error(`🌐 [${timestamp}] Evernote API Request: ${endpoint}`);
  console.error(`📤 Request:`, JSON.stringify(redactSensitiveInfo(requestData), null, 2));
}

/**
 * Log Evernote API response for debugging
 * @param {string} endpoint - API endpoint
 * @param {Object} responseData - Response data
 * @param {number} statusCode - HTTP status code
 */
function logEvernoteResponse(endpoint, responseData, statusCode) {
  if (!DEV_MODE) return;
  
  const timestamp = new Date().toISOString();
  console.error(`🔄 [${timestamp}] Evernote API Response: ${endpoint} (${statusCode})`);
  
  if (statusCode === 200) {
    // For successful responses, show a summary instead of full data
    if (responseData && typeof responseData === 'object') {
      const summary = {
        keys: Object.keys(responseData),
        noteCount: responseData.notes ? responseData.notes.length : undefined,
        totalNotes: responseData.totalNotes,
        title: responseData.title,
        guid: responseData.guid
      };
      console.error(`📨 Response Summary:`, JSON.stringify(summary, null, 2));
    } else {
      console.error(`📨 Response:`, responseData);
    }
  } else {
    console.error(`📨 Error Response:`, responseData);
  }
}

/**
 * Create standardized MCP response
 * @param {string} status - 'success' or 'error'
 * @param {Object} data - Response data (null for errors)
 * @param {string} error - Error message (null for success)
 * @returns {Object} Standardized response
 */
function createMCPResponse(status, data = null, error = null) {
  const response = {
    status,
    timestamp: new Date().toISOString(),
    data,
    error
  };
  
  if (DEV_MODE) {
    console.error(`📤 MCP Response:`, JSON.stringify(response, null, 2));
  } else {
    console.error(`📤 MCP Response: ${status} (${data ? 'with data' : error ? 'with error' : 'empty'})`);
  }
  return response;
}

/**
 * Search for notes using Evernote's findNotesMetadata API
 * @param {Object} args - Search arguments
 * @param {Object} tokenData - OAuth authentication data
 * @returns {Promise<Object>} Standardized MCP response
 */
async function createSearch(args, tokenData) {
  logToolInvocation('createSearch', args);
  
  // Validate required parameters
  if (!args.query && !args.notebookName && !args.tags) {
    throw new Error('At least one search criteria must be provided (query, notebookName, or tags)');
  }
  
  try {
    // Build search query using Evernote search grammar
    const searchQuery = buildSearchQuery(args);
    console.error('📝 Built search query:', searchQuery);
    
    // Prepare NoteFilter for the API call
    const noteFilter = {
      words: searchQuery,
      inactive: false // Only search active notes (not in trash)
    };
    
    // Add notebook GUID if provided
    if (args.notebookGuid) {
      noteFilter.notebookGuid = args.notebookGuid;
    }
    
    // Prepare request parameters
    const maxResults = Math.min(args.maxResults || 20, 100); // Cap at 100
    const offset = args.offset || 0;
    
    // Call Evernote findNotesMetadata API
    const requestData = {
      authenticationToken: tokenData.accessToken,
      filter: noteFilter,
      offset: offset,
      maxNotes: maxResults,
      resultSpec: {
        includeTitle: true,
        includeContentLength: true,
        includeCreated: true,
        includeUpdated: true,
        includeDeleted: false,
        includeUpdateSequenceNum: true,
        includeNotebookGuid: true,
        includeTagGuids: true,
        includeAttributes: false,
        includeLargestResourceMime: false,
        includeLargestResourceSize: false
      }
    };
    
    console.error('🌐 Calling Evernote findNotesMetadata API...');
    const response = await makeNoteStoreRequest('findNotesMetadata', requestData, tokenData);
    
    // Process the response
    const notes = response.notes || [];
    const totalFound = response.totalNotes || 0;
    
    console.error(`✅ Found ${notes.length} notes (${totalFound} total)`);
    
    // Format results according to MCP schema
    const results = notes.map(note => ({
      guid: note.guid,
      title: note.title || 'Untitled',
      created: new Date(note.created).toISOString(),
      updated: new Date(note.updated).toISOString(),
      notebookGuid: note.notebookGuid,
      contentLength: note.contentLength,
      updateSequenceNum: note.updateSequenceNum,
      // Note: Tag names would require additional API calls to resolve from GUIDs
      tags: note.tagGuids || [],
      // Include content only if specifically requested (requires separate API call)
      content: args.includeContent ? null : undefined
    }));
    
    // If content was requested, we'd need to make additional getNoteContent calls
    // For now, we'll indicate that content requires a separate call
    if (args.includeContent) {
      console.error('⚠️ Content inclusion requested but requires separate getNoteContent calls');
    }
    
    const responseData = {
      results: results,
      totalFound: totalFound,
      query: searchQuery,
      offset: offset,
      maxResults: maxResults
    };
    
    return createMCPResponse('success', responseData);
    
  } catch (error) {
    console.error('❌ createSearch error:', error.message);
    console.error('📍 Error details:', error.name || 'Unknown error type');
    console.error('📍 Stack trace:', error.stack);
    
    // Provide more specific error messages
    let errorMessage;
    if (error.message.includes('authentication')) {
      errorMessage = 'Evernote authentication failed. Please re-authenticate.';
    } else if (error.message.includes('quota')) {
      errorMessage = 'Evernote API quota exceeded. Please try again later.';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      errorMessage = 'Network error connecting to Evernote. Please check your internet connection.';
    } else {
      errorMessage = `Search failed: ${error.message}`;
    }
    
    return createMCPResponse('error', null, errorMessage);
  }
}

module.exports = {
  createSearch,
  buildSearchQuery,
  makeNoteStoreRequest,
  logToolInvocation,
  createMCPResponse,
  redactSensitiveInfo,
  logEvernoteRequest,
  logEvernoteResponse,
  DEV_MODE
};