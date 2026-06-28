# cc-vision-eyes

> 让“只会推理、不会看图”的主力模型，也能在 Claude Code 里自动识图。
> 视觉模型只当**眼睛**（把图描述成文字），主力模型当**大脑**（独享全部推理）。

## 解决什么问题

在 Claude Code 里接第三方 / 自建模型（GLM、各类国产模型）时，很多强力的主力模型**不支持图片**。一旦你粘贴截图、或让它读一张图片文件，请求带着图片打到看不懂图的模型上，轻则报错、重则把长程任务的会话搞崩。

cc-vision-eyes 让你既保住主力模型的推理能力，又补上识图能力——办法是“眼脑分离”：视觉模型只把图片描述成文字，推理仍由你的主力模型完成。这样即便视觉模型推理较弱（例如 qwen-vl），也只用它的“眼力”，不用它的“脑子”，最终答案的质量不被拖累。

**眼脑分离的流程：**

```
Claude Code → cc-vision-eyes → 大脑模型（你的主力模型，只推理）
                   │
                   └─ 请求里有图片？→ 眼睛模型（只描述成文字，不推理）
                                        ↓
                          把图块原地换成文字，再交给大脑模型
```

- **眼睛模型**只做一件事：把图片忠实描述成文字（文字、数字逐字照抄，不做任何推理）。
- **大脑模型**收到的永远是纯文字，它根本不知道刚才有张图，只管用自己最强的推理能力作答。
- 全自动：你正常粘贴图片 / 让它读图片文件即可，无需手动切模型。

## 特点

- **眼脑分离**：视觉模型只负责把图片忠实描述成文字，绝不参与推理；最终作答完全交给推理更强的主力模型。
- **跨格式桥接**：大脑端点用 Anthropic 格式、眼睛端点用 OpenAI 格式，两者由代理自动衔接，可直接对接阿里 DashScope（qwen-vl-max）等 OpenAI 兼容视觉端点。
- **全自动、无感**：正常粘贴图片或让它读图片文件即可，无需手动切模型。
- **透明转发**：只改写含图请求，其余路径原样透传；流式 / 非流式响应都按字节回传。
- **零依赖**：仅用 Node.js 原生能力（fetch / Web Streams），不装任何第三方包。
- **配置安全**：真实 key 存于本地 `config.json` 并被 `.gitignore`，不会进版本库。

## 安装

需要 Node.js ≥ 18（用到原生 fetch / Web Streams），无第三方依赖。

```bash
git clone https://github.com/<your-name>/cc-vision-eyes.git
cd cc-vision-eyes
cp config.example.json config.json   # Windows: copy config.example.json config.json
# 编辑 config.json 填入你的端点和 key
```

## 配置

`config.json`（已被 .gitignore，不会上传）：

| 字段 | 说明 |
|---|---|
| `port` | 代理监听端口，默认 `8788` |
| `brainBaseUrl` | **大脑模型**的 Anthropic 兼容端点，例如 `https://.../apps/anthropic` |
| `brainApiKey` | 大脑模型的 API Key |
| `eyesUrl` | **眼睛模型**的 OpenAI 兼容端点，默认填了阿里 DashScope |
| `eyesApiKey` | 眼睛模型的 Key；留空则复用 `brainApiKey`（同一家供应商时很方便） |
| `eyesModel` | 视觉模型名，默认 `qwen-vl-max` |
| `visionPrompt` | （可选）给眼睛模型的描述指令，已内置一份“只描述不推理”的默认值 |

也可用环境变量覆盖（优先级最高）：`CCVE_PORT` / `CCVE_BRAIN_BASE_URL` / `CCVE_BRAIN_API_KEY` / `CCVE_EYES_URL` / `CCVE_EYES_API_KEY` / `CCVE_EYES_MODEL` / `CCVE_VISION_PROMPT`。

## 使用

**一键启动（推荐）** —— 脚本会先后台拉起代理，再把 Claude Code 指向它：

```bash
# Windows
start.bat

# macOS / Linux
chmod +x start.sh && ./start.sh
```

**或手动启动：**

```bash
node proxy.js
# 另开一个终端：
export ANTHROPIC_BASE_URL=http://127.0.0.1:8788
export ANTHROPIC_API_KEY=dummy   # 真 key 由代理注入，这里随便填
claude
```

启动后，在 Claude Code 里**直接粘贴图片**，或**让它读某个图片文件**，都会被自动识别——眼睛描述、大脑推理。代理日志里会看到 `识别并替换了 N 张图片 → 文字`。

## 工作原理

1. 代理监听本地端口，Claude Code 把所有请求发到它这里。
2. 对 `POST /v1/messages`：解析请求体，递归扫描 `messages[].content`，找出 `image` 块，以及 Read 工具返回里 `tool_result` 内嵌套的图片。
3. 每张图发给眼睛模型（OpenAI 格式，`image_url` 走 `data:` base64），拿回文字描述。
4. 把图片块原地替换成文字块，再把整条请求转发给大脑模型的 Anthropic 端点。
5. 响应按字节流式回传，主力模型全程不知道有过图片。
6. 其它路径（如 `count_tokens`）原样透传，不干预。

## 已知限制

- 大脑端点必须是 **Anthropic Messages API**（`/v1/messages`）格式；眼睛端点为 **OpenAI Chat Completions** 格式。
- 目前只处理 base64 内联图片；远程 URL 图片暂未处理。
- 每张图会多一次眼睛模型调用，带来额外延迟和 token 开销。
- API Key 以明文存于本地 `config.json`，请注意文件权限。

## License

[MIT](./LICENSE)
