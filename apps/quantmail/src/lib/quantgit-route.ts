export const QUANTGIT_TABS = [
  'code',
  'issues',
  'pulls',
  'agents',
  'discussions',
  'actions',
  'projects',
  'security',
  'insights',
  'settings',
] as const;

export type QuantGitTab = (typeof QUANTGIT_TABS)[number];

export type QuantGitRoute =
  | { kind: 'quanty' }
  | { kind: 'repositories' }
  | { kind: 'agentlab' }
  | {
      kind: 'repo';
      owner: string;
      repo: string;
      tab: QuantGitTab;
    }
  | {
      kind: 'issue';
      owner: string;
      repo: string;
      number: number;
    }
  | {
      kind: 'pull';
      owner: string;
      repo: string;
      number: number;
    }
  | {
      kind: 'blob';
      owner: string;
      repo: string;
      branch: string;
      path: string;
    };

export type QuantGitNavigationOptions = {
  replace?: boolean;
  state?: Record<string, unknown>;
};

export const QUANTGIT_NAVIGATION_EVENT = 'quantgit:navigation';

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeSegment(value: string) {
  return encodeURIComponent(value);
}

function decodeRequiredSlug(value: string | undefined) {
  const decoded = safeDecode(value ?? '').trim();

  return decoded.length > 0 ? decoded : null;
}

function normalizePathname(pathname: string) {
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? '/';
  const prefixed = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;

  if (prefixed === '/') {
    return '/';
  }

  return prefixed.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
}

export function isQuantGitTab(value: string): value is QuantGitTab {
  return (QUANTGIT_TABS as readonly string[]).includes(value);
}

export function parseQuantGitRoute(pathname: string): QuantGitRoute {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);
  const root = segments[0]?.toLowerCase();

  if (root === 'codehub') {
    return { kind: 'quanty' };
  }

  if (root !== 'quantgit' || segments.length === 1) {
    return { kind: 'quanty' };
  }

  const firstSlug = safeDecode(segments[1] ?? '').toLowerCase();

  if (segments.length === 2 && firstSlug === 'repositories') {
    return { kind: 'repositories' };
  }

  if (segments.length === 2 && firstSlug === 'agentlab') {
    return { kind: 'agentlab' };
  }

  const owner = decodeRequiredSlug(segments[1]);
  const repo = decodeRequiredSlug(segments[2]);

  if (!owner || !repo) {
    return { kind: 'quanty' };
  }

  const action = safeDecode(segments[3] ?? '').toLowerCase();

  if (action === 'issues' && segments.length === 5 && /^\d+$/.test(segments[4] ?? '')) {
    return {
      kind: 'issue',
      owner,
      repo,
      number: Number(segments[4]),
    };
  }

  if (action === 'pulls' && segments.length === 5 && /^\d+$/.test(segments[4] ?? '')) {
    return {
      kind: 'pull',
      owner,
      repo,
      number: Number(segments[4]),
    };
  }

  if (action === 'blob' && segments.length >= 6) {
    const branch = decodeRequiredSlug(segments[4]);
    const path = segments.slice(5).map(safeDecode).join('/').trim();

    if (branch && path) {
      return {
        kind: 'blob',
        owner,
        repo,
        branch,
        path,
      };
    }
  }

  return {
    kind: 'repo',
    owner,
    repo,
    tab: isQuantGitTab(action) ? action : 'code',
  };
}

export function quantGitPath(route: QuantGitRoute): string {
  switch (route.kind) {
    case 'quanty':
      return '/quantgit';

    case 'repositories':
      return '/quantgit/repositories';

    case 'agentlab':
      return '/quantgit/agentlab';

    case 'repo': {
      const root = `/quantgit/${encodeSegment(route.owner)}/${encodeSegment(route.repo)}`;

      return route.tab === 'code' ? root : `${root}/${route.tab}`;
    }

    case 'issue':
      return `/quantgit/${encodeSegment(route.owner)}/${encodeSegment(
        route.repo,
      )}/issues/${route.number}`;

    case 'pull':
      return `/quantgit/${encodeSegment(route.owner)}/${encodeSegment(
        route.repo,
      )}/pulls/${route.number}`;

    case 'blob': {
      /*
       * Encoding the branch as one segment preserves branches such as
       * "feature/deep-links" as "feature%2Fdeep-links".
       */
      const encodedPath = route.path.split('/').filter(Boolean).map(encodeSegment).join('/');

      return `/quantgit/${encodeSegment(route.owner)}/${encodeSegment(
        route.repo,
      )}/blob/${encodeSegment(route.branch)}/${encodedPath}`;
    }
  }
}

export function routesEqual(left: QuantGitRoute, right: QuantGitRoute) {
  return quantGitPath(left) === quantGitPath(right);
}

export function readQuantGitRoute() {
  if (typeof window === 'undefined') {
    return { kind: 'quanty' } satisfies QuantGitRoute;
  }

  return parseQuantGitRoute(window.location.pathname);
}

export function navigateQuantGit(route: QuantGitRoute, options: QuantGitNavigationOptions = {}) {
  if (typeof window === 'undefined') {
    return;
  }

  const path = quantGitPath(route);
  const currentPath = normalizePathname(window.location.pathname);
  const replace = options.replace === true || currentPath === path;

  const historyState = {
    ...(window.history.state ?? {}),
    ...(options.state ?? {}),
    quantgit: route,
  };

  if (replace) {
    window.history.replaceState(historyState, '', path);
  } else {
    window.history.pushState(historyState, '', path);
  }

  window.dispatchEvent(
    new CustomEvent<QuantGitRoute>(QUANTGIT_NAVIGATION_EVENT, {
      detail: route,
    }),
  );
}

export function replaceQuantGitRoute(route: QuantGitRoute) {
  navigateQuantGit(route, { replace: true });
}

export function subscribeToQuantGitRoute(listener: (route: QuantGitRoute) => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handlePopState = () => {
    listener(parseQuantGitRoute(window.location.pathname));
  };

  const handleNavigation = (event: Event) => {
    const navigationEvent = event as CustomEvent<QuantGitRoute>;

    listener(navigationEvent.detail ?? parseQuantGitRoute(window.location.pathname));
  };

  window.addEventListener('popstate', handlePopState);
  window.addEventListener(QUANTGIT_NAVIGATION_EVENT, handleNavigation as EventListener);

  return () => {
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener(QUANTGIT_NAVIGATION_EVENT, handleNavigation as EventListener);
  };
}
