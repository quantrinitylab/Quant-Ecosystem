// ============================================================================
// @quant/shared-ui - Advanced State Management System
// ============================================================================

import {
  Store,
  Action,
  Reducer,
  Selector,
  Middleware,
  MiddlewareAPI,
  Dispatch,
  Unsubscribe,
  StateHistoryEntry,
  ThunkAction,
} from './types';

// Memoized selector cache
interface MemoizedSelector<S, R> {
  selector: Selector<S, R>;
  lastState: S | undefined;
  lastResult: R | undefined;
  dependencies: Selector<S, any>[];
  lastDepValues: any[];
}

// Shallow equality check for memoization
function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// Compose middleware functions
function composeMiddleware(...middlewares: Function[]): Function {
  if (middlewares.length === 0) return (arg: any) => arg;
  if (middlewares.length === 1) return middlewares[0]!;
  return middlewares.reduce(
    (a, b) =>
      (...args: any[]) =>
        a(b(...args)),
  );
}

// Built-in thunk middleware for async actions
export function thunkMiddleware<S>(): Middleware<S> {
  return (api: MiddlewareAPI<S>) => (next: Dispatch) => (action: any) => {
    if (typeof action === 'function') {
      return action(api.dispatch, api.getState);
    }
    return next(action);
  };
}

// Built-in logger middleware
export function loggerMiddleware<S>(): Middleware<S> {
  return (api: MiddlewareAPI<S>) => (next: Dispatch) => (action: Action) => {
    const prevState = api.getState();
    const result = next(action);
    const nextState = api.getState();
    const logEntry = {
      action: action.type,
      payload: action.payload,
      prevState,
      nextState,
      timestamp: Date.now(),
    };
    if (typeof console !== 'undefined' && globalThis.console.groupCollapsed) {
      globalThis.console.groupCollapsed(`Action: ${action.type}`);
      globalThis.console.log('Previous State:', logEntry.prevState);
      globalThis.console.log('Action:', action);
      globalThis.console.log('Next State:', logEntry.nextState);
      globalThis.console.groupEnd();
    }
    return result;
  };
}

// Combine multiple reducers into one
export function combineReducers<S extends Record<string, any>>(reducers: {
  [K in keyof S]: Reducer<S[K]>;
}): Reducer<S> {
  const reducerKeys = Object.keys(reducers) as (keyof S)[];
  return (state: S, action: Action): S => {
    let hasChanged = false;
    const nextState = {} as S;
    for (let i = 0; i < reducerKeys.length; i++) {
      const key = reducerKeys[i]!;
      const reducer = reducers[key];
      const previousStateForKey = state[key];
      const nextStateForKey = reducer(previousStateForKey, action);
      nextState[key] = nextStateForKey;
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey;
    }
    hasChanged = hasChanged || reducerKeys.length !== Object.keys(state).length;
    return hasChanged ? nextState : state;
  };
}

// Create a memoized selector with dependency tracking
export function createSelector<S, R>(
  dependencies: Selector<S, any>[],
  resultFn: (...args: any[]) => R,
): Selector<S, R> {
  let lastArgs: any[] | null = null;
  let lastResult: R | undefined;
  return (state: S): R => {
    const currentArgs = dependencies.map((dep) => dep(state));
    if (lastArgs !== null) {
      let allEqual = true;
      for (let i = 0; i < currentArgs.length; i++) {
        if (currentArgs[i] !== lastArgs[i]) {
          allEqual = false;
          break;
        }
      }
      if (allEqual) return lastResult!;
    }
    lastArgs = currentArgs;
    lastResult = resultFn(...currentArgs);
    return lastResult;
  };
}

// Action creator factory
export function createActionCreator<P = void>(type: string) {
  const actionCreator = (payload?: P): Action<string, P> => ({
    type,
    payload,
  });
  actionCreator.type = type;
  actionCreator.match = (action: Action): action is Action<string, P> => action.type === type;
  return actionCreator;
}

// Action types factory - creates action creators from a map
export function createActions<T extends Record<string, string>>(
  typeMap: T,
): { [K in keyof T]: (payload?: any) => Action } {
  const actions = {} as { [K in keyof T]: (payload?: any) => Action };
  for (const key of Object.keys(typeMap) as (keyof T)[]) {
    actions[key] = (payload?: any) => ({ type: typeMap[key] as string, payload });
  }
  return actions;
}

// Main store creation function
export function createStore<S>(
  reducer: Reducer<S>,
  initialState: S,
  middlewares: Middleware<S>[] = [],
): Store<S> {
  let currentState: S = initialState;
  let currentReducer: Reducer<S> = reducer;
  const listeners: Set<() => void> = new Set();
  let isDispatching = false;

  // Time-travel state history
  const history: StateHistoryEntry<S>[] = [
    {
      state: initialState,
      action: { type: '@@INIT' },
      timestamp: Date.now(),
    },
  ];
  let historyIndex = 0;
  const maxHistorySize = 100;

  function getState(): S {
    if (isDispatching) {
      throw new Error('Cannot call getState while dispatching');
    }
    return currentState;
  }

  function subscribe(listener: () => void): Unsubscribe {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function notifyListeners(): void {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        // Listener errors should not break the store
      }
    });
  }

  function baseDispatch(action: Action): Action {
    if (typeof action.type === 'undefined') {
      throw new Error('Actions must have a type property');
    }
    if (isDispatching) {
      throw new Error('Reducers may not dispatch actions');
    }
    try {
      isDispatching = true;
      currentState = currentReducer(currentState, action);
    } finally {
      isDispatching = false;
    }

    // Record in history for time-travel
    if (history.length > historyIndex + 1) {
      history.splice(historyIndex + 1);
    }
    history.push({
      state: currentState,
      action,
      timestamp: Date.now(),
    });
    if (history.length > maxHistorySize) {
      history.shift();
    } else {
      historyIndex++;
    }

    notifyListeners();
    return action;
  }

  // Apply middleware chain
  let dispatch: Dispatch = baseDispatch as unknown as Dispatch;
  if (middlewares.length > 0) {
    const middlewareAPI: MiddlewareAPI<S> = {
      getState,
      dispatch: (action: any) => dispatch(action),
    };
    const chain = middlewares.map((middleware) => middleware(middlewareAPI));
    dispatch = composeMiddleware(...chain)(baseDispatch) as Dispatch;
  }

  function replaceReducer(nextReducer: Reducer<S>): void {
    currentReducer = nextReducer;
    dispatch({ type: '@@REPLACE' });
  }

  function getHistory(): StateHistoryEntry<S>[] {
    return [...history];
  }

  function jumpToState(index: number): void {
    if (index < 0 || index >= history.length) {
      throw new Error(`Invalid history index: ${index}`);
    }
    historyIndex = index;
    currentState = history[index]!.state;
    notifyListeners();
  }

  return {
    dispatch,
    getState,
    subscribe,
    replaceReducer,
    getHistory,
    jumpToState,
  };
}

// StateManager class - higher-level API wrapping the store
export class StateManager<S extends Record<string, any> = Record<string, any>> {
  private store: Store<S>;
  private selectorCache: Map<string, MemoizedSelector<S, any>> = new Map();
  private actionLog: Array<{ action: Action; timestamp: number }> = [];
  private devToolsEnabled: boolean = false;

  constructor(
    reducer: Reducer<S>,
    initialState: S,
    options: {
      middlewares?: Middleware<S>[];
      enableDevTools?: boolean;
      enableThunk?: boolean;
      enableLogger?: boolean;
    } = {},
  ) {
    const middlewares: Middleware<S>[] = [];
    if (options.enableThunk !== false) {
      middlewares.push(thunkMiddleware<S>());
    }
    if (options.enableLogger) {
      middlewares.push(loggerMiddleware<S>());
    }
    if (options.middlewares) {
      middlewares.push(...options.middlewares);
    }
    this.devToolsEnabled = options.enableDevTools || false;
    this.store = createStore(reducer, initialState, middlewares);
  }

  dispatch(action: Action | ThunkAction<S>): any {
    if (this.devToolsEnabled && typeof action === 'object') {
      this.actionLog.push({ action: action as Action, timestamp: Date.now() });
    }
    return this.store.dispatch(action as any);
  }

  getState(): S {
    return this.store.getState();
  }

  subscribe(listener: () => void): Unsubscribe {
    return this.store.subscribe(listener);
  }

  select<R>(selector: Selector<S, R>): R {
    return selector(this.store.getState());
  }

  createMemoizedSelector<R>(
    id: string,
    dependencies: Selector<S, any>[],
    resultFn: (...args: any[]) => R,
  ): Selector<S, R> {
    const selector = createSelector(dependencies, resultFn);
    this.selectorCache.set(id, {
      selector,
      lastState: undefined,
      lastResult: undefined,
      dependencies,
      lastDepValues: [],
    });
    return selector;
  }

  // Subscribe to specific state slice changes
  subscribeToSlice<R>(selector: Selector<S, R>, listener: (value: R) => void): Unsubscribe {
    let lastValue = selector(this.store.getState());
    return this.store.subscribe(() => {
      const newValue = selector(this.store.getState());
      if (!shallowEqual(lastValue, newValue)) {
        lastValue = newValue;
        listener(newValue);
      }
    });
  }

  // Batch multiple actions (single notification)
  batch(actions: Action[]): void {
    for (const action of actions) {
      this.store.dispatch(action);
    }
  }

  // Time-travel debugging
  getHistory(): StateHistoryEntry<S>[] {
    return this.store.getHistory();
  }

  jumpToState(index: number): void {
    this.store.jumpToState(index);
  }

  // DevTools data
  getActionLog(): Array<{ action: Action; timestamp: number }> {
    return [...this.actionLog];
  }

  getDevToolsState(): {
    currentState: S;
    actionLog: Array<{ action: Action; timestamp: number }>;
    history: StateHistoryEntry<S>[];
    selectorCount: number;
  } {
    return {
      currentState: this.getState(),
      actionLog: this.getActionLog(),
      history: this.getHistory(),
      selectorCount: this.selectorCache.size,
    };
  }

  // Reset store to initial state
  reset(initialState: S): void {
    this.store.dispatch({ type: '@@RESET', payload: initialState });
    this.actionLog = [];
  }

  destroy(): void {
    this.selectorCache.clear();
    this.actionLog = [];
  }
}

export default StateManager;
