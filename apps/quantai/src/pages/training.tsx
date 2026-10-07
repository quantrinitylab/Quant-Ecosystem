// ============================================================================
// QuantAI - Training Page
// ============================================================================

import type { TrainingJob } from '../types';

interface TrainingPageProps {
  jobs: TrainingJob[];
  onStartTraining: () => void;
  onCancelJob: (id: string) => void;
}

export function TrainingPage(_props: Partial<TrainingPageProps>) {
  return null;
}

export default TrainingPage;
