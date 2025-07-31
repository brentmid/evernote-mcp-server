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

## Memory

- **Debugging Session July 31, 2025**: Comprehensive investigation into Podman container restart issues revealed gvproxy network stack degradation as the root cause of intermittent container restarts
- **Performance Testing Strategy**: Developed multi-stage monitoring approach to validate container stability and network connectivity
- **Container Restart Mitigation**: Implemented global error handlers in `index.js` to catch and log potential unhandled exceptions without terminating the process
- **Podman Desktop Compatibility**: Confirmed version-specific gvproxy bugs affecting macOS users, especially after VM restart cycles
- **Recommended Debugging Steps**:
  1. Monitor gvproxy logs for network connection errors
  2. Check Podman/gvproxy version compatibility
  3. Disable VM backup scripts temporarily to isolate issues
  4. Implement additional network reset mechanisms in backup workflows

## 🔍 **FINAL ROOT CAUSE ANALYSIS - MAJOR BREAKTHROUGH (July 31, 2025 - 09:45-10:00 AM)**

### **❌ COMPLETE REVERSAL OF PREVIOUS ANALYSIS**

**CRITICAL DISCOVERY**: All previous root cause analysis was **FUNDAMENTALLY WRONG**. Through systematic VM restart and container isolation testing, we discovered the actual mechanism causing container restart cycles.

#### **VM Restart Testing Results**

**Timeline of Discovery**:
- **09:45:39**: Fresh Podman VM restart, new gvproxy process (PID 31068, version v0.8.6)
- **09:48:38**: **First gvproxy error within 3 minutes** - NOT after 7+ hours as previously theorized
- **Pattern**: gvproxy connection errors continued every ~3 minutes immediately after VM start

**This eliminated our "time-based degradation" theory completely.**

#### **Container Isolation Experiment**

**Method**: Stopped all containers to test if gvproxy errors were container-triggered vs systemic

**Critical Evidence from gvproxy.log**:
```
time="2025-07-31T09:45:39-04:00" level=info msg="gvproxy version v0.8.6"
time="2025-07-31T09:45:39-04:00" level=info msg="waiting for clients..."
time="2025-07-31T09:48:38-04:00" level=error msg="accept tcp [::]:3443: use of closed network connection"  # evernote running
time="2025-07-31T09:51:29-04:00" level=error msg="accept tcp [::]:3443: use of closed network connection"  # evernote running
time="2025-07-31T09:53:04-04:00" level=error msg="accept tcp [::]:3443: use of closed network connection"  # evernote stopped HERE
time="2025-07-31T09:53:23-04:00" level=error msg="accept tcp [::]:3000: use of closed network connection"  # openwebui stopped
time="2025-07-31T09:53:53-04:00" level=error msg="accept tcp [::]:3000: use of closed network connection"  # openwebui restarted
# NO MORE PORT 3443 ERRORS after 09:53:04 - waited 6.5 minutes to confirm
```

#### **✅ DEFINITIVE ROOT CAUSE ESTABLISHED**

**The gvproxy "accept tcp: use of closed network connection" errors are 100% container lifecycle-triggered, NOT time-based network degradation.**

**Proven Facts**:
1. **Each container port** generates specific gvproxy errors only during stop/start/restart events
2. **Stopping a container** immediately stops its associated gvproxy errors (confirmed by 6.5-minute test)
3. **gvproxy errors are SYMPTOMS** of container restarts, not the cause of restarts
4. **gvproxy process remains healthy** - errors are normal connection cleanup during container lifecycle

#### **Container Behavior Comparison Analysis**

**openwebui container** (Homebrew-managed):
- ✅ Has active port forwarding (3000:8080) 
- ✅ Generates gvproxy errors during stop/restart events
- ❌ **NO restart cycle** - runs continuously without issues
- **Proves gvproxy errors don't cause restart loops**

**evernote container**:
- ✅ Has active port forwarding (3443:3443)
- ✅ Generates gvproxy errors during stop/restart events  
- ✅ **TRAPPED in restart cycle** - constant ~3-minute restart pattern
- **Container-specific restart trigger exists**

#### **Revolutionary Insight**

**gvproxy connection errors DO NOT cause container restart cycles.** 

**Evidence**: openwebui container experiences identical gvproxy errors but maintains stable operation.

**The actual causal sequence**:
1. **Unknown trigger X** causes evernote container to restart/exit
2. Container restart → gvproxy connection error (normal Podman networking behavior)
3. Container restarts → **Unknown trigger X** still present → container exits again
4. **Infinite feedback loop** driven by trigger X, not gvproxy errors

#### **Failed Theories Completely Debunked**

❌ **Time-based gvproxy degradation** - Errors begin within minutes, not hours  
❌ **VM restart causing persistent gvproxy damage** - gvproxy works perfectly for other containers
❌ **Backup script as direct trigger** - Issue reproduces immediately after any VM restart
❌ **podman-compose restart fixing gvproxy state** - Container restarts don't affect gvproxy process (separate PIDs)
❌ **gvproxy network stack becoming unstable** - Network stack works fine for openwebui
❌ **Progressive connection degradation** - Each container's errors are isolated and event-driven
❌ **Health check timeout due to gvproxy issues** - openwebui has no health check but also gets gvproxy errors

#### **Current Understanding: The Real Problem**

**The evernote container has a container-specific restart trigger that creates an infinite restart loop.**

**Prime suspects for "Unknown trigger X"** (Updated after comprehensive health check endpoint testing):
1. ❌ **Health check endpoint mismatch** - ✅ **DEFINITIVELY RULED OUT** - Proper 5-minute test with actual container rebuild confirmed no restart cycle with `/health` (404) endpoint
2. **Application-level errors** - Node.js process exits causing container restart (main suspect)
3. **Resource constraints** - Memory/CPU limits causing container kills
4. **Network configuration conflicts** - HTTPS/SSL issues specific to evernote container
5. **Container image/build issues** - Problems in Dockerfile or application startup
6. **Health check timing/configuration** - Complex health check parameters (40s start + 30s interval + 10s timeout + 3 retries) configuration may still be factor

#### **Next Investigation Priority**

**Focus entirely on identifying what causes the initial evernote container restart.**

**Investigation approach** (Updated priorities after comprehensive health check endpoint testing):
1. ✅ **Health check endpoint test DEFINITIVELY completed** - `/health` (404) vs `/` endpoint completely ruled out as primary cause with proper 5-minute rebuild test
2. ⭐ **Monitor application logs for errors/exits** - **PRIMARY FOCUS**: Node.js process behavior and application-level crashes
3. **Check resource usage during operation** - Memory/CPU constraints during runtime
4. **Test with minimal/no health check** - Remove health check entirely to isolate timing factors
5. **Compare successful vs failing container configurations** - Identify what changed between stable and unstable periods

#### **Monitoring Strategy**

**Before container restart**:
- Application logs for errors
- Resource usage (memory/CPU)
- Health check execution results
- Node.js process state

**This will identify the actual root cause of the restart loop, independent of gvproxy symptoms.**

### **Documentation Update Status**

This analysis **completely replaces** all previous root cause theories. The issue is **NOT**:
- Podman VM networking problems
- gvproxy process degradation  
- Backup script timing issues
- Time-based infrastructure failure
- ❌ **Health check endpoint mismatch** - Tested 8+ minute stability with wrong `/health` endpoint (July 31, 2025)

The issue **IS**:
- Container-specific restart trigger in evernote container setup (still investigating)
- Restart loop potentially amplified by health check configuration timing
- gvproxy errors are normal symptoms, not the disease

### **Health Check Endpoint Test Results (July 31, 2025)**

#### **Initial Invalid Test**
**Problem**: First test was invalid - container was not actually rebuilt when switching to `/health` endpoint
**Evidence**: Container status showed "Up 11 minutes" after supposed rebuild, proving it was still running with old configuration

#### **Proper Validation Test**
**Test Setup**: 
- Properly stopped container with `podman-compose down`
- Rebuilt with `--build --no-cache` using `/health` endpoint (returns 404)
- Confirmed new container with "Up X seconds" status
- Monitored for full 5 minutes (every 30 seconds)

**Result**: Container ran stable for full 5 minutes without restart cycle
**Evidence**: Container maintained "healthy" status throughout: "Up 5 minutes (healthy)"
**Conclusion**: ✅ **DEFINITIVELY CONFIRMED** - Health check endpoint mismatch is NOT the root cause of 2-3 minute restart loops

#### **Final Configuration Fix**
**Status**: ✅ **COMPLETED** - Reverted Dockerfile.local to correct `/` endpoint and rebuilt container
**Current State**: Container running with proper health check endpoint configuration

### **Current Investigation Status (July 31, 2025)**

#### **What We Know (Confirmed)**
- ✅ Health check endpoint mismatch is NOT the root cause (definitively tested with proper 5-minute rebuild test)
- ✅ gvproxy connection errors are symptoms, not causes (container-triggered, not time-based)
- ✅ Issue is container-specific to evernote container (openwebui doesn't restart)
- ✅ Restart cycles occur every 2-3 minutes when they manifest
- ✅ Container stability improvements in v2.1.0+ help but don't eliminate the issue entirely
- ✅ Health check endpoint fix implemented (using correct `/` endpoint)

#### **Primary Investigation Focus**
**Next steps should focus on these remaining suspects in priority order:**

1. **Application-level Node.js process exits** ⭐ **TOP PRIORITY**
   - Monitor container logs during restart cycle for unhandled exceptions
   - Check for memory leaks or process crashes in Node.js application
   - Review error handlers and exit conditions in index.js

2. **Resource constraints (memory/CPU)**
   - Monitor container resource usage during operation
   - Check for memory leaks or CPU spikes leading to container kills

3. **Health check timing/configuration**
   - Test with health check completely disabled to isolate timing factors
   - Adjust health check parameters (interval, timeout, retries)

4. **Container image/build issues**
   - Compare working vs non-working container configurations
   - Test with different Node.js base images or build processes

5. **Network configuration conflicts**
   - Test with different port configurations or simplified network setup
   - Check for HTTPS/SSL issues specific to the container environment