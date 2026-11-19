import {pdfPageText} from './study-model.js';

async function boundedPageText(page, limit) {
  const reader = page.streamTextContent().getReader();
  let text = '';
  try {
    while (text.length < limit) {
      const {done,value} = await reader.read();
      if (done) return text;
      const next = pdfPageText(value);
      if (next) text += (text ? '\n' : '') + next.slice(0,limit - text.length);
    }
    await reader.cancel();
    return text.slice(0,limit);
  } finally {
    reader.releaseLock();
  }
}

async function resolvePdfSource(source, signal) {
  const interrupted = Promise.withResolvers();
  const abort = () => interrupted.reject(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener('abort',abort,{once:true});
  try { return await Promise.race([source,interrupted.promise]); }
  finally { signal.removeEventListener('abort',abort); }
}

export async function readPdfPages(pendingSource, signal, selectPages = count =>
  Array.from({length:count}, (_, index) => index + 1), {maxPageChars} = {}) {
  const source = await resolvePdfSource(pendingSource,signal);
  const pdf = await import('./vendor/pdfjs/pdf.js');
  signal.throwIfAborted();
  pdf.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.js', import.meta.url).href;
  const local = name => new URL('./vendor/pdfjs/' + name + '/', import.meta.url).href;
  const ranged = typeof source.readRange === 'function';
  if (ranged && (!Number.isSafeInteger(source.length) || source.length <= 0)) throw Error('PDF 文件为空或无法读取。');
  const worker = ranged ? new pdf.PDFWorker() : undefined;
  const failure = Promise.withResolvers();
  let requested = 0, closed = false, cleanup;
  const range = ranged ? new pdf.PDFDataRangeTransport(source.length,null,true) : null;
  if (range) {
    range.requestDataRange = (begin,end) => {
      const length = end - begin;
      requested += length;
      if (length > 4 * 1024 * 1024 || requested > 24 * 1024 * 1024) {
        const error = new Error('PDF 文本解析需要读取过多文件数据。');
        error.code = 'PDF_READ_BUDGET';
        failure.reject(error);
        return;
      }
      Promise.resolve().then(() => source.readRange(begin,end)).then(bytes => {
        if (closed || signal.aborted) return;
        if (bytes?.byteLength !== length) throw Error('PDF 文件读取不完整。');
        range.onDataRange(begin,bytes);
      }).catch(error => { if (!closed) failure.reject(error); });
    };
    range.abort = () => { closed = true; };
  }
  const loading = pdf.getDocument({...(ranged
    ? {range,worker,disableAutoFetch:true,disableStream:true,rangeChunkSize:128 * 1024,stopAtErrors:true}
    : {data:new Uint8Array(source)}), cMapUrl:local('cmaps'), cMapPacked:true,
    standardFontDataUrl:local('standard_fonts'), wasmUrl:local('wasm'), iccUrl:local('iccs'),
    useWorkerFetch:false, isEvalSupported:false, enableXfa:false, verbosity:0});
  function release() {
    closed = true;
    cleanup ??= loading.destroy().catch(() => {});
    return cleanup;
  }
  const abort = () => {
    failure.reject(signal.reason);
    void release();
  };
  signal.addEventListener('abort', abort, {once:true});
  try {
    const collect = async () => {
      const doc = await loading.promise, pages = [];
      for (const page of selectPages(doc.numPages)) {
        signal.throwIfAborted();
        const pdfPage = await doc.getPage(page);
        try {
          const text = maxPageChars ? await boundedPageText(pdfPage,maxPageChars) : pdfPageText(await pdfPage.getTextContent());
          pages.push({page,text});
        } finally {
          pdfPage.cleanup();
        }
      }
      return pages;
    };
    return await Promise.race([collect(),failure.promise]);
  } finally {
    signal.removeEventListener('abort', abort);
    if (!worker) {
      await release();
    } else {
      let timer;
      try { await Promise.race([release(),new Promise(resolve => { timer = setTimeout(resolve,1000); })]); }
      finally { clearTimeout(timer); worker.destroy(); }
    }
  }
}
