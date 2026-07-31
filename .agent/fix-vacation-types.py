from pathlib import Path

path = Path('apps/quantmail/src/app/settings/VacationResponderSettings.tsx')
text = path.read_text()
old = '<Input type="datetime-local"'
new = '<input type="datetime-local" className="w-full h-9 px-3 rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] text-sm text-[var(--quant-foreground)]"'
assert text.count(old) == 2
text = text.replace(old, new)
assert text.count('value={draft.intervalDays}') == 1
text = text.replace('value={draft.intervalDays}', 'value={String(draft.intervalDays)}')
path.write_text(text)
