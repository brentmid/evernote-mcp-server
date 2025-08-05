#!/bin/bash
#
# Manual Health Check Reliability Test
#
# PURPOSE: Test health check reliability across multiple methods to identify failure patterns
# USAGE: ./test_manual_healthcheck.sh
#
# This script tests three different health check methods every 3 seconds for 3 minutes:
# 1. curl from host to container
# 2. Node.js from host to container  
# 3. Node.js from inside container (same as docker-compose health check)
#
# INVESTIGATION RESULTS (August 5, 2025):
# - Discovered 50% failure rate across ALL host-based methods
# - Container-based health checks had 100% success rate
# - Root cause: Network connectivity issues between host and container
# - Solution: Use container-internal health checks only
#
# Author: Generated for Evernote MCP Server debugging
# Date: August 5, 2025

# Configuration - Modify these for your setup
CONTAINER_NAME="evernote-mcp-server_evernote-mcp-server_1"
LOG_FILE="manual_healthcheck_test_$(date +%Y%m%d_%H%M%S).log"
TOTAL_DURATION=180  # 3 minutes
CHECK_INTERVAL=3    # Every 3 seconds

echo "=== Manual Health Check Reliability Test ===" | tee "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "Testing for $TOTAL_DURATION seconds, checking every $CHECK_INTERVAL seconds" | tee -a "$LOG_FILE"
echo "Container: $CONTAINER_NAME" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Function to log with timestamp
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S.%3N')] $1" | tee -a "$LOG_FILE"
}

# Function to run the exact health check from docker-compose.yml
run_health_check() {
    local method="$1"
    local start_time=$(date +%s.%3N)
    
    case "$method" in
        "curl")
            # Method 1: Using curl (simple)
            if curl -k -s --max-time 10 https://localhost:3443/ >/dev/null 2>&1; then
                local end_time=$(date +%s.%3N)
                local duration=$(echo "$end_time - $start_time" | bc -l)
                echo "SUCCESS curl ${duration}s"
            else
                local end_time=$(date +%s.%3N)
                local duration=$(echo "$end_time - $start_time" | bc -l)
                echo "FAIL curl ${duration}s"
            fi
            ;;
        "node")
            # Method 2: Using Node.js (exact health check command)
            if /usr/bin/node -e "require('https').get({hostname:'localhost',port:3443,rejectUnauthorized:false},res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
                local end_time=$(date +%s.%3N)
                local duration=$(echo "$end_time - $start_time" | bc -l)
                echo "SUCCESS node ${duration}s"
            else
                local end_time=$(date +%s.%3N)
                local duration=$(echo "$end_time - $start_time" | bc -l)
                echo "FAIL node ${duration}s"
            fi
            ;;
        "container")
            # Method 3: From inside container (exact docker-compose command)
            if podman exec "$CONTAINER_NAME" /usr/bin/node -e "require('https').get({hostname:'localhost',port:3443,rejectUnauthorized:false},res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
                local end_time=$(date +%s.%3N)
                local duration=$(echo "$end_time - $start_time" | bc -l)
                echo "SUCCESS container ${duration}s"
            else
                local end_time=$(date +%s.%3N)
                local duration=$(echo "$end_time - $start_time" | bc -l)
                echo "FAIL container ${duration}s"
            fi
            ;;
    esac
}

# Initialize counters
declare -A success_count
declare -A fail_count
success_count[curl]=0
success_count[node]=0
success_count[container]=0
fail_count[curl]=0
fail_count[node]=0
fail_count[container]=0

total_checks=0
start_time=$(date +%s)

log_with_timestamp "Starting health check reliability test..."

# Monitor container status in background
monitor_container_status() {
    local last_status=""
    while true; do
        local current_status=$(podman ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}" 2>/dev/null || echo "NOT_FOUND")
        if [ "$current_status" != "$last_status" ]; then
            log_with_timestamp "CONTAINER STATUS CHANGE: $current_status"
            last_status="$current_status"
        fi
        sleep 1
    done
}

# Start background container monitoring
log_with_timestamp "Starting background container monitoring..."
monitor_container_status &
MONITOR_PID=$!

# Main testing loop
while [ $(($(date +%s) - start_time)) -lt $TOTAL_DURATION ]; do
    total_checks=$((total_checks + 1))
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    
    log_with_timestamp "=== Check #$total_checks (${elapsed}s elapsed) ==="
    
    # Test all three methods simultaneously
    curl_result=$(run_health_check "curl")
    node_result=$(run_health_check "node")
    container_result=$(run_health_check "container")
    
    log_with_timestamp "  curl:      $curl_result"
    log_with_timestamp "  node:      $node_result"
    log_with_timestamp "  container: $container_result"
    
    # Update counters
    [[ "$curl_result" == SUCCESS* ]] && success_count[curl]=$((success_count[curl] + 1)) || fail_count[curl]=$((fail_count[curl] + 1))
    [[ "$node_result" == SUCCESS* ]] && success_count[node]=$((success_count[node] + 1)) || fail_count[node]=$((fail_count[node] + 1))
    [[ "$container_result" == SUCCESS* ]] && success_count[container]=$((success_count[container] + 1)) || fail_count[container]=$((fail_count[container] + 1))
    
    # Check if any method failed
    if [[ "$curl_result" == FAIL* ]] || [[ "$node_result" == FAIL* ]] || [[ "$container_result" == FAIL* ]]; then
        log_with_timestamp "⚠️  AT LEAST ONE METHOD FAILED!"
    fi
    
    sleep $CHECK_INTERVAL
done

# Clean up background process
kill $MONITOR_PID 2>/dev/null

# Final statistics
log_with_timestamp "=== FINAL RESULTS ==="
log_with_timestamp "Total checks performed: $total_checks"
log_with_timestamp ""
log_with_timestamp "SUCCESS RATES:"
for method in curl node container; do
    total=$((success_count[$method] + fail_count[$method]))
    if [ $total -gt 0 ]; then
        success_rate=$(echo "scale=1; ${success_count[$method]} * 100 / $total" | bc -l)
        log_with_timestamp "  $method: ${success_count[$method]}/$total (${success_rate}%)"
    fi
done

log_with_timestamp ""
log_with_timestamp "FAILURE BREAKDOWN:"
for method in curl node container; do
    if [ ${fail_count[$method]} -gt 0 ]; then
        log_with_timestamp "  $method: ${fail_count[$method]} failures"
    else
        log_with_timestamp "  $method: NO FAILURES"
    fi
done

log_with_timestamp ""
log_with_timestamp "=== ANALYSIS ==="
if [ ${fail_count[container]} -gt 0 ]; then
    log_with_timestamp "❌ CRITICAL: Container-based health checks (same as docker-compose) are FAILING"
    log_with_timestamp "   This explains why Podman health checks fail and send SIGTERM"
elif [ ${fail_count[node]} -gt 0 ]; then
    log_with_timestamp "⚠️  WARNING: Node.js health checks failing from host"
elif [ ${fail_count[curl]} -gt 0 ]; then
    log_with_timestamp "⚠️  WARNING: curl health checks failing"
else
    log_with_timestamp "✅ All manual health checks succeeded - issue may be elsewhere"
fi

log_with_timestamp ""
log_with_timestamp "Next steps based on results:"
if [ ${fail_count[container]} -gt 0 ]; then
    log_with_timestamp "1. Health check command itself is flaky"
    log_with_timestamp "2. Issue is in Node.js HTTPS server or SSL certificates"  
    log_with_timestamp "3. Container networking issues"
else
    log_with_timestamp "1. Health check timing/timeout issues"
    log_with_timestamp "2. Podman health check execution context problems"
    log_with_timestamp "3. Resource constraints during automated execution"
fi

log_with_timestamp ""
log_with_timestamp "Test completed at: $(date)"
log_with_timestamp "Full results saved to: $LOG_FILE"