import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const OPENALEX_WORKS_URL = 'https://api.openalex.org/works';
const SELECT_FIELDS = [
  'id',
  'display_name',
  'authorships',
  'publication_year',
  'cited_by_count',
  'primary_location',
  'abstract_inverted_index',
  'doi',
  'referenced_works',
].join(',');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_WORKS = 2500;
const REQUEST_TIMEOUT_MS = 15_000;

export function normalizeDoi(value) {
  let text = String(value ?? '').trim();
  if (!text) return null;
  text = text.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep raw text when percent-encoding is malformed.
  }
  text = text.trim().toLowerCase();
  // Preserve balanced brackets that belong to the DOI suffix.
  while (text) {
    text = text.replace(/[.,;:]+$/, '');
    const close = text.at(-1);
    if (close !== ')' && close !== ']') break;
    const open = close === ')' ? '(' : '[';
    if (text.split(close).length <= text.split(open).length) break;
    text = text.slice(0, -1);
  }
  return /^10\.\d{4,9}\/\S+$/.test(text) ? text : null;
}

export function normalizeTitleKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/<\/?(?:sub|sup)\b[^>]*>/gi, '')
    .replace(/\u00ad/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wid(value) {
  const match = String(value ?? '').match(/(W\d+)$/i);
  return match ? match[1].toUpperCase() : null;
}

function webUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function reconstructAbstract(index) {
  if (!index || typeof index !== 'object') return null;
  const pairs = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (Number.isInteger(pos) && pos >= 0) pairs.push([pos, word]);
    }
  }
  if (!pairs.length) return null;
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map(([, word]) => word).join(' ') || null;
}

function normalizeOpenAlexWork(work, now = Date.now()) {
  const openalexId = wid(work?.id);
  if (!openalexId) return null;
  const loc = work.primary_location || {};
  const doi = normalizeDoi(work.doi || '');
  const authors = [];
  for (const authorship of work.authorships || []) {
    const name = authorship?.author?.display_name;
    if (typeof name === 'string' && name.trim()) authors.push(name.trim());
  }
  const referencedOpenalexIds = [];
  const seenRefs = new Set();
  for (const ref of work.referenced_works || []) {
    const refId = wid(ref);
    if (refId && refId !== openalexId && !seenRefs.has(refId)) {
      seenRefs.add(refId);
      referencedOpenalexIds.push(refId);
    }
  }
  return {
    openalexId,
    doi,
    title: typeof work.display_name === 'string' && work.display_name.trim() ? work.display_name.trim() : '未题名论文',
    authors,
    year: Number.isInteger(work.publication_year) ? work.publication_year : null,
    citationCount: typeof work.cited_by_count === 'number' ? work.cited_by_count : null,
    venue: typeof loc?.source?.display_name === 'string' && loc.source.display_name.trim()
      ? loc.source.display_name.trim()
      : null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    url: webUrl(loc.landing_page_url) || webUrl(work.id),
    referencedOpenalexIds,
    cachedAt: now,
  };
}

function titleMatches(seedTitle, candidateTitle) {
  const a = normalizeTitleKey(seedTitle);
  const b = normalizeTitleKey(candidateTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 28 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function createSemaphore(limit) {
  let active = 0;
  const waiters = [];
  return async fn => {
    if (active >= limit) {
      await new Promise(resolve => waiters.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = waiters.shift();
      if (next) next();
    }
  };
}

function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error('查询已取消。'));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function createCitationAtlas(profileDir, { fetchImpl = globalThis.fetch } = {}) {
  const cacheFile = profileDir ? path.join(profileDir, 'citation-openalex-cache.json') : null;
  const withSlot = createSemaphore(3);
  let cacheLoaded = false;
  let cache = { worksById: {}, doiToId: {} };
  let writeQueue = Promise.resolve();

  async function ensureCacheLoaded() {
    if (cacheLoaded) return;
    cacheLoaded = true;
    if (!cacheFile) return;
    try {
      const parsed = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        const now = Date.now();
        const worksById = {};
        const doiToId = {};
        for (const [id, entry] of Object.entries(parsed.worksById || {})) {
          if (entry && typeof entry === 'object' && now - Number(entry.cachedAt || 0) < CACHE_TTL_MS) {
            worksById[id] = entry;
          }
        }
        for (const [doi, id] of Object.entries(parsed.doiToId || {})) {
          if (typeof id === 'string' && worksById[id]) doiToId[doi] = id;
        }
        cache = { worksById, doiToId };
      }
    } catch {
      // Ignore missing or unreadable cache and start fresh.
    }
  }

  function pruneCache() {
    const entries = Object.entries(cache.worksById);
    if (entries.length <= MAX_CACHE_WORKS) return;
    entries.sort((a, b) => Number(b[1].cachedAt || 0) - Number(a[1].cachedAt || 0));
    const kept = new Set(entries.slice(0, MAX_CACHE_WORKS).map(([id]) => id));
    const nextWorks = {};
    for (const id of kept) nextWorks[id] = cache.worksById[id];
    const nextDoiToId = {};
    for (const [doi, id] of Object.entries(cache.doiToId)) {
      if (kept.has(id)) nextDoiToId[doi] = id;
    }
    cache = { worksById: nextWorks, doiToId: nextDoiToId };
  }

  function scheduleSaveCache() {
    if (!cacheFile) return;
    pruneCache();
    const snapshot = JSON.stringify(cache);
    writeQueue = writeQueue.then(async () => {
      await mkdir(path.dirname(cacheFile), { recursive: true });
      const temp = `${cacheFile}.${randomUUID()}.tmp`;
      await writeFile(temp, snapshot, { encoding: 'utf8', flag: 'wx' });
      await rename(temp, cacheFile);
    }).catch(() => {});
  }

  function getCachedWorkById(id) {
    const entry = cache.worksById[id];
    if (!entry) return null;
    if (Date.now() - Number(entry.cachedAt || 0) >= CACHE_TTL_MS) {
      delete cache.worksById[id];
      return null;
    }
    return entry;
  }

  function getCachedWorkByDoi(doi) {
    const id = cache.doiToId[doi];
    return id ? getCachedWorkById(id) : null;
  }

  function storeWork(work) {
    if (!work?.openalexId) return;
    cache.worksById[work.openalexId] = work;
    if (work.doi) cache.doiToId[work.doi] = work.openalexId;
  }

  async function fetchWorks(params, signal) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('当前环境不支持网络请求。');
    }
    const url = new URL(OPENALEX_WORKS_URL);
    for (const [key, value] of Object.entries({ ...params, select: SELECT_FIELDS })) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    const email = process.env.OPENALEX_EMAIL;
    const apiKey = process.env.OPENALEX_API_KEY;
    if (email) url.searchParams.set('mailto', email);
    if (apiKey) url.searchParams.set('api_key', apiKey);
    const headers = {
      Accept: 'application/json',
      'User-Agent': email ? `MateriaCitationCross/1.0 (mailto:${email})` : 'MateriaCitationCross/1.0',
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted?.();
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const reqSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      let response;
      try {
        response = await withSlot(() => fetchImpl(url.href, { headers, signal: reqSignal }));
      } catch (error) {
        if (signal?.aborted) throw error;
        if (attempt === 2) {
          throw new Error('连接 OpenAlex 超时或网络不可用，请稍后重试。');
        }
        await sleep(400 * (attempt + 1), signal);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('OpenAlex 拒绝访问，请检查 OPENALEX_API_KEY 或配额。');
      }
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers?.get?.('Retry-After'));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0
          ? Math.min(retryAfter * 1000, 5000)
          : 500 * (2 ** attempt);
        if (attempt < 2) {
          await sleep(delay, signal);
          continue;
        }
        throw new Error(response.status === 429
          ? 'OpenAlex 当前限流，请稍后重试。'
          : 'OpenAlex 服务暂不可用，请稍后重试。');
      }
      if (!response.ok) {
        throw new Error(`OpenAlex 查询失败（HTTP ${response.status}）。`);
      }
      try {
        return await response.json();
      } catch {
        throw new Error('OpenAlex 返回了无法解析的响应。');
      }
    }
    throw new Error('OpenAlex 查询未能完成，请重试。');
  }

  async function batchFetchByDois(dois, signal) {
    const resolved = new Map();
    const missing = [];
    for (const doi of dois) {
      const cached = getCachedWorkByDoi(doi);
      if (cached) resolved.set(doi, cached);
      else missing.push(doi);
    }
    let dirty = false;
    for (let i = 0; i < missing.length; i += 40) {
      const chunk = missing.slice(i, i + 40);
      const data = await fetchWorks({
        filter: 'doi:' + chunk.join('|'),
        'per-page': Math.min(50, Math.max(chunk.length, 1)),
      }, signal);
      for (const raw of data?.results || []) {
        const normalized = normalizeOpenAlexWork(raw);
        if (!normalized) continue;
        storeWork(normalized);
        dirty = true;
        if (normalized.doi) resolved.set(normalized.doi, normalized);
      }
    }
    if (dirty) scheduleSaveCache();
    return resolved;
  }

  async function batchFetchByIds(ids, signal) {
    const resolved = new Map();
    const missing = [];
    for (const id of ids) {
      const cached = getCachedWorkById(id);
      if (cached) resolved.set(id, cached);
      else missing.push(id);
    }
    let dirty = false;
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const data = await fetchWorks({
        filter: 'openalex:' + chunk.join('|'),
        'per-page': chunk.length,
      }, signal);
      for (const raw of data?.results || []) {
        const normalized = normalizeOpenAlexWork(raw);
        if (!normalized) continue;
        storeWork(normalized);
        dirty = true;
        resolved.set(normalized.openalexId, normalized);
      }
    }
    if (dirty) scheduleSaveCache();
    return resolved;
  }

  async function query(payload = {}, signal) {
    if (!payload || !Array.isArray(payload.seeds) || payload.seeds.length === 0) {
      throw new Error('请至少选择一篇库内文献作为种子。');
    }
    if (payload.seeds.length > 80) {
      throw new Error('单次最多支持同时交叉分析 80 篇种子文献。');
    }
    const extraCitations = Array.isArray(payload.extraCitations) ? payload.extraCitations.slice(0, 600) : [];
    const maxReferences = Math.min(300, Math.max(20, Number.parseInt(payload.maxReferences, 10) || 180));

    await ensureCacheLoaded();
    const warnings = [];
    const seeds = payload.seeds.map(seed => ({
      id: String(seed.id || ''),
      doi: normalizeDoi(seed.doi),
      title: String(seed.title || '').trim(),
      year: seed.year ?? null,
    })).filter(seed => seed.id);
    if (!seeds.length) throw new Error('选中的文献标识无效。');

    // 1. Resolve seeds via batched DOI lookup, then exact title fallback for unmatched seeds.
    const uniqueSeedDois = [...new Set(seeds.map(s => s.doi).filter(Boolean))];
    const seedWorksByDoi = uniqueSeedDois.length ? await batchFetchByDois(uniqueSeedDois, signal) : new Map();
    const seedWorkMap = new Map();
    const unmatchedSeeds = [];
    for (const seed of seeds) {
      const hit = seed.doi ? seedWorksByDoi.get(seed.doi) : null;
      if (hit) seedWorkMap.set(seed.id, hit);
      else unmatchedSeeds.push(seed);
    }

    let titleResolvedCount = 0;
    let dirtyAfterTitle = false;
    for (const seed of unmatchedSeeds.slice(0, 12)) {
      if (!seed.title) continue;
      try {
        const data = await fetchWorks({ search: seed.title, 'per-page': 3 }, signal);
        const match = (data?.results || [])
          .map(raw => normalizeOpenAlexWork(raw))
          .find(candidate => candidate && titleMatches(seed.title, candidate.title));
        if (match) {
          storeWork(match);
          dirtyAfterTitle = true;
          seedWorkMap.set(seed.id, match);
          titleResolvedCount++;
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        warnings.push(`「${seed.title.slice(0, 32)}」标题检索失败，已尝试跳过。`);
      }
    }
    if (dirtyAfterTitle) scheduleSaveCache();
    if (unmatchedSeeds.length > 12) {
      warnings.push(`有 ${unmatchedSeeds.length - 12} 篇无 DOI 文献超出单次标题检索上限，将尝试使用本地 PDF 参考文献兜底。`);
    } else if (unmatchedSeeds.length > titleResolvedCount) {
      const stillMissing = unmatchedSeeds.length - titleResolvedCount;
      warnings.push(`有 ${stillMissing} 篇所选文献未在 OpenAlex 命中，将优先尝试本地 PDF 参考文献兜底。`);
    }

    // 2. Resolve extraCitations DOIs (from local PDF bibliography fallback).
    const normalizedExtras = [];
    const extraDois = new Set();
    for (const item of extraCitations) {
      const seedId = String(item?.seedId || '');
      const doi = normalizeDoi(item?.doi);
      const page = Number.isInteger(item?.page) && item.page > 0 ? item.page : null;
      if (!seedId || !doi) continue;
      normalizedExtras.push({ seedId, doi, page });
      extraDois.add(doi);
    }
    const extraWorksByDoi = extraDois.size ? await batchFetchByDois([...extraDois], signal) : new Map();

    // Map any OpenAlex ID belonging to a selected seed so seed-to-seed citations link to seed:<id>.
    const openalexToSeedIds = new Map();
    for (const seed of seeds) {
      const work = seedWorkMap.get(seed.id);
      if (!work) continue;
      if (!openalexToSeedIds.has(work.openalexId)) openalexToSeedIds.set(work.openalexId, []);
      openalexToSeedIds.get(work.openalexId).push(seed.id);
    }

    // Collect candidate cited IDs across OpenAlex and PDF fallback, counting distinct citing seeds.
    const candidateSeedLinks = new Map(); // targetKey -> Map<seedId, { page, source }>
    const syntheticWorks = new Map(); // key -> work object (when PDF DOI is not indexed by OpenAlex)

    const addSeedTargetLink = (seedId, targetKey, source, page = null) => {
      if (!candidateSeedLinks.has(targetKey)) candidateSeedLinks.set(targetKey, new Map());
      const bySeed = candidateSeedLinks.get(targetKey);
      const existing = bySeed.get(seedId);
      if (!existing || (existing.page === null && page !== null)) {
        bySeed.set(seedId, { source: existing?.source || source, page: page ?? existing?.page ?? null });
      }
    };

    const seedOpenalexRefCounts = new Map();
    for (const seed of seeds) {
      const work = seedWorkMap.get(seed.id);
      const refs = work?.referencedOpenalexIds || [];
      seedOpenalexRefCounts.set(seed.id, refs.length);
      for (const refId of refs) {
        const targetSeeds = openalexToSeedIds.get(refId);
        if (targetSeeds?.length) {
          for (const targetSeedId of targetSeeds) {
            if (targetSeedId !== seed.id) addSeedTargetLink(seed.id, `seed:${targetSeedId}`, 'openalex', null);
          }
        } else {
          addSeedTargetLink(seed.id, refId, 'openalex', null);
        }
      }
    }

    for (const extra of normalizedExtras) {
      const hit = extraWorksByDoi.get(extra.doi);
      if (hit) {
        const targetSeeds = openalexToSeedIds.get(hit.openalexId);
        if (targetSeeds?.length) {
          for (const targetSeedId of targetSeeds) {
            if (targetSeedId !== extra.seedId) addSeedTargetLink(extra.seedId, `seed:${targetSeedId}`, 'pdf', extra.page);
          }
        } else {
          addSeedTargetLink(extra.seedId, hit.openalexId, 'pdf', extra.page);
        }
      } else {
        const synthKey = `doi:${extra.doi}`;
        if (!syntheticWorks.has(synthKey)) {
          syntheticWorks.set(synthKey, {
            key: synthKey,
            openalexId: null,
            doi: extra.doi,
            title: `DOI ${extra.doi}`,
            authors: [],
            year: null,
            citationCount: null,
            venue: null,
            abstract: null,
            url: `https://doi.org/${extra.doi}`,
            referencedOpenalexIds: [],
          });
        }
        addSeedTargetLink(extra.seedId, synthKey, 'pdf', extra.page);
      }
    }

    // Separate seed-to-seed links from external/non-seed work keys, and rank candidates by co-citation count!
    const seedToSeedKeys = [];
    const nonSeedCandidates = [];
    for (const [targetKey, bySeed] of candidateSeedLinks.entries()) {
      if (targetKey.startsWith('seed:')) {
        seedToSeedKeys.push(targetKey);
      } else {
        nonSeedCandidates.push({
          targetKey,
          coCiteCount: bySeed.size,
          isOpenAlex: !targetKey.startsWith('doi:'),
          firstSeedIndex: seeds.findIndex(s => bySeed.has(s.id)),
        });
      }
    }

    nonSeedCandidates.sort((a, b) =>
      (b.coCiteCount - a.coCiteCount)
      || (Number(b.isOpenAlex) - Number(a.isOpenAlex))
      || a.targetKey.localeCompare(b.targetKey));

    const retainedCandidates = nonSeedCandidates.slice(0, maxReferences);
    if (nonSeedCandidates.length > maxReferences) {
      warnings.push(`所选文献共涉及 ${nonSeedCandidates.length} 篇去重参考文献，已优先保留共引频次最高的前 ${maxReferences} 篇。`);
    }

    const openalexIdsToFetch = retainedCandidates
      .filter(item => item.isOpenAlex)
      .map(item => item.targetKey);

    const fetchedWorks = openalexIdsToFetch.length
      ? await batchFetchByIds(openalexIdsToFetch, signal)
      : new Map();

    const works = [];
    const keptTargetKeys = new Set(seedToSeedKeys);
    let missingWorkCount = 0;

    for (const candidate of retainedCandidates) {
      if (candidate.isOpenAlex) {
        const work = fetchedWorks.get(candidate.targetKey);
        if (!work) {
          missingWorkCount++;
          continue;
        }
        keptTargetKeys.add(candidate.targetKey);
        works.push({
          key: work.openalexId,
          openalexId: work.openalexId,
          doi: work.doi,
          title: work.title,
          authors: work.authors,
          year: work.year,
          citationCount: work.citationCount,
          venue: work.venue,
          abstract: work.abstract,
          url: work.url,
        });
      } else {
        const synth = syntheticWorks.get(candidate.targetKey);
        if (!synth) continue;
        keptTargetKeys.add(candidate.targetKey);
        works.push({
          key: synth.key,
          openalexId: null,
          doi: synth.doi,
          title: synth.title,
          authors: synth.authors,
          year: synth.year,
          citationCount: synth.citationCount,
          venue: synth.venue,
          abstract: synth.abstract,
          url: synth.url,
        });
      }
    }
    if (missingWorkCount > 0) {
      warnings.push(`有 ${missingWorkCount} 条 OpenAlex 参考文献记录暂无法获取详情。`);
    }

    const seedLinks = [];
    for (const targetKey of keptTargetKeys) {
      const bySeed = candidateSeedLinks.get(targetKey);
      if (!bySeed) continue;
      for (const [seedId, meta] of bySeed.entries()) {
        seedLinks.push({
          seedId,
          targetKey,
          page: meta.page,
          source: meta.source,
        });
      }
    }

    // Build internal direct citations among all kept OpenAlex works (and seeds).
    const internalLinks = [];
    const seenInternal = new Set();
    for (const work of works) {
      if (!work.openalexId) continue;
      const cached = fetchedWorks.get(work.openalexId);
      if (!cached) continue;
      for (const refId of cached.referencedOpenalexIds || []) {
        const targetSeeds = openalexToSeedIds.get(refId);
        if (targetSeeds?.length) {
          for (const targetSeedId of targetSeeds) {
            const targetKey = `seed:${targetSeedId}`;
            const edgeId = `${work.key}->${targetKey}`;
            if (!seenInternal.has(edgeId)) {
              seenInternal.add(edgeId);
              internalLinks.push({ sourceKey: work.key, targetKey });
            }
          }
        } else if (keptTargetKeys.has(refId) && refId !== work.key) {
          const edgeId = `${work.key}->${refId}`;
          if (!seenInternal.has(edgeId)) {
            seenInternal.add(edgeId);
            internalLinks.push({ sourceKey: work.key, targetKey: refId });
          }
        }
      }
    }

    const seedMatches = seeds.map(seed => {
      const work = seedWorkMap.get(seed.id) || null;
      const openalexRefCount = seedOpenalexRefCounts.get(seed.id) || 0;
      const seedExtraCount = normalizedExtras.filter(item => item.seedId === seed.id).length;
      return {
        seedId: seed.id,
        openalexId: work?.openalexId || null,
        openalexRefCount,
        referenceCount: openalexRefCount + seedExtraCount,
        needsPdfFallback: !work || openalexRefCount === 0,
        citationCount: work?.citationCount ?? null,
        abstract: work?.abstract ?? null,
        url: work?.url ?? null,
      };
    });

    return {
      seedMatches,
      works,
      seedLinks,
      internalLinks,
      warnings,
    };
  }

  return {
    query,
    close: () => writeQueue,
  };
}
