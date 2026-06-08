#!/usr/bin/env bash
# Upsert Route53 CNAME for chess.jrog.io (wrapper around scripts/upsert-dns.mjs).
set -euo pipefail

export HOSTED_ZONE_ID="${HOSTED_ZONE_ID:-Z3FQ1J6D2XJRDT}"
export DOMAIN_NAME="${DOMAIN_NAME:-chess.jrog.io}"
export DNS_TARGET="${DNS_TARGET:?Set DNS_TARGET (e.g. dev.jrog.io or abc123.us-west-2.awsapprunner.com)}"

node "$(dirname "$0")/upsert-dns.mjs"