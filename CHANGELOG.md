# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-06-28

### 新增
- 图片来源支持 `url` 类型（此前仅支持 `base64`）。
- 新增 `GET /` 与 `GET /health` 健康探活，本地直接回 200。
- README 重写：明确项目定位“给任意接入 Claude Code 的文本模型加上图片识别”，
  新增「支持哪些大脑模型」章节与 DeepSeek（OpenAI 端点）串翻译器的配方。

### 说明
- 协议翻译（Anthropic ↔ OpenAI）不在本项目内重复实现，推荐串接现成翻译器
  （如 a2o）。本项目专注于独有的“眼脑分离”识图能力。

## [0.1.0] - 2026-06-28

### 新增
- 首个版本：本地透明视觉代理，端口默认 8788。
- 眼脑分离：眼睛模型（OpenAI 格式，如 qwen-vl-max）只描述图片成文字，
  大脑模型（Anthropic 格式）独享全部推理。
- 配置驱动：环境变量 > config.json > 内置默认；config.json 被 gitignore。
- 处理 Claude Code 的 Read 工具 tool_result 内嵌套图片。
- 提供 start.bat / start.sh 一键启动脚本。
