# cc-vision-eyes

> 给任意接入 Claude Code 的「文本大脑模型」配上一双「眼睛」——
> 本身看不懂图片的强力推理模型，也能在 Claude Code 里自动识别图片。
> 眼睛只负责把图片描述成文字，全部推理始终交给你的主力文本模型。

## 解决什么问题

很多最强的推理模型（GLM、DeepSeek 等）本身不带多模态、看不懂图片。在 Claude Code 里一旦你粘贴截图、或让它读一张图片文件，请求带着图片打到这些模型上，轻则报错、重则把跑了几十轮的长程任务直接搞崩。

cc-vision-eyes 用「眼脑分离」补上这块：

```
Claude Code → cc-vision-eyes → 大脑模型（你的主力文本模型，只推理）
                   │
                   └─ 请求里有图片？→ 眼睛模型（只描述成文字，不推理）
                                        ↓
                          把图块原地换成文字，再交给大脑模型
```

- **眼睛模型**：把图片忠实描述成文字（文字、数字逐字照抄，不做任何推理）。
- **大脑模型**：你的主力文本模型，收到的永远是纯文字，只管用自己最强的推理能力作答。
- **全自动**：正常粘贴图片 / 让它读图片文件即可，无需手动切模型。

## 和原生多模态模型有什么不同

原生多模态模型是“亲眼看像素”——图像信息直接进入推理，可随时聚焦任意细节；
本项目的大脑是“听眼睛转述”——图片被压成一段文字后，大脑只读这段文字。

因此：对“一段好描述就够用”的任务（读数字、总结截图、抄截图里的代码等）非常合适；
对需要精细视觉定位的任务（精确像素坐标、密集 OCR、复杂图表/空间关系）会有信息损耗。
它的价值在于：让一个**推理强但没眼睛**的大脑，配上一双**便宜好用的眼睛**，各取所长。

## 支持哪些大脑模型

只要你的文本模型能被 Claude Code 访问到，就能配。按它对外的接口格式分两种情况：

### 情况 A：大脑模型有 Anthropic 兼容端点（直接用）

例如智谱 GLM 的 `/apps/anthropic` 端点、OpenRouter、小米 MiMo 的 `/anthropic` 等。
直接把端点填进 `config.json` 的 `brainBaseUrl` 即可，无需任何额外组件。

### 情况 B：大脑模型只有 OpenAI 兼容端点（串一个翻译器）

例如 DeepSeek、Kimi、本地 Ollama / vLLM 等，对外是 `/v1/chat/completions` 格式。
本项目**不重复造“协议翻译”的轮子**（社区已有很多成熟实现，如 [a2o](https://github.com/fjlmcm/a2o)），
推荐在大脑前面串一个现成翻译器：

```
Claude Code → cc-vision-eyes（描述图片）→ 翻译器（如 a2o，Anthropic→OpenAI）→ DeepSeek
```

关键在于顺序天然合理：图片在 cc-vision-eyes 这一步**就已经变成纯文字**了，
流到翻译器时只剩文字，翻译器毫无压力。把 `brainBaseUrl` 指向翻译器即可。

#### DeepSeek 配方示例

1. 启动翻译器 a2o，`config.json`：
   ```json
   {
     "auth_token": "my-token",
     "services": [{
       "listen_address": "11001",
       "openai_base_url": "https://api.deepseek.com/v1/chat/completions",
       "openai_api_key": "sk-你的deepseek密钥",
       "force_model": "deepseek-chat"
     }]
   }
   ```
2. cc-vision-eyes 的 `config.json`：
   ```json
   {
     "port": 8788,
     "brainBaseUrl": "http://127.0.0.1:11001",
     "brainApiKey": "my-token",
     "eyesUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
     "eyesApiKey": "sk-你的视觉模型密钥",
     "eyesModel": "qwen-vl-max"
   }
   ```
3. 先后台跑 a2o，再用 `start.bat` / `start.sh` 启动。DeepSeek 就能识图了。

## 安装

需要 Node.js ≥ 18（用到原生 fetch / Web Streams），无第三方依赖。

```bash
git clone https://github.com/<your-name>/cc-vision-eyes.git
cd cc-vision-eyes
cp config.example.json config.json   # Windows: copy config.example.json config.json
# 编辑 config.json 填入端点和 key
```

## 配置

`config.json`（已被 .gitignore，不会上传）：

| 字段 | 说明 |
|---|---|
| `port` | 代理监听端口，默认 `8788` |
| `brainBaseUrl` | **大脑模型**的 Anthropic 兼容端点；若大脑是 OpenAI 模型，则填翻译器地址（见情况 B） |
| `brainApiKey` | 大脑模型（或翻译器）的密钥 |
| `eyesUrl` | **眼睛模型**的 OpenAI 兼容端点，默认填了阿里 DashScope |
| `eyesApiKey` | 眼睛模型的 Key；留空则复用 `brainApiKey` |
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

## 特点

- **眼脑分离**：视觉模型只描述、不推理，作答完全交给推理更强的主力模型。
- **接任意文本模型**：Anthropic 端点直接接；OpenAI 端点串一个现成翻译器即可。
- **跨格式桥接**：眼睛端点用 OpenAI 格式，可直接对接阿里 DashScope（qwen-vl-max）等。
- **全自动、无感**：粘贴图片或读图片文件即可，无需手动切模型。
- **透明转发**：只改写含图请求，其余路径原样透传；流式 / 非流式响应都按字节回传。
- **零依赖**：仅用 Node.js 原生能力（fetch / Web Streams），不装任何第三方包。
- **配置安全**：真实 key 存于本地 `config.json` 并被 `.gitignore`，不会进版本库。

## 工作原理

1. 代理监听本地端口，Claude Code 把所有请求发到它这里。
2. 对 `POST /v1/messages`：解析请求体，递归扫描 `messages[].content`，找出 `image` 块，以及 Read 工具返回里 `tool_result` 内嵌套的图片（支持 base64 与 url 两种来源）。
3. 每张图发给眼睛模型（OpenAI 格式），拿回文字描述。
4. 把图片块原地替换成文字块，再把整条请求转发给 `brainBaseUrl`。
5. 响应按字节流式回传，主力模型全程不知道有过图片。
6. 其它路径（如 `count_tokens`）原样透传；`GET /` 健康探活本地直接回 200。

## 已知限制

- 大脑端点需是 **Anthropic Messages API**（`/v1/messages`）格式；OpenAI 模型请按“情况 B”串翻译器。
- 眼睛端点为 **OpenAI Chat Completions** 格式。
- 每张图会多一次眼睛模型调用，带来额外延迟和 token 开销。
- 描述是“一次性、不针对具体问题”的，精细视觉任务可能有信息损耗（见上文对比）。
- API Key 以明文存于本地 `config.json`，请注意文件权限。

## License

[MIT](./LICENSE)
