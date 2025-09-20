#!/bin/bash
# BunSNC Environment Setup Script
# Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
#
# This script ensures all required environment variables are set
# to prevent plugin.promisedModules errors in AI services

echo "🔧 Setting up BunSNC environment variables..."

# Core ServiceNow Configuration
export AUTH_SERVICE_URL=http://10.219.8.210:8000/auth
export SERVICENOW_INSTANCE_URL=https://iberdrola.service-now.com

# AI Services - OpenSearch Configuration
export OPENSEARCH_HOST=10.219.8.210
export OPENSEARCH_PORT=9200
export OPENSEARCH_USERNAME=admin
export OPENSEARCH_PASSWORD=admin

# AI Services - Additional Endpoints
export EMBEDDING_SERVICE_URL=http://10.219.8.210:8010
export RERANK_SERVICE_URL=http://10.219.8.210:8011
export LLM_SERVICE_URL=http://10.219.8.210:11434
export TIKA_SERVICE_URL=http://localhost:9999

# PostgreSQL Vector Database (Bun Native)
export DATABASE_URL=postgresql://nexcdc:nexcdc_2025@10.219.8.210:5432/vector
export DATABASE_HOST=10.219.8.210
export DATABASE_PORT=5432
export DATABASE_NAME=vector
export DATABASE_USER=nexcdc
export DATABASE_PASSWORD=nexcdc_2025
export DATABASE_POOL_MIN=5
export DATABASE_POOL_MAX=20
export DATABASE_ACQUIRE_TIMEOUT=30000
export DATABASE_IDLE_TIMEOUT=300000
export DATABASE_CONNECTION_TIMEOUT=30000
export DATABASE_QUERY_TIMEOUT=60000
export DATABASE_SSL=false

# ServiceNow Rate Limiting
export SERVICENOW_RATE_LIMIT=25
export SERVICENOW_MAX_CONCURRENT=18
export SERVICENOW_BATCH_SIZE=100

# SAML Authentication Configuration
export SERVICENOW_AUTH_TYPE=saml
export SERVICENOW_USERNAME="AMER\\E966380"
export SERVICENOW_PASSWORD="Neoenergia@2026"
export SERVICENOW_PROXY=http://10.219.77.12:8080
export SERVICENOW_NO_PROXY_DOMAINS=ibfs.iberdrola.com,corp.iberdrola.com,neoenergia.com,elektro.com.br

# Security Configuration
export ENCRYPTION_KEY=servicenow-encryption-key-2025-change-production

# Hadoop Cluster Configuration
export HADOOP_NAMENODE_URL=http://10.219.8.210:9870
export HADOOP_RESOURCEMANAGER_URL=http://10.219.8.210:8088
export HADOOP_FILESYSTEM_URL=hdfs://10.219.8.210:9000
export HADOOP_DATANODE_1=http://10.219.8.210:19864
export HADOOP_DATANODE_2=http://10.219.8.210:29864
export HADOOP_DATANODE_3=http://10.219.8.210:39864
export HADOOP_NAMENODE=10.219.8.210
export HADOOP_PORT=8020
export HADOOP_USERNAME=hadoop

# OpenSearch Analytics (Enhanced)
export OPENSEARCH_URL=https://10.219.8.210:9200
export OPENSEARCH_USER=admin
export OPENSEARCH_SSL=true

# Fluentd Logging
export FLUENTD_HOST=10.219.8.210
export FLUENTD_PORT=24224

# Performance Tuning
export CACHE_TTL=300
export STREAM_BUFFER_SIZE=1000
export WS_MAX_CONNECTIONS=1000
export SSE_MAX_STREAMS=500

# Application Configuration
export PORT=3000
export JWT_SECRET=bunsnc-super-secret-jwt-key-change-in-production-2025

# Parquet Configuration
export PARQUET_OUTPUT_PATH=/tmp/parquet
export PARQUET_COMPRESSION=snappy

# Redis/KeyDB Configuration (Cache & Session Storage)
export REDIS_URL=redis://default:nexcdc2025@10.219.8.210:6380/1
export REDIS_HOST=10.219.8.210
export REDIS_PORT=6380
export REDIS_PASSWORD=nexcdc2025
export REDIS_DB=1
export REDIS_STREAMS_KEY=servicenow:changes

# MongoDB Configuration
export MONGODB_URL=mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin
export MONGODB_HOST=10.219.8.210
export MONGODB_PORT=27018
export MONGODB_USERNAME=admin
export MONGODB_PASSWORD=Logica2011_
export MONGODB_DATABASE=bunsnc
export MONGODB_AUTH_SOURCE=admin

# Validation function
validate_env() {
    echo "✅ Validating environment variables..."

    local missing_vars=()

    # Check critical variables
    [ -z "$OPENSEARCH_HOST" ] && missing_vars+=("OPENSEARCH_HOST")
    [ -z "$OPENSEARCH_PORT" ] && missing_vars+=("OPENSEARCH_PORT")
    [ -z "$SERVICENOW_INSTANCE_URL" ] && missing_vars+=("SERVICENOW_INSTANCE_URL")
    [ -z "$AUTH_SERVICE_URL" ] && missing_vars+=("AUTH_SERVICE_URL")

    if [ ${#missing_vars[@]} -eq 0 ]; then
        echo "🎉 All critical environment variables are set!"
        echo "   📍 OpenSearch: ${OPENSEARCH_HOST}:${OPENSEARCH_PORT}"
        echo "   📍 ServiceNow: ${SERVICENOW_INSTANCE_URL}"
        echo "   📍 Auth Service: ${AUTH_SERVICE_URL}"
        return 0
    else
        echo "❌ Missing critical environment variables: ${missing_vars[*]}"
        return 1
    fi
}

# Export validation function for use in other scripts
export -f validate_env

# Run validation
validate_env

echo "🚀 Environment setup complete! You can now run:"
echo "   • Glass Design Server: bun src/web/glass-server.ts"
echo "   • AI Services Server: bun src/web/ai-server.ts"