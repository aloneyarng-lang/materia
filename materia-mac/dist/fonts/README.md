# 软件内置字体

这些字体由程序直接从本地资源加载，不需要导入主题包，也不会安装或修改 Windows 系统字体。正文、标题、数字、代码的选择可在「主题与字体 → 字体与字号」中分别保存。

| 字体 | 文件来源 | 本机用途 |
| --- | --- | --- |
| SF Pro | [Apple 官方 SF Pro](https://devimages-cdn.apple.com/design/resources/download/SF-Pro.dmg) | 液态玻璃的西文正文、标题和数字，可变字重与斜体 |
| SF Mono | [Apple 官方 SF Mono](https://devimages-cdn.apple.com/design/resources/download/SF-Mono.dmg) | 等宽内容，常规、半粗体及相应斜体 |
| New York | [Apple 官方 New York](https://devimages-cdn.apple.com/design/resources/download/NY.dmg) | 可选西文衬线标题与正文，可变字重与斜体 |
| Inter | [作者官方仓库 v4.1](https://github.com/rsms/inter/tree/v4.1) | 可选西文无衬线及后备字体 |
| 思源黑体 CN | [Adobe 官方仓库](https://github.com/adobe-fonts/source-han-sans/tree/release/Variable/WOFF2/OTF/Subset) | 简体中文；不是苹方的重命名版本 |
| Source Code Pro | [Adobe 官方项目](https://github.com/adobe-fonts/source-code-pro) | 可选等宽字体 |

SF Pro、SF Mono、New York 不提供完整的中文字形。本机有苹方时优先使用苹方，否则使用思源黑体。当前未附带苹方字体。

Apple 文件是从官方包中未修改地提取到 `apple/` 的本机私有资源，目录由 `.gitignore` 排除。每套字体的原始 RTF 许可和来源校验信息都保留在该目录。Apple 的公开许可不因个人自用而自动豁免嵌入限制；本次复制不产生新的使用或再分发授权。原文见 [Apple 字体许可](https://developer.apple.com/fonts/)。

Inter、思源黑体和 Source Code Pro 的原始 OFL 许可分别位于本目录的 `*-LICENSE.*`。字体文件不写入文献库设置，设置中仅保存字体标识；导出主题不会复制本机 Apple 字体文件。
