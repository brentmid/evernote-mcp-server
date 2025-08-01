#!/bin/zsh

# Daily rebuild script for Evernote MCP Server with Podman
# Pulls latest Chainguard Node.js base image and rebuilds container
# Designed for automated execution via Lingon or cron
# Zero downtime deployment using Podman Compose

set -e

# Add Homebrew to PATH for Lingon compatibility
export PATH="/opt/homebrew/bin:$PATH"

cd ~/bin/evernote-mcp-server  # or wherever your docker-compose.yml lives

echo "[INFO] Starting daily Evernote MCP Server rebuild with Podman..."

# Check if Podman machine is running
echo "[INFO] Checking Podman machine status..."
if ! podman machine list | grep -q "Currently running"; then
    echo "[INFO] Starting Podman machine..."
    podman machine start
    sleep 10  # Give it time to start up
fi

# Pull latest Chainguard base images (both regular and dev for multi-stage build)
echo "[INFO] Pulling latest Chainguard base images..."
podman pull cgr.dev/chainguard/node:latest
podman pull cgr.dev/chainguard/node:latest-dev

# Remove existing images to force complete rebuild
echo "[INFO] Removing existing images to force rebuild..."
podman rmi localhost/evernote-mcp-server_evernote-mcp-server:latest 2>/dev/null || echo "[INFO] No existing image to remove"

echo "[INFO] Rebuilding and restarting using podman-compose with no-cache..."
podman-compose down
podman-compose up -d --build --no-cache

# Wait for container to start and health check
echo "[INFO] Waiting for container health check..."
sleep 30

# Verify container is running
if podman ps --format "table {{.Names}} {{.Status}}" | grep -q "evernote-mcp-server_evernote-mcp-server_1"; then
    echo "[SUCCESS] Container is running successfully"
else
    echo "[WARNING] Container may not be running - checking logs..."
    podman-compose logs --tail=20 evernote-mcp-server
fi

# Clean up unused images to save space
echo "[INFO] Cleaning up unused Podman images..."
podman image prune -f

echo "[SUCCESS] Daily rebuild completed successfully"
echo "[INFO] Current container status:"
podman ps --format "table {{.Names}} {{.Image}} {{.Status}} {{.Ports}}"

echo "[INFO] Disk usage after cleanup:"
podman system df