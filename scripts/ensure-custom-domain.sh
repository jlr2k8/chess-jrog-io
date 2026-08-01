#!/usr/bin/env bash
# Keep DOMAIN_NAME aligned with the live App Runner service.
# Safe to run on every CI build - updates Route53 only; does not redeploy the app stack.
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
STACK="${APP_STACK_NAME:-${STACK_NAME:-chess-jrog-io}}"
DOMAIN="${DOMAIN_NAME:?Set DOMAIN_NAME}"
ZONE_ID="${HOSTED_ZONE_ID:?Set HOSTED_ZONE_ID}"

SERVICE_ARN="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='AppRunnerServiceArn'].OutputValue" \
  --output text)"

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "ERROR: AppRunnerServiceArn not found on stack $STACK"
  exit 1
fi

echo "==> App Runner service: $SERVICE_ARN"

DOMAIN_STATUS="$(aws apprunner describe-custom-domains \
  --region "$REGION" \
  --service-arn "$SERVICE_ARN" \
  --query "CustomDomains[?DomainName=='$DOMAIN'].Status | [0]" \
  --output text 2>/dev/null || true)"

if [[ "$DOMAIN_STATUS" != "active" ]]; then
  echo "==> Associate custom domain $DOMAIN (was: ${DOMAIN_STATUS:-not linked})"
  ASSOC="$(aws apprunner associate-custom-domain \
    --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --domain-name "$DOMAIN" \
    --no-enable-www-subdomain)"
  DNS_TARGET="$(echo "$ASSOC" | jq -r '.DNSTarget')"

  echo "==> ACM validation CNAMEs (if any)"
  RECORDS="$(aws apprunner describe-custom-domains \
    --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --query 'CustomDomains[0].CertificateValidationRecords' \
    --output json)"

  CHANGES="$(echo "$RECORDS" | jq -c '[.[] | {
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: .Name,
      Type: .Type,
      TTL: 300,
      ResourceRecords: [{Value: .Value}]
    }
  }]')"

  if [[ "$CHANGES" != "[]" && "$CHANGES" != "null" ]]; then
    aws route53 change-resource-record-sets \
      --hosted-zone-id "$ZONE_ID" \
      --change-batch "$(jq -n --argjson c "$CHANGES" '{Changes: $c}')"
  fi
else
  echo "==> Custom domain $DOMAIN already active"
  DNS_TARGET="$(aws apprunner describe-custom-domains \
    --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --query 'DNSTarget' \
    --output text)"
fi

if [[ -z "$DNS_TARGET" || "$DNS_TARGET" == "None" ]]; then
  DNS_TARGET="$(aws apprunner describe-service \
    --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --query 'Service.ServiceUrl' \
    --output text)"
fi

echo "==> DnsTarget: $DNS_TARGET"

CURRENT_CNAME="$(aws route53 list-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --query "ResourceRecordSets[?Name=='${DOMAIN}.'].ResourceRecords[0].Value | [0]" \
  --output text 2>/dev/null || true)"

if [[ "$CURRENT_CNAME" == "$DNS_TARGET" ]]; then
  echo "==> Route53 CNAME already correct"
else
  echo "==> Route53 CNAME $DOMAIN: ${CURRENT_CNAME:-<none>} -> $DNS_TARGET"
  aws route53 change-resource-record-sets \
    --hosted-zone-id "$ZONE_ID" \
    --change-batch "$(jq -n \
      --arg name "${DOMAIN}." \
      --arg target "$DNS_TARGET" \
      '{
        Changes: [{
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: $name,
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{Value: $target}]
          }
        }]
      }')"
fi

echo "==> Custom domain sync complete"
