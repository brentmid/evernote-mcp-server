/**
 * Evernote MCP Tool: Get Note
 * Retrieves metadata about a specific note by GUID
 */

const https = require('https');
const { logToolInvocation, createMCPResponse, logEvernoteRequest, logEvernoteResponse, DEV_MODE } = require('./createSearch');

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
 * Get note metadata by GUID
 * @param {Object} args - Arguments containing noteGuid
 * @param {Object} tokenData - OAuth authentication data
 * @returns {Promise<Object>} Standardized MCP response
 */
async function getNote(args, tokenData) {
  logToolInvocation('getNote', args);
  
  try {
    // Validate required parameters
    if (!args.noteGuid) {
      return createMCPResponse('error', null, 'noteGuid is required');
    }
    // Prepare request parameters for getNote API
    const requestData = {
      authenticationToken: tokenData.accessToken,
      guid: args.noteGuid,
      withContent: false, // We only want metadata, not content
      withResourcesData: false,
      withResourcesRecognition: false,
      withResourcesAlternateData: false
    };
    
    console.log('🌐 Calling Evernote getNote API for GUID:', args.noteGuid);
    logEvernoteRequest('/getNote', requestData);
    const note = await makeNoteStoreRequest('/getNote', requestData, tokenData);
    logEvernoteResponse('/getNote', note, 200);
    
    console.log('✅ Retrieved note metadata');
    
    // Get tag names if we have tag GUIDs
    let tagNames = [];
    if (note.tagGuids && note.tagGuids.length > 0) {
      try {
        console.log('🏷️ Resolving tag names...');
        const tagData = {
          authenticationToken: tokenData.accessToken,
          guids: note.tagGuids
        };
        
        logEvernoteRequest('/getTags', tagData);
        const tagsResponse = await makeNoteStoreRequest('/getTags', tagData, tokenData);
        logEvernoteResponse('/getTags', tagsResponse, 200);
        tagNames = tagsResponse.map(tag => tag.name);
        console.log('✅ Resolved tag names:', tagNames);
      } catch (tagError) {
        console.warn('⚠️ Failed to resolve tag names:', tagError.message);
        // Continue without tag names
      }
    }
    
    // Get notebook name if we have notebook GUID
    let notebookName = null;
    if (note.notebookGuid) {
      try {
        console.log('📚 Resolving notebook name...');
        const notebookData = {
          authenticationToken: tokenData.accessToken,
          guid: note.notebookGuid
        };
        
        logEvernoteRequest('/getNotebook', notebookData);
        const notebook = await makeNoteStoreRequest('/getNotebook', notebookData, tokenData);
        logEvernoteResponse('/getNotebook', notebook, 200);
        notebookName = notebook.name;
        console.log('✅ Resolved notebook name:', notebookName);
      } catch (notebookError) {
        console.warn('⚠️ Failed to resolve notebook name:', notebookError.message);
        // Continue without notebook name
      }
    }
    
    // Format the response according to MCP schema
    const result = {
      guid: note.guid,
      title: note.title || 'Untitled',
      created: new Date(note.created).toISOString(),
      updated: new Date(note.updated).toISOString(),
      deleted: note.deleted ? new Date(note.deleted).toISOString() : null,
      active: note.active !== false, // Default to true if not specified
      updateSequenceNum: note.updateSequenceNum,
      notebookGuid: note.notebookGuid,
      notebookName: notebookName,
      tagGuids: note.tagGuids || [],
      tagNames: tagNames,
      contentLength: note.contentLength,
      contentHash: note.contentHash,
      // Note attributes
      attributes: note.attributes ? {
        subjectDate: note.attributes.subjectDate ? new Date(note.attributes.subjectDate).toISOString() : null,
        latitude: note.attributes.latitude,
        longitude: note.attributes.longitude,
        altitude: note.attributes.altitude,
        author: note.attributes.author,
        source: note.attributes.source,
        sourceURL: note.attributes.sourceURL,
        sourceApplication: note.attributes.sourceApplication,
        shareDate: note.attributes.shareDate ? new Date(note.attributes.shareDate).toISOString() : null,
        reminderOrder: note.attributes.reminderOrder,
        reminderDoneTime: note.attributes.reminderDoneTime ? new Date(note.attributes.reminderDoneTime).toISOString() : null,
        reminderTime: note.attributes.reminderTime ? new Date(note.attributes.reminderTime).toISOString() : null,
        placeName: note.attributes.placeName,
        contentClass: note.attributes.contentClass,
        applicationData: note.attributes.applicationData,
        lastEditedBy: note.attributes.lastEditedBy,
        classifications: note.attributes.classifications,
        creatorId: note.attributes.creatorId,
        lastEditorId: note.attributes.lastEditorId
      } : null,
      // Resource information (attachments, images, etc.)
      resources: note.resources ? note.resources.map(resource => ({
        guid: resource.guid,
        noteGuid: resource.noteGuid,
        mime: resource.mime,
        width: resource.width,
        height: resource.height,
        duration: resource.duration,
        active: resource.active !== false,
        updateSequenceNum: resource.updateSequenceNum,
        recognition: resource.recognition ? {
          bodyHash: resource.recognition.bodyHash,
          size: resource.recognition.size
        } : null,
        attributes: resource.attributes ? {
          sourceURL: resource.attributes.sourceURL,
          timestamp: resource.attributes.timestamp ? new Date(resource.attributes.timestamp).toISOString() : null,
          latitude: resource.attributes.latitude,
          longitude: resource.attributes.longitude,
          altitude: resource.attributes.altitude,
          cameraMake: resource.attributes.cameraMake,
          cameraModel: resource.attributes.cameraModel,
          clientWillIndex: resource.attributes.clientWillIndex,
          fileName: resource.attributes.fileName,
          attachment: resource.attributes.attachment
        } : null
      })) : []
    };
    
    return createMCPResponse('success', result);
    
  } catch (error) {
    console.error('❌ getNote error:', error.message);
    
    // Provide more specific error messages
    let errorMessage;
    if (error.message.includes('authentication')) {
      errorMessage = 'Evernote authentication failed. Please re-authenticate.';
    } else if (error.message.includes('not found') || error.message.includes('404')) {
      errorMessage = `Note with GUID ${args.noteGuid} not found or has been deleted.`;
    } else if (error.message.includes('quota')) {
      errorMessage = 'Evernote API quota exceeded. Please try again later.';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      errorMessage = 'Network error connecting to Evernote. Please check your internet connection.';
    } else {
      errorMessage = `Failed to retrieve note: ${error.message}`;
    }
    
    return createMCPResponse('error', null, errorMessage);
  }
}

module.exports = {
  getNote
};