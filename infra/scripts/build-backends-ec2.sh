#!/bin/bash
set -e
export AWS_DEFAULT_REGION=us-east-1
ACCOUNT_ID=266176113726
COMMIT_SHA=53f9d1f0595709588ed76e4d12177021717c5319
cd /tmp && rm -rf Quant-Ecosystem
git clone --depth 1 https://github.com/quantrinitylabsgo/Quant-Ecosystem.git
cd Quant-Ecosystem
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com
echo "=== Build quantchat-backend ==="
docker build -f apps/quantchat/Dockerfile.backend -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantchat-backend:${COMMIT_SHA} -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantchat-backend:latest .
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantchat-backend:${COMMIT_SHA}
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantchat-backend:latest
echo "=== Build quantai-backend ==="
docker build -f apps/quantai/Dockerfile.backend -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantai-backend:${COMMIT_SHA} -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantai-backend:latest .
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantai-backend:${COMMIT_SHA}
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-quantai-backend:latest
echo "=== Build ws-gateway ==="
docker build -f services/ws-gateway/Dockerfile -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-ws-gateway:${COMMIT_SHA} -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-ws-gateway:latest .
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-ws-gateway:${COMMIT_SHA}
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/quant-ws-gateway:latest
echo "=== ALL DONE ==="
