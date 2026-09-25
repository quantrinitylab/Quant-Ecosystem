import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawnSync } from 'node:child_process';
import { QuantCliClient } from '../client.js';
import { getApiUrl, loadConfig } from '../config.js';
import {
  formatRelativeTime,
  getLocalRepoInfo,
  parseRepoString,
  renderTable,
} from '../git-utils.js';

export interface RepoDto {
  id: string;
  name: string;
  fullName?: string;
  ownerId?: string;
  owner?: { username?: string; name?: string } | string;
  description?: string | null;
  visibility: string;
  defaultBranch?: string;
  stars?: number;
  starCount?: number;
  forks?: number;
  forkCount?: number;
  cloneUrl?: string;
  sshUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Registers all `quant repo` commands matching GitHub's `gh repo` CLI.
 */
export function registerRepoCommands(program: Command): void {
  const repo = program
    .command('repo')
    .description(
      'CodeHub repository management matching GitHub gh CLI (list, clone, view, create)',
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant repo list
  // ─────────────────────────────────────────────────────────────────────────────
  repo
    .command('list')
    .description('List repositories for the authenticated user')
    .option('--json', 'Output repository list in JSON format')
    .option('-L, --limit <number>', 'Maximum number of repositories to list', '30')
    .option('--visibility <visibility>', 'Filter by visibility (public, private)')
    .action(async (options: { json?: boolean; limit?: string; visibility?: string }) => {
      const client = new QuantCliClient();
      const limit = parseInt(options.limit || '30', 10);

      try {
        let endpoint = `/api/repos?pageSize=${encodeURIComponent(limit)}`;
        if (options.visibility) {
          endpoint += `&visibility=${encodeURIComponent(options.visibility)}`;
        }

        let res: any;
        try {
          res = await client.get<any>(endpoint);
        } catch (firstErr: any) {
          // Fallback to /repos if /api prefix is stripped or proxy is configured differently
          if (firstErr?.status === 404) {
            res = await client.get<any>(`/repos?pageSize=${encodeURIComponent(limit)}`);
          } else {
            throw firstErr;
          }
        }

        const rawList: any[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.items)
              ? res.items
              : [];

        const repos: RepoDto[] = rawList.slice(0, limit).map((r) => ({
          id: r.id || r._id || r.name,
          name: r.name,
          fullName: r.fullName || (r.owner ? `${r.owner}/${r.name}` : r.name),
          description: r.description || '',
          visibility: (r.visibility || 'public').toLowerCase(),
          defaultBranch: r.defaultBranch || 'main',
          stars: r.stars ?? r.starCount ?? 0,
          forks: r.forks ?? r.forkCount ?? 0,
          cloneUrl: r.cloneUrl,
          updatedAt: r.updatedAt || r.createdAt,
        }));

        if (options.json) {
          console.log(JSON.stringify(repos, null, 2));
          return;
        }

        if (repos.length === 0) {
          console.log(chalk.yellow('\nNo repositories found.'));
          console.log(
            chalk.gray('Create your first repository with: ') +
              chalk.cyan('quant repo create <name>\n'),
          );
          return;
        }

        console.log(chalk.bold(`\nShowing ${repos.length} repositories\n`));

        const headers = ['NAME', 'VISIBILITY', 'STARS', 'UPDATED'];
        const rows = repos.map((r) => {
          const visColor =
            r.visibility === 'public' ? chalk.green('public') : chalk.yellow('private');
          const starFormatted = chalk.yellow(`★ ${r.stars}`);
          const updatedFormatted = chalk.gray(formatRelativeTime(r.updatedAt));
          const nameFormatted = chalk.bold.cyan(r.fullName || r.name);
          return [nameFormatted, visColor, starFormatted, updatedFormatted];
        });

        console.log(renderTable(headers, rows));
        console.log('');
      } catch (err: any) {
        console.error(chalk.red(`\nFailed to list repositories: ${err.message || String(err)}\n`));
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant repo clone <repo> [directory]
  // ─────────────────────────────────────────────────────────────────────────────
  repo
    .command('clone <repo> [directory]')
    .description('Clone a CodeHub repository locally via git')
    .option('--git-url <url>', 'Override base Git URL')
    .action(async (repoArg: string, directoryArg?: string, options?: { gitUrl?: string }) => {
      const parsed = parseRepoString(repoArg);
      if (!parsed) {
        console.error(chalk.red('\nError: Invalid repository name or URL.\n'));
        process.exitCode = 1;
        return;
      }

      const baseUrl = options?.gitUrl || getApiUrl();
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

      let cloneUrl = parsed.url;
      if (!cloneUrl) {
        // Construct canonical CodeHub git clone URL: https://quantmail.in/git/<repo>.git
        const targetSlug = parsed.fullName || `${parsed.owner}/${parsed.name}`;
        cloneUrl = `${cleanBaseUrl}/git/${targetSlug}.git`;
      }

      const targetDir = directoryArg || parsed.name;

      console.log(chalk.bold(`\nCloning into '${chalk.cyan(targetDir)}'...`));
      console.log(chalk.gray(`Source: ${chalk.underline(cloneUrl)}\n`));

      const gitArgs = ['clone', cloneUrl];
      if (directoryArg) {
        gitArgs.push(directoryArg);
      }

      const result = spawnSync('git', gitArgs, {
        stdio: 'inherit',
      });

      if (result.status !== 0) {
        console.error(chalk.red(`\nGit clone failed with exit code ${result.status}.`));
        console.error(chalk.gray(`Ensure you have git installed and access to ${cloneUrl}\n`));
        process.exitCode = result.status ?? 1;
        return;
      }

      console.log(chalk.bold.green(`\n✔ Successfully cloned repository into ./${targetDir}\n`));
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant repo view [repo]
  // ─────────────────────────────────────────────────────────────────────────────
  repo
    .command('view [repo]')
    .description('Display repository overview, README preview, and statistics')
    .option('--json', 'Output repository details in JSON format')
    .option('-w, --web', 'Open repository in the default web browser')
    .option('-b, --branch <branch>', 'Branch to inspect', 'main')
    .action(
      async (repoArg?: string, options?: { json?: boolean; web?: boolean; branch?: string }) => {
        const client = new QuantCliClient();
        let parsed = repoArg ? parseRepoString(repoArg) : getLocalRepoInfo();

        if (!parsed) {
          console.error(
            chalk.red(
              '\nError: No repository specified and unable to detect git repository from current directory.',
            ),
          );
          console.error(
            chalk.gray(
              'Usage: quant repo view <owner/name> or run inside a cloned repo directory.\n',
            ),
          );
          process.exitCode = 1;
          return;
        }

        const identifier = parsed.fullName || `${parsed.owner}/${parsed.name}`;
        const apiUrl = getApiUrl().replace(/\/+$/, '');

        if (options?.web) {
          const webUrl = `${apiUrl}/quantgit/${identifier}`;
          console.log(chalk.gray(`Opening ${chalk.cyan(webUrl)} in browser...`));
          const opener =
            process.platform === 'win32'
              ? 'start'
              : process.platform === 'darwin'
                ? 'open'
                : 'xdg-open';
          spawnSync(opener, [webUrl], { shell: true, stdio: 'ignore' });
          return;
        }

        const spinner = ora(`Fetching repository details for ${chalk.cyan(identifier)}...`).start();

        try {
          let repoData: any = null;
          try {
            const res = await client.get<any>(`/api/repos/${encodeURIComponent(identifier)}`);
            repoData = res?.data || res;
          } catch {
            try {
              const res2 = await client.get<any>(`/api/repos/${parsed.name}`);
              repoData = res2?.data || res2;
            } catch {
              const res3 = await client.get<any>(`/repos/${encodeURIComponent(identifier)}`);
              repoData = res3?.data || res3;
            }
          }

          const repoId = repoData.id || identifier;
          const defaultBranch = repoData.defaultBranch || options?.branch || 'main';

          // Attempt to fetch README preview
          let readmeContent: string | null = null;
          try {
            const fileRes = await client.get<any>(
              `/api/repos/${encodeURIComponent(repoId)}/file?path=README.md&ref=${encodeURIComponent(defaultBranch)}`,
            );
            const rawBlob = fileRes?.data?.content ?? fileRes?.content ?? fileRes?.data;
            if (typeof rawBlob === 'string') {
              readmeContent = rawBlob;
            } else if (rawBlob?.data && typeof rawBlob.data === 'string') {
              readmeContent = rawBlob.data;
            }
          } catch {
            // If README not found or endpoint unavailable, gracefully continue
          }

          spinner.stop();

          if (options?.json) {
            console.log(
              JSON.stringify(
                {
                  ...repoData,
                  readme: readmeContent,
                },
                null,
                2,
              ),
            );
            return;
          }

          // Render CLI View matching GitHub gh repo view
          const visibilityBadge =
            (repoData.visibility || 'public').toLowerCase() === 'public'
              ? chalk.bgGreen.black(' PUBLIC ')
              : chalk.bgYellow.black(' PRIVATE ');

          console.log(
            '\n' + chalk.bold.white(repoData.fullName || identifier) + '  ' + visibilityBadge,
          );

          if (repoData.description) {
            console.log(chalk.italic.gray(repoData.description));
          }

          console.log('');
          console.log(
            chalk.yellow(`★ ${repoData.stars ?? repoData.starCount ?? 0} stars`) +
              chalk.gray('  |  ') +
              chalk.cyan(`⑂ ${repoData.forks ?? repoData.forkCount ?? 0} forks`) +
              chalk.gray('  |  ') +
              chalk.magenta(`🌿 ${defaultBranch}`) +
              chalk.gray('  |  ') +
              chalk.gray(`Updated ${formatRelativeTime(repoData.updatedAt || repoData.createdAt)}`),
          );

          const cloneUrl = repoData.cloneUrl || `${apiUrl}/git/${identifier}.git`;
          console.log(chalk.gray(`Clone URL: ${chalk.underline(cloneUrl)}`));
          console.log(chalk.gray('─'.repeat(72)));

          if (readmeContent) {
            console.log(chalk.bold.cyan('📖 README.md Preview:\n'));
            const lines = readmeContent.split('\n').slice(0, 30);
            console.log(lines.join('\n'));
            if (readmeContent.split('\n').length > 30) {
              console.log(chalk.gray('\n... (view complete file on CodeHub web)'));
            }
          } else {
            console.log(chalk.gray('(No README.md preview available for this repository)'));
          }
          console.log('');
        } catch (err: any) {
          spinner.fail(chalk.red(`Failed to view repository ${identifier}`));
          console.error(chalk.red(`Error: ${err.message || String(err)}\n`));
          process.exitCode = 1;
        }
      },
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant repo create <name>
  // ─────────────────────────────────────────────────────────────────────────────
  repo
    .command('create <name>')
    .description('Create a new CodeHub repository')
    .option('--public', 'Make the repository public')
    .option('--private', 'Make the repository private (default)')
    .option('-d, --description <description>', 'Description of the repository')
    .option('-i, --init', 'Initialize repository with a README.md file')
    .option('-c, --clone', 'Clone the repository locally after creation')
    .action(
      async (
        nameArg: string,
        options: {
          public?: boolean;
          private?: boolean;
          description?: string;
          init?: boolean;
          clone?: boolean;
        },
      ) => {
        const client = new QuantCliClient();
        const cleanName = nameArg.trim();

        if (!cleanName || !/^[a-zA-Z0-9._-]+$/.test(cleanName)) {
          console.error(
            chalk.red(
              '\nError: Repository name may only contain alphanumeric characters, hyphens, periods, and underscores.\n',
            ),
          );
          process.exitCode = 1;
          return;
        }

        const isPublic = Boolean(options.public);
        const visibility = isPublic ? 'public' : 'private';

        const config = loadConfig();
        const defaultOwner = config.user?.name || config.user?.email?.split('@')[0] || 'user';

        const spinner = ora(
          `Creating ${visibility} repository ${chalk.cyan(cleanName)} on CodeHub...`,
        ).start();

        try {
          const payload = {
            name: cleanName,
            owner: defaultOwner,
            description: options.description || '',
            visibility: visibility,
            initReadme: Boolean(options.init),
          };

          let created: any;
          try {
            created = await client.post<any>('/api/repos', payload);
          } catch (firstErr: any) {
            if (firstErr?.status === 404) {
              created = await client.post<any>('/repos', payload);
            } else {
              throw firstErr;
            }
          }

          const repoData = created?.data || created;
          const repoFullName = repoData.fullName || `${defaultOwner}/${cleanName}`;
          const apiUrl = getApiUrl().replace(/\/+$/, '');
          const cloneUrl = repoData.cloneUrl || `${apiUrl}/git/${repoFullName}.git`;

          spinner.succeed(
            chalk.green(`Created repository ${chalk.bold(repoFullName)} on CodeHub!`),
          );

          console.log('\n' + chalk.bold.green('✔ Repository initialized successfully.'));
          console.log(
            chalk.gray(
              `  Visibility: ${isPublic ? chalk.green('PUBLIC') : chalk.yellow('PRIVATE')}`,
            ),
          );
          if (options.description) {
            console.log(chalk.gray(`  Description: ${chalk.white(options.description)}`));
          }
          console.log(
            chalk.gray(`  Web:        ${chalk.cyan(`${apiUrl}/quantgit/${repoFullName}`)}`),
          );
          console.log(chalk.gray(`  Clone URL:  ${chalk.cyan(cloneUrl)}\n`));

          if (options.clone) {
            console.log(chalk.bold(`Cloning ${repoFullName} into ./${cleanName}...`));
            spawnSync('git', ['clone', cloneUrl, cleanName], { stdio: 'inherit' });
          } else {
            console.log(chalk.gray('To clone this repository locally, run:'));
            console.log(chalk.bold.cyan(`  quant repo clone ${repoFullName}\n`));
          }
        } catch (err: any) {
          spinner.fail(chalk.red(`Failed to create repository ${cleanName}`));
          console.error(chalk.red(`Error: ${err.message || String(err)}\n`));
          process.exitCode = 1;
        }
      },
    );
}
