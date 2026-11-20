# Bundled offline dictionaries

These files are installed with Materia. Lookups import local shards; no external dictionary service or API key is used.

- ECDICT: https://github.com/skywind3000/ECDICT — open community English–Chinese dictionary, 770,238 source records containing Chinese translations. MIT license: ECDICT-LICENSE.txt. Original CSV: https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
- Princeton WordNet 3.0: https://wordnet.princeton.edu/ — Princeton University lexical database, 206,978 word/sense records. WordNet license: WORDNET-LICENSE.txt. Original archive: https://wordnetcode.princeton.edu/3.0/WNdb-3.0.tar.gz

Combined: 765,386 normalized headwords. Counts are records, not claims of unique words per source. Source archive SHA-256 hashes are recorded in manifest.js. Built on 2026-11-02 with scripts/build-dictionaries.py; original downloads are retained in .local/dictionary-sources.

Citation: Princeton University "About WordNet." WordNet. Princeton University. 2010.

Chinese target returns ECDICT translations; English target returns WordNet definitions. Full Japanese–English and German–English dictionaries and their reverse indexes are now included in ../language-dictionaries; see that directory for sources, licenses and limitations. The 87-entry materials supplement remains available. ECDICT is a community aggregation, not a publisher-edited authoritative dictionary. WordNet provides English definitions, not Chinese translations.

