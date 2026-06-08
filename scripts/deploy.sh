#!/usr/bin/env bash
# Bootstrap deploy: CloudFormation stack + Docker push + App Runner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-us-west-2}"
STACK="${STACK_NAME:?Set STACK_NAME}"
DOMAIN="${DOMAIN_NAME:?Set DOMAIN_NAME}"
ZONE_ID="${HOSTED_ZONE_ID:?Set HOSTED_ZONE_ID}"
ECR_REPO="${ECR_REPOSITORY_NAME:?Set ECR_REPOSITORY_NAME}"
TEMPLATE="$ROOT/infra/cloudformation/template.yaml"
IMAGE_TAG="${IMAGE_TAG:-latest}"

BASE_PARAMS=(
  "HostedZoneId=$ZONE_ID"
  "DomainName=$DOMAIN"
  "EcrRepositoryName=$ECR_REPO"
  "ImageTag=$IMAGE_TAG"
)

cd "$ROOT"

echo "==> Phase 1: stack (ECR, IAM) — DeployAppRunner=false"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$TEMPLATE" \
  --parameter-overrides "${BASE_PARAMS[@]}" "DeployAppRunner=false" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset

REPO_URI="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='EcrRepositoryUri'].OutputValue" \
  --output text)"

echo "==> ECR login"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${REPO_URI%%/*}"

echo "==> Docker build & push ($REPO_URI:$IMAGE_TAG)"
docker build -t "$REPO_URI:$IMAGE_TAG" .
docker push "$REPO_URI:$IMAGE_TAG"

echo "==> Phase 2: enable App Runner"
EXTRA_PARAMS=()
if [[ -n "${APP_RUNNER_DNS_TARGET:-}" ]]; then
  EXTRA_PARAMS+=("AppRunnerCustomDomainDnsTarget=$APP_RUNNER_DNS_TARGET")
fi

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$TEMPLATE" \
  --parameter-overrides "${BASE_PARAMS[@]}" "DeployAppRunner=true" "${EXTRA_PARAMS[@]}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset

echo ""
echo "==> Stack outputs"
aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK" \
  --query "Stacks[0].Outputs" \
  --output table

SERVICE_URL="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='AppRunnerServiceUrl'].OutputValue" \
  --output text)"

if [[ -n "$SERVICE_URL" && "$SERVICE_URL" != "None" ]]; then
  echo ""
  echo "App Runner URL: $SERVICE_URL"
  echo "Next: ./scripts/ensure-custom-domain.sh"
fi
