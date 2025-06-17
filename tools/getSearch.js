/**
 * Evernote MCP Tool: Get Search
 * Retrieves search results by search ID or re-runs a search query
 */

const { createSearch, buildSearchQuery, logToolInvocation, createMCPResponse, DEV_MODE } = require('./createSearch');

// Simple in-memory storage for search results
// In a production system, you might use Redis or a database
const searchCache = new Map();

/**
 * Generate a search ID from search parameters
 * @param {Object} args - Search arguments
 * @returns {string} Search ID
 */
function generateSearchId(args) {
  // Create a consistent hash from search parameters
  const searchString = JSON.stringify({
    query: args.query || '',
    notebookName: args.notebookName || '',
    notebookGuid: args.notebookGuid || '',
    tags: args.tags || [],
    createdAfter: args.createdAfter || '',
    updatedAfter: args.updatedAfter || '',
    maxResults: args.maxResults || 20,
    offset: args.offset || 0
  });
  
  // Simple hash function for generating search ID
  let hash = 0;
  for (let i = 0; i < searchString.length; i++) {
    const char = searchString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `search_${Math.abs(hash).toString(36)}`;
}

/**
 * Store search results in cache
 * @param {string} searchId - Search ID
 * @param {Object} results - Search results
 * @param {Object} originalArgs - Original search arguments
 */
function cacheSearchResults(searchId, results, originalArgs) {
  searchCache.set(searchId, {
    results,
    originalArgs,
    timestamp: Date.now(),
    // Cache for 1 hour
    expires: Date.now() + 60 * 60 * 1000
  });
}

/**
 * Get cached search results
 * @param {string} searchId - Search ID
 * @returns {Object|null} Cached results or null if not found/expired
 */
function getCachedResults(searchId) {
  const cached = searchCache.get(searchId);
  if (!cached) {
    return null;
  }
  
  // Check if expired
  if (Date.now() > cached.expires) {
    searchCache.delete(searchId);
    return null;
  }
  
  return cached;
}

/**
 * Get search results by search ID or re-run search
 * @param {Object} args - Arguments containing searchId or search parameters
 * @param {Object} tokenData - OAuth authentication data
 * @returns {Promise<Object>} Standardized MCP response
 */
async function getSearch(args, tokenData) {
  logToolInvocation('getSearch', args);
  
  try {
    let searchId = args.searchId;
    let searchArgs = args;
    
    // If searchId is provided, try to get from cache first
    if (searchId) {
      console.error('📂 Looking for cached results for searchId:', searchId);
      const cached = getCachedResults(searchId);
      
      if (cached) {
        console.error('✅ Found cached results');
        const responseData = {
          ...cached.results.data, // Extract data from the MCP response
          searchId: searchId,
          cached: true,
          timestamp: cached.timestamp
        };
        return createMCPResponse('success', responseData);
      } else {
        console.error('❌ No cached results found or expired');
        // If we have a searchId but no cached results, we need the original search args
        // For now, return an error since we can't reconstruct the search
        return createMCPResponse('error', null, `Search ID ${searchId} not found or expired. Please create a new search.`);
      }
    }
    
    // If no searchId provided, generate one from the search parameters
    if (!searchId) {
      // Validate that we have search parameters
      if (!args.query && !args.notebookName && !args.tags) {
        return createMCPResponse('error', null, 'Either searchId or search criteria (query, notebookName, or tags) must be provided');
      }
      
      searchId = generateSearchId(args);
      console.error('🆔 Generated searchId:', searchId);
    }
    
    // Check cache one more time with generated ID
    const cached = getCachedResults(searchId);
    if (cached) {
      console.error('✅ Found cached results for generated searchId');
      const responseData = {
        ...cached.results.data, // Extract data from the MCP response
        searchId: searchId,
        cached: true,
        timestamp: cached.timestamp
      };
      return createMCPResponse('success', responseData);
    }
    
    // No cached results, perform new search
    console.error('🔍 Performing new search...');
    const results = await createSearch(searchArgs, tokenData);
    
    // Check if the search was successful
    if (results.status === 'error') {
      return results; // Return the error response as-is
    }
    
    // Cache the results
    cacheSearchResults(searchId, results, searchArgs);
    
    console.error('✅ Search completed and cached');
    const responseData = {
      ...results.data,
      searchId: searchId,
      cached: false,
      timestamp: Date.now()
    };
    
    return createMCPResponse('success', responseData);
    
  } catch (error) {
    console.error('❌ getSearch error:', error.message);
    return createMCPResponse('error', null, `Failed to get search results: ${error.message}`);
  }
}

/**
 * Clear expired cache entries
 */
function cleanupCache() {
  const now = Date.now();
  for (const [searchId, cached] of searchCache.entries()) {
    if (now > cached.expires) {
      searchCache.delete(searchId);
    }
  }
}

// Clean up cache every 30 minutes
setInterval(cleanupCache, 30 * 60 * 1000);

module.exports = {
  getSearch,
  generateSearchId,
  cacheSearchResults,
  getCachedResults
};