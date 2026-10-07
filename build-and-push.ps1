$REGISTRY="266176113726.dkr.ecr.us-east-1.amazonaws.com"

Write-Host "Logging in to ECR..."
cmd /c "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $REGISTRY"

Write-Host "Building and pushing quant-ws-gateway..."
docker build -t $REGISTRY/quant-ws-gateway:latest -f services/ws-gateway/Dockerfile .
docker push $REGISTRY/quant-ws-gateway:latest

Write-Host "Building and pushing quantchat..."
docker build -t $REGISTRY/quant-quantchat:latest -f apps/quantchat/Dockerfile .
docker push $REGISTRY/quant-quantchat:latest

Write-Host "Building and pushing quantmail..."
docker build -t $REGISTRY/quant-quantmail:latest -f apps/quantmail/Dockerfile .
docker push $REGISTRY/quant-quantmail:latest

Write-Host "Building and pushing quantai..."
docker build -t $REGISTRY/quant-quantai:latest -f apps/quantai/Dockerfile .
docker push $REGISTRY/quant-quantai:latest

Write-Host "Building and pushing admin..."
docker build -t $REGISTRY/quant-admin:latest -f apps/admin/Dockerfile .
docker push $REGISTRY/quant-admin:latest

Write-Host "All images built and pushed successfully!"
