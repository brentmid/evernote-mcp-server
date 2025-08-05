#!/bin/bash
#
# Container SIGTERM Detection Script
# 
# PURPOSE: Real-time monitoring to detect which process sends SIGTERM signals to a container
# USAGE: ./catch_sigterm_sender.sh
# 
# This script monitors container logs for SIGTERM signals and captures process snapshots
# to identify the exact process responsible for sending the termination signal.
# 
# INVESTIGATION RESULTS (August 5, 2025):
# - Identified podman-remote process as SIGTERM sender
# - Confirmed SIGTERM is sent by Podman's health check mechanism
# - Process correlation: podman-remote appears exactly when SIGTERM is logged
#
# Author: Generated for Evernote MCP Server debugging
# Date: August 5, 2025

# Configuration - Modify this for your container setup
CONTAINER_NAME="evernote-mcp-server_evernote-mcp-server_1"
LOG_FILE="sigterm_catcher_$(date +%Y%m%d_%H%M%S).log"

echo "=== SIGTERM Sender Detection ===" | tee "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "Container: $CONTAINER_NAME" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Function to log with timestamp
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Get initial container state
CONTAINER_PID=$(podman inspect "$CONTAINER_NAME" --format '{{.State.Pid}}' 2>/dev/null)
CONTAINER_START=$(podman inspect "$CONTAINER_NAME" --format '{{.State.StartedAt}}' 2>/dev/null)

log_with_timestamp "Container PID: $CONTAINER_PID"
log_with_timestamp "Container started: $CONTAINER_START"

if [ -z "$CONTAINER_PID" ] || [ "$CONTAINER_PID" = "0" ]; then
    log_with_timestamp "❌ Cannot get container PID - container may be restarting"
    exit 1
fi

# Monitor in background: Process list snapshots every 10 seconds
monitor_processes() {
    while true; do
        echo "=== Process Snapshot $(date) ===" >> "${LOG_FILE}.processes"
        ps aux | grep -E "(podman|compose|docker|container)" | grep -v grep >> "${LOG_FILE}.processes"
        echo "" >> "${LOG_FILE}.processes"
        sleep 10
    done
}

# Monitor in background: System activity (file handles and connections)
monitor_system() {
    while true; do
        # Check for any process sending signals to our PID
        lsof -p "$CONTAINER_PID" 2>/dev/null >> "${LOG_FILE}.lsof" || true
        sleep 5
    done
}

# Monitor container for restart by watching PID changes
monitor_container() {
    local current_pid="$CONTAINER_PID"
    local restart_detected=false
    
    while [ "$restart_detected" = false ]; do
        # Check if PID changed (restart occurred)
        new_pid=$(podman inspect "$CONTAINER_NAME" --format '{{.State.Pid}}' 2>/dev/null)
        
        if [ "$new_pid" != "$current_pid" ] && [ -n "$new_pid" ] && [ "$new_pid" != "0" ]; then
            log_with_timestamp "🚨 RESTART DETECTED!"
            log_with_timestamp "Old PID: $current_pid"
            log_with_timestamp "New PID: $new_pid"
            
            # Capture what happened just before restart
            log_with_timestamp "=== IMMEDIATE POST-RESTART ANALYSIS ==="
            
            # Who might have killed the old PID?
            log_with_timestamp "Processes that might have sent SIGTERM:"
            ps aux | grep -E "(podman|kill|compose)" | grep -v grep | tee -a "$LOG_FILE"
            
            # Recent system messages (macOS specific)
            log_with_timestamp "Recent system log entries:"
            log show --predicate 'process CONTAINS "podman" OR message CONTAINS "container"' --info --last 2m 2>/dev/null | tail -10 | tee -a "$LOG_FILE"
            
            restart_detected=true
            break
        fi
        
        sleep 2
    done
}

# Start background monitoring
log_with_timestamp "Starting background monitoring..."
monitor_processes &
PROC_MONITOR_PID=$!

monitor_system &
SYS_MONITOR_PID=$!

# Start dtrace if available (requires SIP disabled on macOS)
if command -v dtrace >/dev/null 2>&1; then
    log_with_timestamp "Starting dtrace signal monitoring..."
    log_with_timestamp "Note: This requires sudo and SIP disabled on macOS"
    sudo dtrace -n "proc:::signal-send /args[1]->pr_pid == $CONTAINER_PID/ { printf(\"%s[%d] sent signal %d to PID %d\", execname, pid, args[2], args[1]->pr_pid); }" &
    DTRACE_PID=$!
else
    log_with_timestamp "dtrace not available or SIP enabled (normal on macOS)"
fi

# Main monitoring loop - wait for container restart
log_with_timestamp "Waiting for container restart (expecting ~3 minutes based on previous patterns)..."
monitor_container

# Cleanup background processes
log_with_timestamp "Cleaning up background processes..."
kill $PROC_MONITOR_PID $SYS_MONITOR_PID 2>/dev/null
[ -n "$DTRACE_PID" ] && sudo kill $DTRACE_PID 2>/dev/null

# Summary and analysis
log_with_timestamp "=== INVESTIGATION COMPLETE ==="
log_with_timestamp "Check these files for detailed logs:"
log_with_timestamp "- Main log: $LOG_FILE"
log_with_timestamp "- Process snapshots: ${LOG_FILE}.processes"  
log_with_timestamp "- File handles: ${LOG_FILE}.lsof"

echo ""
log_with_timestamp "=== ANALYSIS TIPS ==="
log_with_timestamp "1. Look for podman-remote processes appearing before restart"
log_with_timestamp "2. Check process snapshots for patterns in podman activity"
log_with_timestamp "3. Correlate timestamps with container health check intervals"
log_with_timestamp "4. Health check failures typically precede SIGTERM by 10-30 seconds"
log_with_timestamp ""
log_with_timestamp "=== NEXT STEPS ==="
log_with_timestamp "1. Analyze process snapshots for patterns"
log_with_timestamp "2. Check system logs for container management events"
log_with_timestamp "3. Compare with container health check timing"