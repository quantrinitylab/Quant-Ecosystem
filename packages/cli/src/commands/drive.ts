import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { QuantCliClient } from '../client.js';
import { getApiUrl, getToken } from '../config.js';
import { formatRelativeTime, renderTable } from '../git-utils.js';

/**
 * Formats byte counts into human-readable strings (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Formats byte counts specifically in gigabytes (GB).
 */
export function formatGigabytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.00 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(decimals)} GB`;
}

/**
 * Generates an ASCII/Unicode progress bar with colored fill.
 */
export function renderProgressBar(used: number, total: number, width = 30): string {
  const ratio = total > 0 ? Math.min(Math.max(used / total, 0), 1) : 0;
  const percent = (ratio * 100).toFixed(1);
  const filledChars = Math.round(ratio * width);
  const emptyChars = width - filledChars;

  let colorFn = chalk.green;
  if (ratio >= 0.9) {
    colorFn = chalk.red;
  } else if (ratio >= 0.7) {
    colorFn = chalk.yellow;
  }

  const bar = colorFn('█'.repeat(filledChars)) + chalk.gray('░'.repeat(emptyChars));
  return `[${bar}] ${colorFn(`${percent}%`)}`;
}

/**
 * Returns an appropriate icon based on file type / mimeType / name.
 */
export function getDriveItemIcon(isFolder: boolean, mimeType?: string, name?: string): string {
  if (isFolder) return '📁';
  const m = (mimeType || '').toLowerCase();
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';

  if (m.includes('pdf') || ext === 'pdf') return '📕';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return '🖼️';
  if (m.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return '🎬';
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return '🎵';
  if (
    m.includes('zip') ||
    m.includes('tar') ||
    m.includes('compressed') ||
    ['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)
  ) {
    return '📦';
  }
  if (['ts', 'js', 'py', 'go', 'rs', 'c', 'cpp', 'java', 'html', 'css'].includes(ext)) {
    return '💻';
  }
  if (
    m.includes('spreadsheet') ||
    m.includes('excel') ||
    m.includes('csv') ||
    ['xls', 'xlsx', 'csv'].includes(ext)
  ) {
    return '📊';
  }
  if (
    m.startsWith('text/') ||
    m.includes('json') ||
    m.includes('yaml') ||
    ['txt', 'md', 'json'].includes(ext)
  ) {
    return '📝';
  }
  return '📄';
}

/**
 * Guesses MIME type from common file extensions.
 */
function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.ts': 'application/typescript',
    '.js': 'application/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export interface DriveFileItem {
  id: string;
  name: string;
  type?: 'file' | 'folder';
  isFolder?: boolean;
  mimeType?: string;
  size?: number;
  parentId?: string | null;
  folderId?: string | null;
  modifiedAt?: string | Date;
  updatedAt?: string | Date;
  isStarred?: boolean;
}

export interface DriveQuotaResponse {
  used: number;
  total: number;
  tier?: string;
  percentUsed?: number;
}

export interface DuplicateGroupItem {
  hash: string;
  files: Array<{ id: string; name: string; size: number }>;
}

export interface DuplicateResponse {
  groups: DuplicateGroupItem[];
}

/**
 * Registers all `quant drive` subcommands matching Google Drive & Dropbox CLI.
 */
export function registerDriveCommands(program: Command): void {
  const drive = program
    .command('drive')
    .description('QuantDrive file uploads, downloads, quota inspection, and AI deduplication');

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant drive ls [folderId]
  // ─────────────────────────────────────────────────────────────────────────────
  drive
    .command('ls [folderId]')
    .description('List files and folders with Type icon, Name, Size, and Modified date')
    .option('-L, --limit <number>', 'Maximum number of items to list', '50')
    .option('-s, --sort <field>', 'Sort by name, updatedAt, or size', 'updatedAt')
    .option('-d, --dir <direction>', 'Sort direction (asc, desc)', 'desc')
    .option('--json', 'Output results in JSON format')
    .action(
      async (
        folderId: string | undefined,
        options: { limit?: string; sort?: string; dir?: string; json?: boolean },
      ) => {
        const spinner = ora('Fetching files and folders from QuantDrive...').start();
        const client = new QuantCliClient();

        try {
          const queryParams = new URLSearchParams();
          if (folderId) queryParams.set('folderId', folderId);
          if (options.limit) queryParams.set('limit', options.limit);
          if (options.sort) queryParams.set('sortBy', options.sort);
          if (options.dir) queryParams.set('sortDir', options.dir);

          let data: any;
          try {
            data = await client.get<any>(`/api/drive/files?${queryParams.toString()}`);
          } catch (err: any) {
            data = await client.get<any>(`/drive/files?${queryParams.toString()}`);
          }

          const items: DriveFileItem[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.files)
              ? data.files
              : [];

          spinner.stop();

          if (options.json) {
            console.log(JSON.stringify(items, null, 2));
            return;
          }

          if (items.length === 0) {
            console.log(
              chalk.gray(
                `\n  (no files or folders found in ${folderId ? `folder ${folderId}` : 'QuantDrive'})\n`,
              ),
            );
            return;
          }

          const rows: string[][] = [];
          let folderCount = 0;
          let fileCount = 0;

          for (const item of items) {
            const isDir =
              item.type === 'folder' ||
              item.isFolder === true ||
              item.mimeType === 'application/vnd.quant.folder';
            if (isDir) {
              folderCount++;
            } else {
              fileCount++;
            }

            const icon = getDriveItemIcon(isDir, item.mimeType, item.name);
            const typeStr = `${icon} ${isDir ? chalk.cyan('FOLDER') : chalk.gray('FILE')}`;
            const nameStr = isDir ? chalk.bold.cyan(item.name) : chalk.white(item.name);
            const sizeStr = isDir ? chalk.gray('-') : chalk.yellow(formatBytes(item.size || 0));
            const modDate = item.modifiedAt || item.updatedAt;
            const dateStr = modDate ? chalk.gray(formatRelativeTime(modDate)) : chalk.gray('-');
            const idStr = chalk.gray(item.id);

            rows.push([typeStr, nameStr, sizeStr, dateStr, idStr]);
          }

          const headers = ['TYPE', 'NAME', 'SIZE', 'MODIFIED', 'ID'];
          console.log('\n' + renderTable(headers, rows) + '\n');

          const summary = chalk.gray(
            `Total: ${items.length} item(s) (${folderCount} folder(s), ${fileCount} file(s))` +
              (data?.quota
                ? `  |  Quota: ${formatBytes(data.quota.used)} / ${formatBytes(data.quota.total)} used`
                : ''),
          );
          console.log(`  ${summary}\n`);
        } catch (err: any) {
          spinner.fail(chalk.red('Failed to list QuantDrive contents.'));
          console.error(
            chalk.red(`Error: ${err.message || 'Unable to connect to QuantDrive API'}`),
          );
          process.exitCode = 1;
        }
      },
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant drive upload <filePath>
  // ─────────────────────────────────────────────────────────────────────────────
  drive
    .command('upload <filePath>')
    .description('Upload local file to QuantDrive with live progress spinner')
    .option('-f, --folder <folderId>', 'Destination folder ID in QuantDrive')
    .option('-n, --name <name>', 'Override destination filename')
    .action(async (filePath: string, options: { folder?: string; name?: string }) => {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        console.error(chalk.red(`Error: Local file not found at: ${resolvedPath}`));
        process.exitCode = 1;
        return;
      }

      const stats = fs.statSync(resolvedPath);
      if (stats.isDirectory()) {
        console.error(
          chalk.red(
            `Error: Path is a directory: ${resolvedPath}. Please provide a file to upload.`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const fileName = options.name || path.basename(resolvedPath);
      const mimeType = guessMimeType(fileName);
      const folderId = options.folder || null;

      const spinner = ora(
        `Reading local file and preparing upload (${formatBytes(stats.size)})...`,
      ).start();
      const client = new QuantCliClient();

      try {
        const fileBuffer = fs.readFileSync(resolvedPath);
        spinner.text = `Uploading ${chalk.bold.white(fileName)} to QuantDrive...`;

        let uploadResult: any = null;

        // Strategy A: Try FormData with global FormData / Blob
        try {
          const formData = new FormData();
          const blob = new Blob([fileBuffer], { type: mimeType });
          formData.append('file', blob, fileName);
          if (folderId) {
            formData.append('folderId', folderId);
          }
          uploadResult = await client.post<any>('/api/drive/upload', formData);
        } catch (formErr: any) {
          // Strategy B: Fallback to JSON payload with base64 content
          const payload = {
            name: fileName,
            mimeType,
            folderId,
            contentBase64: fileBuffer.toString('base64'),
          };

          try {
            uploadResult = await client.post<any>('/api/drive/upload', payload);
          } catch {
            uploadResult = await client.post<any>('/drive/upload', payload);
          }
        }

        const uploadedFile = uploadResult?.file || uploadResult?.data?.file || uploadResult;
        spinner.succeed(chalk.green(`✔ File uploaded successfully: ${chalk.bold.white(fileName)}`));

        console.log(chalk.gray(`  File ID:    ${chalk.cyan(uploadedFile?.id || 'uploaded')}`));
        console.log(chalk.gray(`  Size:       ${chalk.yellow(formatBytes(stats.size))}`));
        console.log(chalk.gray(`  MIME Type:  ${chalk.white(mimeType)}`));
        console.log(
          chalk.gray(`  Folder:     ${folderId ? chalk.cyan(folderId) : chalk.gray('Root (/)')}\n`),
        );
      } catch (err: any) {
        spinner.fail(chalk.red('File upload failed.'));
        console.error(chalk.red(`Error: ${err.message || 'Unable to upload file to QuantDrive'}`));
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant drive download <fileId> [outputPath]
  // ─────────────────────────────────────────────────────────────────────────────
  drive
    .command('download <fileId> [outputPath]')
    .description('Download file from QuantDrive to local disk')
    .action(async (fileId: string, outputPath?: string) => {
      const spinner = ora(`Downloading file ${chalk.cyan(fileId)} from QuantDrive...`).start();
      const token = getToken();
      const baseUrl = getApiUrl().replace(/\/+$/, '');

      try {
        let downloadUrl = `${baseUrl}/api/drive/files/${fileId}/download`;
        let res = await fetch(downloadUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          downloadUrl = `${baseUrl}/drive/files/${fileId}/download`;
          res = await fetch(downloadUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
        }

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
        }

        // Determine destination file path
        let destinationFilename = `downloaded-${fileId}`;
        const disposition = res.headers.get('content-disposition');
        if (disposition) {
          const filenameMatch = disposition.match(/filename=["']?([^"';]+)["']?/i);
          if (filenameMatch && filenameMatch[1]) {
            destinationFilename = filenameMatch[1].trim();
          }
        }

        let targetPath: string;
        if (!outputPath) {
          targetPath = path.resolve(process.cwd(), destinationFilename);
        } else {
          const resolvedOutput = path.resolve(process.cwd(), outputPath);
          if (fs.existsSync(resolvedOutput) && fs.statSync(resolvedOutput).isDirectory()) {
            targetPath = path.join(resolvedOutput, destinationFilename);
          } else if (outputPath.endsWith('/') || outputPath.endsWith('\\')) {
            fs.mkdirSync(resolvedOutput, { recursive: true });
            targetPath = path.join(resolvedOutput, destinationFilename);
          } else {
            targetPath = resolvedOutput;
          }
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.writeFileSync(targetPath, buffer);
        spinner.succeed(
          chalk.green(`✔ Downloaded file: ${chalk.bold.white(path.basename(targetPath))}`),
        );

        console.log(chalk.gray(`  Destination: ${chalk.cyan(targetPath)}`));
        console.log(chalk.gray(`  Size:        ${chalk.yellow(formatBytes(buffer.length))}\n`));
      } catch (err: any) {
        spinner.fail(chalk.red('File download failed.'));
        console.error(
          chalk.red(`Error: ${err.message || 'Unable to download file from QuantDrive'}`),
        );
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant drive quota
  // ─────────────────────────────────────────────────────────────────────────────
  drive
    .command('quota')
    .description('Display QuantDrive storage quota, terminal progress bar, and used/total GB')
    .option('--json', 'Output quota details in JSON format')
    .action(async (options: { json?: boolean }) => {
      const spinner = ora('Fetching storage quota from QuantDrive...').start();
      const client = new QuantCliClient();

      try {
        let quota: DriveQuotaResponse;
        try {
          quota = await client.get<DriveQuotaResponse>('/api/drive/quota');
        } catch {
          quota = await client.get<DriveQuotaResponse>('/drive/quota');
        }

        spinner.stop();

        const used = (quota as any).used ?? (quota as any).usedBytes ?? 0;
        const total = (quota as any).total ?? (quota as any).totalBytes ?? 15 * 1024 * 1024 * 1024; // Default 15 GB
        const percent = total > 0 ? (used / total) * 100 : 0;
        const remaining = Math.max(0, total - used);
        const tier = quota.tier || 'Standard';

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                ...quota,
                used,
                total,
                usedBytes: used,
                totalBytes: total,
                tier,
                percentUsed: quota.percentUsed ?? parseFloat(percent.toFixed(1)),
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(chalk.bold('\n💾 QuantDrive Storage Quota'));
        console.log(`  Tier:       ${chalk.bold.cyan(tier)}`);
        console.log(
          `  Usage:      ${chalk.bold.white(formatGigabytes(used))} of ${chalk.bold.white(formatGigabytes(total))} used (${percent.toFixed(1)}%)`,
        );
        console.log(`  Available:  ${chalk.green(formatGigabytes(remaining))}`);
        console.log(`  Progress:   ${renderProgressBar(used, total, 32)}\n`);
      } catch (err: any) {
        spinner.fail(chalk.red('Failed to fetch storage quota.'));
        console.error(
          chalk.red(`Error: ${err.message || 'Unable to retrieve quota from QuantDrive API'}`),
        );
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant drive duplicates
  // ─────────────────────────────────────────────────────────────────────────────
  drive
    .command('duplicates')
    .description('Scan for duplicate files with Quant AI and display potential reclaimable space')
    .option('--json', 'Output duplicate analysis in JSON format')
    .action(async (options: { json?: boolean }) => {
      const spinner = ora(
        'Analyzing QuantDrive storage with Quant AI deduplication engine...',
      ).start();
      const client = new QuantCliClient();

      try {
        let res: DuplicateResponse;
        try {
          res = await client.post<DuplicateResponse>('/api/drive/ai/duplicates');
        } catch {
          res = await client.post<DuplicateResponse>('/drive/ai/duplicates');
        }

        const groups = res?.groups || [];
        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(res, null, 2));
          return;
        }

        if (groups.length === 0) {
          console.log(
            chalk.green(
              '\n✔ No duplicate files found. Your QuantDrive storage is fully optimized!\n',
            ),
          );
          return;
        }

        let totalReclaimableBytes = 0;
        let totalDuplicateCopies = 0;

        for (const group of groups) {
          if (group.files.length > 1) {
            const redundant = group.files.slice(1);
            totalDuplicateCopies += redundant.length;
            totalReclaimableBytes += redundant.reduce((sum, f) => sum + (f.size || 0), 0);
          }
        }

        console.log(
          chalk.bold.yellow(
            `\n🔍 Found ${groups.length} duplicate group(s) (${totalDuplicateCopies} duplicate file(s))`,
          ),
        );
        console.log(
          chalk.bold.green(
            `  Potential Reclaimable Space: ${formatBytes(totalReclaimableBytes)}\n`,
          ),
        );

        groups.forEach((group, index) => {
          const shortHash = group.hash ? group.hash.slice(0, 16) : 'group';
          console.log(chalk.bold.cyan(`  Group #${index + 1} [Hash: ${shortHash}...]`));

          group.files.forEach((file, fileIdx) => {
            const isOriginal = fileIdx === 0;
            const badge = isOriginal ? chalk.green(' [KEEP]     ') : chalk.red(' [DUPLICATE]');
            const name = chalk.white(file.name);
            const size = chalk.yellow(formatBytes(file.size || 0));
            const id = chalk.gray(`(id: ${file.id})`);
            console.log(`    ${badge} ${name} - ${size} ${id}`);
          });
          console.log('');
        });
      } catch (err: any) {
        spinner.fail(chalk.red('Duplicate detection failed.'));
        console.error(chalk.red(`Error: ${err.message || 'Unable to scan for duplicate files'}`));
        process.exitCode = 1;
      }
    });
}
