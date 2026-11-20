// Publisher-reported two-year JIFs. Year is the metric year, not release year.
// Verified 2026-10-27. Existing imported records take precedence for the same year.
const nature = 'https://www.nature.com/nature-portfolio/about-journals/journal-metrics';
export const JOURNAL_DATA_CHECKED = '2026-10-27';
export const BUNDLED_METRICS = [
  ['Nature', 56.1, nature],
  ['Nature Communications', 18.1, 'https://www.nature.com/ncomms/ncomms/journal-impact'],
  ['Nature Materials', 38.0, 'https://www.nature.com/nmat/journal-impact'],
  ['Nature Nanotechnology', 37.7, nature],
  ['Nature Energy', 70.1, nature],
  ['Nature Electronics', 42.3, nature],
  ['Nature Chemistry', 24.5, nature],
  ['Nature Catalysis', 48.3, nature],
  ['NPG Asia Materials', 9.0, 'https://www.nature.com/am/journal-information'],
  ['Scientific Reports', 4.9, 'https://www.nature.com/srep/about'],
  ['Journal of Materials Science & Technology', 16.8, 'https://www.jmst.org/EN/news/folder.do?folderId=6'],
  ['Materials Research Letters', 7.5, 'https://www.tandfonline.com/journals/tmrl20/about-this-journal'],
  ['Journal of Materials Science: Materials in Electronics', 3.2, 'https://link.springer.com/journal/10854'],
  ['Metals and Materials International', 4.5, 'https://link.springer.com/journal/12540'],
  ['Energy & Environmental Science', 30.5, 'https://www.rsc.org/publishing/journals/energy-and-environmental-science'],
  ['Journal of Materials Chemistry A', 9.2, 'https://www.rsc.org/publishing/journals/journal-of-materials-chemistry-a'],
  ['Nanoscale', 5.2, 'https://www.rsc.org/publishing/journals/nanoscale'],
].map(([journal, impactFactor, source]) => ({ journal, impactFactor, year: '2025', source }));

export function seedJournalMetrics(current = []) {
  const key = row => `${row.journal.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')}:${row.year}`;
  const rows = new Map(current.map(row => [key(row), row]));
  for (const row of BUNDLED_METRICS) if (!rows.has(key(row))) rows.set(key(row), { ...row });
  return [...rows.values()];
}
