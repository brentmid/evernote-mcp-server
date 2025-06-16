# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local Evernote MCP (Model Context Protocol) server that connects Claude Desktop with Evernote accounts. It provides read-only access to Evernote notes through MCP calls like `createSearch`, `getNote`, and `getNoteContent`.

## Architecture

- **Language**: uses Node.js
- **External services**: Uses Evernote API (OAuth or personal token)
- **Main entry point**: `index.js` - currently minimal, contains the server implementation
- **Authentication**: OAuth 2.0 with PKCE flow, tokens stored in macOS Keychain via `keytar`
- **Security model**: Read-only Evernote access, no third-party data transmission except to Evernote over HTTPS
- **MCP compliance**: Implements MCP protocol for LLM integration

## Development Commands

- **Run server**: `npx node index.js`
- **Install dependencies**: `npm install`
- **Test**: Currently no test framework configured (`npm test` will fail)

## Key Technical Details

- Uses Node.js CommonJS modules (`"type": "commonjs"` in package.json)
- Requires macOS with Node.js 18+ 
- Browser-based OAuth flow launches automatically on first run
- Designed for Claude Desktop MCP integration with future LLM compatibility
- Debug logging available for development and troubleshooting

## Authentication Flow

First run triggers OAuth2 browser flow → tokens saved to macOS Keychain → subsequent runs use stored tokens automatically.