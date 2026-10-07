# M19 — Infrastructure as Code & GitOps

## Terraform
Own cloud/network primitives, managed databases where applicable, object storage, DNS, IAM, and foundational observability resources.

## Helm
Own Kubernetes workload packaging, policies, service configuration templates, and environment-specific values.

## ArgoCD
Own continuous reconciliation from reviewed Git state to Kubernetes.

## Change flow
Design → review → Terraform/Helm change → CI validation → staging → production promotion → observe → rollback if required.

Production state must be reproducible from versioned configuration plus external secrets/state.
