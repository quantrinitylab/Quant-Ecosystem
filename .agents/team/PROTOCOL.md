# Cooperative claim and replacement protocol

This is a client-side protocol and offline helper, **not an access-control boundary, distributed code-write lock, scheduler or deployed orchestrator**. Anyone sharing broad GitHub write credentials can bypass it. Real enforcement requires separately approved scoped identities, protected branches and/or a central write broker. Those are not created here.

## State model

- `ready`: owner-prepared bounded task; no active worker.
- `active`: one cooperative claim with a public holder/claim ID, expiry and monotonically increasing fence.
- `paused`: checkpointed session/context handoff; a new authorized claim can resume.
- `blocked`: missing evidence/access/environment, owner decision, quota or budget; no automatic claim/takeover.
- `review`: worker finished an increment; acceptance is still external owner/reviewer work. The helper cannot mark accepted, merge or deploy.

`revision` changes on every accepted transition. `fence` changes on acquisition/release/reassignment; old worker claims fail the helper's preflight. The 30-minute maximum lease is an ownership TTL, not an inference runtime or schedule. Extend it only with a meaningful checkpoint during real authorized work, never an idle heartbeat.

## Claim → work → checkpoint

1. Read the assigned task JSON from the owner-selected control ref. Save its **task-record blob SHA**.
2. Independently read the feature branch and current code/PR. The **code commit SHA** is different from the task-record blob SHA; never interchange them.
3. Validate/reconcile the checkpoint. `observedHead` must match the supplied checkpoint's source commit. The helper compares caller-supplied data; it does not fetch GitHub or authenticate that observation.
4. Prepare a claim or checkpoint using `transition`/`prepareUpdate`. The helper never performs networking or source writes.
5. An authorized adapter updates **that single task file**, on the explicit control branch, with the current blob SHA as the replace precondition. Follow the adapter's own documented content format. GitHub REST uses Base64; MCP clients may expose text. See the [Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).
6. On conflict, stop and re-read; do not blindly replay an old plan. Serialize state writes. Read back the committed record and acquire the returned generation before work.
7. Before each source side effect, re-read the current record and call `assertWriteAllowed` for the intended path. Use a single writer per feature branch and reconcile the branch head. The check and a later code push are **not atomic**; without a real broker/branch enforcement this remains cooperative, not server-side fencing.

An ordinary comment is not a lock. A role prefix is not proof of agent identity or owner approval. Supplying a token/flag to the helper does not grant platform authority.

## Replacement rules

- Graceful session/context handoff: current worker saves a checkpoint and `yield`s. Old claim is invalidated; an authorized replacement uses a new worker/claim ID and acquires a new generation.
- Crash/expiry: coordinator first inspects the actual branch/diff and reconciles any uncheckpointed commits. `takeover` requires expiry plus a supplied checkpoint matching the freshly observed code head. A live claim cannot be taken over by this helper.
- Returning old worker: stale holder/ID/fence/expiry must cause a stop. Do not keep editing a local checkout or push stale work.
- Quota/budget block: save a checkpoint, `block`, then pause for owner/platform review. The helper intentionally exposes no unblock or automatic replacement path for blocked tasks. Do not relabel a quota incident as a crash, create another task/account to evade the block, or rotate trials. Legitimate entitlement restoration/approved reassignment is a separate process outside this kit.
- Access/environment blocks also need actual new capability/evidence before the owner prepares a new authorized assignment. Repeating the same blocked work is not progress.

Only an externally authorized owner process initializes live task records or clears a block after verifying its cause. The example record is not a live task, and a JSON field is not that authorization.

## CLI — local only

```sh
node .agents/team/coordination.mjs validate .agents/team/tasks/QM-CI-238.json
node --test .agents/team/coordination.test.mjs
```

`plan <state.json> <event.json> <task-blob-sha> <control-branch>` writes a proposed update to stdout only. It does not execute it. The branch must be explicit and must not be main/master. Prefer a reviewed control branch; never rely on an API's default branch.

Events: `claim`, `checkpoint`, `yield`, `block`, `review`, `takeover`. Each supplies an ISO UTC `now`; use a trusted clock. Claim/takeover need a new holder/claim ID, TTL and freshly observed code head. Owned operations need `{holder,id,fence}`. Checkpoint/release operations need a validated complete checkpoint and matching observed head.

## Evidence and limitations

The included tests exercise the real local state helper. Any compare-and-swap test uses an in-memory transport model, not concurrent GitHub integration. No full repository build, canonical-memory validation, Node 22 run, live multi-agent recovery or billing enforcement is implied by these tests.

Task fields intentionally exclude credentials/account URLs. Validation catches shape/path/reference mistakes, not all secrets or false claims. Review content before publishing. No raw transcripts, private workspace pages, environment dumps or personal data.

Existing canonical memory retains authority. This folder does not accept a milestone, rewrite priority, change an ADR, remove a test, or weaken a release gate.
