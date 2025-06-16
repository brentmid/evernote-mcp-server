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
- **Sandbox Mode**: Uses Evernote sandbox by default (change URLs in auth.js for production)
- Designed for Claude Desktop MCP integration with future LLM compatibility
- Debug logging available for development and troubleshooting
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