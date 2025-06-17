/**
 * Evernote MCP Tool: Get Note Content
 * Retrieves the full content of a specific note by GUID
 */

const https = require('https');
const { makeNoteStoreRequest, logToolInvocation, createMCPResponse, logEvernoteRequest, logEvernoteResponse, DEV_MODE } = require('./createSearch');


/**
 * Convert Evernote's ENML (Evernote Markup Language) to plain text
 * @param {string} enml - ENML content
 * @returns {string} Plain text content
 */
function enmlToPlainText(enml) {
  if (!enml) return '';
  
  // Remove ENML-specific tags
  let text = enml
    // Remove DOCTYPE and XML declarations
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    // Remove en-note wrapper
    .replace(/<\/?en-note[^>]*>/gi, '')
    // Remove media elements but keep alt text if available
    .replace(/<en-media[^>]*alt=["']([^"']*)["'][^>]*>/gi, '$1')
    .replace(/<en-media[^>]*>/gi, '[Media]')
    // Remove crypt elements
    .replace(/<en-crypt[^>]*>.*?<\/en-crypt>/gi, '[Encrypted Content]')
    // Remove todo checkboxes but indicate status
    .replace(/<en-todo\s+checked=["']true["'][^>]*>/gi, '☑ ')
    .replace(/<en-todo[^>]*>/gi, '☐ ')
    // Convert common HTML tags to plain text equivalents
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<t[dhr][^>]*>/gi, '')
    .replace(/<\/?table[^>]*>/gi, '\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Clean up whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove multiple consecutive newlines
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/[ \t]+/g, ' '); // Normalize spaces
  
  return text;
}

/**
 * Clean up ENML content for better HTML presentation
 * @param {string} enml - ENML content
 * @returns {string} Cleaned HTML content
 */
function enmlToHtml(enml) {
  if (!enml) return '';
  
  // Remove ENML-specific elements and convert to standard HTML
  let html = enml
    // Remove DOCTYPE and XML declarations
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    // Convert en-note to div
    .replace(/<en-note[^>]*>/gi, '<div class="note-content">')
    .replace(/<\/en-note>/gi, '</div>')
    // Convert media elements to placeholder or image tags
    .replace(/<en-media([^>]*type=["']image[^"']*["'][^>]*)>/gi, '<img$1 alt="Evernote Image" style="max-width: 100%;">')
    .replace(/<en-media[^>]*>/gi, '<div class="media-placeholder">[Media Attachment]</div>')
    // Convert crypt elements
    .replace(/<en-crypt[^>]*>.*?<\/en-crypt>/gi, '<div class="encrypted-content">[Encrypted Content]</div>')
    // Convert todo checkboxes to HTML checkboxes
    .replace(/<en-todo\s+checked=["']true["'][^>]*>/gi, '<input type="checkbox" checked disabled> ')
    .replace(/<en-todo[^>]*>/gi, '<input type="checkbox" disabled> ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  
  return html;
}

/**
 * Get note content by GUID
 * @param {Object} args - Arguments containing noteGuid and optional format
 * @param {Object} tokenData - OAuth authentication data
 * @returns {Promise<Object>} Standardized MCP response
 */
async function getNoteContent(args, tokenData) {
  logToolInvocation('getNoteContent', args);
  
  try {
    // Validate required parameters
    if (!args.noteGuid) {
      return createMCPResponse('error', null, 'noteGuid is required');
    }
    
    // Determine output format (default to 'text')
    const format = args.format || 'text';
    if (!['text', 'html', 'enml'].includes(format)) {
      return createMCPResponse('error', null, 'format must be one of: text, html, enml');
    }
    // Prepare request parameters for getNote API with content
    const requestData = {
      authenticationToken: tokenData.accessToken,
      guid: args.noteGuid,
      withContent: true, // We want the content this time
      withResourcesData: false, // Don't include binary resource data
      withResourcesRecognition: false,
      withResourcesAlternateData: false
    };
    
    console.error('🌐 Calling Evernote getNote API for content, GUID:', args.noteGuid);
    const note = await makeNoteStoreRequest('getNote', requestData, tokenData);
    
    console.error('✅ Retrieved note content');
    
    // Process content based on requested format
    let processedContent;
    let contentType;
    
    switch (format) {
      case 'enml':
        processedContent = note.content || '';
        contentType = 'application/enml+xml';
        break;
      case 'html':
        processedContent = enmlToHtml(note.content || '');
        contentType = 'text/html';
        break;
      case 'text':
      default:
        processedContent = enmlToPlainText(note.content || '');
        contentType = 'text/plain';
        break;
    }
    
    // Get basic note metadata as well
    const result = {
      guid: note.guid,
      title: note.title || 'Untitled',
      content: processedContent,
      contentType: contentType,
      format: format,
      contentLength: note.contentLength,
      contentHash: note.contentHash,
      created: new Date(note.created).toISOString(),
      updated: new Date(note.updated).toISOString(),
      // Include resource information if present
      resources: note.resources ? note.resources.map(resource => ({
        guid: resource.guid,
        mime: resource.mime,
        width: resource.width,
        height: resource.height,
        duration: resource.duration,
        recognition: resource.recognition ? {
          bodyHash: resource.recognition.bodyHash,
          size: resource.recognition.size
        } : null,
        attributes: resource.attributes ? {
          sourceURL: resource.attributes.sourceURL,
          timestamp: resource.attributes.timestamp ? new Date(resource.attributes.timestamp).toISOString() : null,
          fileName: resource.attributes.fileName,
          attachment: resource.attributes.attachment
        } : null
      })) : []
    };
    
    console.error(`✅ Processed content as ${format} (${processedContent.length} characters)`);
    return createMCPResponse('success', result);
    
  } catch (error) {
    console.error('❌ getNoteContent error:', error.message);
    
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
      errorMessage = `Failed to retrieve note content: ${error.message}`;
    }
    
    return createMCPResponse('error', null, errorMessage);
  }
}

module.exports = {
  getNoteContent,
  enmlToPlainText,
  enmlToHtml
};