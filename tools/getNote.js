/**
 * Evernote MCP Tool: Get Note
 * Retrieves metadata about a specific note by GUID
 */

const https = require('https');
const { makeNoteStoreRequest, logToolInvocation, createMCPResponse, logEvernoteRequest, logEvernoteResponse, DEV_MODE } = require('./createSearch');


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
    
    console.error('🌐 Calling Evernote getNote API for GUID:', args.noteGuid);
    const note = await makeNoteStoreRequest('getNote', requestData, tokenData);
    
    console.error('✅ Retrieved note metadata');
    
    // Get tag names if we have tag GUIDs
    let tagNames = [];
    if (note.tagGuids && note.tagGuids.length > 0) {
      try {
        console.error('🏷️ Resolving tag names...');
        const tagData = {
          authenticationToken: tokenData.accessToken,
          guids: note.tagGuids
        };
        
        const tagsResponse = await makeNoteStoreRequest('listTags', tagData, tokenData);
        tagNames = tagsResponse.map(tag => tag.name);
        console.error('✅ Resolved tag names:', tagNames);
      } catch (tagError) {
        console.error('⚠️ Failed to resolve tag names:', tagError.message);
        // Continue without tag names
      }
    }
    
    // Get notebook name if we have notebook GUID
    let notebookName = null;
    if (note.notebookGuid) {
      try {
        console.error('📚 Resolving notebook name...');
        const notebookData = {
          authenticationToken: tokenData.accessToken,
          guid: note.notebookGuid
        };
        
        const notebook = await makeNoteStoreRequest('getNotebook', notebookData, tokenData);
        notebookName = notebook.name;
        console.error('✅ Resolved notebook name:', notebookName);
      } catch (notebookError) {
        console.error('⚠️ Failed to resolve notebook name:', notebookError.message);
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