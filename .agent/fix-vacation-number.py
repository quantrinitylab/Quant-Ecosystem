from pathlib import Path
path = Path('apps/quantmail/src/app/settings/VacationResponderSettings.tsx')
text = path.read_text()
assert text.count('min={0} step={1}') == 1
path.write_text(text.replace('min={0} step={1}', 'min="0" step="1"'))
