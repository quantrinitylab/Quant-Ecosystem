import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveBlobLoadOutcome } from "../blobLoadOutcome";

// QM-FIX: QuantGit code viewer must never FABRICATE file contents.
// Finding: on GET /api/repos/:id/file 404, page.tsx's openBlobEditor set the
// editor's content to an invented template (.md -> "# <file> Sovereign
// workspace documentation.", .ts/.tsx -> `export function sovereignModule()`,
// .json -> `{ "name": "<repo>" }`, package.json -> invented package object)
// rendered as the file's real content with no generated marker. Sibling bug:
// on any non-404 fetch failure the catch branch opened the editor with an
// invented empty string as the file's content.

function srcPath(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

describe("resolveBlobLoadOutcome — honest blob fetch outcomes", () => {
  it("maps HTTP 404 to not-found (never invented template bytes)", () => {
    expect(
      resolveBlobLoadOutcome({ ok: false, status: 404, payload: null }),
    ).toEqual({
      kind: "not-found",
    });
    // Even a success-shaped payload must not override a 404 status.
    expect(
      resolveBlobLoadOutcome({
        ok: false,
        status: 404,
        payload: { success: true, data: { content: "x" } },
      }),
    ).toEqual({ kind: "not-found" });
  });

  it("maps non-404 failures to error with the backend message when present", () => {
    expect(
      resolveBlobLoadOutcome({
        ok: false,
        status: 500,
        payload: { success: false, error: { message: "git blew up" } },
      }),
    ).toEqual({ kind: "error", message: "git blew up" });
    expect(
      resolveBlobLoadOutcome({
        ok: false,
        status: 403,
        payload: { success: false, message: "forbidden" },
      }),
    ).toEqual({ kind: "error", message: "forbidden" });
  });

  it("maps 200 + success:false to error (payload denial is a failure)", () => {
    expect(
      resolveBlobLoadOutcome({
        ok: true,
        status: 200,
        payload: { success: false, error: { message: "nope" } },
      }),
    ).toEqual({ kind: "error", message: "nope" });
  });

  it("maps unparseable payloads to a generic error, not invented content", () => {
    expect(
      resolveBlobLoadOutcome({ ok: false, status: 500, payload: null }),
    ).toEqual({
      kind: "error",
      message: "Failed to load file content.",
    });
    expect(
      resolveBlobLoadOutcome({
        ok: true,
        status: 200,
        payload: { success: true, data: null },
      }),
    ).toEqual({ kind: "loaded", content: "", sha: "" });
  });

  it("loads real bytes and sha (incl. blobSha alias) on success", () => {
    expect(
      resolveBlobLoadOutcome({
        ok: true,
        status: 200,
        payload: {
          success: true,
          data: { content: "real bytes", sha: "abc123" },
        },
      }),
    ).toEqual({ kind: "loaded", content: "real bytes", sha: "abc123" });
    expect(
      resolveBlobLoadOutcome({
        ok: true,
        status: 200,
        payload: {
          success: true,
          data: { content: "real bytes", blobSha: "def456" },
        },
      }),
    ).toEqual({ kind: "loaded", content: "real bytes", sha: "def456" });
  });

  it("never returns invented content for non-string data.content", () => {
    const outcome = resolveBlobLoadOutcome({
      ok: true,
      status: 200,
      payload: { success: true, data: { content: 42 } },
    });
    expect(outcome).toEqual({ kind: "loaded", content: "", sha: "" });
  });
});

describe("page.tsx blob editor — no fabricated file contents", () => {
  it("contains no invented-template strings", () => {
    const page = readFileSync(srcPath("../page.tsx"), "utf8");
    expect(page).not.toContain("sovereignModule");
    expect(page).not.toContain("Sovereign workspace documentation");
    expect(page).not.toContain("return 'Quant Sovereign'");
  });

  it("routes 404 through resolveBlobLoadOutcome and keeps the editor closed", () => {
    const page = readFileSync(srcPath("../page.tsx"), "utf8");
    expect(page).toContain("resolveBlobLoadOutcome");
    // Honest 404 branch: toast + closeBlobEditor, no setViewingFile with content.
    const notFoundIdx = page.indexOf("outcome.kind === 'not-found'");
    expect(notFoundIdx).toBeGreaterThan(-1);
    // Scope to the 404 block: ends at its `return;` before the error branch.
    const returnIdx = page.indexOf("return;", notFoundIdx);
    const block = page.slice(notFoundIdx, returnIdx);
    expect(block).toContain("File not found:");
    expect(block).toContain("closeBlobEditor()");
    expect(block).not.toContain("setViewingFile");
  });

  it("catch branch closes the editor instead of opening it with empty content", () => {
    const page = readFileSync(srcPath("../page.tsx"), "utf8");
    // The old catch invented `content: ''` (or `template`) and called setViewingFile.
    expect(page).not.toContain("content: template");
    // Scope to openBlobEditor's catch: after the honest-error message line.
    const catchIdx = page.indexOf(
      "const message = error instanceof Error ? error.message : 'Failed to load file.';",
    );
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBlock = page.slice(catchIdx, catchIdx + 500);
    expect(catchBlock).toContain("closeBlobEditor();");
    expect(catchBlock).not.toContain("setViewingFile(");
    expect(catchBlock).not.toContain("content: ''");
  });
});
