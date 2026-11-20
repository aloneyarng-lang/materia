# 检索记录

日期：2026-11-08。检索服务：Hugging Face公开模型API、公开网页检索、AI-Hobbyist公开页面、B站公开视频信息、Fish Audio公开模型信息。

先搜蕾塞／蕾赛／レゼ／Reze与GPT-SoVITS组合，未定位到能够同时核验来源和配套.ckpt/.pth的蕾塞专用分享。这个结论仅限本次检索覆盖，不表示互联网上不存在。

用户补充“找蕾塞CV”。据此改搜上田丽奈／上田麗奈／Reina Ueda及甘雨日语模型。核对到AI-Hobbyist的日语多角色v2配套权重，发布者清单包含甘雨；按固定提交下载并核对LFS校验值。

排除项：
- `Loren85/Reze-Chainsawman-Film-Ita-dub`：意大利语RVC，不是日语GPT-SoVITS。
- Fish Audio蕾塞公开音色：在线音色，未提供用户所需的GSV配套文件；生成样例不是原作音频。
- `legekka/ganyutts`、`Aho-official/Ganyu-Genshin-Impact-JP`等单角色条目未核验为GPT-SoVITS配套文件，未当作本包权重。
- 图像LoRA和同名语言模型未当作语音模型。
- B站蕾塞片段合集不是模型权重。本包选用官方预告准备参考音频。

目前缺口：没有蕾塞专用训练权重；没有原作全量逐字台词库；没有人工听校与合成试听评分。已准备的替代路线是“包含同CV角色的日语模型 + 蕾塞本人官方短参考”。
