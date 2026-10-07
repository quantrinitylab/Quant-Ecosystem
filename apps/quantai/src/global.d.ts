import type { JSX } from 'react';

declare global {
  // Re-export JSX namespace for React 19 compatibility with legacy code
  // that references the global JSX.Element type
  export { JSX };
}
