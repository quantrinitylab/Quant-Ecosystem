// ============================================================================
// QuantAI - Training Page
// ============================================================================

import type { TrainingJob } from '../types';

interface TrainingPageProps { jobs: TrainingJob[]; onStartTraining: () => void; onCancelJob: (id: string) => void; }

export function TrainingPage({ jobs, onStartTraining, onCancelJob }: TrainingPageProps) {
  return { type: 'div', className: 'training-page', children: [
    { type: 'header', children: [{ type: 'h1', text: 'Model Training' }, { type: 'button', text: '+ New Training Job', onClick: onStartTraining }] },
    { type: 'div', className: 'jobs-list', children: jobs.map(job => ({
      type: 'div', className: `job-card ${job.status}`, children: [
        { type: 'h3', text: job.name },
        { type: 'div', className: 'progress', children: [{ type: 'div', className: 'progress-bar', style: { width: `${job.progress}%` } }, { type: 'span', text: `${job.progress}%` }] },
        { type: 'div', className: 'metrics', children: [{ type: 'span', text: `Loss: ${job.metrics.loss.toFixed(4)}` }, { type: 'span', text: `Acc: ${(job.metrics.accuracy * 100).toFixed(1)}%` }] },
        { type: 'div', className: 'info', children: [{ type: 'span', text: `Status: ${job.status}` }, { type: 'span', text: `Dataset: ${job.dataset.samples} samples` }] },
        job.status !== 'completed' && job.status !== 'failed' ? { type: 'button', text: 'Cancel', onClick: () => onCancelJob(job.id) } : null,
      ],
    }))},
  ]};
}

export default TrainingPage;
