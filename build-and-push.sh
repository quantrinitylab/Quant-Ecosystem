#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
RELEASE_SHA="${RELEASE_SHA:-$(git rev-parse HEAD)}"

if [[ ! "$ACCOUNT_ID" =~ ^[0-9]{12}$ ]]; then
  echo "Could not resolve a valid AWS account ID" >&2
  exit 1
fi

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "RELEASE_SHA must be an immutable 40-character lowercase commit SHA" >&2
  exit 1
fi

services=(
  "quant-ws-gateway|services/ws-gateway/Dockerfile"
  "quant-quantchat|apps/quantchat/Dockerfile"
  "quant-quantmail|apps/quantmail/Dockerfile"
  "quant-quantai|apps/quantai/Dockerfile"
  "quant-admin|apps/admin/Dockerfile"
)

echo "AWS account: $ACCOUNT_ID"
echo "AWS region:  $AWS_REGION"
echo "Release SHA: $RELEASE_SHA"
echo "Registry:    $REGISTRY"

echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

for service in "${services[@]}"; do
  IFS='|' read -r repository dockerfile <<< "$service"

  aws ecr describe-repositories \
    --region "$AWS_REGION" \
    --repository-names "$repository" >/dev/null

  image="$REGISTRY/$repository:$RELEASE_SHA"
  echo "Building $image from $dockerfile..."
  docker build --pull -t "$image" -f "$dockerfile" .
  docker push "$image"

  digest="$(aws ecr describe-images \
    --region "$AWS_REGION" \
    --repository-name "$repository" \
    --image-ids "imageTag=$RELEASE_SHA" \
    --query 'imageDetails[0].imageDigest' \
    --output text)"

  if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "Invalid digest returned for $repository: $digest" >&2
    exit 1
  fi

  echo "$repository=$REGISTRY/$repository@$digest"
done

echo "All release images were pushed with immutable SHA tags."
