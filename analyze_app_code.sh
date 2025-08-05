#!/bin/bash

# Analyze Node.js application code for potential failure causes

LOG_FILE="code_analysis_$(date +%Y%m%d_%H%M%S).log"

echo "=== Node.js Application Code Analysis ===" | tee "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_with_timestamp "=== ANALYZING APPLICATION CODE ==="

# Check main application files
if [ -f "index.js" ]; then
    log_with_timestamp "✅ Found index.js - analyzing..."
    
    # Look for potential issues
    log_with_timestamp "🔍 Checking for common failure patterns:"
    
    # Memory leaks
    if grep -n "setInterval\|setTimeout" index.js; then
        log_with_timestamp "⚠️  Found timers - check for proper cleanup"
    fi
    
    # Event listeners
    if grep -n "addEventListener\|on(" index.js; then
        log_with_timestamp "⚠️  Found event listeners - check for memory leaks"
    fi
    
    # HTTPS/SSL issues
    if grep -n "https\|ssl\|cert" index.js; then
        log_with_timestamp "🔍 Found HTTPS/SSL code - potential certificate issues"
    fi
    
    # Error handling
    error_handlers=$(grep -n "process\.on\|catch\|try" index.js | wc -l)
    log_with_timestamp "📊 Error handling patterns found: $error_handlers"
    
    # Unhandled exceptions
    if grep -n "uncaughtException\|unhandledRejection" index.js; then
        log_with_timestamp "✅ Found global error handlers"
    else
        log_with_timestamp "❌ NO global error handlers found"
    fi
    
else
    log_with_timestamp "❌ index.js not found in current directory"
fi

# Check for package.json dependencies
if [ -f "package.json" ]; then
    log_with_timestamp "📦 Analyzing dependencies..."
    
    # Look for known problematic packages
    if grep -i "evernote\|oauth" package.json; then
        log_with_timestamp "🔍 Found Evernote/OAuth dependencies"
    fi
    
    # Check for HTTPS-related packages
    if grep -i "https\|ssl\|cert" package.json; then
        log_with_timestamp "🔍 Found HTTPS/SSL related dependencies"
    fi
else
    log_with_timestamp "❌ package.json not found"
fi

# Look for Docker/Podman specific issues
if [ -f "Dockerfile" ] || [ -f "Dockerfile.local" ]; then
    log_with_timestamp "🐳 Analyzing Docker configuration..."
    
    for dockerfile in Dockerfile Dockerfile.local; do
        if [ -f "$dockerfile" ]; then
            log_with_timestamp "Checking $dockerfile:"
            
            # Check user permissions
            if grep -n "USER" "$dockerfile"; then
                log_with_timestamp "  ✅ Found USER directive"
            else
                log_with_timestamp "  ⚠️  No USER directive - running as root?"
            fi
            
            # Check health check
            if grep -n "HEALTHCHECK" "$dockerfile"; then
                log_with_timestamp "  ✅ Found HEALTHCHECK directive"
            fi
            
            # Check exposed ports
            if grep -n "EXPOSE" "$dockerfile"; then
                log_with_timestamp "  📡 Found EXPOSE directive"
            fi
        fi
    done
else
    log_with_timestamp "❌ No Dockerfile found"
fi

log_with_timestamp ""
log_with_timestamp "=== CODE ANALYSIS COMPLETE ==="
log_with_timestamp "Next: Run monitor_app_failure.sh to observe runtime behavior"
log_with_timestamp "Analysis saved to: $LOG_FILE"