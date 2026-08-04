$ErrorActionPreference = 'Stop'

$AWS_REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }
$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text).Trim()
$REGISTRY = "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
$RELEASE_SHA = if ($env:RELEASE_SHA) { $env:RELEASE_SHA } else { (git rev-parse HEAD).Trim() }

if ($ACCOUNT_ID -notmatch '^\d{12}$') {
  throw 'Could not resolve a valid AWS account ID.'
}

if ($RELEASE_SHA -notmatch '^[0-9a-f]{40}$') {
  throw 'RELEASE_SHA must be an immutable 40-character lowercase commit SHA.'
}

$services = @(
  @{ Repository = 'quant-ws-gateway'; Dockerfile = 'services/ws-gateway/Dockerfile' },
  @{ Repository = 'quant-quantchat'; Dockerfile = 'apps/quantchat/Dockerfile' },
  @{ Repository = 'quant-quantmail'; Dockerfile = 'apps/quantmail/Dockerfile' },
  @{ Repository = 'quant-quantai'; Dockerfile = 'apps/quantai/Dockerfile' },
  @{ Repository = 'quant-admin'; Dockerfile = 'apps/admin/Dockerfile' }
)

Write-Host "AWS account: $ACCOUNT_ID"
Write-Host "AWS region:  $AWS_REGION"
Write-Host "Release SHA: $RELEASE_SHA"
Write-Host "Registry:    $REGISTRY"

Write-Host 'Logging in to ECR...'
$loginPassword = aws ecr get-login-password --region $AWS_REGION
$loginPassword | docker login --username AWS --password-stdin $REGISTRY
if ($LASTEXITCODE -ne 0) { throw 'ECR login failed.' }

foreach ($service in $services) {
  $repository = $service.Repository
  $dockerfile = $service.Dockerfile

  aws ecr describe-repositories --region $AWS_REGION --repository-names $repository | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ECR repository is unavailable: $repository" }

  $image = "$REGISTRY/${repository}:$RELEASE_SHA"
  Write-Host "Building $image from $dockerfile..."
  docker build --pull -t $image -f $dockerfile .
  if ($LASTEXITCODE -ne 0) { throw "Docker build failed: $repository" }

  docker push $image
  if ($LASTEXITCODE -ne 0) { throw "Docker push failed: $repository" }

  $digest = (aws ecr describe-images --region $AWS_REGION --repository-name $repository --image-ids "imageTag=$RELEASE_SHA" --query 'imageDetails[0].imageDigest' --output text).Trim()
  if ($digest -notmatch '^sha256:[0-9a-f]{64}$') {
    throw "Invalid digest returned for ${repository}: $digest"
  }

  Write-Host "$repository=$REGISTRY/$repository@$digest"
}

Write-Host 'All release images were pushed with immutable SHA tags.'
