import { z } from 'zod';

export const VCardSchema = z.object({
  uid: z.string(),
  fullName: z.string(),
  familyName: z.string().optional(),
  givenName: z.string().optional(),
  email: z.array(z.string()).optional(),
  tel: z.array(z.string()).optional(),
  org: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
  rev: z.string().optional(),
});

export type VCard = z.infer<typeof VCardSchema>;

export class VCardSerializer {
  serialize(card: VCard): string {
    const lines: string[] = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      `UID:${card.uid}`,
      `FN:${this.escapeValue(card.fullName)}`,
    ];

    if (card.familyName || card.givenName) {
      lines.push(`N:${card.familyName ?? ''};${card.givenName ?? ''};;;`);
    }
    if (card.email) {
      for (const email of card.email) {
        lines.push(`EMAIL:${email}`);
      }
    }
    if (card.tel) {
      for (const tel of card.tel) {
        lines.push(`TEL:${tel}`);
      }
    }
    if (card.org) {
      lines.push(`ORG:${this.escapeValue(card.org)}`);
    }
    if (card.title) {
      lines.push(`TITLE:${this.escapeValue(card.title)}`);
    }
    if (card.url) {
      lines.push(`URL:${card.url}`);
    }
    if (card.note) {
      lines.push(`NOTE:${this.escapeValue(card.note)}`);
    }
    if (card.rev) {
      lines.push(`REV:${card.rev}`);
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  parse(vcard: string): VCard | null {
    const lines = vcard.replace(/\r\n /g, '').split(/\r?\n/);
    const props: Record<string, string> = {};
    const emails: string[] = [];
    const tels: string[] = [];

    for (const line of lines) {
      if (line === 'BEGIN:VCARD' || line === 'END:VCARD' || line.startsWith('VERSION:')) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).split(';')[0]!;
      const value = line.slice(colonIdx + 1);

      if (key === 'EMAIL') {
        emails.push(value);
      } else if (key === 'TEL') {
        tels.push(value);
      } else {
        props[key] = value;
      }
    }

    if (!props['UID'] || !props['FN']) {
      return null;
    }

    const card: VCard = {
      uid: props['UID'],
      fullName: this.unescapeValue(props['FN']),
    };

    if (props['N']) {
      const parts = props['N'].split(';');
      if (parts[0]) card.familyName = parts[0];
      if (parts[1]) card.givenName = parts[1];
    }
    if (emails.length > 0) card.email = emails;
    if (tels.length > 0) card.tel = tels;
    if (props['ORG']) card.org = this.unescapeValue(props['ORG']);
    if (props['TITLE']) card.title = this.unescapeValue(props['TITLE']);
    if (props['URL']) card.url = props['URL'];
    if (props['NOTE']) card.note = this.unescapeValue(props['NOTE']);
    if (props['REV']) card.rev = props['REV'];

    return card;
  }

  private escapeValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  private unescapeValue(value: string): string {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }
}
