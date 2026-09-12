export const UPLOAD_PACK_ADV_CONTENT_TYPE =
  'application/x-git-upload-pack-advertisement';
export const RECEIVE_PACK_ADV_CONTENT_TYPE =
  'application/x-git-receive-pack-advertisement';
export const UPLOAD_PACK_CONTENT_TYPE = 'application/x-git-upload-pack-result';
export const RECEIVE_PACK_CONTENT_TYPE = 'application/x-git-receive-pack-result';

export function formatSmartHttpHeader(service: string): string {
  const line = `# service=${service}\n`;
  const length = (Buffer.byteLength(line, 'utf8') + 4).toString(16).padStart(4, '0');

  return `${length}${line}0000`;
}
