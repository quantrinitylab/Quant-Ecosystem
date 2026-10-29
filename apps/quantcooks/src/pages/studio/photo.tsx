// ============================================================================
// QuantCooks Studio — Photo Editor page (route: /studio/photo, unit C-3,
// checklist row #80: "image editing inside Assets").
//
// Route choice + evidence: row #80 places this surface inside Assets
// (#4) — its picker IS the caller's Assets library and its save-back
// lands in Assets through P0-3. The real /assets page is an existing
// file this unit may not edit, so the surface lives at the
// assets-adjacent studio route /studio/photo (the /studio/<tool>
// pattern of Units 2–7) and links back to /assets throughout. Adding
// the "Edit" entry point on /assets itself and a STUDIO_NAV entry are
// named follow-ups (F-C3-3) for a shared-file unit.
//
// Wiring (Unit 1/2 pattern): shell + real hooks here, behaviour in the
// component. Two real things are wired:
//  - the caller's assets via useAssets (the picker + save-back source);
//  - the save-back upload via useAssetUpload — the P0-3 three-step seam
//    (signed PUT → complete), targeted at the SOURCE asset's project,
//    so the edited copy lands beside its original as a new asset.
// And one honest check: the embedded editor's availability probe
// (probePhotoEditor against the build's parts manifest). Until the
// serving follow-up (F-C3-1) installs the verified bundle at
// /photo-editor, the probe fails and the surface says so.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { StudioShell } from '../../components/studio/StudioShell';
import { PhotoEditor, type PhotoAssetsState } from '../../components/studio/PhotoEditor';
import { useAssets, useAssetUpload } from '../../hooks/useAssets';
import {
  probePhotoEditor,
  type PhotoEmbedProbe,
} from '../../lib/studio/photocraft';

export default function StudioPhotoPage() {
  const assetsQuery = useAssets('image');
  const uploadMutation = useAssetUpload();

  const [embedProbe, setEmbedProbe] = useState<PhotoEmbedProbe | null>(null);
  useEffect(() => {
    let live = true;
    void probePhotoEditor({
      fetchText: async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Editor manifest request failed (${res.status})`);
        return res.text();
      },
    }).then((probe) => {
      if (live) setEmbedProbe(probe);
    });
    return () => {
      live = false;
    };
  }, []);

  const assetsState: PhotoAssetsState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="photo">
      <PhotoEditor
        assets={assetsQuery.data ?? []}
        assetsState={assetsState}
        assetsError={
          assetsQuery.error instanceof Error ? assetsQuery.error.message : null
        }
        onRetryAssets={() => void assetsQuery.refetch()}
        embedProbe={embedProbe}
        upload={(projectId, file) => uploadMutation.mutateAsync({ projectId, file })}
      />
    </StudioShell>
  );
}
