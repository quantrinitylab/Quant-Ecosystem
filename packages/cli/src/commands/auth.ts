import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { clearConfig, getApiUrl, getToken, loadConfig, saveConfig } from '../config.js';
import { QuantCliClient } from '../client.js';

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command('auth')
    .description('Manage Quant account authentication and API tokens');

  // Subcommand: quant auth login
  auth
    .command('login')
    .description('Authenticate with your Quant account via email/password or API token')
    .option('-t, --token <token>', 'Authenticate directly with an API or session token')
    .option('-u, --url <url>', 'Override Quant API endpoint URL for this login')
    .option('-e, --email <email>', 'Account email (skips prompt)')
    .option('-p, --password <password>', 'Account password (skips prompt)')
    .action(
      async (options: { token?: string; url?: string; email?: string; password?: string }) => {
        const targetUrl = options.url || getApiUrl();

        // Path A: Authenticate with direct token
        if (options.token) {
          const spinner = ora('Validating API token with Quant server...').start();
          const client = new QuantCliClient({ apiUrl: targetUrl, token: options.token });

          try {
            let sessionUser: any = null;
            try {
              const session = await client.get<any>('/api/auth/session');
              sessionUser = session?.user || session?.data?.user || session?.session?.user;
            } catch (sessionErr: any) {
              try {
                const me = await client.get<any>('/api/auth/me');
                sessionUser = me?.user || me;
              } catch {
                if (sessionErr?.status === 401 || sessionErr?.status === 403) {
                  throw sessionErr;
                }
              }
            }

            const userEmail = sessionUser?.email || 'authenticated-user';
            const userName = sessionUser?.name || sessionUser?.fullName || userEmail.split('@')[0];
            const userId = sessionUser?.id || sessionUser?._id || 'user';

            saveConfig({
              apiUrl: targetUrl,
              token: options.token,
              user: {
                id: userId,
                email: userEmail,
                name: userName,
              },
            });

            spinner.succeed(chalk.green('Authentication successful!'));
            console.log(chalk.bold.green('✔ Logged in successfully to Quant Ecosystem.'));
            console.log(
              chalk.gray(`  User:    ${chalk.white(userName)} <${chalk.cyan(userEmail)}>`),
            );
            console.log(chalk.gray(`  API:     ${chalk.cyan(targetUrl)}`));
            console.log(chalk.gray(`  Config:  ~/.quant/config.json\n`));
            return;
          } catch (err: any) {
            spinner.fail(chalk.red('Authentication failed.'));
            console.error(
              chalk.red(
                `Error: ${err.message || 'Invalid token or unable to reach Quant server.'}`,
              ),
            );
            process.exitCode = 1;
            return;
          }
        }

        // Path B: Interactive email & password login
        let email = options.email;
        let password = options.password;

        if (!email || !password) {
          console.log(chalk.bold('\n🔐 Quant Ecosystem Authentication'));
          console.log(chalk.gray(`Endpoint: ${chalk.cyan(targetUrl)}\n`));

          const questions: any[] = [];
          if (!email) {
            questions.push({
              type: 'input',
              name: 'email',
              message: 'Quant account email:',
              validate: (input: string) => {
                const trimmed = input.trim();
                if (!trimmed) return 'Email is required';
                if (!trimmed.includes('@')) return 'Please enter a valid email address';
                return true;
              },
            });
          }
          if (!password) {
            questions.push({
              type: 'password',
              name: 'password',
              message: 'Quant account password:',
              mask: '*',
              validate: (input: string) => (input.length > 0 ? true : 'Password is required'),
            });
          }

          const answers = await inquirer.prompt(questions);
          if (!email) email = answers.email;
          if (!password) password = answers.password;
        }

        const spinner = ora('Logging in to Quant Ecosystem...').start();
        const client = new QuantCliClient({ apiUrl: targetUrl });

        try {
          const result = await client.post<any>('/api/auth/login', {
            email: email!.trim(),
            password,
          });

          const token =
            result?.token ||
            result?.accessToken ||
            result?.sessionToken ||
            result?.session?.token ||
            result?.data?.token;

          if (!token) {
            throw new Error('Server response succeeded but no session token was returned.');
          }

          const userObj = result?.user || result?.session?.user || result?.data?.user;
          const resolvedEmail = userObj?.email || email!.trim();
          const resolvedName = userObj?.name || userObj?.fullName || resolvedEmail.split('@')[0];
          const resolvedId = userObj?.id || userObj?._id || 'user';

          saveConfig({
            apiUrl: targetUrl,
            token,
            user: {
              id: resolvedId,
              email: resolvedEmail,
              name: resolvedName,
            },
          });

          spinner.succeed(chalk.green('Login successful!'));
          console.log(chalk.bold.green(`✔ Welcome back, ${resolvedName}!`));
          console.log(chalk.gray(`  Email:   ${chalk.cyan(resolvedEmail)}`));
          console.log(chalk.gray(`  API:     ${chalk.cyan(targetUrl)}`));
          console.log(chalk.gray(`  Config:  ~/.quant/config.json\n`));
        } catch (err: any) {
          spinner.fail(chalk.red('Login failed.'));
          console.error(
            chalk.red(`Error: ${err.message || 'Invalid credentials or login rejected.'}`),
          );
          process.exitCode = 1;
        }
      },
    );

  // Subcommand: quant auth logout
  auth
    .command('logout')
    .description('Clear saved credentials and log out')
    .action(() => {
      clearConfig();
      console.log(chalk.green('✔ Successfully logged out. Cleared saved credentials.'));
    });

  // Subcommand: quant auth status
  auth
    .command('status')
    .description('Display current authentication status')
    .action(() => {
      const config = loadConfig();
      const token = getToken();
      const apiUrl = getApiUrl();

      console.log(chalk.bold('\nQuant Authentication Status:'));
      console.log(chalk.gray('────────────────────────────────────────'));
      console.log(`${chalk.gray('API Endpoint:')}   ${chalk.cyan(apiUrl)}`);

      if (token) {
        console.log(`${chalk.gray('Status:')}         ${chalk.green('● Logged in')}`);
        if (config.user) {
          console.log(`${chalk.gray('Name:')}           ${chalk.white(config.user.name || 'N/A')}`);
          console.log(`${chalk.gray('Email:')}          ${chalk.cyan(config.user.email)}`);
          if (config.user.id) {
            console.log(`${chalk.gray('User ID:')}        ${chalk.white(config.user.id)}`);
          }
        }
        if (config.defaultWorkspace) {
          console.log(`${chalk.gray('Workspace:')}      ${chalk.white(config.defaultWorkspace)}`);
        }
        const maskedToken =
          token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-4)}` : '••••••••';
        console.log(`${chalk.gray('Token:')}          ${chalk.yellow(maskedToken)}`);
      } else {
        console.log(`${chalk.gray('Status:')}         ${chalk.yellow('○ Not logged in')}`);
        console.log(chalk.gray(`\nRun ${chalk.cyan('quant auth login')} to authenticate.`));
      }
      console.log();
    });

  // Subcommand: quant auth whoami
  auth
    .command('whoami')
    .description('Print the email of the currently authenticated user')
    .action(() => {
      const config = loadConfig();
      const token = getToken();
      if (token && config.user?.email) {
        console.log(config.user.email);
      } else {
        console.log('Not logged in');
      }
    });

  // Subcommand: quant auth token
  auth
    .command('token')
    .description('Print raw auth token for scripting')
    .action(() => {
      const token = getToken();
      if (token) {
        process.stdout.write(token.trim() + '\n');
      } else {
        console.error(chalk.red('Error: Not logged in. No authentication token found.'));
        process.exitCode = 1;
      }
    });

  // Default action if `quant auth` is called without subcommands
  auth.action(() => {
    auth.outputHelp();
  });
}
