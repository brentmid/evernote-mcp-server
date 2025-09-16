# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local Evernote MCP (Model Context Protocol) server that connects Claude Desktop with Evernote accounts. It provides read-only access to Evernote notes through MCP calls like `createSearch`, `getNote`, and `getNoteContent`. Version 2.0 includes production-ready containerization and enhanced MCP protocol compliance for both local stdin/stdout and remote HTTP/JSON-RPC integration.

## Architecture

- **Language**: Node.js with Express framework
- **External services**: Evernote API using OAuth 1.0a authentication
- **Main entry point**: `index.js` - HTTPS server with OAuth integration
- **Authentication module**: `auth.js` - handles complete OAuth 1.0a flow
- **Authentication**: OAuth 1.0a flow (NOT OAuth 2.0), tokens automatically persisted in .env file
- **Security model**: Read-only Evernote access, HTTPS-only server, no third-party data transmission except to Evernote
- **MCP compliance**: Implements both stdin/stdout MCP protocol (mcp-server.js) and HTTP/JSON-RPC remote server protocol (index.js /mcp endpoint)
- **Dual integration modes**: Local Claude Desktop integration via mcp-server.js or remote integration via HTTPS JSON-RPC at /mcp endpoint

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
- **Daily container rebuilds**: `./evernote-mcp-daily-rebuild.sh` (automated script to pull latest Chainguard base image and rebuild with zero downtime)
- **⚠️ IMPORTANT**: Docker/Podman builds clone from GitHub repository. **Always commit and push code changes before rebuilding containers** or changes won't be included in the build.

### Podman Development (Docker Alternative)
- **Build and run with Podman Compose**: `podman-compose up --build` or `docker-compose up --build` (if using docker-compose with Podman)
- **Run in background**: `podman-compose up -d --build`
- **View logs**: `podman-compose logs -f evernote-mcp-server`
- **Stop and remove**: `podman-compose down`
- **Build Podman image directly**: `podman build --build-arg GITHUB_REPO_URL=https://github.com/yourusername/evernote-mcp-server.git -t evernote-mcp-server .`
- **Run Podman container**: `podman run -d --name evernote-mcp -p 3443:3443 -e EVERNOTE_CONSUMER_KEY=your_key -e EVERNOTE_CONSUMER_SECRET=your_secret evernote-mcp-server`
- **Debug Podman container**: `podman exec -it evernote-mcp-server_evernote-mcp-server_1 sh`
- **List Podman containers**: `podman ps` (note: container names use underscores instead of hyphens)
- **⚠️ IMPORTANT**: Podman builds clone from GitHub repository. **Always commit and push code changes before rebuilding containers** or changes won't be included in the build.

### Testing Commands
- **Run all tests**: `npm test` (38 tests across 3 test suites)
- **Run tests with coverage**: `npm run test:coverage` (70%+ branch, 80%+ function/line coverage)
- **Run tests in watch mode**: `npm run test:watch` (for active development)
- **Run specific test files**: `npm test auth.test.js`, `npm test server.test.js`, `npm test integration.test.js`

## Container Restart Loop Investigation & Resolution (September 15, 2025)

### **🎯 ISSUE DEFINITIVELY RESOLVED**

**FINAL STATUS**: Container restart loop has been **completely fixed**. Root cause was misconfigured systemd services inside Podman VM.

#### **🔍 Investigation Timeline & Actual Root Cause Discovery**

**Phase 1: SIGTERM Source Identification**
- ✅ **Real-time monitoring**: Identified container receiving SIGTERM every 2-3 minutes
- ✅ **Process tracking**: Monitored exact moment of container death (PID monitoring)
- ✅ **Pattern confirmed**: Consistent restart cycle with SIGTERM signals

**Phase 2: Container vs VM Investigation**
- ✅ **Key insight**: Realized container runs inside Podman VM (Linux), not directly on macOS
- ✅ **VM systemd check**: Found systemd service `container-evernote-mcp-server_evernote-mcp-server_1.service` inside VM
- ✅ **Service status**: Service was in "deactivating (stop-sigterm)" state with "Result: timeout"

**Phase 3: Systemd Service Analysis**
- ✅ **Service configuration**: Found problematic `Type=forking` with missing PID file
- ✅ **Start timeout**: Service timing out after 90 seconds and sending SIGTERM
- ✅ **Key discovery**: Only evernote and openwebui had systemd services; other containers managed by podman-compose only

**Phase 4: Container Management Comparison**
- ✅ **Working containers**: redis, postgres, searxng, n8n, influxdb, grafana - no systemd services
- ✅ **Problem containers**: evernote and openwebui had systemd services created by `podman generate systemd`
- ✅ **Root cause**: Someone had run `podman generate systemd` on these containers, creating conflicting management

#### **🔧 RESOLUTION IMPLEMENTED (September 15, 2025)**

**Problem**: Systemd services inside Podman VM were conflicting with podman-compose management.

**Solution**: Completely removed systemd services and reverted to pure podman-compose management:

```bash
# Inside Podman VM:
systemctl --user disable container-evernote-mcp-server_evernote-mcp-server_1.service
systemctl --user disable container-openwebui.service
rm -f /var/home/core/.config/systemd/user/container-evernote-mcp-server_evernote-mcp-server_1.service
rm -f /var/home/core/.config/systemd/user/container-openwebui.service
systemctl --user daemon-reload

# On host:
podman-compose down && podman-compose up -d
```

**Why this works:**
- Removes conflicting systemd management layer
- Returns containers to pure podman-compose management like other working containers
- Eliminates systemd timeout/restart behavior
- Matches the working configuration of other stable containers

#### **✅ VERIFICATION STEPS COMPLETED**

**Before Fix:**
- Container restarted every 2-3 minutes with SIGTERM
- Systemd service showed `Type=forking` with PID file errors
- Service timeout after 90 seconds causing SIGTERM

**After Fix:**
- ✅ Container running stable for 10+ minutes (well past previous restart cycle)
- ✅ No systemd services managing the container
- ✅ Pure podman-compose management like other working containers
- ✅ Same stable behavior as containers running for 11+ hours

#### **🔄 Future Prevention**

**NEVER run `podman generate systemd` on containers managed by podman-compose**

If containers need persistent startup, use:
- macOS LaunchAgents to run `podman-compose up -d` on boot
- Podman auto-restart policies in compose files
- NOT systemd service generation inside the VM

#### **🗂️ Diagnostic Tools (Still Available)**

Diagnostic scripts remain available for future issues:
1. **`catch_sigterm_sender.sh`** - Real-time SIGTERM detection
2. **`test_manual_healthcheck.sh`** - Health check testing
3. **`monitor_app_failure.sh`** - Process monitoring

#### **🧠 KEY LESSONS LEARNED**

1. **Container management**: Don't mix podman-compose with systemd services
2. **VM vs Host**: Remember containers run inside Podman VM (Linux) with its own systemd
3. **Debugging method**: Always compare working vs broken containers to find differences
4. **Root cause vs symptoms**: gvproxy errors were symptoms, not the cause
5. **Simplicity wins**: Working containers use simple podman-compose management only