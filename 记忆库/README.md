# Materia 记忆库

## 原作记忆

`canon/makise-kurisu/corpus.json` 是红莉栖的中、英、日台词和对话语料。Materia 桌面版启动后优先读这里，安装包也带有可独立使用的副本。条目保留台词位置、角色版本、原文语言和转录来源，机器译文另标。覆盖统计见 `canon/makise-kurisu/coverage.json`。

## 相处记忆

`relationship/makise-kurisu/` 保存按文献库划分的本地索引。软件自动把已答复的交流、自我介绍和明确表达的偏好组织进去。索引引用该文献库 `ai-chats.json` 中的原始对话与消息位置，删除对话后同步重建。历史聊天内容只在其文献库留存一份，索引可由原始对话重建。

两类记忆分别按角色 ID 管理。当前包含 `makise-kurisu`（红莉栖）、`chainsawman-reze`（蕾塞）和 `genshin-ganyu`（甘雨）。在 Materia 的「当前角色 → 设置 → 记忆库」可以分别查看和检索，并选择回复语言。


## Reze / 蕾塞

角色ID为 `chainsawman-reze`。原作台词转录、制作资料摘要、原创语言示例保存在 `canon/chainsawman-reze/corpus.json`，界面分别标注来源类型；原创例句不得作为原作或用户经历。

`relationship/chainsawman-reze/` 由程序按实际对话自动重建，引用对应文献库的 `ai-chats.json`。蕾塞和红莉栖的语言偏好、聊天索引与召回相互隔离。

`canon/chainsawman-reze/source-material.sqlite3` 仅为导入资料的备用副本，运行时相处记忆以 `ai-chats.json` 及 relationship 索引为准，不维护两套相处记录。


## Ganyu / 甘雨

角色ID：`genshin-ganyu`。原作资料在 `canon/genshin-ganyu/`；真实相处记忆按文献库建立在 `relationship/genshin-ganyu/`。与蕾塞共享语音参考不代表共享人格、语言偏好或聊天经历。


## 2026-11-08 原作台词补充

甘雨新增 400 条游戏原文，中英日按游戏文件名对齐；蕾塞新增 23 条日文原作台词的二手转录，中英为补译。各角色目录的 README.md 和 source-manifest.json 记录覆盖范围和证据。蕾塞此前的 source-material.sqlite3 为旧版资料备份，新增台词的运行时来源是 corpus.json。


## 2026-11-09 记忆管理页面

MEM 入口可直接分页浏览，筛选原作台词、摘要和原创示例，查看完整中英日文本并保存个人修订。原始 corpus.json 保留，原作修订与移除状态另存 canon/<角色ID>/personal-edits.json；可恢复原文。

相处记忆支持手动补充、修订及移除/恢复。notes 和 memoryEdits 保存在当前文献库 ai-chats.json 的 characterMemory.roles.<角色ID> 中，并同步到 relationship 索引；不改写历史消息文本。移除状态会参与回忆过滤，修订会参与实际回复。原作个人修订全角色本机生效，相处记忆按角色和文献库隔离。
