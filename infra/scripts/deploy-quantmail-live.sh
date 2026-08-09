#!/bin/bash
set -x

# Full build + deploy pipeline for QuantMail on EC2
cd /tmp && rm -rf qe-deploy
git clone --depth 1 https://github.com/quantrinitylabsgo/Quant-Ecosystem.git qe-deploy
cd /tmp/qe-deploy

# ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 266176113726.dkr.ecr.us-east-1.amazonaws.com

# Build frontend
docker build -t 266176113726.dkr.ecr.us-east-1.amazonaws.com/quant-quantmail:live -f apps/quantmail/Dockerfile .
docker push 266176113726.dkr.ecr.us-east-1.amazonaws.com/quant-quantmail:live

# Build backend  
docker build -t 266176113726.dkr.ecr.us-east-1.amazonaws.com/quant-quantmail-backend:live -f apps/quantmail/Dockerfile.backend .
docker push 266176113726.dkr.ecr.us-east-1.amazonaws.com/quant-quantmail-backend:live

# Deploy to EKS
aws eks update-kubeconfig --name quant-staging-eks --region us-east-1
kubectl set image deployment/quant-quantmail quant-quantmail=266176113726.dkr.ecr.us-east-1.amazonaws.com/quant-quantmail:live -n quant-staging
kubectl set image deployment/quant-quantmail-backend quant-quantmail-backend=266176113726.dkr.ecr.us-east-1.amazonaws.com/quant-quantmail-backend:live -n quant-staging
kubectl rollout status deployment/quant-quantmail -n quant-staging --timeout=180s

echo "QUANTMAIL_DEPLOYED_SUCCESSFULLY"
