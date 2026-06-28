#!/usr/bin/env node
// ============================================================
//  cc-vision-eyes  ——  让“只会推理、不会看图”的主力模型也能识图
//
//  原理：在 Claude Code 与「大脑模型」之间夹一层透明代理。
//  发现请求里有图片 → 先用「眼睛模型」把图描述成纯文字 → 把图块
//  原地换成文字 → 再原样转发给「大脑模型」推理。
//
//  和同类项目最大的不同：
//    1) 眼脑分离——眼睛模型只描述、不推理，全部推理交给大脑模型；
//    2) 眼睛模型支持 OpenAI 格式端点（如阿里 DashScope 的 qwen-vl-max）。
//
//  CC ↔ 代理 ↔ 大脑：全程 Anthropic 格式，无需转换；
//  只有「代理 → 眼睛」这一发用 OpenAI 格式。
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

// ---------- 读取配置：环境变量 > config.json > 内置默认 ----------
function loadConfig() {
  const defaults = {
    port: 8788,
    // 大脑模型：Anthropic 兼容端点（Claude Code 直接对接的那个）
    brainBaseUrl: "",
    brainApiKey: "",
    // 眼睛模型：OpenAI 兼容端点（默认填了阿里 DashScope）
    eyesUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    eyesApiKey: "", // 留空则复用 brainApiKey（同一家供应商时很方便）
    eyesModel: "qwen-vl-max",
    // 给眼睛模型的指令：只描述、不推理，逐字逐数照抄
    visionPrompt:
      "请尽可能详尽、准确地描述这张图片的全部内容：包括所有可见的文字与数字（逐字逐数照抄，不要漏）、" +
      "代码、图表、表格、界面布局、颜色、物体及其位置关系。只陈述你看到的事实，不要做任何推理或解答，" +
      "因为后续会有另一个模型基于你的描述来推理。用中文回答。",
  };

  let fileCfg = {};
  const cfgPath = path.join(__dirname, "config.json");
  if (fs.existsSync(cfgPath)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    } catch (e) {
      console.error("[cc-vision-eyes] config.json 解析失败：", e.message);
      process.exit(1);
    }
  }

  const env = process.env;
  const cfg = {
    port: Number(env.CCVE_PORT || fileCfg.port || defaults.port),
    brainBaseUrl: env.CCVE_BRAIN_BASE_URL || fileCfg.brainBaseUrl || defaults.brainBaseUrl,
    brainApiKey: env.CCVE_BRAIN_API_KEY || fileCfg.brainApiKey || defaults.brainApiKey,
    eyesUrl: env.CCVE_EYES_URL || fileCfg.eyesUrl || defaults.eyesUrl,
    eyesApiKey: env.CCVE_EYES_API_KEY || fileCfg.eyesApiKey || defaults.eyesApiKey,
    eyesModel: env.CCVE_EYES_MODEL || fileCfg.eyesModel || defaults.eyesModel,
    visionPrompt: env.CCVE_VISION_PROMPT || fileCfg.visionPrompt || defaults.visionPrompt,
  };
  // 眼睛 key 留空时复用大脑 key
  if (!cfg.eyesApiKey) cfg.eyesApiKey = cfg.brainApiKey;
  return cfg;
}

const CFG = loadConfig();

// 启动前自检：缺了大脑端点就没法干活
if (!CFG.brainBaseUrl || !CFG.brainApiKey) {
  console.error("============================================================");
  console.error(" [cc-vision-eyes] 缺少必填配置：brainBaseUrl / brainApiKey");
  console.error(" 请复制 config.example.json 为 config.json 并填写，");
  console.error(" 或设置环境变量 CCVE_BRAIN_BASE_URL / CCVE_BRAIN_API_KEY。");
  console.error("============================================================");
  process.exit(1);
}

// 把一张图片（base64 data URL 或 http(s) URL）丢给眼睛模型，拿回文字描述
async function describeImageByUrl(imageUrl) {
  const body = {
    model: CFG.eyesModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: CFG.visionPrompt },
        ],
      },
    ],
  };
  const r = await fetch(CFG.eyesUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CFG.eyesApiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`eyes ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "(眼睛模型未返回描述)";
}

// 把一个 content 数组里的图片块原地替换成文字块；返回替换了几张
async function replaceImagesInContentArray(arr) {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object") continue;
    // 直接的图片块（支持 base64 和 url 两种来源）
    if (item.type === "image" && item.source) {
      let imageUrl = null;
      if (item.source.type === "base64" && item.source.data) {
        imageUrl = `data:${item.source.media_type || "image/png"};base64,${item.source.data}`;
      } else if (item.source.type === "url" && item.source.url) {
        imageUrl = item.source.url;
      }
      if (imageUrl) {
        const desc = await describeImageByUrl(imageUrl).catch((e) => `(识图失败：${e.message})`);
        arr[i] = { type: "text", text: `[图片识别结果，由眼睛模型描述]：\n${desc}` };
        count++;
      }
    }
    // tool_result 里嵌套的图片（Claude Code 的 Read 工具读图会走这条）
    else if (item.type === "tool_result" && Array.isArray(item.content)) {
      count += await replaceImagesInContentArray(item.content);
    }
  }
  return count;
}

// 遍历整个请求体，把所有图片换成文字
async function stripImages(payload) {
  if (!payload || !Array.isArray(payload.messages)) return 0;
  let total = 0;
  for (const msg of payload.messages) {
    if (Array.isArray(msg.content)) {
      total += await replaceImagesInContentArray(msg.content);
    }
  }
  return total;
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    // 健康探活：GET / 或 /health 本地直接回 200，不打扰上游
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "cc-vision-eyes" }));
      return;
    }
    const raw = Buffer.concat(chunks);
    const targetUrl = CFG.brainBaseUrl + req.url; // /v1/messages → <brainBaseUrl>/v1/messages

    // 透传请求头（去掉 host/content-length，让 fetch 自己算）
    const fwdHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lk = k.toLowerCase();
      if (["host", "content-length", "connection"].includes(lk)) continue;
      fwdHeaders[k] = v;
    }
    // 强制注入真 key（Claude Code 那边可以填假 key）
    fwdHeaders["x-api-key"] = CFG.brainApiKey;
    delete fwdHeaders["authorization"];
    if (!fwdHeaders["anthropic-version"]) fwdHeaders["anthropic-version"] = "2023-06-01";

    let outBody = raw;
    // 只对 messages 请求做识图改写，其它请求（如 count_tokens）原样透传
    if (req.method === "POST" && req.url.includes("/v1/messages")) {
      try {
        const payload = JSON.parse(raw.toString("utf-8"));
        const n = await stripImages(payload);
        if (n > 0) console.log(`[cc-vision-eyes] 识别并替换了 ${n} 张图片 → 文字，转交大脑模型推理`);
        outBody = Buffer.from(JSON.stringify(payload), "utf-8");
      } catch (e) {
        console.log("[cc-vision-eyes] 解析请求体失败，原样转发：", e.message);
        outBody = raw;
      }
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: fwdHeaders,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : outBody,
      });
      const respHeaders = {};
      upstream.headers.forEach((v, k) => {
        if (["content-length", "content-encoding", "transfer-encoding", "connection"].includes(k.toLowerCase()))
          return;
        respHeaders[k] = v;
      });
      res.writeHead(upstream.status, respHeaders);
      if (upstream.body) {
        // 流式/非流式都能用：把 web 流转成 node 流灌回去
        Readable.fromWeb(upstream.body).pipe(res);
      } else {
        res.end();
      }
    } catch (e) {
      console.log("[cc-vision-eyes] 转发大脑模型失败：", e.message);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "proxy_error", message: e.message } }));
    }
  });
});

server.listen(CFG.port, "127.0.0.1", () => {
  console.log("============================================================");
  console.log(` cc-vision-eyes 已启动：http://127.0.0.1:${CFG.port}`);
  console.log(` 眼睛：${CFG.eyesModel}（只描述）   大脑：你的主力模型（只推理）`);
  console.log(" 发图 → 眼睛描述成文字 → 大脑推理（全自动）");
  console.log("============================================================");
});
