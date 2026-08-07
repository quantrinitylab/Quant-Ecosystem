#!/bin/bash
set -e

REGISTRY="266176113726.dkr.ecr.us-east-1.amazonaws.com"

echo "Logging in to ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $REGISTRY

echo "Building and pushing quant-ws-gateway..."
docker build -t $REGISTRY/quant-ws-gateway:latest -f services/ws-gateway/Dockerfile .
docker push $REGISTRY/quant-ws-gateway:latest
echo "Cleaning up docker space..."
docker system prune -a --volumes -f
df -h

echo "Building and pushing quantchat..."
docker build -t $REGISTRY/quant-quantchat:latest -f apps/quantchat/Dockerfile .
docker push $REGISTRY/quant-quantchat:latest
echo "Cleaning up docker space..."
docker system prune -a --volumes -f
df -h

echo "Building and pushing quantmail..."
docker build -t $REGISTRY/quant-quantmail:latest -f apps/quantmail/Dockerfile .
docker push $REGISTRY/quant-quantmail:latest
echo "Cleaning up docker space..."
docker system prune -a --volumes -f
df -h

echo "Building and pushing quantai..."
docker build -t $REGISTRY/quant-quantai:latest -f apps/quantai/Dockerfile .
docker push $REGISTRY/quant-quantai:latest
echo "Cleaning up docker space..."
docker system prune -a --volumes -f
df -h

echo "Building and pushing admin..."
docker build -t $REGISTRY/quant-admin:latest -f apps/admin/Dockerfile .
docker push $REGISTRY/quant-admin:latest
echo "Cleaning up docker space..."
docker system prune -a --volumes -f
df -h

echo "All images built, pushed, and space cleaned successfully!"
