import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailTemplateService } from '../services/email-template.service';

function createMockPrisma() {
  return {
    emailTemplate: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    userId: 'user-1',
    name: 'Welcome',
    subject: 'Hello {{name}}',
    bodyHtml: '<p>Hi {{name}}</p>',
    shortcut: ':welcome',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailTemplateService(prisma as never);
  });

  describe('createTemplate', () => {
    it('creates a template and normalizes the shortcut to start with ":"', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);
      const created = makeTemplate();
      prisma.emailTemplate.create.mockResolvedValue(created);

      const result = await service.createTemplate('user-1', {
        name: 'Welcome',
        subject: 'Hello {{name}}',
        bodyHtml: '<p>Hi {{name}}</p>',
        shortcut: 'welcome',
      });

      expect(result).toEqual(created);
      expect(prisma.emailTemplate.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'Welcome',
          subject: 'Hello {{name}}',
          bodyHtml: '<p>Hi {{name}}</p>',
          shortcut: ':welcome',
        },
      });
    });

    it('stores a null shortcut when none is provided', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);
      prisma.emailTemplate.create.mockResolvedValue(makeTemplate({ shortcut: null }));

      await service.createTemplate('user-1', {
        name: 'NoShortcut',
        subject: 'Subj',
        bodyHtml: '<p>Body</p>',
      });

      const callArg = prisma.emailTemplate.create.mock.calls[0]?.[0] as {
        data: { shortcut: string | null };
      };
      expect(callArg.data.shortcut).toBeNull();
    });

    it('rejects a duplicate name for the same user with a 409', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(makeTemplate());

      await expect(
        service.createTemplate('user-1', {
          name: 'Welcome',
          subject: 'Subj',
          bodyHtml: '<p>Body</p>',
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'TEMPLATE_NAME_DUPLICATE' });
      expect(prisma.emailTemplate.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate shortcut for the same user with a 409', async () => {
      // First findFirst (name check) -> null, second (shortcut check) -> existing.
      prisma.emailTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeTemplate({ id: 'tpl-2' }));

      await expect(
        service.createTemplate('user-1', {
          name: 'Unique Name',
          subject: 'Subj',
          bodyHtml: '<p>Body</p>',
          shortcut: ':welcome',
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'TEMPLATE_SHORTCUT_DUPLICATE' });
      expect(prisma.emailTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe('listTemplates', () => {
    it('returns templates ordered by name ascending', async () => {
      const templates = [
        makeTemplate({ id: 'a', name: 'Alpha' }),
        makeTemplate({ id: 'b', name: 'Beta' }),
      ];
      prisma.emailTemplate.findMany.mockResolvedValue(templates);

      const result = await service.listTemplates('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Alpha');
      expect(result[1]?.name).toBe('Beta');
      expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('getTemplate', () => {
    it('returns the template when the user owns it', async () => {
      const tpl = makeTemplate();
      prisma.emailTemplate.findUnique.mockResolvedValue(tpl);

      const result = await service.getTemplate('tpl-1', 'user-1');

      expect(result).toEqual(tpl);
    });

    it('throws 404 TEMPLATE_NOT_FOUND when missing', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(null);

      await expect(service.getTemplate('missing', 'user-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'TEMPLATE_NOT_FOUND',
      });
    });

    it('throws 403 FORBIDDEN when another user owns the template', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate({ userId: 'other-user' }));

      await expect(service.getTemplate('tpl-1', 'user-1')).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('updateTemplate', () => {
    it('prevents renaming to a name already used by the same user', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate({ name: 'Old Name' }));
      prisma.emailTemplate.findFirst.mockResolvedValue(
        makeTemplate({ id: 'tpl-2', name: 'Taken' }),
      );

      await expect(
        service.updateTemplate('tpl-1', 'user-1', { name: 'Taken' }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'TEMPLATE_NAME_DUPLICATE' });
      expect(prisma.emailTemplate.update).not.toHaveBeenCalled();
    });

    it('updates fields when the rename target is free', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate({ name: 'Old Name' }));
      prisma.emailTemplate.findFirst.mockResolvedValue(null);
      prisma.emailTemplate.update.mockResolvedValue(makeTemplate({ name: 'New Name' }));

      const result = await service.updateTemplate('tpl-1', 'user-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
      const callArg = prisma.emailTemplate.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { name?: string };
      };
      expect(callArg.where).toEqual({ id: 'tpl-1' });
      expect(callArg.data.name).toBe('New Name');
    });
  });

  describe('deleteTemplate', () => {
    it('deletes a template the user owns', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate());
      prisma.emailTemplate.delete.mockResolvedValue(makeTemplate());

      const result = await service.deleteTemplate('tpl-1', 'user-1');

      expect(result.id).toBe('tpl-1');
      expect(prisma.emailTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
    });
  });

  describe('render', () => {
    it('substitutes known placeholders in subject and body', () => {
      const result = service.render(
        { subject: 'Hi {{name}}', bodyHtml: '<p>Welcome {{name}} to {{company}}</p>' },
        { name: 'Ada', company: 'QuantMail' },
      );

      expect(result.subject).toBe('Hi Ada');
      expect(result.bodyHtml).toBe('<p>Welcome Ada to QuantMail</p>');
    });

    it('HTML-escapes substituted values', () => {
      const result = service.render(
        { subject: 'Re: {{topic}}', bodyHtml: '<p>{{topic}}</p>' },
        { topic: '<script>alert("x")</script> & friends' },
      );

      expect(result.subject).toBe(
        'Re: &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; friends',
      );
      expect(result.bodyHtml).toContain('&lt;script&gt;');
      expect(result.bodyHtml).not.toContain('<script>');
    });

    it('blanks placeholders that have no matching variable', () => {
      const result = service.render(
        { subject: 'Hello {{name}}', bodyHtml: '<p>{{missing}} done</p>' },
        { name: 'Ada' },
      );

      expect(result.subject).toBe('Hello Ada');
      expect(result.bodyHtml).toBe('<p> done</p>');
    });

    it('defaults to an empty vars record blanking all placeholders', () => {
      const result = service.render({ subject: '{{a}}', bodyHtml: '{{b}}' });

      expect(result.subject).toBe('');
      expect(result.bodyHtml).toBe('');
    });
  });

  describe('findByShortcut', () => {
    it('normalizes a bare shortcut and resolves a template', async () => {
      const tpl = makeTemplate();
      prisma.emailTemplate.findFirst.mockResolvedValue(tpl);

      const result = await service.findByShortcut('user-1', 'welcome');

      expect(result).toEqual(tpl);
      expect(prisma.emailTemplate.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', shortcut: ':welcome' },
      });
    });

    it('returns null when no template matches the shortcut', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);

      const result = await service.findByShortcut('user-1', ':nope');

      expect(result).toBeNull();
    });

    it('returns null for an empty shortcut without querying prisma', async () => {
      const result = await service.findByShortcut('user-1', '   ');

      expect(result).toBeNull();
      expect(prisma.emailTemplate.findFirst).not.toHaveBeenCalled();
    });
  });
});
