"""Build bundled dictionaries from the original upstream archives in .local/dictionary-sources."""
import csv, hashlib, io, json, re, tarfile
from pathlib import Path
from collections import defaultdict

root = Path(__file__).resolve().parents[1]
src = root / '.local/dictionary-sources'
out = root / 'dist/dictionaries'
out.mkdir(exist_ok=True)
def norm(s):
    import unicodedata
    return re.sub(r'\s+', ' ', re.sub(r'[‐‑‒–—−-]', ' ', unicodedata.normalize('NFKC', s).strip().lower()))
def key(s):
    return ''.join(f'{ord(c):04x}' for c in norm(s)[:2])
data = defaultdict(dict)
counts = {}
def add(word, source, translation, phonetic=''):
    word = norm(word.replace('_', ' '))
    if not word or not translation: return
    entry = data[key(word)].setdefault(word, [])
    entry.append([source, translation.replace('\\n', '\n'), phonetic])
with (src/'ecdict.csv').open(encoding='utf-8-sig', newline='') as f:
    count = 0
    for row in csv.DictReader(f):
        if row['translation']:
            add(row['word'], 'ecdict', row['translation'], row.get('phonetic', ''))
            count += 1
    counts['ecdict'] = count
with tarfile.open(src/'wordnet.tar.gz') as archive:
    count = 0
    for member in archive.getmembers():
        name = Path(member.name).name
        if name == 'LICENSE':
            (out/'WORDNET-LICENSE.txt').write_bytes(archive.extractfile(member).read())
        if not name.startswith('data.'): continue
        for line in io.TextIOWrapper(archive.extractfile(member), encoding='utf-8'):
            if not line[0].isdigit() or ' | ' not in line: continue
            head, gloss = line.rstrip().split(' | ', 1)
            fields = head.split(); n = int(fields[3], 16)
            for i in range(n):
                add(fields[4+i*2], 'wordnet', fields[2]+'. '+gloss)
                count += 1
    counts['wordnet'] = count
if not (out/'WORDNET-LICENSE.txt').exists():
    (out/'WORDNET-LICENSE.txt').write_bytes((src/'WORDNET-LICENSE.txt').read_bytes())
(out/'ECDICT-LICENSE.txt').write_bytes((src/'ECDICT-LICENSE.txt').read_bytes())
for bucket, words in data.items():
    (out/(bucket+'.js')).write_text('export default '+json.dumps(words, ensure_ascii=False, separators=(',', ':'))+';\n', encoding='utf-8')
manifest = {'counts': counts, 'headwords': sum(map(len, data.values())), 'shards': sorted(data),
            'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in src.iterdir() if p.is_file()}}
(out/'manifest.js').write_text('export default '+json.dumps(manifest)+';\n', encoding='utf-8')
print(json.dumps(manifest | {'shards': len(data)}))
