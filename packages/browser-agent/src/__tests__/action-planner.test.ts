import { ActionPlanner } from '../planner/action-planner.js';
import type { ActionPlannerStrategy, ReplanContext } from '../planner/action-planner.js';
import type { PageState } from '../types.js';

const mockState: PageState = {
  url: 'https://example.com',
  title: 'Test',
  visibleText: 'hello',
  formFields: [],
  clickableElements: ['#btn'],
  domSummary: 'test',
};
const mockStrategy = (n: number): ActionPlannerStrategy => ({
  generatePlan: async () => ({
    actions: Array.from({ length: n }, (_, i) => ({ type: 'click' as const, selector: `#b${i}` })),
    estimatedCost: n * 0.01,
  }),
});

describe('ActionPlanner', () => {
  it('plan returns action sequence for a goal', async () => {
    const planner = new ActionPlanner({ maxActions: 10, retryLimit: 3 }, mockStrategy(1));
    const seq = await planner.plan('click button', mockState);
    expect(seq.actions).toHaveLength(1);
    expect(seq.estimatedCost).toBeGreaterThan(0);
  });

  it('replan produces a new sequence after failure', async () => {
    const planner = new ActionPlanner({ maxActions: 10, retryLimit: 3 }, mockStrategy(1));
    const seq = await planner.replan(
      'retry',
      mockState,
      { type: 'click', selector: '#x' },
      'not found',
    );
    expect(seq.actions).toHaveLength(1);
  });

  it('replan passes failure context to strategy', async () => {
    let receivedContext: ReplanContext | undefined;
    const strategy: ActionPlannerStrategy = {
      generatePlan: async (_goal, _state, context) => {
        receivedContext = context;
        return { actions: [{ type: 'click', selector: '#alt' }], estimatedCost: 0.01 };
      },
    };
    const planner = new ActionPlanner({ maxActions: 10, retryLimit: 3 }, strategy);
    await planner.replan('retry', mockState, { type: 'click', selector: '#x' }, 'element missing');
    expect(receivedContext).toBeDefined();
    expect(receivedContext!.failedAction).toEqual({ type: 'click', selector: '#x' });
    expect(receivedContext!.error).toBe('element missing');
  });

  it('maxActions limit stops planning', async () => {
    const planner = new ActionPlanner({ maxActions: 1, retryLimit: 3 }, mockStrategy(2));
    const seq = await planner.plan('do stuff', mockState);
    expect(seq.actions).toHaveLength(1);
    const seq2 = await planner.plan('more', mockState);
    expect(seq2.actions).toHaveLength(0);
  });

  it('tracks totalActionsExecuted', async () => {
    const planner = new ActionPlanner({ maxActions: 5, retryLimit: 3 }, mockStrategy(1));
    await planner.plan('go', mockState);
    expect(planner.executed).toBe(1);
  });
});
