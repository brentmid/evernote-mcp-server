# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local Evernote MCP (Model Context Protocol) server that connects Claude Desktop with Evernote accounts. It provides read-only access to Evernote notes through MCP calls like `createSearch`, `getNote`, and `getNoteContent`.

## Architecture

- **Language**: Node.js with Express framework
- **External services**: Evernote API using OAuth 1.0a authentication
- **Main entry point**: `index.js` - HTTPS server with OAuth integration
- **Authentication module**: `auth.js` - handles complete OAuth 1.0a flow
- **Authentication**: OAuth 1.0a flow (NOT OAuth 2.0), tokens stored in macOS Keychain via `keytar`
- **Security model**: Read-only Evernote access, HTTPS-only server, no third-party data transmission except to Evernote
- **MCP compliance**: Implements MCP protocol for LLM integration

## Development Commands

- **Install dependencies**: `npm install`
- **Set environment variables**: Export `EVERNOTE_CONSUMER_KEY` and `EVERNOTE_CONSUMER_SECRET`
- **Enable debug logging** (optional): `export DEV_MODE=true` for detailed API request/response logging
- **Generate SSL certificates**: `mkdir cert && openssl req -x509 -newkey rsa:4096 -keyout cert/localhost.key -out cert/localhost.crt -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=Local/OU=Local/CN=localhost"`
- **Run server**: `npx node index.js` (requires SSL certificates and Evernote API credentials)

### Testing Commands
- **Run all tests**: `npm test` (38 tests across 3 test suites)
- **Run tests with coverage**: `npm run test:coverage` (70%+ branch, 80%+ function/line coverage)
- **Run tests in watch mode**: `npm run test:watch` (for active development)
- **Run specific test files**: `npm test auth.test.js`, `npm test server.test.js`, `npm test integration.test.js`

## Key Technical Details

- **HTTPS Required**: Server runs on HTTPS with self-signed certificates (port 3443)
- **OAuth 1.0a Implementation**: Uses HMAC-SHA1 signatures, not OAuth 2.0/PKCE
- Uses Node.js CommonJS modules (`"type": "commonjs"` in package.json)
- Requires macOS with Node.js 18+ and OpenSSL for certificate generation
- **Evernote API Credentials**: Requires registered Evernote developer app
- Browser-based OAuth 1.0a flow launches automatically on first run
- **Production Environment**: Uses Evernote production API (sandbox decommissioned)
- Designed for Claude Desktop MCP integration with future LLM compatibility
- **Debug Logging**: Configurable via `DEV_MODE` environment variable (detailed API logging with token redaction)
- SSL certificates stored in cert/ directory (excluded from git)
- **Dependencies**: `express`, `keytar` (for macOS Keychain), built-in `crypto`, `https`
- **Dev Dependencies**: `jest`, `supertest` for comprehensive testing

## Authentication Flow

**OAuth 1.0a Flow (NOT OAuth 2.0)**:

1. **Token Check**: Server checks macOS Keychain for existing access token
2. **Request Token**: If none found, generates temporary request token from Evernote
3. **User Authorization**: Browser opens Evernote authorization URL automatically
4. **Callback Handling**: `/oauth/callback` endpoint receives authorization response
5. **Token Exchange**: Server exchanges request token + verifier for permanent access token
6. **Storage**: Access token stored securely in macOS Keychain via `keytar`
7. **Subsequent Runs**: Stored tokens used automatically for future requests

**Key Implementation Details**:
- Uses HMAC-SHA1 signature generation for OAuth 1.0a
- Callback URL: `https://localhost:3443/oauth/callback`
- Tokens stored with service name: `evernote-mcp-server`
- Request token secrets temporarily stored in server memory during OAuth flow
- MCP endpoints require valid authentication (return 401 if not authenticated)

## Testing Implementation

**Test Structure** (38 tests total):
- `tests/auth.test.js` - OAuth 1.0a authentication tests (12 tests)
- `tests/server.test.js` - Express server route tests (15 tests) 
- `tests/integration.test.js` - End-to-end workflow tests (11 tests)
- `tests/setup.js` - Global test configuration and utilities
- `jest.config.js` - Jest configuration with coverage thresholds

**Key Test Features**:
- **Comprehensive Mocking**: All external dependencies mocked (keytar, child_process, fs, https)
- **Real Crypto Testing**: Actual HMAC-SHA1 signature validation with test vectors
- **Environment Isolation**: Test-specific environment variables prevent interference
- **Coverage Requirements**: 70%+ branch, 80%+ function/line coverage enforced
- **Error Scenario Testing**: Network failures, invalid responses, keychain errors
- **Integration Validation**: Full OAuth workflow simulation without external API dependencies

**Test Categories**:
- OAuth parameter generation and HMAC-SHA1 signature creation
- Keychain integration (store/retrieve tokens)
- Express route testing (health check, OAuth callback, MCP endpoint)
- Authentication flow validation (existing vs new token scenarios)
- Error handling (network failures, malformed requests, access denials)
- Configuration validation (endpoints, environment variables)

## Current Implementation Status

### Completed Features ✅
- Complete OAuth 1.0a implementation with Evernote production endpoints
- HTTPS server with self-signed certificates for local development  
- macOS Keychain integration for secure token storage
- Comprehensive test suite (38 tests) with extensive mocking
- MCP tool manifest (mcp.json) with complete specification  
- POST /mcp endpoint with command dispatching
- **Complete Apache Thrift protocol implementation** with official Evernote IDL definitions
- **Real Evernote API integration** - all mock implementations replaced with actual Thrift calls
- Four MCP tools fully implemented: createSearch, getSearch, getNote, getNoteContent
- Support for advanced search filters (notebook, tags, date ranges)
- Modular tool architecture in tools/ directory
- **Claude Desktop integration** with MCP server configuration
- GET /mcp.json endpoint for serving MCP manifest
- Generated JavaScript Thrift client libraries from official Evernote IDL files

### In Progress 🚧
- Performance optimizations for large note collections
- Enhanced error handling and user feedback

### Planned Features 📋
- Support for additional Evernote search filters and advanced queries
- Cross-platform compatibility (Linux/Windows token storage)
- Integration with other MCP-compatible LLMs

## Claude Desktop Integration

### Configuration Setup

Claude Desktop requires configuration in its settings file to connect to the MCP server:

**Location**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Configuration**:
```json
{
  "mcpServers": {
    "evernote": {
      "command": "node",
      "args": ["/Users/brent/bin/evernote-mcp-server/mcp-server.js"],
      "env": {
        "EVERNOTE_CONSUMER_KEY": "your-actual-consumer-key",
        "EVERNOTE_CONSUMER_SECRET": "your-actual-consumer-secret"
      }
    }
  }
}
```

### Integration Steps

1. **Complete Server Setup**: Follow development commands to set up the server, certificates, and complete OAuth flow using `node index.js`
2. **Configure Claude Desktop**: Edit the configuration file with your credentials and absolute path (use `mcp-server.js` not `index.js`)
3. **Restart Claude Desktop**: Quit completely (⌘+Q) and reopen
4. **Test Integration**: Ask Claude to search your Evernote notes

### Available MCP Tools in Claude Desktop

- **createSearch**: Natural language search of Evernote notes with filters
- **getSearch**: Retrieve cached search results by ID
- **getNote**: Get detailed note metadata including tags and notebook info
- **getNoteContent**: Retrieve full note content in text, HTML, or ENML formats

### Example Claude Desktop Interactions

```
User: "Search my Evernote for notes about boat maintenance"
Claude: [Uses createSearch tool] "I found 12 notes about boat maintenance..."

User: "Get the full content of that first note"
Claude: [Uses getNoteContent tool] "Here's the complete content..."

User: "Show me my most recent meeting notes"
Claude: [Uses createSearch with date filters] "Here are your recent meeting notes..."
```

### Troubleshooting Claude Desktop

**Common Issues**:
- **Server not running**: Ensure the MCP server is started before launching Claude Desktop
- **Authentication failure**: Complete OAuth flow standalone first to store tokens in Keychain
- **Path errors**: Use absolute paths in Claude Desktop configuration
- **Credential issues**: Verify Evernote API keys are correctly set

**Debug Methods**:
- Check server logs for Thrift connection errors
- Use `DEV_MODE=true` for detailed API logging
- Verify tokens in macOS Keychain Access app
- Test server endpoints directly with curl before Claude Desktop integration

## File Structure

```
evernote-mcp-server/
├── index.js              # Main HTTPS server with OAuth integration and /mcp.json endpoint
├── auth.js               # OAuth 1.0a authentication module
├── mcp.json              # MCP tool manifest for Claude Desktop
├── tools/                # MCP tool implementations
│   ├── createSearch.js   # Real Thrift-based search implementation
│   ├── getSearch.js      # Search result caching and retrieval
│   ├── getNote.js        # Note metadata retrieval with tag/notebook resolution
│   └── getNoteContent.js # Note content with ENML/HTML/text format conversion
├── thrift/               # Apache Thrift client implementation
│   ├── evernote-client.js # Real Thrift protocol client for Evernote
│   ├── *.thrift          # Official Evernote IDL definitions (5 files)
│   └── gen-nodejs/       # Generated JavaScript Thrift client libraries (7 files)
├── tests/                # Comprehensive test suite (38 tests)
│   ├── auth.test.js      # OAuth authentication tests
│   ├── server.test.js    # Express server route tests
│   ├── integration.test.js # End-to-end workflow tests
│   └── setup.js          # Global test configuration
├── cert/                 # SSL certificates (excluded from git)
├── package.json          # Dependencies and scripts (includes thrift dependency)
├── jest.config.js        # Jest test configuration
├── .gitignore            # Git ignore patterns
├── README.md             # Detailed project documentation
└── CLAUDE.md             # This file - guidance for Claude Code
```