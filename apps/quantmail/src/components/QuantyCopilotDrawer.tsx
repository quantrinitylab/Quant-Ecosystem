'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quanty } from './Quanty';
import { quantyReact, useQuantyMood } from '../lib/quanty/reactions';
import { showToast } from './InboxToast';
import { IconX } from './icons';
import { browserAuthSession } from '../services/browser-auth-session';
import { readAIIntent, clientTimeoutForIntent } from '../lib/ai-intent-preference';
import type { Email } from '../types';

export interface QuantyEmailAction {
  to?: string;
  subject?: string;
  greeting?: string;
  opening?: string;
  body?: string;
  closing?: string;
  signoff?: string;
  senderName?: string;
}

export interface QuantyAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contextEmail?: Email | null;
  contextThreadSubject?: string;
  /**
   * What the user is looking at, in a phrase Quanty can read — "Browsing the
   * primary inbox", "Looking at the calendar". This used to be a single
   * `isInboxContext` boolean, which meant exactly one of QuantMail's twenty-odd
   * surfaces could say where it was and every other one opened an assistant
   * that had been told nothing. A string costs the same and scales.
   *
   * Ignored while `contextEmail`/`contextThreadSubject` are set: an open message
   * is a more specific answer to the same question.
   */
  viewLabel?: string;
  isComposeContext?: boolean;
  onInsertReply?: (text: string) => void;
  onApplyAction?: (action: QuantyEmailAction) => void;
}

interface ChatHistoryItem {
  id: string;
  date: string;
  preview: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
}

export function parseEmailActionFromText(text: string): QuantyEmailAction {
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const subjectMatch = text.match(/Subject:\s*([^\n]+)/i);
  const greetingMatch = text.match(/^(Dear\s+[^,\n]+,|Hi\s+[^,\n]+,|Hello\s+[^,\n]+,)/im);
  const closingMatch = text.match(
    /(Thank you for your time\.|Looking forward to hearing from you\.|Thanks\.|Best regards|Sincerely)[^\n]*/i,
  );

  const cleanBody = text
    .replace(/^Subject:.*$/im, '')
    .replace(/^(Dear|Hi|Hello)[^\n]+,\s*/im, '')
    .replace(/(Best regards|Sincerely|Thanks|Warm regards)[,\s\S]*$/im, '')
    .trim();

  return {
    to: emailMatch ? emailMatch[1] : undefined,
    subject: subjectMatch ? subjectMatch[1].trim() : undefined,
    greeting: greetingMatch ? greetingMatch[1].trim() : undefined,
    body: cleanBody || text,
    closing: closingMatch ? closingMatch[0].trim() : undefined,
  };
}

const STORAGE_KEY = 'quantmail_quanty_chats_v1';

/*
 * ─── Talking to the model ──────────────────────────────────────────────────────
 *
 * This drawer used to POST to `/api/ai/chat` with a bare `fetch` and a
 * hand-rolled `{role: 'system'}` message. Both halves of that were wrong, and
 * they failed in an order that hid each other:
 *
 *   1. `chatSchema` in `backend/routes/ai-chat.ts` types a message role as
 *      `z.enum(['user', 'assistant'])`. A `system` role failed `safeParse`, so
 *      the route threw a 400 *before* it ever looked at the caller's identity.
 *   2. Underneath that, the request carried no `Authorization` header at all, so
 *      even a schema-clean body would have been answered 401 — the route reads
 *      `request.auth?.userId` and throws `UNAUTHORIZED` without it.
 *
 * So the request could never succeed, from any surface, ever. And because the
 * old code treated `!res.ok` as "improvise", every Quanty answer in the product
 * was a canned string written in this file — including "I've analyzed this
 * conversation. Everything looks in order.", asserted about an email no model
 * had read. In compose context it went further and wrote that fabrication into
 * the user's draft, then toasted "Quanty updated your email draft".
 *
 * The fix is the pattern `MailCopilot` and QuantGit's build chat already use:
 * `authenticatedFetch` (bearer token, plus one refresh-and-retry on a 401), and
 * the backend's own `context` object instead of a fake system turn. Every field
 * the old prompt string was smuggling — subject, sender, body, which surface the
 * user is on — has a real slot in `chatSchema.context`, and the backend composes
 * the system prompt itself. A client should not be authoring one.
 */

/*
 * The 45 s timeout that used to live here was a hand-written number sitting next
 * to a provider default of 40 s — a 5 s margin nobody had written down, and one
 * that would have aborted the Deep tier (75 s) at the client while the server was
 * still legitimately working. `clientTimeoutForIntent` derives the wait from the
 * same tier table the backend resolves against, so the two cannot drift.
 */

/** Transient by nature: a retry is a reasonable thing to offer the user. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

/** Backend caps: `messages` max 24, each `content` max 6000 chars. */
const MAX_TURNS = 12;
const MAX_CONTENT = 6000;

const clamp = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * A failed round trip, stated rather than papered over. Kept out of `messages`
 * on purpose: an error rendered as an assistant bubble would be saved into chat
 * history and read back later as something Quanty said.
 */
interface ChatFailure {
  title: string;
  detail: string;
  retryable: boolean;
}

type ChatTurn = { role: 'user' | 'assistant'; text: string };

type ChatResult = { ok: true; message: string } | { ok: false; failure: ChatFailure };

/**
 * Shape a transcript into a history a provider will accept.
 *
 * `chatSchema` only bounds the count, but the models behind it expect roles to
 * alternate and to start on a `user` turn, and two things here break that:
 *
 *  - A failed turn leaves the user's prompt on screen with nothing after it, so
 *    their *next* prompt makes two `user` messages in a row. Folding them into
 *    one is what two stacked user bubbles already mean on screen, and it stops a
 *    single transient failure from wedging the conversation permanently.
 *  - `slice(-12)` of an odd-length history lands on an `assistant` turn — at 13
 *    turns, which is an ordinary afternoon, not an edge case.
 *
 * Fold first, then trim, then drop a leading answer: trimming first could cut
 * between two turns that were about to merge.
 */
function buildHistory(turns: ChatTurn[]): { role: 'user' | 'assistant'; content: string }[] {
  const folded = turns.reduce<ChatTurn[]>((acc, turn) => {
    const previous = acc[acc.length - 1];
    if (previous && previous.role === turn.role) {
      acc[acc.length - 1] = { role: previous.role, text: `${previous.text}\n\n${turn.text}` };
      return acc;
    }
    acc.push(turn);
    return acc;
  }, []);

  const recent = folded.slice(-MAX_TURNS);
  const start = recent[0]?.role === 'assistant' ? 1 : 0;

  return recent
    .slice(start)
    .map((turn) => ({ role: turn.role, content: clamp(turn.text, MAX_CONTENT) }));
}

/** One round trip, with a hard timeout so the sheet can never spin forever. */
async function requestQuanty(
  turns: ChatTurn[],
  context: Record<string, string>,
): Promise<ChatResult> {
  // Read at send time, not at mount: changing the preference in the settings tab
  // then coming back here should take effect without a remount.
  const intent = readAIIntent();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clientTimeoutForIntent(intent));

  try {
    const response = await browserAuthSession.authenticatedFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages: buildHistory(turns),
        intent,
        ...(Object.keys(context).length > 0 ? { context } : {}),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: { message?: string };
      error?: { code?: string; message?: string };
    } | null;

    if (response.ok && payload?.success && payload.data?.message) {
      return { ok: true, message: payload.data.message };
    }

    if (response.status === 401) {
      // `authenticatedFetch` has already tried one silent refresh by this point.
      return {
        ok: false,
        failure: {
          title: 'Session expired',
          detail: 'Sign in again to keep chatting with Quanty.',
          retryable: false,
        },
      };
    }

    if (payload?.error?.code === 'AI_UNAVAILABLE') {
      // The backend answers 503 `AI_UNAVAILABLE` both when the provider is
      // unconfigured (permanent) and when a live call to it failed (transient),
      // so this cannot branch on the status. It offers a retry and lets the
      // backend's own wording carry the difference.
      return {
        ok: false,
        failure: {
          title: 'Quanty is unavailable',
          detail:
            payload.error.message ?? 'The assistant is not configured on this environment yet.',
          retryable: true,
        },
      };
    }

    if (response.ok) {
      // A 2xx that carries no message is a contract violation, not an answer.
      // Reachable in production: the API proxy only rejects a non-JSON body, so
      // any well-formed envelope with the wrong shape inside arrives here intact.
      // Saying "replied 200" would be true and useless, so this names the fault.
      return {
        ok: false,
        failure: {
          title: 'Quanty answered with nothing',
          detail: 'The assistant service returned an empty reply. Nothing was sent to your draft.',
          retryable: true,
        },
      };
    }

    return {
      ok: false,
      failure: {
        title: 'Quanty could not answer',
        detail:
          payload?.error?.message ??
          `The assistant service replied ${response.status}. Nothing was sent to your draft.`,
        retryable: RETRYABLE_STATUS.has(response.status),
      },
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      failure: aborted
        ? {
            title: 'Quanty took too long',
            detail: 'The request timed out after 45 seconds. Try a shorter prompt.',
            retryable: true,
          }
        : {
            title: 'Could not reach Quanty',
            detail: 'Check your connection and try again.',
            retryable: true,
          },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function QuantyCopilotDrawer({
  isOpen,
  onClose,
  contextEmail,
  contextThreadSubject,
  viewLabel,
  isComposeContext = false,
  onInsertReply,
  onApplyAction,
}: QuantyAssistantDrawerProps) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  /**
   * Deliberately not cleared when the drawer closes. A failed turn leaves the
   * user's own prompt as the last thing in the transcript, so on reopening,
   * dropping the banner would show an unanswered question with no explanation
   * and no way to retry it. It is cleared where it genuinely goes stale: at the
   * top of every turn, and in `loadChat`, which swaps the transcript underneath
   * it for a different conversation.
   */
  const [failure, setFailure] = useState<ChatFailure | null>(null);

  /*
   * The drawer's face, and it is no longer the drawer's alone.
   *
   * This was a five-member local union — `'idle' | 'happy' | 'thinking' | 'wink' | 'shock'`
   * — set at three points inside `runTurn`. Two things were wrong with that. It resolved to
   * `happy` between turns, and `happy` is the `arch` eye: a ∩ stroked rather than filled,
   * which at 22–28px is indistinguishable from a shut lid, so the assistant sat there with
   * its eyes apparently closed. And the state was private, so the header trigger two
   * components up — the only Quanty a session is guaranteed to see — knew nothing about the
   * request this drawer was running.
   *
   * Now `runTurn` announces on the bus and every mounted Quanty hears it. `ai:answered`
   * holds `proud` for 1.4s and then decays to `idle`, the open capsule eye — an answer that
   * lands should be a beat, not a permanent grin.
   *
   * `isLoading` is a backstop and nothing more. The `ai:thinking` latch caps at 25s while
   * `clientTimeoutForIntent` can be longer, so a slow intent could otherwise decay to
   * resting while its request is still in flight. Gating on `mood === 'idle'` means the
   * backstop only fires in exactly that case — an unconditional override would hide
   * `determined` on a retry, which is the one face this component asks for by name.
   */
  const mood = useQuantyMood({ channels: ['ai', 'mail', 'sys'] });
  const quantyExpression = isLoading && mood === 'idle' ? 'thinking' : mood;

  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [historyList, setHistoryList] = useState<ChatHistoryItem[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHistoryList(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      setShowHistoryMenu(false);
    } else {
      setShowHistoryMenu(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (messages.length > 0 || failure) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading, failure]);

  const saveCurrentConversation = (newMsgs: ChatTurn[]) => {
    if (newMsgs.length < 2) return;
    try {
      const firstUserMsg = newMsgs.find((m) => m.role === 'user')?.text || 'Conversation';
      const newItem: ChatHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        preview: firstUserMsg.slice(0, 45),
        messages: newMsgs,
      };
      const updated = [newItem, ...historyList.filter((h) => h.preview !== newItem.preview)].slice(
        0,
        15,
      );
      setHistoryList(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  /**
   * Everything the old fake `system` turn was smuggling, in the fields the
   * backend actually declares. `contextEmail` is authoritative where it exists —
   * these are real props, not a DOM scrape — and the open message's body goes in
   * `screenText` because `chatSchema.context` has no `body` slot and that text
   * is, literally, what is on the screen.
   */
  const buildContext = (): Record<string, string> => {
    const context: Record<string, string> = { app: 'QuantMail' };
    if (typeof window !== 'undefined') context.route = window.location.pathname;

    if (contextEmail || contextThreadSubject) {
      context.view = 'Reading a message';
      const subject = contextEmail?.subject || contextThreadSubject;
      if (subject) context.subject = clamp(subject, 1000);
      const from = contextEmail?.from?.name || contextEmail?.from?.email;
      if (from) context.from = clamp(from, 320);
      const body = contextEmail?.bodyText || contextEmail?.snippet;
      if (body) context.screenText = clamp(body, 8000);
    } else if (isComposeContext) {
      context.view =
        'Composing a new message. When asked to draft one, answer with a Subject line, a greeting, a body and a closing.';
    } else if (viewLabel) {
      context.view = viewLabel;
    }

    return context;
  };

  /**
   * Send a history and commit whatever comes back — or say plainly that nothing
   * did. There is deliberately no local substitute for an answer: a canned string
   * that claims to have read the user's mail is worse than an error, and in
   * compose context the old one wrote itself into the draft and toasted success.
   */
  const runTurn = async (turns: ChatTurn[], isRetry = false) => {
    setFailure(null);
    setIsLoading(true);
    // A 25s latch in the table, so a request that never resolves cannot strand the mascot
    // mid-thought on any of the mounts now listening. A retry wears `determined` instead —
    // brow set, same ellipsis, because persistence and a first attempt are not the same face.
    quantyReact(isRetry ? 'ai:retrying' : 'ai:thinking');

    const result = await requestQuanty(turns, buildContext());
    setIsLoading(false);

    if (!result.ok) {
      setFailure(result.failure);
      quantyReact('ai:failed');
      return;
    }

    const finalMsgs: ChatTurn[] = [...turns, { role: 'assistant', text: result.message }];
    setMessages(finalMsgs);
    quantyReact('ai:answered');
    saveCurrentConversation(finalMsgs);

    if (isComposeContext && onApplyAction) {
      onApplyAction(parseEmailActionFromText(result.message));
      showToast({ text: 'Quanty updated your email draft', type: 'success' });
    }
  };

  const handleSend = async (userPrompt?: string) => {
    const promptToSend = (userPrompt ?? inputValue).trim();
    if (!promptToSend || isLoading) return;

    const turns: ChatTurn[] = [...messages, { role: 'user', text: promptToSend }];
    setMessages(turns);
    setInputValue('');
    await runTurn(turns);
  };

  /**
   * Re-send the same history. A failed turn appends no assistant message, so
   * `messages` still ends on the user's prompt and is already the right payload.
   */
  const retryLastTurn = () => {
    if (isLoading || messages.length === 0) return;
    // The retry wears `determined` for the whole request instead of `thinking`, which is why
    // it is a parameter rather than an extra `quantyReact` before the call: both events are
    // `PRIORITY.state`, so firing them back to back in one tick would batch into a single
    // render and `determined` would never appear at all.
    void runTurn(messages, true);
  };

  const clearHistory = () => {
    setHistoryList([]);
    localStorage.removeItem(STORAGE_KEY);
    setShowHistoryMenu(false);
    showToast({ text: 'Recent chat history cleared', type: 'info' });
  };

  const loadChat = (item: ChatHistoryItem) => {
    setMessages(item.messages);
    // A stale error banner over a conversation the user just restored would be
    // describing a request that has nothing to do with what is now on screen.
    setFailure(null);
    setShowHistoryMenu(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = historyList.filter((x) => x.id !== id);
    setHistoryList(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // A failed first turn still put the user's own prompt on screen, so the
  // transcript is what should render — not the starter buttons behind it.
  const hasConversation = messages.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm"
          />

          {/* Full-Width Mobile & Centered Desktop Bottom Sheet with Swipe-to-Dismiss */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            className={`fixed bottom-0 left-0 right-0 z-50 w-full sm:max-w-xl sm:mx-auto rounded-t-2xl border-t border-x border-[#282C35] bg-[#111318] shadow-[0_-12px_45px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden transition-all duration-300 ${
              hasConversation ? 'h-[580px] max-h-[82vh]' : 'h-auto max-h-[75vh]'
            }`}
          >
            <div className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 rounded-full bg-[#282C35]" />
            </div>

            <div className="flex items-center justify-between px-4 sm:px-5 pt-1 pb-3 relative border-b border-[#282C35]">
              <div className="flex items-center gap-2.5">
                <Quanty size={28} expression={quantyExpression} bob={false} />
                <h3 className="text-sm font-semibold text-[#F5F5F5] tracking-tight">
                  Quanty AI Copilot
                </h3>
              </div>

              {/*
                `gap-3.5`, not `gap-1`, and the 14px is load-bearing: two 30px
                controls can only both own a 44px-wide target if their centres are
                44px apart, and 30 + 14 = 44. At `gap-1` the two halos overlapped
                by 10px, the later sibling won every point in the overlap, and the
                history button's real hit area was 34px wide while measuring as if
                it were fine. Costs 10px of header width; buys two honest targets.
              */}
              <div className="flex items-center gap-3.5">
                {/*
                  A 44px pointer target on a 30px control, the way
                  `SearchClearButton` already does it: `before:-inset-[7px]`
                  expands the hit box without touching layout, so this header
                  keeps its 28px mark and 13px title instead of growing 14px
                  taller to satisfy the touch minimum. Measured with
                  `elementFromPoint`, not with `getBoundingClientRect` — the rect
                  under-reports a pseudo-element target.
                */}
                <button
                  type="button"
                  onClick={() => setShowHistoryMenu(!showHistoryMenu)}
                  className={`relative p-1.5 rounded-full transition-colors before:absolute before:-inset-[7px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    showHistoryMenu
                      ? 'text-[#FF8C42] bg-[#2B1A11]'
                      : 'text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#16181D]'
                  }`}
                  title="Chat history"
                  aria-label="Chat history"
                  aria-haspopup="menu"
                  aria-expanded={showHistoryMenu}
                >
                  <svg
                    className="size-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle cx="12" cy="12" r="1" fill="currentColor" />
                    <circle cx="12" cy="5" r="1" fill="currentColor" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="relative p-1.5 rounded-full text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#16181D] transition-colors before:absolute before:-inset-[7px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  aria-label="Close Quanty"
                  title="Close Quanty"
                >
                  <svg
                    className="size-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <AnimatePresence>
                {showHistoryMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    className="absolute right-4 top-12 z-50 w-64 rounded-xl border border-[#282C35] bg-[#16181D] p-3 shadow-2xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#282C35]">
                      <span className="font-semibold text-[#F5F5F5]">Recent Chats</span>
                      {historyList.length > 0 && (
                        <button
                          type="button"
                          onClick={clearHistory}
                          className="text-[10px] text-rose-400 hover:underline"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {historyList.length === 0 ? (
                      <p className="text-[11px] text-[#A1A4AC] py-2 text-center">
                        No previous chats recorded
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {historyList.map((item) => (
                          <div
                            key={item.id}
                            className="group flex items-center justify-between p-2 rounded-lg hover:bg-[#111318] cursor-pointer"
                            onClick={() => loadChat(item)}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="text-xs text-[#F5F5F5] truncate">{item.preview}</p>
                              <p className="text-[10px] text-[#A1A4AC]">{item.date}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => deleteChat(item.id, e)}
                              className="inline-flex items-center justify-center size-7 min-h-[44px] min-w-[44px] shrink-0 rounded-lg text-[#6B6E76] hover:text-rose-400 transition-opacity sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                              title="Delete chat"
                              aria-label="Delete chat"
                            >
                              <IconX size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {!hasConversation ? (
              <div className="px-4 pb-3 pt-3 space-y-2">
                {contextEmail || contextThreadSubject ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void handleSend('Please summarize this email in 3 crisp bullet points.')
                      }
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all active:scale-[0.99] group shadow-sm"
                    >
                      <div className="size-8 rounded-lg bg-[#2B1A11] border border-[#5C3016] flex items-center justify-center text-[#FF8C42] text-sm shrink-0">
                        <svg
                          className="size-4 text-[#FF8C42]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#F5F5F5]">Summarize this email</p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          void handleSend(
                            'Draft a polite, professional, and concise smart reply to this email.',
                          )
                        }
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all text-xs text-[#A1A4AC] font-medium"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-[#FF8C42]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        <span className="truncate">Draft a reply</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleSend(
                            'कृपया इस ईमेल का हिंदी में मुख्य सारांश (Summary) बताएं।',
                          )
                        }
                        className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all text-xs text-[#A1A4AC] font-medium"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-[#FF8C42]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                          />
                        </svg>
                        <span className="truncate">Hindi Summary</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void handleSend('What can Quanty do to manage my emails and daily tasks?')
                    }
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] text-left transition-all active:scale-[0.99] group shadow-sm"
                  >
                    {/*
                      `greeting`, not `happy` — this card only exists in the empty state, so
                      the face is meeting the user for the first time in the session. It is
                      the sheet's wink-and-wave: an arch, one shut eye, a grin and a spark.
                    */}
                    <Quanty size={24} expression="greeting" bob={false} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#F5F5F5]">
                        What can Quanty do in QuantMail?
                      </p>
                    </div>
                  </button>
                )}
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 text-xs text-white"
              >
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2.5 ${
                      m.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {m.role === 'assistant' && (
                      <div className="shrink-0 mt-0.5">
                        <Quanty size={22} expression={quantyExpression} bob={false} />
                      </div>
                    )}

                    <div
                      className={`max-w-[86%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#2B1A11] border border-[#5C3016] text-[#F5F5F5] rounded-br-none shadow-sm font-medium'
                          : 'bg-[#16181D] border border-[#282C35] text-[#F5F5F5] rounded-bl-none shadow-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>

                      {m.role === 'assistant' && onApplyAction && (
                        <button
                          type="button"
                          onClick={() => {
                            const text = m.text;
                            const emailMatch = text.match(
                              /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
                            );
                            const subjectMatch = text.match(/Subject:\s*([^\n]+)/i);
                            const greetingMatch = text.match(
                              /^(Dear\s+[^,\n]+,|Hi\s+[^,\n]+,|Hello\s+[^,\n]+,)/im,
                            );

                            onApplyAction({
                              to: emailMatch ? emailMatch[1] : undefined,
                              subject: subjectMatch ? subjectMatch[1].trim() : undefined,
                              greeting: greetingMatch ? greetingMatch[1].trim() : undefined,
                              body: text
                                .replace(/^Subject:.*$/im, '')
                                .replace(/^(Dear|Hi|Hello)[^\n]+,\s*/im, '')
                                .replace(
                                  /(Best regards|Sincerely|Thanks|Warm regards)[,\s\S]*$/im,
                                  '',
                                )
                                .trim(),
                            });
                            onClose();
                            showToast({ text: 'Applied draft into composer', type: 'success' });
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#FF8C42] bg-[#2B1A11] hover:bg-[#3A2416] border border-[#5C3016] transition-all shadow-sm"
                        >
                          <svg
                            className="w-3 h-3 text-[#FF8C42]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          <span>Apply to Composer</span>
                        </button>
                      )}

                      {m.role === 'assistant' &&
                        onInsertReply &&
                        !onApplyAction &&
                        i > 0 &&
                        messages[i - 1]?.role === 'user' &&
                        (messages[i - 1].text.toLowerCase().includes('draft') ||
                          messages[i - 1].text.toLowerCase().includes('write a reply') ||
                          messages[i - 1].text.toLowerCase().includes('compose') ||
                          messages[i - 1].text.toLowerCase().includes('formalize') ||
                          messages[i - 1].text.toLowerCase().includes('उत्तर तैयार') ||
                          messages[i - 1].text.toLowerCase().includes('reply to')) && (
                          <button
                            type="button"
                            onClick={() => {
                              onInsertReply(m.text);
                              onClose();
                              showToast({ text: 'Inserted draft into reply', type: 'success' });
                            }}
                            className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#FF8C42] bg-[#2B1A11] hover:bg-[#3A2416] border border-[#5C3016] transition-all"
                          >
                            <svg
                              className="w-3 h-3 text-[#FF8C42]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                              />
                            </svg>
                            <span>Insert into reply</span>
                          </button>
                        )}
                    </div>
                  </motion.div>
                ))}

                {isLoading && (
                  <div className="flex gap-2.5 items-center">
                    <div className="shrink-0">
                      <Quanty size={22} expression="thinking" bob={false} />
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-[#181c26] border border-[#FF8C42]/20 text-xs text-[#FF8C42] flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce" />
                      <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce [animation-delay:0.15s]" />
                      <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce [animation-delay:0.3s]" />
                      <span className="ml-1 text-[11px] text-[#A1A4AC]">Quanty is thinking…</span>
                    </div>
                  </div>
                )}

                {/*
                  Not an assistant bubble. An error styled as one gets written to
                  chat history by `saveCurrentConversation` and read back a week
                  later as something Quanty actually said — which is how the
                  fabricated fallback this replaces did its damage. It keeps the
                  assistant surface so it sits in the column, and carries rose
                  type (the hue this file already uses for destructive actions)
                  plus `role="alert"` to say what it is.
                */}
                {failure && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2.5"
                    role="alert"
                  >
                    <div className="shrink-0 mt-0.5">
                      <Quanty size={22} expression="shock" bob={false} />
                    </div>
                    <div className="max-w-[86%] rounded-xl rounded-bl-none border border-[#282C35] bg-[#16181D] px-3.5 py-2.5 shadow-sm">
                      <p className="text-xs font-semibold text-rose-300">{failure.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#A1A4AC]">
                        {failure.detail}
                      </p>
                      {failure.retryable && (
                        <button
                          type="button"
                          onClick={retryLastTurn}
                          className="mt-2 inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-[#5C3016] bg-[#2B1A11] px-2.5 text-xs font-semibold text-[#FF8C42] transition-colors hover:bg-[#3A2416] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                        >
                          <svg
                            className="size-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
                            <path d="M3 21v-5h5" />
                          </svg>
                          <span>Try again</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Bottom Rounded Pill Prompt Input + "Quanty can make mistakes." Disclaimer */}
            <div className="p-3.5 pt-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="relative flex items-center"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter a prompt here"
                  className="w-full rounded-full border border-[#3A404D]/80 bg-[#1a1f2c] pl-4 pr-11 py-3 text-xs sm:text-[13px] text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42] focus:ring-1 focus:ring-[#FF8C42]/40 transition-all shadow-inner font-sans"
                />

                {/*
                  32px glyph, 44px target. The halo is asymmetric on purpose:
                  `pr-11` stops the field's text 44px short of its right edge, so
                  a symmetric `-inset-[6px]` would put 2px of hit area over the
                  last of the text and steal a click meant to place the caret.
                  This one ends exactly on that boundary and takes its remaining
                  width outward to the field's edge instead.

                  No `relative` here — `absolute right-2` is already a containing
                  block for the pseudo-element, and Tailwind emits `.relative`
                  after `.absolute`, so adding it would unpin the button.
                */}
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-2 p-1.5 rounded-full text-[#FF8C42] hover:text-[#FFB875] disabled:opacity-30 transition-all active:scale-95 before:absolute before:-inset-y-[6px] before:-left-[4px] before:-right-[8px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  title="Send"
                  aria-label="Send prompt to Quanty"
                >
                  <svg
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </form>

              <div className="pt-2 text-center">
                <span className="text-[10px] text-[#A1A4AC] font-sans tracking-wide">
                  Quanty can make mistakes.
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default QuantyCopilotDrawer;
