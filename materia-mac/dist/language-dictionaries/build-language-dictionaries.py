"""Build JMdict and Ding indexes, retaining the original redistributable sources."""
import gzip, hashlib, json, re, shutil, tarfile, unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from collections import defaultdict
root = Path(__file__).resolve().parents[1]
src = root/'.local/dictionary-sources'
out = root/'dist/language-dictionaries'
out.mkdir(exist_ok=True)
data = defaultdict(dict)
counts = defaultdict(int)
def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'[‐‑‒–—−-]', ' ', unicodedata.normalize('NFKC', s).strip().lower()))
def bucket(s):
    if ord(s[0]) > 127: return 'u'+str(ord(s[0]) % 128)
    return ''.join(f'{ord(c):04x}' for c in s[:2])
def add(word, source, fr, to, text, reading=''):
    word = norm(word)
    if not word or len(word)>160 or not text: return
    record = [source, text, reading, fr, to]
    records = data[bucket(word)].setdefault(word, [])
    if record not in records: records.append(record)
def text(node, path): return [e.text for e in node.findall(path) if e.text]
with gzip.open(src/'JMdict_e.gz', 'rb') as f:
    for _, entry in ET.iterparse(f, events=('end',)):
        if entry.tag != 'entry': continue
        kanji = text(entry, 'k_ele/keb')
        readings = text(entry, 'r_ele/reb')
        for word in kanji+readings:
            senses=[]
            for sense in entry.findall('sense'):
                if text(sense, 'stagk') and word in kanji and word not in text(sense, 'stagk'): continue
                if text(sense, 'stagr') and word in readings and word not in text(sense, 'stagr'): continue
                glosses=text(sense, 'gloss')
                pos='; '.join(text(sense,'pos'))
                if glosses:senses.append(('['+pos+'] ' if pos else '')+'; '.join(glosses))
            allowed_readings=[r.findtext('reb') for r in entry.findall('r_ele') if not text(r,'re_restr') or word in text(r,'re_restr') or word==r.findtext('reb')]
            add(word,'jmdict','ja','en','\n'.join(senses),'・'.join(allowed_readings))
        for sense in entry.findall('sense'):
            forms=text(sense,'stagk') or kanji or readings
            selected_readings=text(sense,'stagr') or readings
            target='；'.join(forms)+' ['+'・'.join(selected_readings)+']'
            for gloss in text(sense,'gloss'):
                add(gloss,'jmdict','en','ja',target+' — '+gloss)
                alias=re.sub(r'\([^()]*\)','',gloss).strip()
                if alias!=gloss:add(alias,'jmdict','en','ja',target+' — '+gloss)
        counts['jmdictEntries']+=1
        entry.clear()
def pieces(s, separator):
    result=[]; start=0; stack=[]
    for i,c in enumerate(s):
        if c in '{[(<':stack.append(c)
        elif c in '}])>' and stack: stack.pop()
        elif c==separator and not stack:result.append(s[start:i].strip());start=i+1
    result.append(s[start:].strip());return result
def clean(s):
    for _ in range(4): s=re.sub(r'\{[^{}]*\}|\[[^\[\]]*\]|\([^()]*\)|<[^<>]*>','',s)
    return s.strip()
with gzip.open(src/'de-en.txt.gz','rt',encoding='utf-8') as f:
    for line in f:
        if line.startswith('#') or ' :: ' not in line:continue
        de,en=line.rstrip().split(' :: ',1)
        german,english=pieces(de,'|'),pieces(en,'|')
        # Parallel columns are distinct inflected forms/phrases, never a cross product.
        if len(german)!=len(english): raise ValueError('Unaligned Ding entry: '+line)
        for a,b in zip(german,english):
            for word in pieces(a,';'):add(clean(word),'ding','de','en',b)
            for word in pieces(b,';'):add(clean(word),'ding','en','de',a)
        counts['dingEntries']+=1
for key,words in data.items():
    (out/(key+'.js')).write_text('export default '+json.dumps(words,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
for name in ['JMdict_e.gz','de-en.txt.gz','JMDICT-LICENSE.html','JMDICT-DOCUMENTATION.html','CC-BY-SA-4.0.txt']:
    shutil.copyfile(src/name,out/name)
with tarfile.open(src/'ding-1.9.tar.gz') as tar:
    for member in tar.getmembers():
        if Path(member.name).name in ['COPYING','README.md']:
            name='DING-COPYING.txt' if Path(member.name).name=='COPYING' else 'DING-README.txt'
            (out/name).write_bytes(tar.extractfile(member).read())
assert (out/'DING-COPYING.txt').exists()
shutil.copyfile(Path(__file__),out/'build-language-dictionaries.py')
manifest={'counts':dict(counts),'headwords':sum(map(len,data.values())),'shards':sorted(data),
 'sha256':{name:hashlib.sha256((src/name).read_bytes()).hexdigest() for name in ['JMdict_e.gz','de-en.txt.gz','ding-1.9.tar.gz']}}
(out/'manifest.js').write_text('export default '+json.dumps(manifest)+';\n',encoding='utf-8')
print(json.dumps(manifest|{'shards':len(data)}))
