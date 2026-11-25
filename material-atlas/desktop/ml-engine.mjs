import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateWorkspace} from '../dist/prediction-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runtimeCandidates(appRoot, platform = process.platform) {
  if (platform === 'win32') {
    return [
      path.join(appRoot, 'ml/runtime/python.exe'),
      path.join(appRoot, '.local/ml-runtime/python.exe'),
    ];
  }
  return [
    path.join(appRoot, 'ml/runtime/bin/python3'),
    path.join(appRoot, 'ml/runtime/bin/python'),
    path.join(appRoot, '.local/ml-runtime/bin/python3'),
    path.join(appRoot, '.local/ml-runtime/bin/python'),
  ];
}

function terminateChild(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
    // A missing taskkill executable emits an asynchronous error.
    killer.once('error', () => child.kill());
    killer.once('exit', code => {
      if (code !== 0) child.kill();
    });
    killer.unref();
    return;
  }
  child.kill();
}

export class MachineLearningEngine {
  constructor({ appRoot = root, onProgress = () => {} } = {}) {
    this.appRoot = appRoot;
    this.onProgress = onProgress;
    this.jobs = new Map();
  }

  executable() {
    const candidates = runtimeCandidates(this.appRoot, process.platform);
    const executable = candidates.find(existsSync);
    if (!executable) {
      const hint = process.platform === 'win32'
        ? '请运行 npm run setup:ml 后重新打包。'
        : '请先安装内置 Python 3.13 运行环境（ml/runtime/bin/python3）后重试。';
      throw Error('机器学习运行环境未安装，' + hint);
    }
    return executable;
  }

  async run(action, payload = {}, id = crypto.randomUUID()) {
    if (!['status', 'train', 'predict'].includes(action)) throw Error('未知机器学习操作。');
    if (typeof id !== 'string' || !id || id.length > 100 || this.jobs.has(id)) throw Error('机器学习任务编号无效。');
    if (action === 'train') {
      if ([...this.jobs.values()].some(j => j.action === 'train')) throw Error('已有训练正在运行，请先停止或等待完成。');
      payload = { ...payload, workspace: validateWorkspace(payload.workspace) };
    }
    const executable = this.executable();
    return new Promise((resolve, reject) => {
      const child = spawn(executable, ['-I', '-X', 'utf8', path.join(this.appRoot, 'ml/engine.py')], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          OMP_NUM_THREADS: '4',
          OPENBLAS_NUM_THREADS: '4',
          MKL_NUM_THREADS: '4',
        },
      });
      const job = { child, action, cancelled: false };
      this.jobs.set(id, job);
      let buffer = '', stderr = '', result, engineError = '', settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.jobs.delete(id);
        error ? reject(error) : resolve(result);
      };
      const timer = setTimeout(() => {
        terminateChild(child);
        finish(Error('机器学习任务超过 24 小时，已停止。'));
      }, 24 * 60 * 60 * 1000);
      timer.unref();
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 512 * 1024 * 1024) {
          terminateChild(child);
          finish(Error('模型超过内存传输上限，请减少树数量或拆分目标。'));
          return;
        }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            if (message.progress) this.onProgress({ id, message: message.progress });
            if ('result' in message) result = message.result;
            if (message.error) engineError = message.error;
          } catch {
            terminateChild(child);
            finish(Error('机器学习引擎返回了无效数据。'));
            return;
          }
        }
      });
      child.stderr.on('data', chunk => {
        stderr = (stderr + chunk).slice(-6000);
      });
      child.on('error', e => finish(Error('无法启动机器学习引擎：' + e.message)));
      child.on('close', code => finish(
        job.cancelled
          ? Error('训练已停止，已完成的模型保留。')
          : engineError
            ? Error(engineError)
            : code !== 0 || result === undefined
              ? Error('机器学习引擎退出：' + (stderr || code))
              : null
      ));
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ ...payload, action }));
    });
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.cancelled = true;
    terminateChild(job.child);
    return true;
  }

  cancelAll() {
    for (const id of this.jobs.keys()) this.cancel(id);
  }
}
