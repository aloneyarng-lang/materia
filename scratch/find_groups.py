import os

matches = []
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', '.next', 'out', 'build']]
    for f in files:
        if f.endswith(('.ts', '.tsx', '.json', '.js', '.csv')):
            p = os.path.join(root, f)
            try:
                with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                    text = fp.read()
                    if 'K101' in text or 'comparisonState' in text:
                        matches.append(p)
            except Exception:
                pass

for m in sorted(matches):
    print(m)
