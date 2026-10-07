import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task W34-01: Infrastructure Configurations for CI Runners', () => {
  // Resolve paths from root workspace
  const repoRoot = path.resolve(__dirname, '../../../../');
  const mngTfPath = path.join(repoRoot, 'infra/terraform/ci-runners/mng.tf');
  const userdataPath = path.join(repoRoot, 'infra/terraform/ci-runners/userdata.sh');
  const k8sManifestPath = path.join(repoRoot, 'infra/k8s/ci-runner-daemonset.yaml');

  describe('Terraform Managed Node Group (mng.tf)', () => {
    it('exists and contains valid Terraform definitions', () => {
      expect(fs.existsSync(mngTfPath)).toBe(true);
      const content = fs.readFileSync(mngTfPath, 'utf8');

      // AWS EKS Managed Node Group resource
      expect(content).toContain('resource "aws_eks_node_group" "ci_runners"');
      // Compute-optimized c6i.2xlarge instance type
      expect(content).toContain('c6i.2xlarge');
      // Launch template configuration
      expect(content).toContain('resource "aws_launch_template" "ci_runner"');
      // References userdata.sh
      expect(content).toContain('userdata.sh');
      // References Linux 6.1 and KVM virtualization in tags/metadata
      expect(content).toMatch(/linux-6\.1/i);
      expect(content).toMatch(/kvm/i);
      // Contains gVisor sandbox labels
      expect(content).toContain('"sandbox"                          = "gvisor"');
      // Scaling config
      expect(content).toContain('scaling_config');
    });
  });

  describe('UserData Shell Script (userdata.sh)', () => {
    it('exists, is executable shell script, installs runsc and configures systrap', () => {
      expect(fs.existsSync(userdataPath)).toBe(true);
      const content = fs.readFileSync(userdataPath, 'utf8');

      // Shell shebang and error handling
      expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
      expect(content).toContain('set -euo pipefail');

      // Checks KVM virtualization
      expect(content).toContain('/dev/kvm');

      // Downloads and installs gVisor runsc into /usr/local/bin/runsc
      expect(content).toContain('https://storage.googleapis.com/gvisor/releases/release/latest');
      expect(content).toContain('/usr/local/bin/runsc');
      expect(content).toContain('sha512sum');
      expect(content).toContain('chmod a+rx runsc');

      // Configures containerd runtime handler runsc with platform = "systrap"
      expect(content).toContain('platform = "systrap"');
      expect(content).toContain('--platform=systrap');
      expect(content).toContain('/etc/containerd/config.toml');
      expect(content).toContain('systemctl restart containerd');
    });
  });

  describe('Kubernetes Manifests (ci-runner-daemonset.yaml)', () => {
    it('exists and configures RuntimeClass runsc and DaemonSet with gVisor isolation', () => {
      expect(fs.existsSync(k8sManifestPath)).toBe(true);
      const content = fs.readFileSync(k8sManifestPath, 'utf8');

      // Defines RuntimeClass runsc
      expect(content).toContain('kind: RuntimeClass');
      expect(content).toContain('name: runsc');
      expect(content).toContain('handler: runsc');

      // Defines DaemonSet with runtimeClassName: runsc
      expect(content).toContain('kind: DaemonSet');
      expect(content).toContain('name: ci-runner-daemonset');
      expect(content).toContain('runtimeClassName: runsc');

      // Targets nodes with gvisor sandbox
      expect(content).toContain('sandbox: gvisor');
      expect(content).toContain('workload: ci-runner');

      // Sets gVisor env vars
      expect(content).toContain('GVISOR_PLATFORM');
      expect(content).toContain('systrap');
    });
  });
});
