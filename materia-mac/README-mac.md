# Materia 3.0.1 · macOS 构建

将这个文件夹复制到 Mac。在终端进入该文件夹，使用原生架构的 Node.js 22.12 或更新版本，并提前安装 `uv`。首次构建需要联网下载 Electron、Python 和依赖。

```sh
npm ci --ignore-scripts
node build-mac.mjs
```

构建结果位于 `release/Materia-darwin-arm64/Materia.app`（Apple Silicon）或 `release/Materia-darwin-x64/Materia.app`（Intel）。构建脚本会验证应用签名和内置的机器学习引擎。应用采用本地临时签名，未经过 Apple 公证。

程序包包含应用源码、离线字典、界面和角色资源。首次打开时，应用在用户的 Application Support 配置目录创建空文献库。AI API 连接仍需在应用内设置。现有 Antigravity 客户端直连和 GPT-SoVITS 本地 CUDA 语音依赖 Windows 环境。

可用 `node build-mac.mjs --check-assets` 离线检查源码包中的资源。
