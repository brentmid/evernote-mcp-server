/**
 * Evernote MCP Tool: Create Search
 * Searches for notes in Evernote using the NoteStore API
 */

const https = require('https');
const querystring = require('querystring');

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
 * Make authenticated request to Evernote NoteStore API
 * @param {string} endpoint - API endpoint path
 * @param {Object} data - Request data
 * @param {Object} tokenData - OAuth token data
 * @returns {Promise<Object>} API response
 */
function makeNoteStoreRequest(endpoint, data, tokenData) {
  return new Promise((resolve, reject) => {
    // Use the note store URL from the token data
    const noteStoreUrl = tokenData.edamNoteStoreUrl;
    if (!noteStoreUrl) {
      reject(new Error('Note store URL not available in token data'));
      return;
    }
    
    const url = new URL(noteStoreUrl + endpoint);
    
    // Prepare request data
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'User-Agent': 'evernote-mcp-server/1.0.0'
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } else {
            console.error('❌ Evernote API Error:', res.statusCode, responseData);
            // Log API error response in dev mode
            if (DEV_MODE) {
              logEvernoteResponse(endpoint, responseData, res.statusCode);
            }
            reject(new Error(`Evernote API Error: ${res.statusCode} - ${responseData}`));
          }
        } catch (parseError) {
          console.error('❌ Failed to parse Evernote API response:', parseError.message);
          if (DEV_MODE) {
            console.log('📨 Raw response data:', responseData);
          }
          reject(new Error('Invalid response from Evernote API'));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Network error calling Evernote API:', error.message);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
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
  console.log(`🔧 [${timestamp}] MCP Tool Invocation: ${toolName}`);
  
  if (DEV_MODE) {
    console.log(`📥 Args:`, JSON.stringify(redactSensitiveInfo(args), null, 2));
  } else {
    console.log(`📥 Args: [${Object.keys(args || {}).join(', ')}]`);
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
  console.log(`🌐 [${timestamp}] Evernote API Request: ${endpoint}`);
  console.log(`📤 Request:`, JSON.stringify(redactSensitiveInfo(requestData), null, 2));
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
  console.log(`🔄 [${timestamp}] Evernote API Response: ${endpoint} (${statusCode})`);
  
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
      console.log(`📨 Response Summary:`, JSON.stringify(summary, null, 2));
    } else {
      console.log(`📨 Response:`, responseData);
    }
  } else {
    console.log(`📨 Error Response:`, responseData);
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
    console.log(`📤 MCP Response:`, JSON.stringify(response, null, 2));
  } else {
    console.log(`📤 MCP Response: ${status} (${data ? 'with data' : error ? 'with error' : 'empty'})`);
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
    console.log('📝 Built search query:', searchQuery);
    
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
    
    console.log('🌐 Calling Evernote findNotesMetadata API...');
    logEvernoteRequest('/findNotesMetadata', requestData);
    const response = await makeNoteStoreRequest('/findNotesMetadata', requestData, tokenData);
    logEvernoteResponse('/findNotesMetadata', response, 200);
    
    // Process the response
    const notes = response.notes || [];
    const totalFound = response.totalNotes || 0;
    
    console.log(`✅ Found ${notes.length} notes (${totalFound} total)`);
    
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
      console.log('⚠️ Content inclusion requested but requires separate getNoteContent calls');
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
  logToolInvocation,
  createMCPResponse,
  redactSensitiveInfo,
  logEvernoteRequest,
  logEvernoteResponse,
  DEV_MODE
};