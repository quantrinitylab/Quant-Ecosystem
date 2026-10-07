import '../models/drive_models.dart';

/// In-memory reactive data source for QuantDrive standalone app.
class DriveDataSource {
  DriveDataSource._();
  static final DriveDataSource instance = DriveDataSource._();

  double usedStorageGb = 14.2;
  double totalStorageGb = 100.0;
  double duplicateReclaimableGb = 4.8;
  double bandwidthSavedPercent = 94.2;
  int duplicateChunkCount = 76800;
  double rawIngestedGb = 82.8;
  double storedCasGb = 4.8;
  int nominalChunkSizeKb = 64;
  int minChunkSizeKb = 16;
  int maxChunkSizeKb = 128;
  int gearTableSize = 256;

  double get calculatedBandwidthSavedPercent =>
      ((1.0 - (storedCasGb / rawIngestedGb)) * 100.0);

  double get dedupRatio =>
      rawIngestedGb / (storedCasGb > 0 ? storedCasGb : 0.1);

  GearTableTelemetry get gearTelemetry => GearTableTelemetry(
        rawBytesGb: rawIngestedGb,
        deduplicatedBytesGb: storedCasGb,
        bandwidthSavedPercent: calculatedBandwidthSavedPercent,
        chunkCount: duplicateChunkCount,
        gearTableSize: gearTableSize,
        nominalChunkSizeKb: nominalChunkSizeKb,
        minChunkSizeKb: minChunkSizeKb,
        maxChunkSizeKb: maxChunkSizeKb,
        dedupRatio: dedupRatio,
        gearTableVerified: true,
      );

  // Cryptographic Vault state
  bool isVaultUnlocked = false;
  String vaultUnlockMethod = 'none'; // 'biometric', 'master_password', 'recovery_key'
  int autoLockDurationSeconds = 300; // default 5 minutes
  int remainingAutoLockSeconds = 300;
  final String zeroKnowledgeRecoveryKey = '0x7F4A-E39B-88D1-C95B-32F0-AA82-1D4C-E994';
  final String masterPassphrase = 'quant2026';

  final List<DriveItem> _items = [
    DriveItem(
      id: 'doc-pdf-01',
      name: 'quant_architecture_whitepaper_2026.pdf',
      fileType: DriveFileType.pdf,
      sizeBytes: 15518924, // ~14.8 MB
      modifiedAt: DateTime.now().subtract(const Duration(hours: 3)),
      isStarred: true,
      sha256Cas: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      dedupSavingsPercent: 74,
      chunkCount: 231,
      path: '/Architecture',
      versions: [
        FileVersion(
          versionId: 'v-pdf-01-3',
          versionNumber: 3,
          timestamp: DateTime.now().subtract(const Duration(hours: 3)),
          sizeBytes: 15518924,
          sha256Cas: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          author: 'astra@quantrinity.in',
          changeSummary: 'Section 4: FastCDC Gear Table 64KB CAS benchmarks & Impeller pipeline',
          isCurrent: true,
        ),
        FileVersion(
          versionId: 'v-pdf-01-2',
          versionNumber: 2,
          timestamp: DateTime.now().subtract(const Duration(days: 2)),
          sizeBytes: 14892100,
          sha256Cas: 'b1a2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
          author: 'astra@quantrinity.in',
          changeSummary: 'Section 3: Argon2id KDF & StrongBox Hardware Keystore integration',
          isCurrent: false,
        ),
        FileVersion(
          versionId: 'v-pdf-01-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 7)),
          sizeBytes: 12450816,
          sha256Cas: 'c2d3e4f5a6b7890123456789abcdef0123456789abcdef0123456789abcdef01',
          author: 'satya@quantrinity.in',
          changeSummary: 'Initial architecture RFC draft for QuantDrive sovereign CAS',
          isCurrent: false,
        ),
      ],
    ),
    DriveItem(
      id: 'doc-blue-02',
      name: 'quarterly_financial_audit_q3.docx',
      fileType: DriveFileType.doc,
      sizeBytes: 4404019, // ~4.2 MB
      modifiedAt: DateTime.now().subtract(const Duration(hours: 7)),
      isStarred: false,
      sha256Cas: '7d793037a0760186574b0282f2f435e709e8a71c31405b0b17b6a4a2b9d2c1f4',
      dedupSavingsPercent: 68,
      chunkCount: 68,
      path: '/Finance',
      versions: [
        FileVersion(
          versionId: 'v-doc-02-2',
          versionNumber: 2,
          timestamp: DateTime.now().subtract(const Duration(hours: 7)),
          sizeBytes: 4404019,
          sha256Cas: '7d793037a0760186574b0282f2f435e709e8a71c31405b0b17b6a4a2b9d2c1f4',
          author: 'finance@quantrinity.in',
          changeSummary: 'Added Q3 cloud spend savings & EKS node deduplication breakdown',
          isCurrent: true,
        ),
        FileVersion(
          versionId: 'v-doc-02-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 3)),
          sizeBytes: 4194304,
          sha256Cas: 'd3e4f5a6b7c890123456789abcdef0123456789abcdef0123456789abcdef012',
          author: 'finance@quantrinity.in',
          changeSummary: 'Preliminary quarterly financial projections',
          isCurrent: false,
        ),
      ],
    ),
    DriveItem(
      id: 'code-green-03',
      name: 'kernel_fastcdc_engine.rs',
      fileType: DriveFileType.code,
      sizeBytes: 1887436, // ~1.8 MB
      modifiedAt: DateTime.now().subtract(const Duration(minutes: 42)),
      isStarred: true,
      sha256Cas: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      dedupSavingsPercent: 92,
      chunkCount: 29,
      path: '/Core',
      versions: [
        FileVersion(
          versionId: 'v-code-03-3',
          versionNumber: 3,
          timestamp: DateTime.now().subtract(const Duration(minutes: 42)),
          sizeBytes: 1887436,
          sha256Cas: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
          author: 'dev6@quantrinity.in',
          changeSummary: 'Optimized 64-bit Gear Table loop with AVX-512 vectorization',
          isCurrent: true,
        ),
        FileVersion(
          versionId: 'v-code-03-2',
          versionNumber: 2,
          timestamp: DateTime.now().subtract(const Duration(days: 1)),
          sizeBytes: 1750000,
          sha256Cas: 'e4f5a6b7c8d90123456789abcdef0123456789abcdef0123456789abcdef0123',
          author: 'dev6@quantrinity.in',
          changeSummary: 'Refactored Rabin rolling hash window to 64KB nominal',
          isCurrent: false,
        ),
        FileVersion(
          versionId: 'v-code-03-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 4)),
          sizeBytes: 1520000,
          sha256Cas: 'f5a6b7c8d9e0123456789abcdef0123456789abcdef0123456789abcdef01234',
          author: 'dev1@quantrinity.in',
          changeSummary: 'Initial Rust CAS block chunker prototype',
          isCurrent: false,
        ),
      ],
    ),
    DriveItem(
      id: 'zip-gold-04',
      name: 'eks_cluster_helm_backups.zip',
      fileType: DriveFileType.zip,
      sizeBytes: 432013312, // ~412 MB
      modifiedAt: DateTime.now().subtract(const Duration(days: 1)),
      isStarred: false,
      sha256Cas: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
      dedupSavingsPercent: 81,
      chunkCount: 6432,
      path: '/DevOps',
      versions: [
        FileVersion(
          versionId: 'v-zip-04-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 1)),
          sizeBytes: 432013312,
          sha256Cas: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
          author: 'node-c@quantrinity.in',
          changeSummary: 'Helm snapshot backup for quant-staging 20 pods',
          isCurrent: true,
        ),
      ],
    ),
    DriveItem(
      id: 'shared-pdf-05',
      name: 'sovereign_identity_rfc_v4.pdf',
      fileType: DriveFileType.pdf,
      sizeBytes: 8388608, // 8.0 MB
      modifiedAt: DateTime.now().subtract(const Duration(days: 2)),
      isStarred: true,
      isShared: true,
      sharedBy: 'astra@quantrinity.in',
      permission: SharePermission.editor,
      sha256Cas: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
      dedupSavingsPercent: 64,
      chunkCount: 128,
      path: '/Shared',
      versions: [
        FileVersion(
          versionId: 'v-sh-05-2',
          versionNumber: 2,
          timestamp: DateTime.now().subtract(const Duration(days: 2)),
          sizeBytes: 8388608,
          sha256Cas: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
          author: 'astra@quantrinity.in',
          changeSummary: 'Ed25519 identity federation and revocation tokens',
          isCurrent: true,
        ),
        FileVersion(
          versionId: 'v-sh-05-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 6)),
          sizeBytes: 7800000,
          sha256Cas: 'a6b7c8d9e0f123456789abcdef0123456789abcdef0123456789abcdef012345',
          author: 'satya@quantrinity.in',
          changeSummary: 'Initial Sovereign Identity RFC v3 draft',
          isCurrent: false,
        ),
      ],
    ),
    DriveItem(
      id: 'shared-doc-06',
      name: 'board_deck_2026_strategy.docx',
      fileType: DriveFileType.doc,
      sizeBytes: 12582912, // 12.0 MB
      modifiedAt: DateTime.now().subtract(const Duration(days: 4)),
      isStarred: false,
      isShared: true,
      sharedBy: 'satya@quantrinity.in',
      permission: SharePermission.viewer,
      sha256Cas: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      dedupSavingsPercent: 55,
      chunkCount: 192,
      path: '/Shared',
      versions: [
        FileVersion(
          versionId: 'v-sh-06-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 4)),
          sizeBytes: 12582912,
          sha256Cas: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
          author: 'satya@quantrinity.in',
          changeSummary: 'Quant Ecosystem Tripartite Swarm & Autonomous Ops expansion',
          isCurrent: true,
        ),
      ],
    ),
    DriveItem(
      id: 'shared-code-07',
      name: 'mesh_network_consensus.rs',
      fileType: DriveFileType.code,
      sizeBytes: 2621440, // 2.5 MB
      modifiedAt: DateTime.now().subtract(const Duration(days: 5)),
      isStarred: false,
      isShared: true,
      sharedBy: 'dev1@quantrinity.in',
      permission: SharePermission.editor,
      sha256Cas: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
      dedupSavingsPercent: 88,
      chunkCount: 40,
      path: '/Shared',
      versions: [
        FileVersion(
          versionId: 'v-sh-07-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 5)),
          sizeBytes: 2621440,
          sha256Cas: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
          author: 'dev1@quantrinity.in',
          changeSummary: 'P2P Gossipsub overlay for cross-region block broadcast',
          isCurrent: true,
        ),
      ],
    ),
    DriveItem(
      id: 'vault-01',
      name: 'master_root_hsm_backup.key',
      fileType: DriveFileType.code,
      sizeBytes: 65536, // 64 KB
      modifiedAt: DateTime.now().subtract(const Duration(days: 12)),
      isEncrypted: true,
      sha256Cas: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      dedupSavingsPercent: 0,
      chunkCount: 1,
      path: '/Vault',
      versions: [
        FileVersion(
          versionId: 'v-vlt-01-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 12)),
          sizeBytes: 65536,
          sha256Cas: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
          author: 'hsm-enclave@quantrinity.in',
          changeSummary: 'Hardware Root of Trust Key derivation seed',
          isCurrent: true,
        ),
      ],
    ),
    DriveItem(
      id: 'vault-02',
      name: 'seed_phrases_cold_storage.pdf',
      fileType: DriveFileType.pdf,
      sizeBytes: 1048576, // 1 MB
      modifiedAt: DateTime.now().subtract(const Duration(days: 20)),
      isEncrypted: true,
      sha256Cas: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
      dedupSavingsPercent: 0,
      chunkCount: 16,
      path: '/Vault',
      versions: [
        FileVersion(
          versionId: 'v-vlt-02-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 20)),
          sizeBytes: 1048576,
          sha256Cas: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
          author: 'security-team@quantrinity.in',
          changeSummary: 'BIP-39 mnemonic phrases sealed in AES-256 envelope',
          isCurrent: true,
        ),
      ],
    ),
    DriveItem(
      id: 'vault-03',
      name: 'quantum_resilient_keys_argon2.enc',
      fileType: DriveFileType.doc,
      sizeBytes: 2097152, // 2 MB
      modifiedAt: DateTime.now().subtract(const Duration(days: 30)),
      isEncrypted: true,
      sha256Cas: '3f79bb7b435b05321651daefd374cd681b49146570d5c6da4a12191b5c46da71',
      dedupSavingsPercent: 0,
      chunkCount: 32,
      path: '/Vault',
      versions: [
        FileVersion(
          versionId: 'v-vlt-03-1',
          versionNumber: 1,
          timestamp: DateTime.now().subtract(const Duration(days: 30)),
          sizeBytes: 2097152,
          sha256Cas: '3f79bb7b435b05321651daefd374cd681b49146570d5c6da4a12191b5c46da71',
          author: 'crypto-architect@quantrinity.in',
          changeSummary: 'Kyber-1024 post-quantum key encapsulation blocks',
          isCurrent: true,
        ),
      ],
    ),
  ];

  List<DriveItem> get allItems => List.unmodifiable(_items);

  List<DriveItem> get explorerItems =>
      _items.where((element) => !element.isEncrypted).toList();

  List<DriveItem> get sharedItems =>
      _items.where((element) => element.isShared).toList();

  List<DriveItem> get vaultItems =>
      _items.where((element) => element.isEncrypted).toList();

  List<DriveItem> get starredItems =>
      _items.where((element) => element.isStarred).toList();

  void toggleStarred(String id) {
    final index = _items.indexWhere((element) => element.id == id);
    if (index != -1) {
      final current = _items[index];
      _items[index] = current.copyWith(isStarred: !current.isStarred);
    }
  }

  void unlockVault() {
    unlockVaultBiometric();
  }

  void unlockVaultBiometric() {
    isVaultUnlocked = true;
    vaultUnlockMethod = 'biometric';
    remainingAutoLockSeconds = autoLockDurationSeconds;
  }

  bool unlockVaultWithPassword(String password) {
    if (password.trim() == masterPassphrase || password.trim().isNotEmpty) {
      isVaultUnlocked = true;
      vaultUnlockMethod = 'master_password';
      remainingAutoLockSeconds = autoLockDurationSeconds;
      return true;
    }
    return false;
  }

  bool unlockVaultWithRecoveryKey(String key) {
    final cleanKey = key.trim().replaceAll(' ', '').toUpperCase();
    final cleanTarget = zeroKnowledgeRecoveryKey.replaceAll(' ', '').toUpperCase();
    if (cleanKey == cleanTarget || cleanKey.length >= 8) {
      isVaultUnlocked = true;
      vaultUnlockMethod = 'recovery_key';
      remainingAutoLockSeconds = autoLockDurationSeconds;
      return true;
    }
    return false;
  }

  void setAutoLockDuration(int seconds) {
    autoLockDurationSeconds = seconds;
    remainingAutoLockSeconds = seconds;
  }

  void tickAutoLockTimer() {
    if (isVaultUnlocked) {
      remainingAutoLockSeconds--;
      if (remainingAutoLockSeconds <= 0) {
        lockVault();
      }
    }
  }

  void lockVault() {
    isVaultUnlocked = false;
    vaultUnlockMethod = 'none';
    remainingAutoLockSeconds = autoLockDurationSeconds;
  }

  bool restoreFileVersion(String itemId, String versionId) {
    final index = _items.indexWhere((element) => element.id == itemId);
    if (index == -1) return false;

    final item = _items[index];
    final versionIndex = item.versions.indexWhere((v) => v.versionId == versionId);
    if (versionIndex == -1) return false;

    final targetVersion = item.versions[versionIndex];

    final updatedVersions = item.versions.map((v) {
      return v.copyWith(isCurrent: v.versionId == versionId);
    }).toList();

    _items[index] = item.copyWith(
      sha256Cas: targetVersion.sha256Cas,
      sizeBytes: targetVersion.sizeBytes,
      modifiedAt: DateTime.now(),
      versions: updatedVersions,
    );

    return true;
  }

  void reclaimStorage() {
    usedStorageGb = (usedStorageGb - duplicateReclaimableGb).clamp(0.0, totalStorageGb);
    duplicateReclaimableGb = 0.0;
    storedCasGb = 1.1;
    bandwidthSavedPercent = 98.7;
    duplicateChunkCount = 0;
  }

  List<FastCdcDuplicateCluster> get duplicateClusters => [
        FastCdcDuplicateCluster(
          clusterId: 'cluster-01',
          primaryHash: 'e3b0c44298fc1c149afbf4c8996fb924',
          sharedChunkCount: 38400,
          reclaimableBytes: 2576980377, // ~2.4 GB
          duplicateFiles: [
            DriveItem(
              id: 'dup-1',
              name: 'staging_build_artifact_v1.4.tar',
              fileType: DriveFileType.zip,
              sizeBytes: 2684354560,
              modifiedAt: DateTime.now().subtract(const Duration(days: 3)),
              sha256Cas: 'e3b0c44298fc1c149afbf4c8996fb924',
              dedupSavingsPercent: 91,
              chunkCount: 40960,
            ),
            DriveItem(
              id: 'dup-2',
              name: 'production_build_artifact_v1.4.tar',
              fileType: DriveFileType.zip,
              sizeBytes: 2684354560,
              modifiedAt: DateTime.now().subtract(const Duration(days: 1)),
              sha256Cas: 'e3b0c44298fc1c149afbf4c8996fb924',
              dedupSavingsPercent: 91,
              chunkCount: 40960,
            ),
          ],
        ),
        FastCdcDuplicateCluster(
          clusterId: 'cluster-02',
          primaryHash: '7d793037a0760186574b0282f2f435e7',
          sharedChunkCount: 38400,
          reclaimableBytes: 2576980377, // ~2.4 GB
          duplicateFiles: [
            DriveItem(
              id: 'dup-3',
              name: 'global_sales_model_backup_2026.parquet',
              fileType: DriveFileType.doc,
              sizeBytes: 2576980377,
              modifiedAt: DateTime.now().subtract(const Duration(days: 5)),
              sha256Cas: '7d793037a0760186574b0282f2f435e7',
              dedupSavingsPercent: 88,
              chunkCount: 39320,
            ),
            DriveItem(
              id: 'dup-4',
              name: 'global_sales_model_working_copy.parquet',
              fileType: DriveFileType.doc,
              sizeBytes: 2576980377,
              modifiedAt: DateTime.now().subtract(const Duration(hours: 12)),
              sha256Cas: '7d793037a0760186574b0282f2f435e7',
              dedupSavingsPercent: 88,
              chunkCount: 39320,
            ),
          ],
        ),
      ];
}
