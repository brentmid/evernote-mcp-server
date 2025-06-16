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

- Supports **read-only Evernote access** (searching, reading, and listing notes).
- **OAuth 2.0 with PKCE** login flow, with browser auto-launch.
- Uses **macOS Keychain** to securely store credentials.
- Designed to work with **Claude Desktop MCP integrations**, with future-proofing for other LLMs (e.g., ChatGPT Desktop).
- Toggleable **debug logging** to view incoming/outgoing requests for development and troubleshooting.
- Easy to extend later for note creation, updates, or deletion.

## 🧰 Tech Stack

- Node.js + Express
- Evernote API (OAuth2 + REST)
- macOS Keychain via `keytar`
- MCP protocol compliance
- GitHub Copilot and 1Password SSH signing for development

## 🗝️ Authentication

- First-time login uses a browser-based OAuth flow with PKCE.
- Access and refresh tokens are stored securely in macOS Keychain.
- (Planned) Future support for file-based token store for Linux/Windows.

## 💻 Setup

### Requirements

- macOS with Node.js installed via Homebrew (`node --version`)
- GitHub SSH key configured via 1Password
- Visual Studio Code with GitHub Copilot and Copilot Chat extensions

### Clone & Run

```bash
git clone git@github.com:brentmid/evernote-mcp-server.git
cd evernote-mcp-server
npm install
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

### First Run

- Generate SSL certificates (see setup instructions above)
- Server will launch OAuth2 login in your browser
- Accept the self-signed certificate warning in your browser
- Upon success, token is saved and used for future requests

## 🧪 Testing

You can write and run unit tests to verify MCP command handlers. Claude Desktop can be used to validate that your MCP server responds properly to natural language prompts.

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