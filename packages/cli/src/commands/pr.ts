import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { spawnSync } from 'node:child_process';
import { QuantCliClient } from '../client.js';
import { getApiUrl } from '../config.js';
import {
  formatRelativeTime,
  getCurrentBranch,
  getLocalRepoInfo,
  parseRepoString,
  renderTable,
} from '../git-utils.js';

export interface PullRequestDto {
  id: number | string;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged' | string;
  status?: string;
  author: string;
  sourceBranch?: string;
  targetBranch?: string;
  head?: string;
  base?: string;
  branchSource?: string;
  branchTarget?: string;
  checksStatus?: string;
  commentsCount?: number;
  createdAt: string;
  mergedAt?: string | null;
  mergeCommitSha?: string | null;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

export interface ReviewDto {
  id: string;
  status: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | string;
  body?: string;
  author?: {
    username?: string;
    displayName?: string;
  };
}

/**
 * Registers all `quant pr` commands matching GitHub's `gh pr` CLI.
 */
export function registerPrCommands(program: Command): void {
  const pr = program
    .command('pr')
    .description('Manage CodeHub pull requests matching GitHub gh CLI (list, create, view, merge)');

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant pr list [repo]
  // ─────────────────────────────────────────────────────────────────────────────
  pr.command('list [repo]')
    .description('List pull requests for a repository')
    .option('-s, --state <state>', 'Filter by state (open, closed, merged, all)', 'open')
    .option('-L, --limit <number>', 'Maximum number of pull requests to list', '30')
    .option('--json', 'Output pull requests in JSON format')
    .action(
      async (repoArg?: string, options?: { state?: string; limit?: string; json?: boolean }) => {
        const client = new QuantCliClient();
        const limit = parseInt(options?.limit || '30', 10);
        const filterState = (options?.state || 'open').toLowerCase();

        const parsed = repoArg ? parseRepoString(repoArg) : getLocalRepoInfo();
        if (!parsed) {
          console.error(
            chalk.red(
              '\nError: No repository specified and unable to detect git repository from current directory.',
            ),
          );
          console.error(
            chalk.gray(
              'Usage: quant pr list <owner/repo> or run inside a cloned repo directory.\n',
            ),
          );
          process.exitCode = 1;
          return;
        }

        const identifier = parsed.fullName || `${parsed.owner}/${parsed.name}`;

        try {
          let endpoint = `/api/repos/${encodeURIComponent(identifier)}/pulls`;
          if (filterState && filterState !== 'all') {
            endpoint += `?status=${encodeURIComponent(filterState)}`;
          }

          let res: any;
          try {
            res = await client.get<any>(endpoint);
          } catch (firstErr: any) {
            if (firstErr?.status === 404) {
              const fallbackUrl = `/api/repos/${encodeURIComponent(parsed.name)}/pulls${
                filterState && filterState !== 'all'
                  ? `?status=${encodeURIComponent(filterState)}`
                  : ''
              }`;
              res = await client.get<any>(fallbackUrl);
            } else {
              throw firstErr;
            }
          }

          const rawList: any[] = Array.isArray(res)
            ? res
            : Array.isArray(res?.data)
              ? res.data
              : Array.isArray(res?.pullRequests)
                ? res.pullRequests
                : [];

          const pullRequests: PullRequestDto[] = rawList.slice(0, limit).map((p) => {
            const rawStatus = (p.status || p.state || 'open').toLowerCase();
            return {
              id: p.id || p.number,
              number: p.number ?? parseInt(String(p.id), 10) ?? 1,
              title: p.title || 'Untitled',
              body: p.body || '',
              state: rawStatus,
              author: typeof p.author === 'string' ? p.author : p.author?.username || 'user',
              sourceBranch: p.sourceBranch || p.branchSource || p.head || 'branch',
              targetBranch: p.targetBranch || p.branchTarget || p.base || 'main',
              checksStatus: p.checksStatus || 'none',
              createdAt: p.createdAt || new Date().toISOString(),
              additions: p.additions ?? 0,
              deletions: p.deletions ?? 0,
              changedFiles: p.changedFiles ?? 0,
            };
          });

          if (options?.json) {
            console.log(JSON.stringify(pullRequests, null, 2));
            return;
          }

          if (pullRequests.length === 0) {
            console.log(chalk.yellow(`\nNo ${filterState} pull requests found in ${identifier}.`));
            console.log(
              chalk.gray('Create a pull request with: ') + chalk.cyan('quant pr create\n'),
            );
            return;
          }

          console.log(
            chalk.bold(
              `\nShowing ${pullRequests.length} pull requests in ${chalk.cyan(identifier)}\n`,
            ),
          );

          const headers = ['NUMBER', 'TITLE', 'AUTHOR', 'BRANCHES', 'STATE', 'CREATED'];
          const rows = pullRequests.map((p) => {
            const numFormatted = chalk.bold.cyan(`#${p.number}`);
            const titleFormatted = chalk.bold.white(
              p.title.length > 40 ? p.title.slice(0, 37) + '...' : p.title,
            );
            const authorFormatted = chalk.gray(`@${p.author}`);
            const branchesFormatted = chalk.gray(`${p.sourceBranch} ➔ ${p.targetBranch}`);

            let stateFormatted = chalk.green('OPEN');
            if (p.state === 'merged') {
              stateFormatted = chalk.magenta('MERGED');
            } else if (p.state === 'closed') {
              stateFormatted = chalk.red('CLOSED');
            }

            const createdFormatted = chalk.gray(formatRelativeTime(p.createdAt));
            return [
              numFormatted,
              titleFormatted,
              authorFormatted,
              branchesFormatted,
              stateFormatted,
              createdFormatted,
            ];
          });

          console.log(renderTable(headers, rows));
          console.log('');
        } catch (err: any) {
          console.error(
            chalk.red(
              `\nFailed to list pull requests for ${identifier}: ${err.message || String(err)}\n`,
            ),
          );
          process.exitCode = 1;
        }
      },
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant pr create
  // ─────────────────────────────────────────────────────────────────────────────
  pr.command('create')
    .description('Create a new CodeHub pull request')
    .option('-R, --repo <repo>', 'Target repository (owner/name)')
    .option('-t, --title <title>', 'Title for the pull request')
    .option('-b, --body <body>', 'Body / description of the pull request')
    .option('-H, --head <branch>', 'The branch that contains commits for your pull request')
    .option(
      '-B, --base <branch>',
      'The branch into which you want your code merged (default: main)',
      'main',
    )
    .option('-d, --draft', 'Create pull request as draft')
    .option('-w, --web', 'Open pull request in the web browser after creation')
    .action(
      async (options: {
        repo?: string;
        title?: string;
        body?: string;
        head?: string;
        base?: string;
        draft?: boolean;
        web?: boolean;
      }) => {
        const client = new QuantCliClient();
        const parsed = options.repo ? parseRepoString(options.repo) : getLocalRepoInfo();

        if (!parsed) {
          console.error(
            chalk.red(
              '\nError: No repository specified and unable to detect git repository from current directory.',
            ),
          );
          console.error(
            chalk.gray('Specify repository with -R <owner/repo> or run inside a cloned repo.\n'),
          );
          process.exitCode = 1;
          return;
        }

        const identifier = parsed.fullName || `${parsed.owner}/${parsed.name}`;
        const detectedHead = options.head || getCurrentBranch();
        const base = options.base || 'main';

        let title = options.title;
        let body = options.body;
        let head = detectedHead;

        // Interactive questionnaire if title not supplied in flags
        if (!title) {
          console.log(chalk.bold(`\nCreating pull request for ${chalk.cyan(identifier)}\n`));

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'title',
              message: 'Pull request title:',
              validate: (input: string) => {
                if (!input.trim()) return 'Title is required';
                return true;
              },
            },
            {
              type: 'editor',
              name: 'body',
              message: 'Pull request description (optional):',
              default: '',
            },
            {
              type: 'input',
              name: 'head',
              message: 'Source branch (head):',
              default: head,
            },
            {
              type: 'input',
              name: 'base',
              message: 'Target branch (base):',
              default: base,
            },
          ]);

          title = answers.title.trim();
          body = answers.body ? answers.body.trim() : '';
          head = answers.head ? answers.head.trim() : head;
        }

        const spinner = ora(
          `Submitting pull request ${chalk.cyan(`${head} ➔ ${base}`)}...`,
        ).start();

        try {
          const payload = {
            title,
            body: body || '',
            sourceBranch: head,
            targetBranch: base,
            head,
            base,
            draft: Boolean(options.draft),
          };

          let created: any;
          try {
            created = await client.post<any>(
              `/api/repos/${encodeURIComponent(identifier)}/pulls`,
              payload,
            );
          } catch (firstErr: any) {
            if (firstErr?.status === 404) {
              created = await client.post<any>(
                `/api/repos/${encodeURIComponent(parsed.name)}/pulls`,
                payload,
              );
            } else {
              throw firstErr;
            }
          }

          const prData = created?.data || created;
          const prNumber = prData.number || prData.id || 1;
          const apiUrl = getApiUrl().replace(/\/+$/, '');
          const prWebUrl = `${apiUrl}/quantgit/${identifier}/pulls/${prNumber}`;

          spinner.succeed(chalk.green(`Created pull request #${prNumber} on CodeHub!`));

          console.log('\n' + chalk.bold.green(`✔ Pull request #${prNumber} created successfully.`));
          console.log(chalk.gray(`  Title:     ${chalk.white(title)}`));
          console.log(chalk.gray(`  Branches:  ${chalk.cyan(head)} ➔ ${chalk.cyan(base)}`));
          console.log(chalk.gray(`  Web View:  ${chalk.underline.cyan(prWebUrl)}\n`));

          if (options.web) {
            const opener =
              process.platform === 'win32'
                ? 'start'
                : process.platform === 'darwin'
                  ? 'open'
                  : 'xdg-open';
            spawnSync(opener, [prWebUrl], { shell: true, stdio: 'ignore' });
          }
        } catch (err: any) {
          spinner.fail(chalk.red('Failed to create pull request'));
          console.error(chalk.red(`Error: ${err.message || String(err)}\n`));
          process.exitCode = 1;
        }
      },
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant pr view <number>
  // ─────────────────────────────────────────────────────────────────────────────
  pr.command('view <number>')
    .description('View detailed pull request statistics, diff stats, reviewers, and checks')
    .option('-R, --repo <repo>', 'Target repository (owner/name)')
    .option('-w, --web', 'Open pull request in the web browser')
    .option('--json', 'Output pull request details in JSON format')
    .action(
      async (
        numberArg: string,
        options: {
          repo?: string;
          web?: boolean;
          json?: boolean;
        },
      ) => {
        const client = new QuantCliClient();
        const prNumber = parseInt(numberArg, 10);
        if (isNaN(prNumber) || prNumber <= 0) {
          console.error(chalk.red('\nError: Invalid pull request number specified.\n'));
          process.exitCode = 1;
          return;
        }

        const parsed = options.repo ? parseRepoString(options.repo) : getLocalRepoInfo();
        if (!parsed) {
          console.error(
            chalk.red(
              '\nError: No repository specified and unable to detect git repository from current directory.',
            ),
          );
          console.error(
            chalk.gray('Specify repository with -R <owner/repo> or run inside a cloned repo.\n'),
          );
          process.exitCode = 1;
          return;
        }

        const identifier = parsed.fullName || `${parsed.owner}/${parsed.name}`;
        const apiUrl = getApiUrl().replace(/\/+$/, '');
        const prWebUrl = `${apiUrl}/quantgit/${identifier}/pulls/${prNumber}`;

        if (options.web) {
          console.log(chalk.gray(`Opening ${chalk.cyan(prWebUrl)} in browser...`));
          const opener =
            process.platform === 'win32'
              ? 'start'
              : process.platform === 'darwin'
                ? 'open'
                : 'xdg-open';
          spawnSync(opener, [prWebUrl], { shell: true, stdio: 'ignore' });
          return;
        }

        const spinner = ora(
          `Fetching pull request #${prNumber} in ${chalk.cyan(identifier)}...`,
        ).start();

        try {
          let prData: any = null;
          try {
            const res = await client.get<any>(
              `/api/repos/${encodeURIComponent(identifier)}/pulls/${prNumber}`,
            );
            prData = res?.data || res;
          } catch (firstErr: any) {
            if (firstErr?.status === 404) {
              const res2 = await client.get<any>(
                `/api/repos/${encodeURIComponent(parsed.name)}/pulls/${prNumber}`,
              );
              prData = res2?.data || res2;
            } else {
              throw firstErr;
            }
          }

          // Fetch reviewers if endpoint available
          let reviews: ReviewDto[] = [];
          try {
            const reviewsRes = await client.get<any>(
              `/api/repos/${encodeURIComponent(identifier)}/pulls/${prNumber}/reviews`,
            );
            const rawReviews = Array.isArray(reviewsRes) ? reviewsRes : reviewsRes?.data || [];
            reviews = rawReviews;
          } catch {
            // Non-blocking fallback
          }

          spinner.stop();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  ...prData,
                  reviews,
                },
                null,
                2,
              ),
            );
            return;
          }

          const rawState = (prData.state || prData.status || 'open').toLowerCase();
          let stateBadge = chalk.bgGreen.black(' OPEN ');
          if (rawState === 'merged') {
            stateBadge = chalk.bgMagenta.black(' MERGED ');
          } else if (rawState === 'closed') {
            stateBadge = chalk.bgRed.black(' CLOSED ');
          }

          const sourceBranch = prData.sourceBranch || prData.branchSource || prData.head || 'head';
          const targetBranch = prData.targetBranch || prData.branchTarget || prData.base || 'main';
          const author =
            typeof prData.author === 'string' ? prData.author : prData.author?.username || 'user';
          const additions = prData.additions ?? 0;
          const deletions = prData.deletions ?? 0;
          const changedFiles = prData.changedFiles ?? 0;
          const checksStatus = prData.checksStatus || 'passed';

          console.log(
            '\n' + chalk.bold.white(`PR #${prNumber}: ${prData.title}`) + '  ' + stateBadge,
          );
          console.log(
            chalk.gray(
              `@${author} wants to merge into ${chalk.cyan(targetBranch)} from ${chalk.cyan(sourceBranch)}`,
            ),
          );

          // Diff stats line: +142 -23
          const statsDiff =
            chalk.bold.green(`+${additions}`) +
            ' ' +
            chalk.bold.red(`-${deletions}`) +
            chalk.gray(` (${changedFiles} files changed)`);

          console.log('\n' + chalk.bold('Diff Stats:  ') + statsDiff);

          // Reviewers status
          if (reviews.length > 0) {
            const reviewSummary = reviews
              .map((r) => {
                const username = r.author?.displayName || r.author?.username || 'reviewer';
                if (r.status === 'APPROVED') return chalk.green(`✔ ${username} (Approved)`);
                if (r.status === 'CHANGES_REQUESTED')
                  return chalk.red(`✖ ${username} (Changes Requested)`);
                return chalk.yellow(`⏳ ${username} (Commented)`);
              })
              .join(', ');
            console.log(chalk.bold('Reviewers:   ') + reviewSummary);
          } else {
            console.log(chalk.bold('Reviewers:   ') + chalk.gray('No reviews submitted yet'));
          }

          // Check runs status
          let checkLabel = chalk.green('✔ All checks passed (CI: green)');
          if (checksStatus === 'failure' || checksStatus === 'failed') {
            checkLabel = chalk.red('✖ Checks failing');
          } else if (checksStatus === 'running' || checksStatus === 'in_progress') {
            checkLabel = chalk.yellow('⏳ Checks in progress');
          } else if (checksStatus === 'none') {
            checkLabel = chalk.gray('No status checks reported');
          }
          console.log(chalk.bold('Check Runs:  ') + checkLabel);

          console.log(chalk.gray(`URL:         ${chalk.underline(prWebUrl)}`));
          console.log(chalk.gray('─'.repeat(72)));

          if (prData.body) {
            console.log(chalk.bold.white('Description:\n'));
            console.log(prData.body);
          } else {
            console.log(chalk.gray('(No pull request description provided)'));
          }
          console.log('');
        } catch (err: any) {
          spinner.fail(chalk.red(`Failed to view PR #${prNumber}`));
          console.error(chalk.red(`Error: ${err.message || String(err)}\n`));
          process.exitCode = 1;
        }
      },
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant pr merge <number>
  // ─────────────────────────────────────────────────────────────────────────────
  pr.command('merge <number>')
    .description('Merge a pull request on CodeHub via 3-way git merge')
    .option('-R, --repo <repo>', 'Target repository (owner/name)')
    .option('-m, --merge', 'Create a 3-way merge commit (default)')
    .option('-s, --squash', 'Squash all commits into a single commit')
    .option('-r, --rebase', 'Rebase commits onto the base branch')
    .option('-d, --delete-branch', 'Delete source branch after merging')
    .option('-y, --yes', 'Skip confirmation prompt and merge immediately')
    .action(
      async (
        numberArg: string,
        options: {
          repo?: string;
          merge?: boolean;
          squash?: boolean;
          rebase?: boolean;
          deleteBranch?: boolean;
          yes?: boolean;
        },
      ) => {
        const client = new QuantCliClient();
        const prNumber = parseInt(numberArg, 10);
        if (isNaN(prNumber) || prNumber <= 0) {
          console.error(chalk.red('\nError: Invalid pull request number specified.\n'));
          process.exitCode = 1;
          return;
        }

        const parsed = options.repo ? parseRepoString(options.repo) : getLocalRepoInfo();
        if (!parsed) {
          console.error(
            chalk.red(
              '\nError: No repository specified and unable to detect git repository from current directory.',
            ),
          );
          console.error(
            chalk.gray('Specify repository with -R <owner/repo> or run inside a cloned repo.\n'),
          );
          process.exitCode = 1;
          return;
        }

        const identifier = parsed.fullName || `${parsed.owner}/${parsed.name}`;

        // Verify PR existence & check state first
        let prData: any = null;
        try {
          const res = await client.get<any>(
            `/api/repos/${encodeURIComponent(identifier)}/pulls/${prNumber}`,
          );
          prData = res?.data || res;
        } catch {
          try {
            const res2 = await client.get<any>(
              `/api/repos/${encodeURIComponent(parsed.name)}/pulls/${prNumber}`,
            );
            prData = res2?.data || res2;
          } catch (err: any) {
            console.error(
              chalk.red(
                `\nError: Pull request #${prNumber} not found in ${identifier}: ${err.message}\n`,
              ),
            );
            process.exitCode = 1;
            return;
          }
        }

        const currentState = (prData?.state || prData?.status || 'open').toLowerCase();
        if (currentState === 'merged') {
          console.log(chalk.magenta(`\nPull request #${prNumber} is already merged.\n`));
          return;
        }

        const mergeMethod = options.squash ? 'squash' : options.rebase ? 'rebase' : 'merge';
        const targetBranch = prData.targetBranch || prData.branchTarget || 'main';

        // Confirmation prompt if not -y
        if (!options.yes) {
          const answer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Merge pull request #${prNumber} (${prData.title}) into ${chalk.cyan(targetBranch)} via 3-way merge?`,
              default: true,
            },
          ]);

          if (!answer.confirmed) {
            console.log(chalk.gray('Merge canceled by user.'));
            return;
          }
        }

        const spinner = ora(`Executing 3-way merge for PR #${prNumber} on CodeHub...`).start();

        try {
          const payload = {
            method: mergeMethod,
            deleteBranch: Boolean(options.deleteBranch),
          };

          let result: any;
          try {
            result = await client.post<any>(
              `/api/repos/${encodeURIComponent(identifier)}/pulls/${prNumber}/merge`,
              payload,
            );
          } catch (firstErr: any) {
            if (firstErr?.status === 404) {
              result = await client.post<any>(
                `/api/repos/${encodeURIComponent(parsed.name)}/pulls/${prNumber}/merge`,
                payload,
              );
            } else {
              throw firstErr;
            }
          }

          const mergeData = result?.data || result;
          const commitSha =
            mergeData?.mergeCommitSha || mergeData?.commitSha || 'merge-commit-executed';

          spinner.succeed(chalk.green(`Merged pull request #${prNumber}!`));

          console.log(
            '\n' + chalk.bold.green(`✔ Pull request #${prNumber} merged into ${targetBranch}.`),
          );
          console.log(chalk.gray(`  Method:      3-way ${mergeMethod.toUpperCase()}`));
          console.log(chalk.gray(`  Commit SHA:  ${chalk.cyan(commitSha)}`));
          if (options.deleteBranch) {
            console.log(chalk.gray(`  Branch:      Deleted remote branch ${prData.sourceBranch}`));
          }
          console.log('');
        } catch (err: any) {
          spinner.fail(chalk.red(`Failed to merge pull request #${prNumber}`));
          console.error(chalk.red(`Error: ${err.message || String(err)}\n`));
          process.exitCode = 1;
        }
      },
    );
}
