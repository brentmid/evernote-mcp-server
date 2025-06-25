/**
 * Evernote Thrift Client
 * Handles Thrift protocol communication with Evernote API using official Evernote Thrift definitions
 */

const thrift = require('thrift');
const https = require('https');
const { URL } = require('url');

// Import the generated Evernote Thrift client
const NoteStore = require('./gen-nodejs/NoteStore');
const NoteStoreTypes = require('./gen-nodejs/NoteStore_types');
const Types = require('./gen-nodejs/Types_types');

/**
 * Create a real Thrift client for Evernote NoteStore
 * @param {string} noteStoreUrl - The NoteStore URL from OAuth response
 * @returns {Object} Thrift client and connection
 */
function createNoteStoreClient(noteStoreUrl) {
  const url = new URL(noteStoreUrl);
  
  console.error(`🔧 Creating real Thrift connection to: ${url.hostname}:${url.port || 443}${url.pathname}`);
  
  // Create HTTPS connection for Thrift
  const connectionOptions = {
    transport: thrift.TBufferedTransport,
    protocol: thrift.TBinaryProtocol,
    path: url.pathname,
    headers: {
      'User-Agent': 'evernote-mcp-server/1.1.0'
    },
    https: true // Enable HTTPS
  };
  
  const connection = thrift.createHttpConnection(url.hostname, url.port || 443, connectionOptions);
  
  // Create the NoteStore client
  const client = thrift.createHttpClient(NoteStore, connection);
  
  // Handle connection events
  connection.on('error', (err) => {
    console.error('❌ Thrift connection error:', err.message);
  });
  
  connection.on('connect', () => {
    console.error('✅ Real Thrift connection established');
  });
  
  console.error('✅ Real Thrift client created');
  return { client, connection };
}

/**
 * Make a real Thrift method call to Evernote NoteStore
 * @param {Object} clientData - Object containing client and connection from createNoteStoreClient
 * @param {string} method - Thrift method name
 * @param {Array} params - Method parameters
 * @returns {Promise<Object>} Method result
 */
function callThriftMethod(clientData, method, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const { client } = clientData;
      console.error(`🔧 Real Thrift call: ${method} with ${params.length} parameters`);
      
      // Call the appropriate method on the real Thrift client
      switch (method) {
        case 'findNotesMetadata':
          const [authToken, filter, offset, maxNotes, resultSpec] = params;
          client.findNotesMetadata(authToken, filter, offset, maxNotes, resultSpec, (err, result) => {
            if (err) {
              console.error(`❌ Thrift ${method} error:`, err);
              reject(err);
            } else {
              console.error(`✅ Thrift ${method} completed successfully`);
              resolve(result);
            }
          });
          break;
          
        case 'getNote':
          const [authToken2, guid, withContent, withResourcesData, withResourcesRecognition, withResourcesAlternateData] = params;
          client.getNote(authToken2, guid, withContent, withResourcesData, withResourcesRecognition, withResourcesAlternateData, (err, result) => {
            if (err) {
              console.error(`❌ Thrift ${method} error:`, err);
              reject(err);
            } else {
              console.error(`✅ Thrift ${method} completed successfully`);
              resolve(result);
            }
          });
          break;
          
        case 'getNoteContent':
          const [authToken3, guid2] = params;
          client.getNoteContent(authToken3, guid2, (err, result) => {
            if (err) {
              console.error(`❌ Thrift ${method} error:`, err);
              reject(err);
            } else {
              console.error(`✅ Thrift ${method} completed successfully`);
              // getNoteContent returns just the content string, so we need to wrap it
              resolve({ content: result });
            }
          });
          break;
          
        case 'listTags':
          const [authToken4] = params;
          client.listTags(authToken4, (err, result) => {
            if (err) {
              console.error(`❌ Thrift ${method} error:`, err);
              reject(err);
            } else {
              console.error(`✅ Thrift ${method} completed successfully`);
              resolve(result);
            }
          });
          break;
          
        case 'getNotebook':
          const [authToken5, notebookGuid] = params;
          client.getNotebook(authToken5, notebookGuid, (err, result) => {
            if (err) {
              console.error(`❌ Thrift ${method} error:`, err);
              reject(err);
            } else {
              console.error(`✅ Thrift ${method} completed successfully`);
              resolve(result);
            }
          });
          break;
          
        case 'getNoteTagNames':
          const [authToken6, noteGuid] = params;
          client.getNoteTagNames(authToken6, noteGuid, (err, result) => {
            if (err) {
              console.error(`❌ Thrift ${method} error:`, err);
              reject(err);
            } else {
              console.error(`✅ Thrift ${method} completed successfully`);
              resolve(result);
            }
          });
          break;
          
        default:
          reject(new Error(`Unsupported Thrift method: ${method}`));
      }
      
    } catch (error) {
      console.error(`❌ Thrift call ${method} failed:`, error.message);
      reject(error);
    }
  });
}


/**
 * Close Thrift connection
 * @param {Object} clientData - Object containing client and connection from createNoteStoreClient
 */
function closeConnection(clientData) {
  if (clientData && clientData.connection) {
    try {
      console.error('🔧 Closing Thrift connection...');
      // HTTP connections don't need explicit cleanup for one-off requests
      // The connection will be closed automatically by the HTTP client
      console.error('✅ Thrift connection closed');
    } catch (error) {
      console.error('❌ Error closing Thrift connection:', error.message);
    }
  }
}

module.exports = {
  createNoteStoreClient,
  callThriftMethod,
  closeConnection
};