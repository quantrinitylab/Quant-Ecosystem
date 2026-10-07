export type ActionType =
  | 'click'
  | 'type'
  | 'scroll'
  | 'navigate'
  | 'extract'
  | 'screenshot'
  | 'wait'
  | 'select';

export type BrowserAction =
  | { type: 'click'; selector: string; id?: string }
  | { type: 'type'; selector: string; text: string; id?: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number; id?: string }
  | { type: 'navigate'; url: string; id?: string }
  | { type: 'extract'; selector: string; id?: string }
  | { type: 'screenshot'; id?: string }
  | { type: 'wait'; ms: number; id?: string }
  | { type: 'select'; selector: string; value: string; id?: string };

export interface ActionResult {
  success: boolean;
  data?: unknown;
  screenshot?: string;
  error?: string;
}

export interface PageState {
  url: string;
  title: string;
  visibleText: string;
  formFields: FormField[];
  clickableElements: string[];
  screenshotUri?: string;
  extractedData?: Record<string, unknown>;
  domSummary: string;
}

export interface FormField {
  selector: string;
  type: string;
  name: string;
  value?: string;
}

export type SessionStatus = 'active' | 'closed';

export interface BrowserSession {
  id: string;
  userId: string;
  siteUrl: string;
  status: SessionStatus;
  actions: Array<{ action: BrowserAction; result: ActionResult }>;
  startedAt: number;
  lastActivityAt: number;
  cookies?: EncryptedCookieData;
}

export interface EncryptedCookieData {
  ciphertext: string;
  iv: string;
}

export interface SiteAuth {
  sitePattern: string;
  granted: boolean;
  grantedAt: number;
  grantedBy: string;
}

export interface SpendingCap {
  sessionLimit: number;
  currentSpend: number;
  currency: string;
}

export enum ActionTier {
  read_only = 'read_only',
  write = 'write',
  purchase = 'purchase',
}

export interface ReplayEntry {
  timestamp: number;
  action: BrowserAction;
  result: ActionResult;
  screenshotUri?: string;
}

export interface ActionSequence {
  actions: BrowserAction[];
  estimatedCost?: number;
}
