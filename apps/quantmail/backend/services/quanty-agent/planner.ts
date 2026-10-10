/**
 * quanty-agent/planner.ts — Natural-language command → ordered plan of tool steps.
 *
 * The QuantyPlanner interface is the seam: RuleBasedPlanner handles the common
 * commands today; an LLM-backed planner implementing the same interface can be
 * swapped in via createPlanner('llm') without touching the executor or routes.
 */

import { randomUUID } from 'node:crypto';
import type { QuantyStep, QuantyTool } from './types';
import { listTools } from './tool-registry';

/** A step before ids/status are assigned. */
export interface PlannedStep {
  toolName: string;
  label: string;
  args: Record<string, unknown>;
}

/** What plan() returns. */
export interface QuantyPlan {
  /** Human-readable summary shown to the user before/during execution. */
  summary: string;
  steps: PlannedStep[];
  /** True when the command could not be understood — executor reports it. */
  unmatched: boolean;
}

/** Planner seam — implement this to add an LLM planner later. */
export interface QuantyPlanner {
  plan(command: string): QuantyPlan;
}

/** Normalize a command for rule matching. */
function normalize(command: string): string {
  return command.toLowerCase().replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Rule {
  /** Keywords; all must appear (in any order) for the rule to fire. */
  match: string[];
  summary: string;
  steps: PlannedStep[];
  /**
   * Optional: build the step args from the raw command (used by rules that
   * carry a free-text argument, e.g. the drive search query or file name).
   * Applied to every step of the rule when it fires.
   */
  argsFrom?: (command: string) => Record<string, unknown>;
  /**
   * Optional narrowness gate: evaluated on the raw command after the keyword
   * match. Lets a deliberately broad rule (e.g. `add`, which also prefixes
   * `address`) fire only when the command actually carries what the tool
   * needs (e.g. an email-shaped token) instead of planning against garbage.
   */
  guard?: (command: string) => boolean;
}

/** Words that carry no meaning in a drive command; stripped before arg extraction. */
const DRIVE_STOPWORDS = new Set([
  'find', 'search', 'read', 'files', 'file', 'summarize', 'summary', 'organize', 'organise',
  'where', 'should', 'does', 'go', 'move', 'my', 'me', 'for', 'the', 'a', 'an',
  'about', 'named', 'called', 'to', 'its', 'their', 'folder', 'please',
]);

/** Everything left after removing trigger/stop words — the search query or file name. */
function driveArgRemainder(command: string): string {
  // NOTE: works on the raw command (not normalize()), because normalize()
  // strips punctuation and would turn "notes.txt" into "notes txt".
  const remainder = command
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !DRIVE_STOPWORDS.has(w.replace(/[?!.,]+$/g, '')))
    .join(' ')
    .trim();
  return remainder.replace(/[?!.,]+$/g, '');
}

/** Words that carry no meaning in a git command; stripped before arg extraction. */
const GIT_STOPWORDS = new Set([
  'show', 'list', 'summarize', 'summary', 'my', 'me', 'for', 'the', 'a', 'an',
  'in', 'of', 'on', 'to', 'all', 'open', 'closed', 'merged',
  'pr', 'prs', 'pull', 'request', 'requests', 'repo', 'repos', 'repository',
  'repositories', 'please', 'about', 'number',
]);

/** Everything left after removing trigger/stop words — the repo name (and PR number). */
function gitArgRemainder(command: string): string {
  return command
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !GIT_STOPWORDS.has(w.replace(/[?!.,]+$/g, '')))
    .join(' ')
    .trim()
    .replace(/[?!.,]+$/g, '');
}

/**
 * The commands the rule-based planner understands. Each rule is deliberately
 * narrow — unknown commands fall through to the unmatched plan instead of
 * guessing a destructive action.
 */
const RULES: Rule[] = [  {
    match: ['archive', 'unread'],
    summary: 'Archive all unread emails',
    steps: [{ toolName: 'mail.archiveUnread', label: 'Archiving unread emails', args: {} }],
  },
  {
    match: ['mark', 'read'],
    summary: 'Mark all emails as read',
    steps: [{ toolName: 'mail.markAllRead', label: 'Marking everything as read', args: {} }],
  },
  {
    match: ['star', 'important'],
    summary: 'Star important emails',
    steps: [{ toolName: 'mail.starImportant', label: 'Starring important emails', args: { limit: 10 } }],
  },
  {
    match: ['summarize', 'latest'],
    summary: 'Summarize the latest unread thread',
    steps: [{ toolName: 'mail.summarizeLatest', label: 'Summarizing latest thread', args: {} }],
  },
  {
    match: ['clean', 'inbox'],
    summary: 'Clean inbox: archive unread mail, then mark the rest read',
    steps: [
      { toolName: 'mail.archiveUnread', label: 'Archiving unread emails', args: {} },
      { toolName: 'mail.markAllRead', label: 'Marking everything as read', args: {} },
    ],
  },
  {
    match: ['delete', 'spam'],
    summary: 'Delete spam (asks for confirmation first)',
    steps: [{ toolName: 'mail.deleteSpam', label: 'Deleting spam', args: {} }],
  },
  {
    match: ['list', 'repos'],
    summary: 'List repositories',
    steps: [{ toolName: 'git.listRepos', label: 'Listing repositories', args: {} }],
  },
  // Git tools (most useful read-only ones only): open PRs and PR summaries.
  // Destructive git tools (merge_pr, create_repo) have NO rules — they stay
  // reachable only via explicit tool paths, never casual NL.
  {
    match: ['open', 'prs'],
    summary: 'Show open pull requests',
    steps: [{ toolName: 'git.listPrs', label: 'Listing open pull requests', args: {} }],
    argsFrom: (command) => ({ repo: gitArgRemainder(command), state: 'open' }),
  },
  {
    match: ['summarize', 'pr'],
    summary: 'Summarize a pull request',
    steps: [{ toolName: 'git.summarizePr', label: 'Summarizing pull request', args: {} }],
    argsFrom: (command) => {
      const remainder = gitArgRemainder(command);
      const prNumber = Number(remainder.match(/\d+/)?.[0]);
      const repo = remainder.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
      return { repo, prNumber };
    },
  },
  // Drive tools (QM-M39-011): Quanty file workspace commands. Each rule
  // targets a REAL registered drive.* tool; the free-text remainder of the
  // command becomes the query / file name. Empty remainders surface as honest
  // tool errors, never guesses.
  {
    match: ['find', 'file'],
    summary: 'Find files in Drive',
    steps: [{ toolName: 'drive.searchFiles', label: 'Searching Drive files', args: {} }],
    argsFrom: (command) => ({ query: driveArgRemainder(command) }),
  },
  {
    match: ['search', 'file'],
    summary: 'Search files in Drive',
    steps: [{ toolName: 'drive.searchFiles', label: 'Searching Drive files', args: {} }],
    argsFrom: (command) => ({ query: driveArgRemainder(command) }),
  },
  {
    match: ['summarize', 'file'],
    summary: 'Summarize a Drive file',
    steps: [{ toolName: 'drive.summarizeFile', label: 'Summarizing file', args: {} }],
    argsFrom: (command) => ({ fileName: driveArgRemainder(command) }),
  },
  {
    match: ['read', 'file'],
    summary: 'Read a Drive file\'s contents',
    steps: [{ toolName: 'drive.readFile', label: 'Reading file', args: {} }],
    argsFrom: (command) => ({ fileName: driveArgRemainder(command) }),
  },
  {
    match: ['where', 'should', 'go'],
    summary: 'Suggest a destination folder',
    steps: [{ toolName: 'drive.suggestDestination', label: 'Finding the best folder', args: {} }],
    argsFrom: (command) => ({ fileName: driveArgRemainder(command) }),
  },
  {
    match: ['organize', 'file'],
    summary: 'Suggest a destination folder',
    steps: [{ toolName: 'drive.suggestDestination', label: 'Finding the best folder', args: {} }],
    argsFrom: (command) => ({ fileName: driveArgRemainder(command) }),
  },
  {
    match: ['move', 'folder'],
    summary: 'Move a file to its suggested folder (asks for confirmation first)',
    steps: [{ toolName: 'drive.organizeFile', label: 'Moving file to suggested folder', args: {} }],
    argsFrom: (command) => ({ fileName: driveArgRemainder(command) }),
  },
  // Contacts tools: real ContactService-backed tools (search, add). Rules stay
  // narrow and keyword-based; get/update take a contactId, which has no
  // reliable NL form, so they are left to the LLM planner rather than guessed.
  {
    match: ['find', 'contact'],
    summary: 'Find a contact',
    steps: [{ toolName: 'contacts.searchContacts', label: 'Searching contacts', args: {} }],
    argsFrom: (command) => ({ q: contactsArgRemainder(command) }),
  },
  {
    match: ['search', 'contact'],
    summary: 'Search contacts',
    steps: [{ toolName: 'contacts.searchContacts', label: 'Searching contacts', args: {} }],
    argsFrom: (command) => ({ q: contactsArgRemainder(command) }),
  },
  {
    match: ['add'],
    summary: 'Add a contact (asks for confirmation first)',
    steps: [{ toolName: 'contacts.addContact', label: 'Adding contact', args: {} }],
    argsFrom: parseAddContactArgs,
    // `add` also prefixes `address`/`added` — require an email-shaped token so
    // "show my address book" and friends fall through to unmatched instead of
    // planning a contact add against garbage.
    guard: (command) => EMAIL_TOKEN_RE.test(command),
  },
];

/** Words that carry no meaning in a contacts command; stripped before arg extraction. */
const CONTACTS_STOPWORDS = new Set([
  'find', 'search', 'contact', 'contacts', 'add', 'new', 'create',
  'my', 'me', 'for', 'the', 'a', 'an', 'about', 'named', 'called',
  'with', 'please', 'show', 'get', 'details', 'detail', 'info', 'of', 'to',
]);

/** An email-shaped token, e.g. priya@example.com — used by the add-contact guard. */
const EMAIL_TOKEN_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/** Everything left after removing trigger/stop words — the contacts search query. */
function contactsArgRemainder(command: string): string {
  // NOTE: works on the raw command (not normalize()), like driveArgRemainder,
  // so queries keep their punctuation.
  const remainder = command
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !CONTACTS_STOPWORDS.has(w.replace(/[?!.,]+$/g, '')))
    .join(' ')
    .trim();
  return remainder.replace(/[?!.,]+$/g, '');
}

/**
 * Parse "add Priya Sharma, priya@example.com" into add_contact args:
 * the email-shaped token becomes `email`, everything else that is not a
 * trigger/stop word becomes the name. A phone-only command has no reliable
 * shape, so phone stays empty and the tool honestly errors asking for one —
 * never a guess.
 */
function parseAddContactArgs(command: string): Record<string, unknown> {
  const emailMatch = command.match(EMAIL_TOKEN_RE);
  const email = emailMatch ? emailMatch[0] : '';
  const name = command
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.replace(/[,;?!."']+$/g, '').replace(/^["']+/g, ''))
    .filter((w) => {
      if (!w) return false;
      if (email && w === email.toLowerCase()) return false;
      return !CONTACTS_STOPWORDS.has(w);
    })
    .join(' ')
    .trim();
  return email ? { name, email } : { name };
}

/**
 * Rule-based planner: keyword matching over the commands above. Every rule
 * targets a REAL registered tool; calendar commands are deliberately absent —
 * those tools don't exist yet, so the planner honestly says it couldn't
 * understand rather than planning against a stub.
 */
export class RuleBasedPlanner implements QuantyPlanner {
  plan(command: string): QuantyPlan {
    const norm = ` ${normalize(command)} `;
    for (const rule of RULES) {
      const hits = rule.match.every((kw) => norm.includes(` ${kw}`));
      if (hits && (!rule.guard || rule.guard(command))) {
        const steps = rule.argsFrom
          ? rule.steps.map((s) => ({ ...s, args: rule.argsFrom!(command) }))
          : rule.steps;
        return { summary: rule.summary, steps, unmatched: false };
      }
    }
    return {
      summary: `I couldn't understand "${command}". Try: archive unread, mark all read, star important, summarize latest, clean inbox, delete spam, list repos, show open PRs in <repo>, summarize PR <n> in <repo>, find files <query>, read file <name>, summarize file <name>, where should <name> go, organize file <name>, move <name> to its folder, find <name>'s contact, search contacts <query>, add <name>, <email>.`,
      summary: `I couldn't understand "${command}". Try: archive unread, mark all read, star important, summarize latest, clean inbox, delete spam, list repos, find files <query>, summarize file <name>, where should <name> go, organize file <name>, move <name> to its folder, find <name>'s contact, search contacts <query>, add <name>, <email>.`,
      steps: [],
      unmatched: true,
    };
  }
}

/**
 * LLM planner placeholder. Implements the interface so call sites never branch
 * on planner kind; today it delegates to the rule-based planner and is honest
 * about it. Wire a real model call here in the next phase.
 */
export class LlmPlanner implements QuantyPlanner {
  private fallback = new RuleBasedPlanner();
  plan(command: string): QuantyPlan {
    // TODO(llm-planner): call the model with listTools() as function schemas.
    return this.fallback.plan(command);
  }
}

/** Factory — the seam every caller uses. */
export function createPlanner(kind: 'rule' | 'llm' = 'rule'): QuantyPlanner {
  return kind === 'llm' ? new LlmPlanner() : new RuleBasedPlanner();
}

/**
 * Attach ids + pending status to planned steps, validating that every tool
 * exists in the registry. Unknown tool names are a planner bug — fail loudly.
 */
export function materializeSteps(plan: QuantyPlan, available?: QuantyTool[]): QuantyStep[] {
  const tools = available ?? listTools();
  const byName = new Map(tools.map((t) => [t.name, t]));
  return plan.steps.map((s) => {
    const tool = byName.get(s.toolName);
    if (!tool) {
      throw new Error(`Planner produced unknown tool "${s.toolName}"`);
    }
    return {
      id: randomUUID(),
      toolName: s.toolName,
      label: s.label,
      args: s.args,
      status: 'pending' as const,
      // The frontend consent UI ("Haan, karo" / "Rehne do") reads this
      // straight off the step — no extra registry round-trip needed.
      destructive: tool.destructive === true,
    };
  });
}
