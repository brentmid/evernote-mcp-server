#!/bin/bash

# Evernote Container Restart Loop Monitor
# Checks if evernote container is less than 4 minutes old every 15 minutes
# If detected, runs rebuild.sh to fix the restart loop issue

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$HOME/TimeMachineBackups/evernote-monitor.log"
REBUILD_SCRIPT="$SCRIPT_DIR/rebuild.sh"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

log "Starting evernote container monitoring check..."

# Get evernote container ID using the method from CLAUDE.md
evernote_container=$(podman ps --format "{{.ID}} {{.Names}}" | grep evernote | cut -d' ' -f1 2>/dev/null || true)

if [ -z "$evernote_container" ]; then
    log "WARNING: No evernote container found running. Skipping check."
    exit 0
fi

log "Found evernote container: $evernote_container"

# Get container start time (when it was last started/restarted)
container_created=$(podman inspect "$evernote_container" --format '{{.State.StartedAt}}' 2>/dev/null || true)

if [ -z "$container_created" ]; then
    log "ERROR: Could not get container start time"
    exit 1
fi

# Convert container creation time to epoch seconds
# Handle multiple possible timestamp formats
if command -v gdate >/dev/null 2>&1; then
    # Use GNU date if available (from brew install coreutils)
    created_epoch=$(gdate -d "$container_created" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${container_created%.*}" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$container_created" +%s)
else
    # Use macOS date
    created_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${container_created%.*}" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$container_created" +%s)
fi

current_epoch=$(date +%s)
age_seconds=$((current_epoch - created_epoch))
age_minutes=$((age_seconds / 60))

log "Container age: $age_minutes minutes ($age_seconds seconds)"

# Check if container is less than 4 minutes old
if [ "$age_minutes" -lt 4 ]; then
    log "RESTART LOOP DETECTED: Container is only $age_minutes minutes old (< 4 minutes)"
    
    if [ ! -f "$REBUILD_SCRIPT" ]; then
        log "ERROR: Rebuild script not found at $REBUILD_SCRIPT"
        exit 1
    fi
    
    if [ ! -x "$REBUILD_SCRIPT" ]; then
        log "ERROR: Rebuild script is not executable: $REBUILD_SCRIPT"
        exit 1
    fi
    
    log "Running rebuild script to fix restart loop..."
    cd "$SCRIPT_DIR"
    
    # Run rebuild script and capture output
    if "$REBUILD_SCRIPT" >> "$LOG_FILE" 2>&1; then
        log "SUCCESS: Rebuild script completed successfully"
    else
        log "ERROR: Rebuild script failed with exit code $?"
        exit 1
    fi
else
    log "Container age OK: $age_minutes minutes (>= 4 minutes). No action needed."
fi

log "Monitoring check completed successfully."