import {execFileSync} from 'node:child_process';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePackagedAssets} from './desktop/package-assets.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

if (process.argv.includes('--check-assets')) {
  console.log(await validatePackagedAssets(root, {requireWindowsRuntime: false}));
} else {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) {
    throw new Error('请在目标 Mac 上使用原生架构的 Node.js 构建。');
  }
  await build();
}

async function build() {
  const {packager} = await import('@electron/packager');
  const {MachineLearningEngine} = await import('./desktop/ml-engine.mjs');
  const work = await mkdtemp(path.join(os.tmpdir(), 'materia-mac-'));
  const stage = path.join(work, 'app');
  const uvEnv = {...process.env, UV_PYTHON_INSTALL_DIR: path.join(work, 'python'), UV_PYTHON_PREFERENCE: 'only-managed'};

  try {
    for (const directory of ['desktop', 'dist', 'ml']) {
      await cp(path.join(root, directory), path.join(stage, directory), {
        recursive: true,
        filter: file => !['__pycache__', 'runtime', 'package-assets.mjs'].includes(path.basename(file)),
      });
    }
    await writeFile(path.join(stage, 'package.json'), JSON.stringify({
      name: 'materia-desktop',
      productName: 'Materia',
      version: manifest.version,
      type: 'module',
      main: 'desktop/main.mjs',
    }));
    await validatePackagedAssets(stage, {requireWindowsRuntime: false});

    execFileSync('uv', ['python', 'install', '3.13'], {env: uvEnv, stdio: 'inherit'});
    const python = execFileSync('uv', ['python', 'find', '3.13', '--no-project'], {
      cwd: work,
      env: uvEnv,
      encoding: 'utf8',
    }).trim();
    const {prefix, executable, sitePackages} = JSON.parse(execFileSync(python, [
      '-I', '-c',
      'import json, os, sys, sysconfig; print(json.dumps(dict(prefix=sys.base_prefix, executable=os.path.realpath(sys.executable), sitePackages=sysconfig.get_path("purelib"))))',
    ], {encoding: 'utf8'}));
    const runtime = path.join(stage, 'ml', 'runtime');
    await cp(prefix, runtime, {recursive: true, dereference: true});
    const bundledPython = path.join(runtime, path.relative(prefix, executable));
    const bundledSitePackages = path.join(runtime, path.relative(prefix, sitePackages));
    execFileSync('uv', [
      'pip', 'install', '--python', bundledPython, '--target', bundledSitePackages,
      '--only-binary', ':all:', '--requirements', path.join(root, 'ml', 'requirements.txt'),
    ], {env: uvEnv, stdio: 'inherit'});
    const status = await new MachineLearningEngine({appRoot: stage}).run('status');
    if (!status.ready) throw new Error('打包前机器学习引擎检查失败。');

    const output = await packager({
      dir: stage,
      name: 'Materia',
      platform: 'darwin',
      arch: process.arch,
      appBundleId: 'com.materia.desktop',
      appCategoryType: 'public.app-category.productivity',
      electronVersion: manifest.devDependencies.electron,
      out: path.join(root, 'release'),
      asar: false,
      prune: false,
      overwrite: false,
      osxSign: {identity: '-'},
    });
    if (output.length !== 1) throw new Error('应用未生成，或同名发布文件夹已存在。');
    const app = path.join(output[0], 'Materia.app');
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], {stdio: 'inherit'});
    const packagedRoot = path.join(app, 'Contents', 'Resources', 'app');
    const packagedStatus = await new MachineLearningEngine({appRoot: packagedRoot}).run('status');
    if (!packagedStatus.ready) throw new Error('已打包的机器学习引擎检查失败。');
    console.log(app);
  } finally {
    await rm(work, {recursive: true, force: true});
  }
}
