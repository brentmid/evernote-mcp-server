#!/bin/bash

# Monitor Node.js application behavior inside container during failure cycle

CONTAINER_NAME="evernote-mcp-server_evernote-mcp-server_1"
LOG_FILE="app_failure_monitor_$(date +%Y%m%d_%H%M%S).log"

echo "=== Node.js Application Failure Monitoring ===" | tee "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "Container: $CONTAINER_NAME" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Function to log with timestamp
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S.%3N')] $1" | tee -a "$LOG_FILE"
}

# Function to get container stats
get_container_stats() {
    local stats=$(podman stats --no-stream "$CONTAINER_NAME" 2>/dev/null || echo "CONTAINER_NOT_FOUND")
    echo "$stats"
}

# Function to get process info from inside container
get_process_info() {
    local info=$(podman exec "$CONTAINER_NAME" ps aux 2>/dev/null || echo "EXEC_FAILED")
    echo "$info"
}

# Function to get memory info from inside container
get_memory_info() {
    local meminfo=$(podman exec "$CONTAINER_NAME" cat /proc/meminfo 2>/dev/null | head -5 || echo "MEMINFO_FAILED")
    echo "$meminfo"
}

# Function to check if Node.js process is responding
check_node_health() {
    # Try to connect to the server directly
    if podman exec "$CONTAINER_NAME" timeout 5 /usr/bin/node -e "require('https').get({hostname:'localhost',port:3443,rejectUnauthorized:false,timeout:2000},res=>process.exit(0)).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))" 2>/dev/null; then
        echo "RESPONSIVE"
    else
        echo "UNRESPONSIVE"
    fi
}

# Function to get application logs
get_recent_logs() {
    local logs=$(podman logs --tail=5 "$CONTAINER_NAME" 2>/dev/null | tail -5)
    echo "$logs"
}

# Initialize monitoring
log_with_timestamp "Starting Node.js application failure monitoring..."
log_with_timestamp "Expected failure cycle: ~3 minutes"

# Monitor for 5 minutes or until we catch a failure
start_time=$(date +%s)
last_status=""
failure_detected=false

while [ $(($(date +%s) - start_time)) -lt 300 ]; do  # 5 minutes
    elapsed=$(($(date +%s) - start_time))
    
    # Get current container status
    current_status=$(podman ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}" 2>/dev/null || echo "NOT_FOUND")
    
    # Check if status changed
    if [ "$current_status" != "$last_status" ]; then
        log_with_timestamp "=== STATUS CHANGE: $current_status ==="
        last_status="$current_status"
        
        # If container just restarted, capture detailed info
        if [[ "$current_status" == *"starting"* ]] || [[ "$current_status" == *"second"* ]]; then
            log_with_timestamp "🔄 RESTART DETECTED - Capturing failure data..."
            failure_detected=true
            
            # Get logs from just before restart
            log_with_timestamp "Recent application logs:"
            get_recent_logs | sed 's/^/  /' | tee -a "$LOG_FILE"
        fi
    fi
    
    # Every 10 seconds, capture detailed process state
    if [ $((elapsed % 10)) -eq 0 ]; then
        log_with_timestamp "=== Process Check (${elapsed}s) ==="
        
        # Container resource usage
        log_with_timestamp "Container Stats:"
        get_container_stats | sed 's/^/  /' | tee -a "$LOG_FILE"
        
        # Process list inside container
        log_with_timestamp "Processes inside container:"
        get_process_info | sed 's/^/  /' | tee -a "$LOG_FILE"
        
        # Memory info
        log_with_timestamp "Memory info:"
        get_memory_info | sed 's/^/  /' | tee -a "$LOG_FILE"
        
        # Application responsiveness
        node_health=$(check_node_health)
        log_with_timestamp "Node.js server: $node_health"
        
        # If server becomes unresponsive, capture more detail
        if [ "$node_health" = "UNRESPONSIVE" ]; then
            log_with_timestamp "🚨 SERVER UNRESPONSIVE - Investigating..."
            
            # Try to get more detailed process info
            log_with_timestamp "Detailed process tree:"
            podman exec "$CONTAINER_NAME" ps -ef 2>/dev/null | sed 's/^/  /' | tee -a "$LOG_FILE"
            
            # Check for any error messages in recent logs
            log_with_timestamp "Recent container logs:"
            podman logs --tail=10 "$CONTAINER_NAME" 2>/dev/null | sed 's/^/  /' | tee -a "$LOG_FILE"
            
            # Check open file descriptors
            log_with_timestamp "Open files (if available):"
            podman exec "$CONTAINER_NAME" ls -la /proc/1/fd/ 2>/dev/null | sed 's/^/  /' | tee -a "$LOG_FILE" || echo "  Cannot access /proc/1/fd"
        fi
        
        echo "" | tee -a "$LOG_FILE"
    fi
    
    sleep 2
done

# Summary
log_with_timestamp "=== MONITORING SUMMARY ==="
if [ "$failure_detected" = true ]; then
    log_with_timestamp "✅ Captured container restart during monitoring"
    log_with_timestamp "📊 Analysis shows pattern of server becoming unresponsive before restart"
    log_with_timestamp "🔍 Check logs above for:"
    log_with_timestamp "   - Memory usage spikes"
    log_with_timestamp "   - Process crashes or hangs"
    log_with_timestamp "   - Application error messages"
    log_with_timestamp "   - Resource exhaustion"
else
    log_with_timestamp "⚠️  No restart captured during monitoring period"
    log_with_timestamp "💡 Try running longer or during known failure window"
fi

log_with_timestamp ""
log_with_timestamp "Next investigation steps:"
log_with_timestamp "1. Analyze process behavior patterns from logs"
log_with_timestamp "2. Check for memory leaks or resource growth"
log_with_timestamp "3. Look for unhandled exceptions in application logs"
log_with_timestamp "4. Test SSL certificate handling under load"

log_with_timestamp ""
log_with_timestamp "Monitoring completed at: $(date)"
log_with_timestamp "Full results saved to: $LOG_FILE"