// ============================================================================
// Asset storage integration test (P0-3) — ENV-GATED, skipped by default.
//
// This is the done-definition's "its URL actually downloads the file"
// evidence against REAL object storage: request a signed URL → PUT a small
// buffer to it → complete (HeadObject-verified) → download the object back
// through the port and compare bytes. Run it where storage exists (CI /
// staging) with:
//
//   STORAGE_IT=1 S3_ENDPOINT=... S3_ACCESS_KEY=... S3_SECRET_KEY=...
//   S3_BUCKET=quantcooks-assets npx vitest run asset-storage.integration
//
// Rows live in the fake EditAsset delegate: what is under test here is the
// storage round-trip, not the database (the fake-vs-real-DB story is the
// same one P0-1 already tells). The storage adapter is imported dynamically
// inside the test so this file loads — and skips — in environments where
// @quant/storage cannot resolve (like the no-lockfile local extract).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { AssetService } from '../services/asset.service';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';

describe.skipIf(!process.env['STORAGE_IT'])('asset storage (integration)', () => {
  it('upload → complete → download returns identical bytes', async () => {
    const { buildStoragePort } = await import('../services/storage.adapter');
    const storage = buildStoragePort();
    expect(storage, 'STORAGE_IT is set but no storage config resolved').not.toBeNull();

    const service = new AssetService(createFakeEditAssetPrisma(), storage);
    const payload = Buffer.from(`quantcooks-p03-integration-${Date.now()}`);

    const { assetId, key, uploadUrl, requiredHeaders } = await service.generateUploadUrl(
      'integration-user',
      {
        projectId: 'integration-project',
        filename: 'clip.bin',
        contentType: 'application/octet-stream',
        size: payload.length,
      },
    );

    const headers: Record<string, string> = { ...requiredHeaders };
    delete headers['Content-Length']; // forbidden header; fetch sets it from the body
    const put = await fetch(uploadUrl, { method: 'PUT', headers, body: payload });
    expect(put.ok).toBe(true);

    const asset = await service.completeUpload(assetId, 'integration-user');
    expect(asset.uploadStatus).toBe('READY');
    expect(asset.storageKey).toBe(key);
    expect(asset.url).toBeTruthy();

    const downloaded = await storage!.download(key);
    const chunks: Buffer[] = [];
    for await (const chunk of downloaded.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    expect(Buffer.concat(chunks).equals(payload)).toBe(true);

    await service.deleteAsset(assetId, 'integration-user');
    expect(await storage!.headObject(key)).toBeNull();
  });
});
