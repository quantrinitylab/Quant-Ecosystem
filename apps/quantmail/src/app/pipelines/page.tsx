'use client';

import { useRouter } from 'next/navigation';
import { Card, Badge, Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import {
  useWorkflows,
  useBuilds,
  useDeployments,
  useTriggerWorkflow,
  useCancelBuild,
} from '../../hooks/usePipelines';

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  switch (status) {
    case 'success':
      return 'success';
    case 'failure':
      return 'danger';
    case 'running':
    case 'pending':
      return 'warning';
    case 'cancelled':
      return 'default';
    default:
      return 'info';
  }
}

export default function PipelinesPage() {
  const router = useRouter();
  const {
    data: workflows,
    isLoading: loadingWorkflows,
    error: workflowsError,
    refetch: refetchWorkflows,
  } = useWorkflows();
  const {
    data: builds,
    isLoading: loadingBuilds,
    error: buildsError,
    refetch: refetchBuilds,
  } = useBuilds();
  const {
    data: deployments,
    isLoading: loadingDeployments,
    error: deploymentsError,
  } = useDeployments();
  const triggerWorkflow = useTriggerWorkflow();
  const cancelBuild = useCancelBuild();
  const firstWorkflow = workflows?.[0];

  const handleTrigger = async (id: string) => {
    await triggerWorkflow.mutateAsync({ id });
    refetchBuilds();
  };

  const handleCancel = async (id: string) => {
    await cancelBuild.mutateAsync(id);
    refetchBuilds();
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page pipelines-workspace flex flex-col h-full overflow-y-auto p-4 md:p-6 space-y-8">
        {/* Workflows */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Workflows</h2>
          {loadingWorkflows && <Skeleton variant="rect" width="100%" height="120px" />}
          {workflowsError && (
            <ErrorState message={workflowsError.message} onRetry={() => void refetchWorkflows()} />
          )}
          {!loadingWorkflows && !workflowsError && (!workflows || workflows.length === 0) && (
            <EmptyState
              title="Connect your first workflow"
              description="Workflows run checks, builds, and deployments for each repository. Create a repository or add a CI file so your Code workspace can start automating real work."
              actionLabel="Open repositories"
              onAction={() => router.push('/repos')}
            />
          )}
          {!loadingWorkflows &&
            !workflowsError &&
            workflows &&
            workflows.map((workflow) => (
              <Card key={workflow.id} className="mb-2 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-sm">{workflow.name}</h3>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      {workflow.filename} - {workflow.trigger?.events?.join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {workflow.lastRunStatus && (
                      <Badge variant={getStatusVariant(workflow.lastRunStatus)}>
                        {workflow.lastRunStatus}
                      </Badge>
                    )}
                    <Button variant="secondary" onClick={() => handleTrigger(workflow.id)}>
                      Trigger
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
        </section>

        {/* Builds */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Recent Builds</h2>
          {loadingBuilds && <Skeleton variant="rect" width="100%" height="120px" />}
          {buildsError && (
            <ErrorState message={buildsError.message} onRetry={() => void refetchBuilds()} />
          )}
          {!loadingBuilds && !buildsError && (!builds || builds.length === 0) &&
            (firstWorkflow ? (
              <EmptyState
                title="Run your first build"
                description={`Start ${firstWorkflow.name} to create the first build record and verify that your pipeline path is wired correctly.`}
                actionLabel="Trigger first run"
                onAction={() => void handleTrigger(firstWorkflow.id)}
              />
            ) : (
              <EmptyState
                title="Build history will appear here"
                description="Builds show up after a workflow is configured and triggered. Set up a repository workflow first so the system has something real to run."
                actionLabel="Open repositories"
                onAction={() => router.push('/repos')}
              />
            ))}
          {!loadingBuilds &&
            !buildsError &&
            builds &&
            builds.map((build) => (
              <Card key={build.id} className="mb-2 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusVariant(build.status)}>{build.status}</Badge>
                      <span className="font-medium text-sm">Build #{build.number}</span>
                    </div>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 truncate">
                      {build.commitMessage} - {build.branch}
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      {build.author?.name} - {build.duration ? `${build.duration}s` : 'running'}
                    </p>
                  </div>
                  {build.status === 'running' && (
                    <Button variant="secondary" onClick={() => handleCancel(build.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </Card>
            ))}
        </section>

        {/* Deployments */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Deployments</h2>
          {loadingDeployments && <Skeleton variant="rect" width="100%" height="120px" />}
          {deploymentsError && <ErrorState message={deploymentsError.message} />}
          {!loadingDeployments && !deploymentsError && (!deployments || deployments.length === 0) &&
            (firstWorkflow ? (
              <EmptyState
                title="Ship your first deployment"
                description="Deployments appear after a workflow promotes a successful build. Run the pipeline to create the first release trail for this workspace."
                actionLabel="Run a build"
                onAction={() => void handleTrigger(firstWorkflow.id)}
              />
            ) : (
              <EmptyState
                title="Deployments need a release path"
                description="Create a repository and add a deployment workflow so staging, preview, or production releases can appear here with real history."
                actionLabel="Open repositories"
                onAction={() => router.push('/repos')}
              />
            ))}
          {!loadingDeployments &&
            !deploymentsError &&
            deployments &&
            deployments.map((deploy) => (
              <Card key={deploy.id} className="mb-2 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusVariant(deploy.status)}>{deploy.status}</Badge>
                      <span className="font-medium text-sm">{deploy.environment}</span>
                    </div>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                      v{deploy.version} - {new Date(deploy.startedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
        </section>
      </PageTransition>
    </AppShell>
  );
}
