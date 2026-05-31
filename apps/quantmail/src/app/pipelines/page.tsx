'use client';

import { AppShell, Card, Badge, Button, Skeleton } from '@quant/shared-ui';
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

  const handleTrigger = async (id: string) => {
    await triggerWorkflow.mutateAsync({ id });
    refetchBuilds();
  };

  const handleCancel = async (id: string) => {
    await cancelBuild.mutateAsync(id);
    refetchBuilds();
  };

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full overflow-y-auto p-4 md:p-6 space-y-8">
        {/* Workflows */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Workflows</h2>
          {loadingWorkflows && <Skeleton variant="rect" width="100%" height="120px" />}
          {workflowsError && (
            <ErrorState message={workflowsError.message} onRetry={() => void refetchWorkflows()} />
          )}
          {!loadingWorkflows && !workflowsError && (!workflows || workflows.length === 0) && (
            <EmptyState title="No workflows" description="No CI/CD workflows configured" />
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
          {!loadingBuilds && !buildsError && (!builds || builds.length === 0) && (
            <EmptyState title="No builds" description="No builds have been run yet" />
          )}
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
          {!loadingDeployments &&
            !deploymentsError &&
            (!deployments || deployments.length === 0) && (
              <EmptyState title="No deployments" description="No deployments have been made yet" />
            )}
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
