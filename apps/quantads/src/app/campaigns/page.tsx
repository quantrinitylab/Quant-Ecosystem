'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, Button, Badge, Avatar, LoadingState, ErrorState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { quantAdsAPI } from '../../services/api-client';
import { SignInRequired } from '../../components/SignInRequired';
import { isUnauthorizedError } from '../../lib/auth-errors';
import type { Campaign } from '../../types';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

function CampaignCard({
  campaign,
  onPause,
  onDelete,
}: {
  campaign: Campaign;
  onPause: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const statusVariant =
    campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warning' : 'default';

  return (
    <motion.div variants={staggerItem}>
      <Card className="p-4 mb-3">
        <div className="flex items-start gap-3">
          <Avatar src={undefined} alt={campaign.name} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{campaign.name}</h3>
              <Badge variant={statusVariant}>{campaign.status}</Badge>
            </div>
            <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
              {campaign.objective} &middot; Budget: ${campaign.budget.amount.toLocaleString()} (
              {campaign.budget.type})
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-[var(--quant-muted-foreground)]">
              <span>{campaign.metrics.impressions.toLocaleString()} impressions</span>
              <span>{campaign.metrics.clicks.toLocaleString()} clicks</span>
              <span>{(campaign.metrics.ctr * 100).toFixed(2)}% CTR</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {campaign.status === 'active' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onPause(campaign.id, 'paused')}
                  className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
                >
                  Pause
                </Button>
              ) : campaign.status === 'paused' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onPause(campaign.id, 'active')}
                  className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
                >
                  Resume
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(campaign.id)}
                className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);

  const {
    data: campaigns,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await quantAdsAPI.listCampaigns();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load campaigns');
      }
      return response.data || [];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await quantAdsAPI.updateCampaignStatus(id, status);
      if (!response.success) throw new Error(response.error?.message || 'Failed to update status');
      return response.data;
    },
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to update campaign status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await quantAdsAPI.deleteCampaign(id);
      if (!response.success) throw new Error(response.error?.message || 'Failed to delete');
      return response.data;
    },
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to delete campaign');
    },
  });

  const handlePause = (id: string, status: string) => {
    statusMutation.mutate({ id, status });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Button
          variant="primary"
          size="sm"
          className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
        >
          Create Campaign
        </Button>
      </div>

      {mutationError && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-500 text-sm">
          {mutationError}
        </div>
      )}

      {isLoading && <LoadingState text="Loading campaigns..." />}

      {isError &&
        (isUnauthorizedError(error) ? (
          <SignInRequired />
        ) : (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load campaigns'}
            onRetry={() => refetch()}
          />
        ))}

      {!isLoading && !isError && campaigns && campaigns.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--quant-muted-foreground)]">
            No campaigns yet. Create your first campaign to start advertising.
          </p>
        </div>
      )}

      {!isLoading && !isError && campaigns && campaigns.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-0"
        >
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onPause={handlePause}
              onDelete={handleDelete}
            />
          ))}
        </motion.div>
      )}
    </main>
  );
}
