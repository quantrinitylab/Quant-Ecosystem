import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { QuantCliClient } from '../client.js';
import { renderTable } from '../git-utils.js';

export interface RoomDto {
  id: string;
  title: string;
  topic?: string | null;
  tags?: string[];
  host?: { name?: string; username?: string } | string;
  hostName?: string;
  participantsCount?: number;
  participants?: any[];
  isLive?: boolean;
}

/**
 * Formats active audio rooms list into an ANSI table.
 */
export function formatRoomTable(rooms: any[]): string {
  if (!rooms || rooms.length === 0) return chalk.gray('No active live audio rooms found.');

  const headers = ['ID', 'Title', 'Topic', 'Host', 'Participants'];
  const rows = rooms.map((r) => {
    const id = r.id || 'N/A';
    const title = r.title || 'Untitled Room';
    const topic = r.topic || '-';
    const host =
      typeof r.host === 'object' && r.host !== null
        ? r.host.name || r.host.username || 'Host'
        : r.hostName || r.host || 'Host';
    const count =
      r.participantsCount !== undefined
        ? r.participantsCount
        : Array.isArray(r.participants)
          ? r.participants.length
          : 1;

    return [
      chalk.gray(id),
      chalk.bold.white(title),
      chalk.cyan(topic),
      chalk.white(host),
      chalk.yellow(`${count} 🎧`),
    ];
  });

  return renderTable(headers, rows);
}

/**
 * Registers all `quant room` commands.
 */
export function registerRoomCommands(
  program: Command,
  getClient: () => QuantCliClient = () => new QuantCliClient(),
): void {
  const room = program
    .command('room')
    .description(
      'Chatter Live Audio Rooms: list rooms, create live audio spaces, and join as speaker/listener',
    );

  // Subcommand: quant room list
  room
    .command('list')
    .description('Lists active live social audio rooms in an ANSI table')
    .option('--json', 'Output rooms in JSON format')
    .action(async (options: { json?: boolean }) => {
      const spinner = !options.json
        ? ora('Fetching active Chatter live audio rooms...').start()
        : null;
      const client = getClient();

      try {
        let res: any;
        try {
          res = await client.get<any>('/api/rooms');
        } catch {
          try {
            res = await client.get<any>('/api/chatter/rooms');
          } catch {
            res = await client.get<any>('/rooms');
          }
        }

        spinner?.stop();
        const rooms = Array.isArray(res) ? res : res?.data || res?.rooms || [];

        if (options.json) {
          console.log(JSON.stringify(rooms, null, 2));
          return;
        }

        console.log(chalk.bold('\n🎙️ Chatter Live Social Audio Rooms'));
        console.log(formatRoomTable(rooms));
        console.log(
          chalk.gray(`\n💡 Tip: Run ${chalk.cyan('quant room join <id>')} to enter a room\n`),
        );
      } catch (err: any) {
        spinner?.fail(chalk.red('Failed to fetch audio rooms.'));
        console.error(chalk.red(`Error: ${err.message || 'Unable to retrieve live rooms'}`));
        process.exitCode = 1;
      }
    });

  // Subcommand: quant room create <title>
  room
    .command('create <title>')
    .description('Creates an audio room with optional --topic and --tags')
    .option('-t, --topic <topic>', 'Audio room discussion topic')
    .option('--tags <tags>', 'Comma-separated tags (e.g. startup,tech,ai)')
    .option('--json', 'Output created room in JSON format')
    .action(async (title: string, options: { topic?: string; tags?: string; json?: boolean }) => {
      const spinner = !options.json ? ora(`Creating live audio room "${title}"...`).start() : null;
      const client = getClient();

      try {
        const tagsArray = options.tags
          ? options.tags
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        const payload = {
          title,
          topic: options.topic || '',
          tags: tagsArray,
        };

        let res: any;
        try {
          res = await client.post<any>('/api/rooms', payload);
        } catch {
          try {
            res = await client.post<any>('/api/chatter/rooms', payload);
          } catch {
            res = await client.post<any>('/rooms', payload);
          }
        }

        spinner?.stop();
        const createdRoom = res?.data || res;

        if (options.json) {
          console.log(JSON.stringify(createdRoom, null, 2));
          return;
        }

        console.log(chalk.bold.green('\n✔ Chatter Live Audio Room created successfully!'));
        console.log(`  Room ID:     ${chalk.cyan(createdRoom?.id || 'live-room-1')}`);
        console.log(`  Title:       ${chalk.bold.white(createdRoom?.title || title)}`);
        if (createdRoom?.topic) {
          console.log(`  Topic:       ${chalk.cyan(createdRoom.topic)}`);
        }
        if (tagsArray.length > 0) {
          console.log(`  Tags:        ${chalk.magenta(tagsArray.join(', '))}`);
        }
        console.log(
          chalk.gray(
            `\n💡 Invite participants to join using: ${chalk.cyan(`quant room join ${createdRoom?.id || 'id'}`)}\n`,
          ),
        );
      } catch (err: any) {
        spinner?.fail(chalk.red('Failed to create audio room.'));
        console.error(chalk.red(`Error: ${err.message || 'Unable to create room'}`));
        process.exitCode = 1;
      }
    });

  // Subcommand: quant room join <id>
  room
    .command('join <id>')
    .description('Joins an audio room as a listener or speaker')
    .option('-r, --role <role>', 'Role in room (listener or speaker)', 'listener')
    .option('--json', 'Output join status in JSON format')
    .action(async (id: string, options: { role?: string; json?: boolean }) => {
      const role = (options.role || 'listener').toLowerCase();
      const spinner = !options.json
        ? ora(`Joining audio room ${chalk.cyan(id)} as ${role}...`).start()
        : null;
      const client = getClient();

      try {
        const payload = { role };
        let res: any;
        try {
          res = await client.post<any>(`/api/rooms/${encodeURIComponent(id)}/join`, payload);
        } catch {
          try {
            res = await client.post<any>(
              `/api/chatter/rooms/${encodeURIComponent(id)}/join`,
              payload,
            );
          } catch {
            res = await client.post<any>(`/rooms/${encodeURIComponent(id)}/join`, payload);
          }
        }

        spinner?.stop();
        const joinData = res?.data || res;

        if (options.json) {
          console.log(JSON.stringify(joinData, null, 2));
          return;
        }

        console.log(chalk.bold.green(`\n✔ Connected to Chatter Live Audio Room!`));
        console.log(`  Room ID:   ${chalk.cyan(id)}`);
        console.log(`  Role:      ${chalk.bold.yellow(role.toUpperCase())}`);
        console.log(
          chalk.gray(
            `  Status:    Live audio session active. Press ${chalk.bold('Ctrl+C')} to disconnect.\n`,
          ),
        );
      } catch (err: any) {
        spinner?.fail(chalk.red(`Failed to join room ${id}.`));
        console.error(chalk.red(`Error: ${err.message || 'Unable to join audio room'}`));
        process.exitCode = 1;
      }
    });
}
