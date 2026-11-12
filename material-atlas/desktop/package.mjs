import { packager } from '@electron/packager';
import { mkdir, copyFile, writeFile, cp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {randomUUID} from 'node:crypto';
import { makeIcon } from './icon.mjs';
import {validatePackagedAssets} from './package-assets.mjs';
import {MachineLearningEngine} from './ml-engine.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {version,devDependencies} = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const stage = path.join(root, '.local', `desktop-stage-v${version}-${randomUUID()}`);
const packagingTemp = path.join(root, '.local', `packager-temp-${randomUUID()}`);
const iconPath = await makeIcon();
await mkdir(stage,{recursive:true});
try {
await new MachineLearningEngine({appRoot:root}).run('status');
await cp(path.join(root,'ml'),path.join(stage,'ml'),{recursive:true,filter:source=>!['__pycache__','runtime','test_engine.py'].includes(path.basename(source))});
await cp(path.join(root,'.local/ml-runtime'),path.join(stage,'ml/runtime'),{recursive:true,filter:source=>!['__pycache__'].includes(path.basename(source))});
await cp(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true});
await cp(path.join(root,'desktop'),path.join(stage,'desktop'),{recursive:true,filter:source=>!['package.mjs','package-assets.mjs','icon.mjs'].includes(path.basename(source))});
await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'materia-desktop', productName: 'Materia', version, type: 'module', main: 'desktop/main.mjs', description: '材料文献星图 · 多材料性能对比与完整主题包' }, null, 2));
await validatePackagedAssets(stage);
await new MachineLearningEngine({appRoot:stage}).run('status');
const paths = await packager({ dir: stage, tmpdir: packagingTemp, name: 'Materia', executableName: 'Materia', platform: 'win32', arch: 'x64', out: process.env.MATERIA_PACKAGE_OUT?path.resolve(process.env.MATERIA_PACKAGE_OUT):path.join(root, 'release', `v${version}`), overwrite: false, asar: false, prune: false, icon: iconPath, electronVersion: devDependencies.electron, ...(process.env.MATERIA_ELECTRON_ZIP_DIR?{electronZipDir:path.resolve(process.env.MATERIA_ELECTRON_ZIP_DIR)}:{}), win32metadata: { CompanyName: 'Materia', FileDescription: 'Materia · 材料文献星图', ProductName: 'Materia' } });
for (const output of paths) {
  await mkdir(path.join(output,'scripts'),{recursive:true});
  const themeValidator=(await readFile(path.join(root,'scripts/validate-theme-design.mjs'),'utf8')).replaceAll("'../dist/","'../resources/app/dist/");
  await writeFile(path.join(output,'scripts/validate-theme-design.mjs'),themeValidator);
  await cp(path.join(root,'theme-examples'),path.join(output,'theme-examples'),{recursive:true});
  await copyFile(path.join(root,'AI_AGENT.md'),path.join(output,'AI_AGENT.md'));
  await copyFile(path.join(root,'PREDICTION.md'),path.join(output,'PREDICTION.md'));
  await copyFile(path.join(root,'MODULES.md'),path.join(output,'MODULES.md'));
  await copyFile(path.join(root,'FIGURA.md'),path.join(output,'FIGURA.md'));
  for (const file of ['KG_OBSERVATIONS.md','kg-observations-template.csv','READING_STATUS.md','TRANSLATION.md','README.md', 'GRAPH_THEME_API.md', 'THEMES.md', 'RESEARCH_CANVAS.md', 'MATERIAL_COMPARISON.md', 'canvas-example.canvas.md', 'theme-template.css', 'theme-template.mtheme.json', 'DATA_IMPORT.md', 'metadata-template.md', 'metadata-template.json', 'journal-metrics-template.csv', 'journal-metrics-2025.csv']) await copyFile(path.join(root, file), path.join(output, file));
  await writeFile(path.join(output, '使用说明.txt'), '双击 Materia.exe 启动，更新后请完全退出并重开。\r\n请保留整个 materia 文件夹。\r\n默认文献库位于 materia 根目录的「文献库」，旧目录保留作迁移备份。\r\n软件分组对应 papers 子文件夹；在软件和文件夹内移动、改名会自动同步。录入信息保存在 library.json。\r\n主界面阅读状态与文件夹分组独立，支持批量设置。星图右下角可自然整理。\r\n齿轮中的「设置」底部可查看每日导入记录；「主题与字体」提供七款双模式透明玻璃主题。\r\n文献管理可离线运行，无需安装 Node.js。AI 研究助手的配置见 AI_AGENT.md。\r\n');
  console.log(path.join(output, 'Materia.exe'));
}


} finally {
  // This uniquely named directory contains only the generated packaging input.
  await rm(stage,{recursive:true,force:true});
  await rm(packagingTemp,{recursive:true,force:true});
}
