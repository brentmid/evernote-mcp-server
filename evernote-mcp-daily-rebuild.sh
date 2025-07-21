#!/bin/zsh

set -e

cd ~/bin/evernote-mcp-server  # or wherever your docker-compose.yml lives

echo "[INFO] Pulling latest Chainguard base image..."
docker pull cgr.dev/chainguard/node:latest

echo "[INFO] Rebuilding and restarting using Compose..."
docker compose down
docker compose build --no-cache
docker compose up -d
