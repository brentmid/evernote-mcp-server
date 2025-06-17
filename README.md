# Evernote MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
![Node.js](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen)
[![Last Commit](https://img.shields.io/github/last-commit/brentmid/evernote-mcp-server)](https://github.com/brentmid/evernote-mcp-server/commits/main)
[![Issues](https://img.shields.io/github/issues/brentmid/evernote-mcp-server)](https://github.com/brentmid/evernote-mcp-server/issues)
[![Stars](https://img.shields.io/github/stars/brentmid/evernote-mcp-server?style=social)](https://github.com/brentmid/evernote-mcp-server/stargazers)

A local MCP server that connects Claude Desktop (or any MCP-compatible LLM) with your Evernote account, allowing contextual queries and searches over your notes using natural language.

## 🎯 Project Goal

Enable local, secure AI-assisted access to your Evernote notes. For example:

> "Summarize all my Evernotes regarding my Sea Pro boat."

This project allows the LLM to send MCP calls like `createSearch`, `getNote`, and `getNoteContent`, which are translated into API calls to Evernote. The response is returned to the LLM in a structured format.

## ✅ Features

- Supports **read-only Evernote access** (searching, reading, and listing notes)
- **OAuth 1.0a authentication** with browser auto-launch for secure authorization
- Uses **macOS Keychain** to securely store access tokens
- **HTTPS-only server** with self-signed certificates for local development
- Designed to work with **Claude Desktop MCP integrations**, with future-proofing for other LLMs (e.g., ChatGPT Desktop)
- **Configurable debug logging** via `DEV_MODE` environment variable with automatic token redaction for security
- Easy to extend later for note creation, updates, or deletion

## 🧰 Tech Stack

- Node.js + Express with HTTPS
- Evernote API (OAuth 1.0a + REST)
- macOS Keychain via `keytar`
- MCP protocol compliance
- GitHub Copilot and 1Password SSH signing for development

## 🗝️ Authentication

Evernote uses OAuth 1.0a (not OAuth 2.0) for API authentication:

- **First-time setup**: Browser-based OAuth 1.0a flow with automatic token exchange
- **Token storage**: Access tokens stored securely in macOS Keychain via `keytar`
- **Automatic reuse**: Stored tokens are automatically used for subsequent API calls
- **Production environment**: Uses Evernote production API (sandbox decommissioned)
- (Planned) Future support for file-based token store for Linux/Windows

## 💻 Setup

### Requirements

- macOS with Node.js 18+ installed via Homebrew (`node --version`)
- OpenSSL for SSL certificate generation
- Evernote developer account and API credentials
- GitHub SSH key configured via 1Password (for development)
- Visual Studio Code with GitHub Copilot and Copilot Chat extensions (for development)

### Clone & Setup

```bash
git clone git@github.com:brentmid/evernote-mcp-server.git
cd evernote-mcp-server
npm install
```

#### Get Evernote API Credentials

1. **Register your application** at [Evernote Developers](https://dev.evernote.com/)
2. **Create a new app** and note your Consumer Key and Consumer Secret
3. **Set callback URL** to `https://localhost:3443/oauth/callback`

#### Configure Environment Variables

Set your Evernote API credentials:

```bash
# Add to your shell profile (.zshrc, .bashrc, etc.)
export EVERNOTE_CONSUMER_KEY="your-consumer-key-here"
export EVERNOTE_CONSUMER_SECRET="your-consumer-secret-here"

# Optional: Enable detailed debug logging for development
export DEV_MODE=true

# Reload your shell or run:
source ~/.zshrc
```

#### Generate SSL Certificates

The server runs over HTTPS and requires SSL certificates for local development:

```bash
# Create certificate directory
mkdir cert

# Generate self-signed certificate (valid for 365 days)
openssl req -x509 -newkey rsa:4096 -keyout cert/localhost.key -out cert/localhost.crt -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=Local/OU=Local/CN=localhost"
```

#### Start the Server

```bash
npx node index.js
```

The server will start on `https://localhost:3443`. Your browser will show a security warning for the self-signed certificate - this is normal for local development.

### First Run & OAuth Flow

1. **Generate SSL certificates** (see setup instructions above)
2. **Set environment variables** with your Evernote API credentials
3. **Start the server**: `npx node index.js`
4. **Complete OAuth authentication**:
   - Server automatically opens your browser to Evernote's authorization page
   - Accept the self-signed certificate warning in your browser
   - Log in to your Evernote account and authorize the application
   - You'll be redirected back to the server with a success message
   - Access token is automatically stored in macOS Keychain for future use

#### OAuth Flow Details

The server implements Evernote's OAuth 1.0a flow:

1. **Request Token**: Server generates temporary request token
2. **User Authorization**: Browser opens Evernote authorization URL
3. **Callback**: User authorizes app, Evernote redirects to callback URL
4. **Access Token**: Server exchanges request token for permanent access token
5. **Storage**: Access token stored securely in macOS Keychain

**Note**: The server uses Evernote's production environment (sandbox has been decommissioned by Evernote).

## 🐛 Debug & Development

### Debug Logging

The server supports detailed debug logging via the `DEV_MODE` environment variable:

```bash
# Enable detailed debug logging
export DEV_MODE=true

# Or run with debug mode for a single session
DEV_MODE=true npx node index.js
```

**Debug Features:**
- **MCP Tool Invocations**: Detailed logging of all tool calls with timestamps
- **Evernote API Requests**: Full request payloads and parameters  
- **Evernote API Responses**: Response summaries and error details
- **Token Redaction**: Automatic redaction of sensitive information (tokens, secrets, keys)
- **Error Details**: Enhanced error logging with raw response data

**Normal vs Debug Mode:**
- **Normal**: Basic logging with key information only
- **Debug**: Detailed JSON logging with redacted sensitive data

Example debug output:
```
🔧 [2025-06-17T00:07:56.351Z] MCP Tool Invocation: createSearch
📥 Args: {
  "query": "Sea Pro boat",
  "authenticationToken": "[REDACTED:19chars]"
}
🌐 [2025-06-17T00:07:57.123Z] Evernote API Request: /findNotesMetadata
📤 Request: {
  "filter": { "words": "Sea Pro boat" },
  "authenticationToken": "[REDACTED:19chars]"
}
```

## 🧪 Testing

The project includes a comprehensive test suite with **38 tests** covering all critical functionality:

### Test Commands

```bash
# Run all tests
npm test

# Run tests with coverage report  
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch
```

### Test Structure

```
tests/
├── auth.test.js        # OAuth 1.0a authentication tests
├── server.test.js      # Express server route tests
├── integration.test.js # End-to-end workflow tests
├── setup.js           # Global test configuration
└── jest.config.js     # Jest configuration
```

### Test Coverage Details

#### 🔐 **auth.test.js** - OAuth Authentication (12 tests)
- **OAuth Parameter Generation**: Validates required OAuth 1.0a parameters
- **HMAC-SHA1 Signature Generation**: Tests cryptographic signatures with known test vectors
- **Keychain Integration**: Store/retrieve tokens in macOS Keychain
- **Authentication Flow**: Existing token reuse vs new OAuth flow initiation
- **Configuration Validation**: Evernote endpoints and environment variables
- **Error Handling**: Network failures and keychain access errors

#### 🌐 **server.test.js** - Express Server Routes (15 tests)
- **Health Check** (`GET /`): Server status and JSON responses
- **OAuth Callback** (`GET /oauth/callback`): 
  - Successful token exchange
  - Missing parameter validation
  - Invalid OAuth state handling
  - Error scenarios
- **MCP Endpoint** (`POST /mcp`):
  - Authenticated request handling
  - Unauthenticated request rejection (401)
  - JSON body parsing
  - Internal error handling
- **Content-Type Handling**: JSON validation and malformed request handling
- **Route Validation**: 404 errors for unknown routes and wrong HTTP methods

#### 🔄 **integration.test.js** - End-to-End Workflows (11 tests)
- **Complete OAuth Flow**: Simulated request token → authorization → access token exchange
- **OAuth State Management**: State preservation between request and callback phases
- **Browser Integration**: System browser launching for authorization
- **Error Scenarios**: Network failures, invalid responses, keychain errors
- **Configuration Validation**: Endpoint URLs and credential validation
- **Token Lifecycle**: Storage, retrieval, and reuse patterns

### Coverage Requirements

The test suite maintains high coverage standards:
- **Branches**: 70% minimum coverage
- **Functions**: 80% minimum coverage  
- **Lines**: 80% minimum coverage
- **Statements**: 80% minimum coverage

### Test Features

- **Comprehensive Mocking**: All external dependencies (Keychain, browser, SSL, network)
- **Environment Isolation**: Test-specific environment variables prevent interference
- **Real Crypto Testing**: Actual HMAC-SHA1 signature validation with known test vectors
- **Error Scenario Coverage**: Network failures, malformed responses, access denials
- **Integration Validation**: Full OAuth workflow simulation without external API calls

### Running Specific Tests

```bash
# Run only authentication tests
npm test auth.test.js

# Run only server tests  
npm test server.test.js

# Run only integration tests
npm test integration.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="OAuth"
```

The test suite ensures OAuth 1.0a implementation correctness, validates all server endpoints, and provides confidence in the authentication flow without requiring actual Evernote API calls or SSL certificates during testing. Claude Desktop can also be used to validate that your MCP server responds correctly to natural language prompts.

## 🔒 Security

- No third-party data sent anywhere except to Evernote via HTTPS.
- Authentication tokens stored using OS-native secure storage.
- Signing key usage (SSH-based GPG) is enforced on all commits.

## 📄 License

Licensed under the MIT License. See `LICENSE` file for full terms.

## 🙋‍♂️ Author

Maintained by [@brentmid](https://github.com/brentmid).  
This project is both a functional integration and an educational experience in MCP, Evernote’s API, GitHub workflows, and modern Node.js practices.

---

Pull requests and contributions are welcome after MVP completion. Check the Issues tab for known tasks.