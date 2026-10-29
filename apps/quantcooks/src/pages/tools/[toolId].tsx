// ============================================================================
// QuantCooks Studio — Quick Tool page (route: /tools/[toolId], spec §8.2)
//
// One dynamic page renders whichever single-purpose flow the route
// names; an unknown id renders an honest not-found inside the shell,
// never a blank page or a fake tool.
//
// Wiring mirrors the studio pages: the caller's assets unfiltered
// (each flow applies its READY/kind rules), the upload target resolved
// like Image Studio (?projectId= wins, else the most recent project,
// else uploads honestly off), and — for Presenter Swap — the caller's
// Chef Personas read from the Voice Studio device mirror (Unit 7's
// VOICE_DRAFT_KEY, parsed by voice.ts's own defensive parser; personas
// are device drafts, labelled as such by the flow itself).
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../components/studio/StudioShell';
import { DishPhotoFix } from '../../components/studio/DishPhotoFix';
import { ExpandPhoto } from '../../components/studio/ExpandPhoto';
import { HookScoreTool } from '../../components/studio/HookScoreTool';
import { PresenterSwap } from '../../components/studio/PresenterSwap';
import type { ToolAssetsState } from '../../components/studio/ToolFlow';
import { useAssets, useAssetUpload } from '../../hooks/useAssets';
import { useProjects } from '../../hooks/useProjects';
import { toolById } from '../../lib/studio/tools';
import {
  VOICE_DRAFT_KEY,
  parseVoiceDraft,
  type ChefPersona,
} from '../../lib/studio/voice';

export default function QuickToolPage() {
  const router = useRouter();
  const toolId = typeof router.query.toolId === 'string' ? router.query.toolId : null;
  const tool = toolById(toolId);

  const queryProjectId = typeof router.query.projectId === 'string' ? router.query.projectId : null;
  const projectsQuery = useProjects(undefined, 1);
  const project = useMemo(() => {
    const items = projectsQuery.data ?? [];
    if (queryProjectId) return items.find((p) => p.id === queryProjectId) ?? null;
    return items[0] ?? null;
  }, [projectsQuery.data, queryProjectId]);
  const projectId = queryProjectId ?? project?.id ?? null;

  const assetsQuery = useAssets();
  const uploadMutation = useAssetUpload();

  const assetsState: ToolAssetsState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  // Chef Personas live in the Voice Studio device mirror (no server home
  // yet). Read once on mount, client-side only; absent mirror = no
  // personas, which the swap flow renders as its honest empty state.
  const [personas, setPersonas] = useState<ChefPersona[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VOICE_DRAFT_KEY);
      setPersonas(parseVoiceDraft(raw).personas);
    } catch {
      setPersonas([]);
    }
  }, []);

  const shared = {
    projectId,
    assets: assetsQuery.data ?? [],
    assetsState,
    assetsError: assetsQuery.error instanceof Error ? assetsQuery.error.message : null,
    onRetryAssets: () => {
      void assetsQuery.refetch();
    },
    upload: projectId
      ? (file: File) => uploadMutation.mutateAsync({ projectId, file })
      : undefined,
    jobs: [] as never[],
  };

  return (
    <StudioShell active="tools">
      {toolId === null || tool === null ? (
        <section className="studio-tools-not-found" data-testid="tool-not-found">
          <h1>That Quick Tool does not exist</h1>
          <p>
            The directory only lists tools that are actually built — this link names one that is
            not. <a href="/tools">Back to Quick Tools</a>.
          </p>
        </section>
      ) : tool.id === 'dish-photo-fix' ? (
        <DishPhotoFix {...shared} />
      ) : tool.id === 'expand-photo' ? (
        <ExpandPhoto {...shared} />
      ) : tool.id === 'hook-score' ? (
        <HookScoreTool {...shared} />
      ) : (
        <PresenterSwap {...shared} personas={personas} />
      )}
    </StudioShell>
  );
}
