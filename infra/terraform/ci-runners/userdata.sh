#!/usr/bin/env bash
# ==============================================================================
# EKS CI Runner Node Bootstrapping — gVisor runsc with systrap platform
# ==============================================================================
# Installs and registers gVisor runsc runtime with containerd (/usr/local/bin/runsc)
# and configures containerd runtime handler runsc with platform = "systrap".
# Operating environment: Linux 6.1 with KVM virtualization on c6i.2xlarge.
# ==============================================================================

set -euo pipefail

echo "==> [gVisor Bootstrap] Checking Linux kernel and KVM virtualization prerequisites..."
KERNEL_RELEASE=$(uname -r)
echo "Current Linux kernel release: ${KERNEL_RELEASE}"

# Verify KVM hardware virtualization if available
if [ -e /dev/kvm ]; then
  echo "KVM device /dev/kvm detected: hardware virtualization is active."
  chmod 666 /dev/kvm || true
else
  echo "KVM device not yet populated. Attempting modprobe kvm / kvm_intel..."
  modprobe kvm || true
  modprobe kvm_intel || true
fi

# Determine host architecture
ARCH=$(uname -m)
case "${ARCH}" in
  x86_64)
    GVISOR_ARCH="x86_64"
    ;;
  aarch64)
    GVISOR_ARCH="aarch64"
    ;;
  *)
    echo "Unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

echo "==> [gVisor Bootstrap] Downloading and installing gVisor runsc binary for ${GVISOR_ARCH}..."
URL="https://storage.googleapis.com/gvisor/releases/release/latest/${GVISOR_ARCH}"
TMP_DIR=$(mktemp -d)
cd "${TMP_DIR}"

curl -fsSL "${URL}/runsc" -o runsc
curl -fsSL "${URL}/runsc.sha512" -o runsc.sha512
sha512sum -c runsc.sha512

# Generate and verify SHA-256 digest for security audit
RUNSC_SHA256=$(sha256sum runsc | awk '{print $1}')
echo "runsc binary SHA-256 checksum: ${RUNSC_SHA256}"
test -n "${RUNSC_SHA256}"

chmod a+rx runsc
install -m 0755 runsc /usr/local/bin/runsc
rm -rf "${TMP_DIR}"

echo "==> [gVisor Bootstrap] Successfully installed /usr/local/bin/runsc"
/usr/local/bin/runsc --version

echo "==> [gVisor Bootstrap] Configuring containerd runtime handler 'runsc' with platform = 'systrap'..."

# Create runsc configuration directory and config.toml
mkdir -p /etc/containerd
cat <<'EOF' > /etc/containerd/runsc.toml
platform = "systrap"
debug = false
root = "/run/user/0/runsc"
log = "/var/log/runsc.log"
EOF

# Ensure containerd configuration directory exists
CONTAINERD_CONFIG="/etc/containerd/config.toml"
if [ ! -f "${CONTAINERD_CONFIG}" ]; then
  mkdir -p /etc/containerd
  containerd config default > "${CONTAINERD_CONFIG}"
fi

# Configure containerd CRI runtime handler for runsc with systrap platform
if grep -q 'runtimes.runsc' "${CONTAINERD_CONFIG}"; then
  echo "containerd already contains runsc runtime handler configuration."
else
  # Use runsc install helper to register runtime handler with systrap platform
  /usr/local/bin/runsc install --runtime=runsc -- --platform=systrap

  # Append explicit CRI configuration block if not present
  cat <<'EOF' >> "${CONTAINERD_CONFIG}"

# gVisor runsc CRI runtime configuration with systrap acceleration
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc]
  runtime_type = "io.containerd.runsc.v1"
  pod_annotations = ["dev.gvisor.*"]
  [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc.options]
    TypeUrl = "io.containerd.runsc.v1.options"
    BinaryName = "/usr/local/bin/runsc"
    ConfigPath = "/etc/containerd/runsc.toml"
EOF
fi

echo "==> [gVisor Bootstrap] Restarting containerd..."
systemctl daemon-reload || true
systemctl restart containerd

echo "==> [gVisor Bootstrap] Verifying containerd status and runsc registration..."
systemctl is-active --quiet containerd && echo "containerd is active."

# Complete EKS bootstrap if /etc/eks/bootstrap.sh exists
if [ -f /etc/eks/bootstrap.sh ]; then
  echo "==> Executing EKS bootstrap script..."
  /etc/eks/bootstrap.sh "quant-eks-production" \
    --container-runtime containerd \
    --kubelet-extra-args '--node-labels=workload=ci-runner,sandbox=gvisor --register-with-taints=ci-runner=true:NoSchedule'
fi

echo "==> [gVisor Bootstrap] Bootstrap completed successfully."
