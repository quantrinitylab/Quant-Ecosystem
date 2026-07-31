from pathlib import Path
import re

api_path = Path('apps/quantmail/src/services/api-client.ts')
api = api_path.read_text()
anchor = '''interface EmailSignaturePreference {
  id: string;
  name: string;
  contentHtml: string;
  isDefault: boolean;
}
'''
addition = anchor + '''
export interface VacationResponderPreference {
  id: string;
  enabled: boolean;
  subject: string;
  message: string;
  startAt: string | null;
  endAt: string | null;
  onlyContacts: boolean;
  intervalDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertVacationResponderPreference {
  enabled?: boolean;
  subject: string;
  message: string;
  startAt?: string | null;
  endAt?: string | null;
  onlyContacts?: boolean;
  intervalDays?: number;
}
'''
assert api.count(anchor) == 1
api = api.replace(anchor, addition)
method_anchor = '''  async updateEmailSignature(
    id: string,
    data: Partial<Pick<EmailSignaturePreference, 'name' | 'contentHtml' | 'isDefault'>>,
  ): Promise<ApiResponse<EmailSignaturePreference>> {
    return this.put(`/email-signatures/${id}`, data);
  }
'''
methods = method_anchor + '''
  async getVacationResponder(): Promise<ApiResponse<VacationResponderPreference | null>> {
    return this.get('/vacation-responder');
  }

  async upsertVacationResponder(
    data: UpsertVacationResponderPreference,
  ): Promise<ApiResponse<VacationResponderPreference>> {
    return this.put('/vacation-responder', data);
  }

  async enableVacationResponder(): Promise<ApiResponse<VacationResponderPreference>> {
    return this.post('/vacation-responder/enable', {});
  }

  async disableVacationResponder(): Promise<ApiResponse<VacationResponderPreference>> {
    return this.post('/vacation-responder/disable', {});
  }
'''
assert api.count(method_anchor) == 1
api = api.replace(method_anchor, methods)
api_path.write_text(api)

page_path = Path('apps/quantmail/src/app/settings/page.tsx')
page = page_path.read_text()
import_anchor = "import { PageTransition } from '../../components/PageTransition';\n"
assert page.count(import_anchor) == 1
page = page.replace(import_anchor, import_anchor + "import { VacationResponderSettings } from './VacationResponderSettings';\n")
assert page.count('    autoReply: false,\n') == 1
page = page.replace('    autoReply: false,\n', '')
pattern = re.compile(r'''\n                    <label className="flex items-center gap-3 cursor-not-allowed group">\n                      <input\n                        type="checkbox"\n                        checked=\{emailPrefs\.autoReply\}.*?\n                    </label>''', re.DOTALL)
page, count = pattern.subn('', page)
assert count == 1, count
fieldset_anchor = '''                  </fieldset>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">'''
assert page.count(fieldset_anchor) == 1
page = page.replace(fieldset_anchor, '''                  </fieldset>
                  <VacationResponderSettings />
                  <p className="text-xs text-[var(--quant-muted-foreground)]">''')
old_copy = "Signature is live here. Undo send, reply behavior, conversation view, read receipts, and vacation auto-reply aren&apos;t connected in Settings yet."
new_copy = "Signature and vacation auto-reply are live here. Undo send, reply behavior, conversation view, and read receipts aren&apos;t connected in Settings yet."
assert page.count(old_copy) == 1
page = page.replace(old_copy, new_copy)
page_path.write_text(page)
