# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local Evernote MCP (Model Context Protocol) server that connects Claude Desktop with Evernote accounts. It provides read-only access to Evernote notes through MCP calls like `createSearch`, `getNote`, and `getNoteContent`. Version 1.1 includes automatic token expiration detection and user-friendly re-authentication prompts.

## Architecture

- **Language**: Node.js with Express framework
- **External services**: Evernote API using OAuth 1.0a authentication
- **Main entry point**: `index.js` - HTTPS server with OAuth integration
- **Authentication module**: `auth.js` - handles complete OAuth 1.0a flow
- **Authentication**: OAuth 1.0a flow (NOT OAuth 2.0), tokens automatically persisted in .env file
- **Security model**: Read-only Evernote access, HTTPS-only server, no third-party data transmission except to Evernote
- **MCP compliance**: Implements MCP protocol for LLM integration

## Development Commands

### Local Development
- **Install dependencies**: `npm install`
- **Set environment variables**: Export `EVERNOTE_CONSUMER_KEY` and `EVERNOTE_CONSUMER_SECRET`
- **Enable debug logging** (optional): `export DEV_MODE=true` for detailed API request/response logging
- **Generate SSL certificates**: `mkdir cert && openssl req -x509 -newkey rsa:4096 -keyout cert/localhost.key -out cert/localhost.crt -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=Local/OU=Local/CN=localhost"`
- **Run server**: `npx node index.js` (requires SSL certificates and Evernote API credentials)

### Docker Development
- **Build and run with Docker Compose**: `docker-compose up --build`
- **Run in background**: `docker-compose up -d --build`
- **View logs**: `docker-compose logs -f evernote-mcp-server`
- **Stop and remove**: `docker-compose down`
- **Build Docker image directly**: `docker build --build-arg GITHUB_REPO_URL=https://github.com/yourusername/evernote-mcp-server.git -t evernote-mcp-server .`
- **Run Docker container**: `docker run -d --name evernote-mcp -p 3443:3443 -e EVERNOTE_CONSUMER_KEY=your_key -e EVERNOTE_CONSUMER_SECRET=your_secret evernote-mcp-server`
- **Debug Docker container**: `docker-compose exec evernote-mcp-server sh`

### Testing Commands
- **Run all tests**: `npm test` (38 tests across 3 test suites)
- **Run tests with coverage**: `npm run test:coverage` (70%+ branch, 80%+ function/line coverage)
- **Run tests in watch mode**: `npm run test:watch` (for active development)
- **Run specific test files**: `npm test auth.test.js`, `npm test server.test.js`, `npm test integration.test.js`

## Key Technical Details

- **HTTPS Required**: Server runs on HTTPS with self-signed certificates (port 3443)
- **OAuth 1.0a Implementation**: Uses HMAC-SHA1 signatures, not OAuth 2.0/PKCE
- Uses Node.js CommonJS modules (`"type": "commonjs"` in package.json)
- Requires macOS with Node.js 18+ and OpenSSL for certificate generation (local development)
- **Docker Support**: Containerized deployment using Chainguard secure Node.js base image
- **Evernote API Credentials**: Requires registered Evernote developer app
- Browser-based OAuth 1.0a flow launches automatically on first run
- **Production Environment**: Uses Evernote production API (sandbox decommissioned)
- Designed for Claude Desktop MCP integration with future LLM compatibility
- **Debug Logging**: Configurable via `DEV_MODE` environment variable (detailed API logging with token redaction)
- SSL certificates stored in cert/ directory (excluded from git) or auto-generated in Docker containers
- **Dependencies**: `express`, `dotenv` (for environment variables), built-in `crypto`, `https`
- **Dev Dependencies**: `jest`, `supertest` for comprehensive testing
- **Container Security**: Non-root execution, minimal attack surface, signed base images

## Authentication Flow

**OAuth 1.0a Flow (NOT OAuth 2.0)**:

1. **Token Check**: Server checks .env file for existing access token
2. **Request Token**: If none found, generates temporary request token from Evernote
3. **User Authorization**: Browser opens Evernote authorization URL automatically
4. **Callback Handling**: `/oauth/callback` endpoint receives authorization response
5. **Token Exchange**: Server exchanges request token + verifier for permanent access token
6. **Storage**: Access token automatically saved to .env file for persistence
7. **Subsequent Runs**: Stored tokens loaded from .env file and used automatically for future requests

**Key Implementation Details**:
- Uses HMAC-SHA1 signature generation for OAuth 1.0a
- Callback URL: `https://localhost:3443/oauth/callback`
- Tokens stored in .env file with automatic persistence
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
- **Comprehensive Mocking**: All external dependencies mocked (fs, child_process, https)
- **Real Crypto Testing**: Actual HMAC-SHA1 signature validation with test vectors
- **Environment Isolation**: Test-specific environment variables prevent interference
- **Coverage Requirements**: 70%+ branch, 80%+ function/line coverage enforced
- **Error Scenario Testing**: Network failures, invalid responses, environment variable errors
- **Integration Validation**: Full OAuth workflow simulation without external API dependencies

**Test Categories**:
- OAuth parameter generation and HMAC-SHA1 signature creation
- Environment variable token persistence (store/retrieve from .env)
- Express route testing (health check, OAuth callback, MCP endpoint)
- Authentication flow validation (existing vs new token scenarios)
- Error handling (network failures, malformed requests, access denials)
- Configuration validation (endpoints, environment variables)

## Current Implementation Status

### Completed Features ✅
- Complete OAuth 1.0a implementation with Evernote production endpoints
- HTTPS server with self-signed certificates for local development  
- Cross-platform token storage via environment variables (replaced macOS Keychain for broader compatibility)
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
- **🆕 v1.1.0: Automatic token expiration detection** - Server checks token validity on startup
- **🆕 v1.1.0: Interactive re-authentication prompts** - User-friendly prompts for expired tokens
- **🆕 v1.1.0: Enhanced error handling** - Specific EDAMUserException error code reporting
- **🆕 v1.1.0: Proactive token management** - Prevents API failures from expired credentials
- **🆕 v1.1.1: Automatic .env token persistence** - Tokens saved to .env file automatically, eliminating re-authorization on server restart (replaced macOS Keychain for cross-platform compatibility)
- **🆕 v1.1.2: Security hardening** - Resolved CVE-2021-32640 in ws dependency using npm overrides to force secure versions
- **🆕 v2.0.0: Production containerization** - Full Docker support with Chainguard secure base images, token persistence, and zero-CVE security

### Security Notes 🔒

**CVE Resolution Strategy**: When Docker vulnerability scans show CVEs in dependencies:

1. **Check nested dependencies**: Use `npm ls <package>` to find all instances of vulnerable packages
2. **Chainguard vs Application CVEs**: Chainguard secures the base OS/runtime, but application dependencies need manual maintenance
3. **Nested vulnerability pattern**: The `thrift` package had its own `ws@5.2.4` in `thrift/node_modules/ws` despite top-level `ws@8.18.3`
4. **Solution**: Use npm `overrides` in package.json to force ALL instances of a package to use the secure version
5. **Docker builds from GitHub**: Remember that Docker builds clone from GitHub, so security fixes must be committed/pushed before rebuilding
6. **Verification**: Check the final Docker image with `docker run --rm --entrypoint sh image:latest -c "find /app/node_modules -name 'packagename' -type d"`

**Example override configuration**:
```json
{
  "overrides": {
    "ws": "^8.18.3"
  }
}
```

This forces ALL ws dependencies (including nested ones in subdependencies) to use the secure version, eliminating CVE-2021-32640.

## Version 2.0.0 Release Notes 🚀

**Major Release: Production-Ready Containerization**

### Breaking Changes
- **Docker Compose**: Now the recommended deployment method with full token persistence
- **Environment Variables**: All OAuth tokens must be provided via environment variables for Docker deployment
- **Modern Docker Compose**: Removed obsolete version field from docker-compose.yml

### New Features
- **🐳 Full Docker Support**: Production-ready containerization with Chainguard secure base images
- **🔐 Container Token Persistence**: OAuth tokens persist across container restarts via environment variables
- **⚡ Zero-Setup Docker**: `docker-compose up` with automatic OAuth token detection
- **🛡️ Security Hardening**: Zero CVEs with npm overrides for nested vulnerable dependencies
- **📦 Multi-stage Build**: Optimized Docker images using builder pattern for minimal production footprint

### Technical Improvements
- **Chainguard Base Images**: Using `cgr.dev/chainguard/node` for minimal attack surface
- **ENTRYPOINT/CMD Pattern**: Proper Docker execution with `/usr/bin/node` as entrypoint
- **Environment Variable Loading**: dotenv integration for seamless local/container development
- **Automated SSL Generation**: SSL certificates auto-generated in Docker containers
- **Health Checks**: Built-in Docker health monitoring

### Migration from v1.x
- **Local Development**: No changes required - `node index.js` works as before
- **Docker Deployment**: Use `docker-compose up` instead of manual Docker commands
- **Token Storage**: Ensure `.env` file contains all `EVERNOTE_*` tokens for container persistence

### In Progress 🚧
- Performance optimizations for large note collections
- Enhanced error handling and user feedback

### Planned Features 📋
- Support for additional Evernote search filters and advanced queries
- Enhanced cross-platform authentication workflow
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
      "args": ["/path/to/your/evernote-mcp-server/mcp-server.js"],
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
- **Authentication failure**: Complete OAuth flow standalone first to store tokens in .env file
- **Path errors**: Use absolute paths in Claude Desktop configuration
- **Credential issues**: Verify Evernote API keys are correctly set

**Debug Methods**:
- Check server logs for Thrift connection errors
- Use `DEV_MODE=true` for detailed API logging
- Verify tokens in .env file or environment variables
- Test server endpoints directly with curl before Claude Desktop integration

## File Structure

```
evernote-mcp-server/
├── index.js              # Main HTTPS server with OAuth integration and /mcp.json endpoint
├── auth.js               # OAuth 1.0a authentication module
├── mcp.json              # MCP tool manifest for Claude Desktop
├── mcp-server.js         # MCP server entry point for Claude Desktop integration
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
├── docker-compose.yml    # Docker Compose configuration for containerized deployment
├── Dockerfile            # Multi-stage Docker build using Chainguard secure base image
├── .dockerignore         # Docker build context exclusions
├── .env.example          # Environment variable template for Docker deployment
├── package.json          # Dependencies and scripts (includes thrift dependency)
├── jest.config.js        # Jest test configuration
├── .gitignore            # Git ignore patterns
├── README.md             # Detailed project documentation
└── CLAUDE.md             # This file - guidance for Claude Code
```