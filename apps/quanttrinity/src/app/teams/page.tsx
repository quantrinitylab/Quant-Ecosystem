'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@quant/shared-ui';
import {
  SECTORS,
  SECTOR_LABEL,
  TEAM_ROLES,
  type PrincipalKind,
  type Sector,
  type TeamMember,
  type TeamRole,
} from '../../lib/domain';
import { ownerFetch } from '../../lib/api';

const MODELS = [
  { id: 'or-claude-sonnet', label: 'Claude Sonnet' },
  { id: 'or-gpt-4o', label: 'GPT-4o' },
  { id: 'or-gemini-pro', label: 'Gemini Pro' },
  { id: 'local-quant-8b', label: 'Quant-8B (local)' },
];

const STATUS_BADGE: Record<TeamMember['status'], 'success' | 'warning' | 'default'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'default',
};

interface ShiftAction {
  summary: string;
  kind: 'resolved' | 'escalated' | 'suggested' | 'skipped';
  creditsSpent: number;
}
interface ShiftResult {
  employeeId: string;
  permissionLevel: string;
  trustScore: number;
  dailyRemaining: number;
  processed: number;
  paused: boolean;
  note: string;
  actions: ShiftAction[];
}

const ACTION_BADGE: Record<ShiftAction['kind'], 'success' | 'warning' | 'info' | 'default'> = {
  resolved: 'success',
  escalated: 'warning',
  suggested: 'info',
  skipped: 'default',
};

export default function TeamsPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [kind, setKind] = useState<PrincipalKind>('human');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sector, setSector] = useState<Sector>('reporting');
  const [role, setRole] = useState<TeamRole>('agent');
  const [modelId, setModelId] = useState(MODELS[0]!.id);
  const [autonomy, setAutonomy] = useState<'suggest' | 'act-with-approval' | 'autonomous'>(
    'act-with-approval',
  );
  const [dailyCreditBudget, setDailyCreditBudget] = useState(50);
  const [mandate, setMandate] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await ownerFetch<{ data: TeamMember[] }>('/api/teams');
      setTeam(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload =
        kind === 'human'
          ? { kind, name, email, sector, role }
          : {
              kind,
              name: name || `QuantAI · ${SECTOR_LABEL[sector]}`,
              sector,
              role,
              ai: {
                modelId,
                autonomy,
                dailyCreditBudget,
                mandate: mandate || 'Standing sector task.',
              },
            };
      await ownerFetch('/api/teams', { method: 'POST', body: JSON.stringify(payload) });
      setName('');
      setEmail('');
      setMandate('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member');
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (id: string, status: TeamMember['status']) => {
    try {
      await ownerFetch(`/api/teams/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member');
    }
  };

  const [shifts, setShifts] = useState<Record<string, ShiftResult>>({});
  const [running, setRunning] = useState<string | null>(null);

  const runShift = async (id: string) => {
    setRunning(id);
    setError(null);
    try {
      const res = await ownerFetch<{ data: ShiftResult }>(`/api/teams/${id}/run`, {
        method: 'POST',
      });
      setShifts((prev) => ({ ...prev, [id]: res.data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run shift');
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Teams &amp; AI Staff</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          Provision team accounts by sector and role — or place an AI agent as an employee that
          works the sector autonomously under your budget and approval limits.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Provision form */}
        <Card padding="none" className="lg:col-span-1">
          <div className="border-b border-[var(--quant-border)] px-5 py-4">
            <h2 className="font-semibold text-[var(--quant-foreground)]">Provision account</h2>
          </div>
          <form className="space-y-4 p-5" onSubmit={submit}>
            <div className="flex gap-2">
              {(['human', 'ai'] as PrincipalKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    kind === k
                      ? 'border-[var(--brand-app-color)] bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)]'
                      : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)]'
                  }`}
                >
                  {k === 'human' ? '🧑 Human' : '👾 AI employee'}
                </button>
              ))}
            </div>

            <Field label={kind === 'ai' ? 'Name (optional)' : 'Name'}>
              <input
                className="trinity-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === 'ai' ? 'Auto-named by sector' : 'Full name'}
                required={kind === 'human'}
              />
            </Field>

            {kind === 'human' && (
              <Field label="Email">
                <input
                  type="email"
                  className="trinity-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@quant.dev"
                  required
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sector">
                <select
                  className="trinity-input"
                  value={sector}
                  onChange={(e) => setSector(e.target.value as Sector)}
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {SECTOR_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role">
                <select
                  className="trinity-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as TeamRole)}
                >
                  {TEAM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {kind === 'ai' && (
              <div className="space-y-4 rounded-lg border border-[var(--brand-app-color)]/30 bg-[var(--brand-app-color)]/5 p-3">
                <Field label="Model">
                  <select
                    className="trinity-input"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Autonomy">
                    <select
                      className="trinity-input"
                      value={autonomy}
                      onChange={(e) =>
                        setAutonomy(
                          e.target.value as 'suggest' | 'act-with-approval' | 'autonomous',
                        )
                      }
                    >
                      <option value="suggest">Suggest only</option>
                      <option value="act-with-approval">Act w/ approval</option>
                      <option value="autonomous">Autonomous</option>
                    </select>
                  </Field>
                  <Field label="Daily credits">
                    <input
                      type="number"
                      min={0}
                      className="trinity-input"
                      value={dailyCreditBudget}
                      onChange={(e) => setDailyCreditBudget(Number(e.target.value))}
                    />
                  </Field>
                </div>
                <Field label="Mandate">
                  <textarea
                    className="trinity-input"
                    rows={2}
                    value={mandate}
                    onChange={(e) => setMandate(e.target.value)}
                    placeholder="e.g. Triage incoming reports daily and escalate criticals."
                  />
                </Field>
              </div>
            )}

            <Button type="submit" loading={submitting} fullWidth>
              {kind === 'ai' ? 'Deploy AI employee' : 'Invite member'}
            </Button>
          </form>
        </Card>

        {/* Team list */}
        <div className="space-y-3 lg:col-span-2">
          {loading && (
            <p className="text-sm text-[var(--quant-muted-foreground)]">Loading staff…</p>
          )}
          {!loading && team.length === 0 && (
            <p className="text-sm text-[var(--quant-muted-foreground)]">No staff yet.</p>
          )}
          {team.map((m) => (
            <Card key={m.id} padding="none">
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{m.kind === 'ai' ? '👾' : '🧑'}</span>
                    <span className="font-medium text-[var(--quant-foreground)]">{m.name}</span>
                    <Badge variant={STATUS_BADGE[m.status]} size="sm">
                      {m.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                    <Badge variant="info" size="sm">
                      {SECTOR_LABEL[m.sector]}
                    </Badge>
                    <span>· {m.role}</span>
                    {m.email && <span>· {m.email}</span>}
                  </div>
                  {m.ai && (
                    <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">
                      <span className="font-medium text-[var(--brand-app-color)]">
                        {m.ai.autonomy}
                      </span>{' '}
                      · {m.ai.modelId} · {m.ai.dailyCreditBudget} cr/day — {m.ai.mandate}
                    </p>
                  )}
                  {m.kind === 'ai' && shifts[m.id] && (
                    <div className="mt-3 rounded-lg border border-[var(--brand-app-color)]/30 bg-[var(--brand-app-color)]/5 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="info" size="sm">
                          trust {shifts[m.id]!.trustScore}
                        </Badge>
                        <Badge variant="default" size="sm">
                          {shifts[m.id]!.permissionLevel}
                        </Badge>
                        <span className="text-[var(--quant-muted-foreground)]">
                          {shifts[m.id]!.dailyRemaining} cr left today
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-[var(--quant-foreground)]">
                        {shifts[m.id]!.note}
                      </p>
                      {shifts[m.id]!.actions.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {shifts[m.id]!.actions.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              <Badge variant={ACTION_BADGE[a.kind]} size="sm">
                                {a.kind}
                              </Badge>
                              <span className="text-[var(--quant-muted-foreground)]">
                                {a.summary}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {m.kind === 'ai' && m.status !== 'suspended' && (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={running === m.id}
                      onClick={() => runShift(m.id)}
                    >
                      Run shift
                    </Button>
                  )}
                  {m.status !== 'suspended' ? (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(m.id, 'suspended')}>
                      Suspend
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(m.id, 'active')}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <style>{`
        .trinity-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--quant-border);
          background: var(--quant-background);
          color: var(--quant-foreground);
          padding: 0.5rem 0.625rem;
          font-size: 0.875rem;
        }
        .trinity-input:focus { outline: 2px solid var(--brand-app-color); outline-offset: 1px; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}
