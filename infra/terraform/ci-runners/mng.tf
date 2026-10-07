# ==============================================================================
# AWS EC2 Managed Node Group for EKS CI Runners with gVisor runsc Sandbox
# ==============================================================================
# Provisions an EC2 Managed Node Group using c6i.2xlarge instances with KVM
# hardware virtualization and Linux 6.1 kernel, configured for gVisor runsc
# user-space kernel sandbox execution with systrap hardware-accelerated traps.
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "quant-eks-production"
}

variable "vpc_id" {
  description = "VPC ID where the node group is deployed"
  type        = string
  default     = "vpc-quant-prod"
}

variable "subnet_ids" {
  description = "Subnet IDs for the CI runner managed node group"
  type        = list(string)
  default     = []
}

variable "node_role_arn" {
  description = "IAM Role ARN for the EKS node group"
  type        = string
  default     = ""
}

variable "instance_types" {
  description = "EC2 instance types for CI runners (c6i.2xlarge compute-optimized with KVM support)"
  type        = list(string)
  default     = ["c6i.2xlarge"]
}

variable "desired_size" {
  description = "Desired number of CI runner worker nodes"
  type        = number
  default     = 2
}

variable "min_size" {
  description = "Minimum number of CI runner worker nodes"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum number of CI runner worker nodes"
  type        = number
  default     = 10
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default = {
    Project     = "quant-ecosystem"
    Environment = "production"
    ManagedBy   = "terraform"
    Component   = "ci-runners"
  }
}

locals {
  common_tags = merge(var.tags, {
    "kubernetes.io/cluster/${var.cluster_name}" = "owned"
    "k8s.io/cluster-autoscaler/enabled"        = "true"
    "k8s.io/cluster-autoscaler/${var.cluster_name}" = "owned"
  })
}

# ------------------------------------------------------------------------------
# IAM Role for CI Runner Managed Node Group (fallback if not passed)
# ------------------------------------------------------------------------------

resource "aws_iam_role" "ci_runner_node" {
  count = var.node_role_arn == "" ? 1 : 0
  name  = "${var.cluster_name}-ci-runner-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ci_runner_worker_node" {
  count      = var.node_role_arn == "" ? 1 : 0
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.ci_runner_node[0].name
}

resource "aws_iam_role_policy_attachment" "ci_runner_cni_policy" {
  count      = var.node_role_arn == "" ? 1 : 0
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.ci_runner_node[0].name
}

resource "aws_iam_role_policy_attachment" "ci_runner_ecr_policy" {
  count      = var.node_role_arn == "" ? 1 : 0
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.ci_runner_node[0].name
}

resource "aws_iam_role_policy_attachment" "ci_runner_ssm_policy" {
  count      = var.node_role_arn == "" ? 1 : 0
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.ci_runner_node[0].name
}

# ------------------------------------------------------------------------------
# Launch Template with Linux 6.1, KVM Virtualization & gVisor UserData
# ------------------------------------------------------------------------------

resource "aws_launch_template" "ci_runner" {
  name_prefix   = "${var.cluster_name}-ci-runner-"
  description   = "Launch template for EKS CI runners with Linux 6.1, KVM virtualization and gVisor runsc"
  instance_type = "c6i.2xlarge"

  # UserData bootstraps gVisor runsc and configures containerd with systrap
  user_data = filebase64("${path.module}/userdata.sh")

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 120
      volume_type           = "gp3"
      iops                  = 4000
      throughput            = 250
      delete_on_termination = true
      encrypted             = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 enforced
    http_put_response_hop_limit = 1          # Hop limit 1 prevents container sandboxes from reaching EC2 metadata even if proxy is bypassed
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name           = "${var.cluster_name}-ci-runner-gvisor-node"
      Kernel         = "linux-6.1"
      Virtualization = "kvm"
      Sandbox        = "gvisor"
      InstanceType   = "c6i.2xlarge"
    })
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(local.common_tags, {
      Name = "${var.cluster_name}-ci-runner-volume"
    })
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ------------------------------------------------------------------------------
# EKS Managed Node Group: c6i.2xlarge, Linux 6.1, gVisor runsc
# ------------------------------------------------------------------------------

resource "aws_eks_node_group" "ci_runners" {
  cluster_name    = var.cluster_name
  node_group_name = "${var.cluster_name}-ci-runners"
  node_role_arn   = var.node_role_arn != "" ? var.node_role_arn : aws_iam_role.ci_runner_node[0].arn
  subnet_ids      = var.subnet_ids

  ami_type       = "AL2_x86_64" # Amazon Linux 2 / AL2023 with Linux 6.1 kernel
  capacity_type  = "ON_DEMAND"
  instance_types = ["c6i.2xlarge"]

  launch_template {
    id      = aws_launch_template.ci_runner.id
    version = aws_launch_template.ci_runner.latest_version
  }

  scaling_config {
    desired_size = var.desired_size
    min_size     = var.min_size
    max_size     = var.max_size
  }

  labels = {
    "workload"                         = "ci-runner"
    "sandbox"                          = "gvisor"
    "node.kubernetes.io/instance-type" = "c6i.2xlarge"
  }

  taint {
    key    = "ci-runner"
    value  = "true"
    effect = "NO_SCHEDULE"
  }

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-ci-runner-mng"
  })

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [scaling_config[0].desired_size]
  }

  depends_on = [
    aws_iam_role_policy_attachment.ci_runner_worker_node,
    aws_iam_role_policy_attachment.ci_runner_cni_policy,
    aws_iam_role_policy_attachment.ci_runner_ecr_policy,
  ]
}

output "node_group_arn" {
  description = "ARN of the CI Runner EKS Managed Node Group"
  value       = aws_eks_node_group.ci_runners.arn
}

output "node_group_id" {
  description = "ID of the CI Runner EKS Managed Node Group"
  value       = aws_eks_node_group.ci_runners.id
}

output "launch_template_id" {
  description = "ID of the CI Runner Launch Template"
  value       = aws_launch_template.ci_runner.id
}
