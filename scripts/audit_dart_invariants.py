import os
import sys
import unicodedata
import re

sys.stdout.reconfigure(encoding='utf-8')

def get_dart_files(base_dir):
    dart_files = []
    for root, dirs, files in os.walk(base_dir):
        if 'flutter_apps' + os.sep + 'flutter_apps' in root:
            continue
        for f in files:
            if f.endswith('.dart'):
                dart_files.append(os.path.join(root, f))
    return sorted(dart_files)

def is_emoji_or_symbol(char):
    if char == '⌘':  # Explicitly allowed Mac Command key
        return False
    cp = ord(char)
    # Standard emoji ranges
    if 0x1F300 <= cp <= 0x1FAFF: # Emoticons, symbols, pictographs, transport, etc.
        return True
    if 0x2600 <= cp <= 0x27BF:   # Misc symbols, dingbats (including ⚡, ✨, ✉, ✂, etc.)
        return True
    if 0xFE00 <= cp <= 0xFE0F:   # Variation selectors
        return True
    if 0x1F1E6 <= cp <= 0x1F1FF: # Flags
        return True
    cat = unicodedata.category(char)
    if cat in ('So', 'Sk') and cp > 127:
        return True
    return False

def audit_emojis(dart_files, base_dir):
    findings = []
    for path in dart_files:
        rel = os.path.relpath(path, base_dir)
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line_no, line in enumerate(f, 1):
                for col_no, ch in enumerate(line, 1):
                    if is_emoji_or_symbol(ch):
                        findings.append({
                            'file': rel,
                            'path': path,
                            'line': line_no,
                            'col': col_no,
                            'char': ch,
                            'codepoint': hex(ord(ch)),
                            'name': unicodedata.name(ch, 'UNKNOWN'),
                            'line_text': line.rstrip('\r\n')
                        })
    return findings

def audit_clippath(dart_files, base_dir):
    # Regex to match actual ClipPath widgets or .clipPath / canvas.clipPath invocations
    call_regex = re.compile(r'(\bcanvas\.clipPath\s*\(|\b\.clipPath\s*\(|\bClipPath\s*\()')
    findings = []
    for path in dart_files:
        rel = os.path.relpath(path, base_dir)
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line_no, line in enumerate(f, 1):
                stripped = line.strip()
                if stripped.startswith('//') or stripped.startswith('///') or stripped.startswith('*'):
                    continue
                if 'RegExp' in line or 'clipPathCallRegex' in line:
                    continue
                m = call_regex.search(line)
                if m:
                    findings.append({
                        'file': rel,
                        'path': path,
                        'line': line_no,
                        'matched': m.group(1),
                        'line_text': stripped
                    })
    return findings

def check_brackets_and_syntax(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    n = len(content)
    i = 0
    line = 1
    col = 1
    stack = []
    errors = []

    while i < n:
        c = content[i]

        if c == '\n':
            line += 1
            col = 1
            i += 1
            continue

        # Single line comment
        if c == '/' and i + 1 < n and content[i + 1] == '/':
            while i < n and content[i] != '\n':
                i += 1
            continue

        # Block comment (support nesting)
        if c == '/' and i + 1 < n and content[i + 1] == '*':
            depth = 1
            i += 2
            col += 2
            while i < n and depth > 0:
                if content[i] == '\n':
                    line += 1
                    col = 1
                    i += 1
                elif content[i] == '/' and i + 1 < n and content[i + 1] == '*':
                    depth += 1
                    i += 2
                    col += 2
                elif content[i] == '*' and i + 1 < n and content[i + 1] == '/':
                    depth -= 1
                    i += 2
                    col += 2
                else:
                    i += 1
                    col += 1
            if depth > 0:
                errors.append(f"Unterminated block comment started near line {line}")
            continue

        # Raw string literals
        if (c == 'r' or c == 'R') and i + 1 < n and content[i + 1] in ('"', "'"):
            q = content[i + 1]
            if i + 3 < n and content[i + 1:i + 4] == q * 3:
                # Raw multiline
                q3 = q * 3
                i += 4
                col += 4
                end = content.find(q3, i)
                if end == -1:
                    errors.append(f"Unterminated raw multiline string {q3} at line {line}")
                    break
                sub = content[i:end]
                line += sub.count('\n')
                nl = sub.rfind('\n')
                col = len(sub) - nl if nl != -1 else col + len(sub)
                i = end + 3
                col += 3
                continue
            else:
                # Raw single line
                i += 2
                col += 2
                end = content.find(q, i)
                nl = content.find('\n', i)
                if end == -1 or (nl != -1 and nl < end):
                    errors.append(f"Unterminated raw string {q} at line {line}")
                    i = nl if nl != -1 else n
                else:
                    col += (end - i) + 1
                    i = end + 1
                continue

        # Standard strings
        if c in ('"', "'"):
            q = c
            if i + 2 < n and content[i:i + 3] == q * 3:
                # Multiline
                q3 = q * 3
                i += 3
                col += 3
                while i < n:
                    if content[i:i + 3] == q3:
                        i += 3
                        col += 3
                        break
                    elif content[i] == '\\' and i + 1 < n:
                        i += 2
                        col += 2
                    elif content[i] == '\n':
                        line += 1
                        col = 1
                        i += 1
                    elif content[i] == '$' and i + 1 < n and content[i + 1] == '{':
                        stack.append(('interp_' + q3, line, col))
                        stack.append(('{', line, col))
                        i += 2
                        col += 2
                        break
                    else:
                        i += 1
                        col += 1
                continue
            else:
                # Single line
                i += 1
                col += 1
                while i < n:
                    if content[i] == '\n':
                        errors.append(f"Unterminated string literal at line {line}")
                        break
                    elif content[i] == '\\' and i + 1 < n:
                        i += 2
                        col += 2
                    elif content[i] == q:
                        i += 1
                        col += 1
                        break
                    elif content[i] == '$' and i + 1 < n and content[i + 1] == '{':
                        stack.append(('interp_' + q, line, col))
                        stack.append(('{', line, col))
                        i += 2
                        col += 2
                        break
                    else:
                        i += 1
                        col += 1
                continue

        # Bracket checking
        if c in ('(', '[', '{'):
            stack.append((c, line, col))
            i += 1
            col += 1
        elif c in (')', ']', '}'):
            if not stack:
                errors.append(f"Extraneous closing bracket '{c}' at line {line}, col {col}")
                i += 1
                col += 1
                continue

            top, t_line, t_col = stack.pop()
            expected = {'(': ')', '[': ']', '{': '}'}.get(top)
            if expected != c:
                errors.append(f"Mismatched bracket: expected '{expected}' for '{top}' (from line {t_line}:{t_col}), got '{c}' at line {line}:{col}")

            # Check if this closes string interpolation
            if top == '{' and stack and stack[-1][0].startswith('interp_'):
                marker, m_line, m_col = stack.pop()
                quote = marker[len('interp_'):]
                if len(quote) == 3:
                    # Multiline resume
                    while i < n:
                        if content[i:i + 3] == quote:
                            i += 3
                            col += 3
                            break
                        elif content[i] == '\\' and i + 1 < n:
                            i += 2
                            col += 2
                        elif content[i] == '\n':
                            line += 1
                            col = 1
                            i += 1
                        elif content[i] == '$' and i + 1 < n and content[i + 1] == '{':
                            stack.append(('interp_' + quote, line, col))
                            stack.append(('{', line, col))
                            i += 2
                            col += 2
                            break
                        else:
                            i += 1
                            col += 1
                else:
                    # Single line resume
                    while i < n:
                        if content[i] == '\n':
                            errors.append(f"Unterminated string literal at line {line}")
                            break
                        elif content[i] == '\\' and i + 1 < n:
                            i += 2
                            col += 2
                        elif content[i] == quote:
                            i += 1
                            col += 1
                            break
                        elif content[i] == '$' and i + 1 < n and content[i + 1] == '{':
                            stack.append(('interp_' + quote, line, col))
                            stack.append(('{', line, col))
                            i += 2
                            col += 2
                            break
                        else:
                            i += 1
                            col += 1
                continue
            else:
                i += 1
                col += 1
        else:
            i += 1
            col += 1

    if stack:
        for item, l, c_pos in stack:
            errors.append(f"Unclosed '{item}' opened at line {l}, col {c_pos}")

    return errors

def main():
    base_dir = r"c:\Users\Pc\Quant-Ecosystem\flutter_apps"
    dart_files = get_dart_files(base_dir)
    print(f"============================================================")
    print(f"ECOSYSTEM QUALITY SENTINEL & INVARIANT GATEKEEPER AUDIT")
    print(f"Base Directory: {base_dir}")
    print(f"Total Dart Files: {len(dart_files)}")
    print(f"============================================================")

    # 1. ClipPath Audit
    print("\n[1/3] AUDITING ZERO-CLIPPATH INVARIANT...")
    clip_findings = audit_clippath(dart_files, base_dir)
    if not clip_findings:
        print(f"  -> PASSED: ZERO Skia clipPath invocations detected across all {len(dart_files)} files!")
    else:
        print(f"  -> FAILED: Found {len(clip_findings)} clipPath invocations:")
        for cf in clip_findings:
            print(f"     {cf['file']}:{cf['line']} -> {cf['line_text']}")

    # 2. Emoji Audit
    print("\n[2/3] AUDITING ZERO-EMOJI INVARIANT (⌘ Command Key Permitted)...")
    emoji_findings = audit_emojis(dart_files, base_dir)
    if not emoji_findings:
        print(f"  -> PASSED: ZERO raw Unicode emojis detected across all {len(dart_files)} files!")
    else:
        print(f"  -> FAILED: Found {len(emoji_findings)} raw Unicode emoji occurrences:")
        for ef in emoji_findings:
            print(f"     {ef['file']}:{ef['line']}:{ef['col']} -> '{ef['char']}' ({ef['codepoint']} {ef['name']})")
            print(f"        Line: {ef['line_text']}")

    # 3. Bracket & AST Balance
    print("\n[3/3] AUDITING BRACKET BALANCE & SYNTAX...")
    bracket_errors = {}
    for df in dart_files:
        errs = check_brackets_and_syntax(df)
        if errs:
            rel = os.path.relpath(df, base_dir)
            bracket_errors[rel] = errs

    if not bracket_errors:
        print(f"  -> PASSED: 100% Balanced brackets & string literals across all {len(dart_files)} files!")
    else:
        print(f"  -> FAILED: Bracket/syntax errors found in {len(bracket_errors)} files:")
        for rel, errs in bracket_errors.items():
            print(f"     {rel}:")
            for e in errs:
                print(f"       {e}")

    print("\n============================================================")
    print(f"AUDIT SUMMARY: clipPath errors={len(clip_findings)}, emoji violations={len(emoji_findings)}, bracket errors={len(bracket_errors)}")
    print(f"============================================================")

if __name__ == '__main__':
    main()
