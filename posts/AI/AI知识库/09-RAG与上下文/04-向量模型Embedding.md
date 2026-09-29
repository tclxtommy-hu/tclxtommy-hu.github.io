# 向量模型（Embedding Model）

> 一句话定义：把文本 / 图片 / 视频编码成固定维度浮点向量的模型，只负责"算相似度"、不负责"写答案"，是 RAG、语义搜索与推荐系统的检索底座。

> 关联阅读：RAG 全链路见 [01-RAG检索增强生成.md](01-RAG检索增强生成.md)；向量怎么存、怎么查见 [03-向量数据库.md](03-向量数据库.md)；词级嵌入基础见 [../06-大语言模型LLM/03-Embedding与表示.md](../06-大语言模型LLM/03-Embedding与表示.md)。

## 1. 三种模型定位：大模型 / 推理模型 / 向量模型

向量模型即 **Embedding** /ɪmˈbedɪŋ/ （嵌入）模型，与负责生成的 **LLM** /ˌel el ˈem/ （ **Large Language Model** /lɑːdʒ ˈlæŋɡwɪdʒ ˈmɒdl/ ，大语言模型）是完全不同的物种：

| 维度 | 普通大模型 | 推理模型 | 向量模型（Embedding） |
|---|---|---|---|
| 输出 | 自然语言文本 | 自然语言文本（内部先思考草稿） | 一串数字向量（固定维度数组） |
| 训练目标 | 生成通顺文字、记忆知识 | 分步推理、奖励过程正确 | 对比学习：语义相近向量距离近 |
| 核心能力 | 聊天、写作、简答 | 复杂逻辑、数学、代码 | 语义检索、相似度对比、聚类 |
| 速度 | 较快 | 慢（内部思考） | 非常快 |
| 成本 | 中等 | 高 | 很低 |
| 能否直接回答问题 | ✅ | ✅ | ❌ 只做匹配 |
| 典型场景 | 日常对话、文案、摘要 | 奥数、算法、复杂方案推演 | RAG 知识库、语义搜索、推荐 |
| 例子 | GPT-4o、普通豆包 | o1、DeepSeek R1 | BGE、text-embedding、doubao-embedding |

**通俗比喻** ：

- 普通 / 推理模型 = 答题的人
- 向量模型 = 档案管理员：给每份文档"编号"（向量化），只负责找意思最接近的那份，自己不写答案

## 2. 在 RAG 链路中的位置

**RAG** /ræɡ/ （ **Retrieval-Augmented Generation** /rɪˈtriːvl ɔːɡˈmentɪd ˌdʒenəˈreɪʃn/ ，检索增强生成）的完整链路里，向量模型承担"建库"与"查库"两头的向量化：

1. **建库** ：把 **PDF** /ˌpiː diː ˈef/ （ **Portable Document Format** /ˈpɔːtəbl ˈdɒkjumənt ˈfɔːmæt/ ，便携式文档格式）/网页等文档切片 → 向量模型逐片向量化 → 存入向量数据库；
2. **查库** ：用户提问 → 同一个向量模型把问题转向量 → 检索语义最相关的片段；
3. **生成** ：相关片段交给大模型，结合资料生成最终回答。

> 向量模型没有推理能力，只判断"两段话意思像不像"；写答案永远是 LLM 的事。

**落地示例** ：电商客服知识库——5000 篇帮助文档切成约 2 万个 chunk，用 BGE-M3 向量化入库（1024 维，建库一次约 40 分钟）；用户问"退货多久到账"，问题转向量后命中《退款时效说明》片段，交给 LLM 生成带引用的回答，在线单次检索 < 50ms。

## 3. 稠密向量 vs 稀疏向量

核心结论：

> **稠密向量才是大家说的"语义向量"；稀疏向量本质是"词权重向量"。**

### 3.1 稠密向量（Dense）

**Dense** /dens/ （稠密）向量：

- 固定长度浮点数组（如 2048 维），绝大多数位置非 0
- 整段文本 / 图片压缩成一个向量，编码整体语义
- 匹配方式：余弦相似度（ **cosine** /ˈkəʊzaɪn/ ）
- 擅长：同义、改写、语义相近召回
- 缺点：生僻实体 / 编号容易淹没

### 3.2 稀疏向量（Sparse）

**Sparse** /spɑːs/ （稀疏）向量：

- 绝大多数维度 = 0，只存 `{token_id: weight}` 字典
- 模型自动识别重要词 / **token** /ˈtəʊkən/ （词元），给每个词分配权重
- 匹配方式：点积（类似增强版 **BM25** /ˌbiː em ˌtwenti ˈfaɪv/ （ **Best Matching 25** /best ˈmætʃɪŋ/ ，经典关键词打分算法））
- 擅长：实体、编号、专有名词、精确词命中
- 缺点：不懂深层语义，同义词召回差

### 3.3 对比表

| 项目 | 稠密 Dense | 稀疏 Sparse |
|---|---|---|
| 是语义向量吗 | ✅ 是 | ❌ 是词权重向量 |
| 形态 | 固定长度，几乎无 0 | 极多 0，仅少数 token 有权重 |
| 匹配原理 | 整体语义相似度（cosine） | 关键词 / 子词权重点积 |
| 擅长 | 同义、改写、语义相近 | 实体、编号、专有名词 |
| 存储 | 完整 float 数组 | 只存非零位置，体积小 |
| doubao-embedding-vision | 默认输出 | `sparse_embedding.type: enabled` （ **仅文本**） |

### 3.4 直观例子

文本：`红色的苹果放在木桌子上`

**稠密向量** ：

```text
[-0.021, 0.145, 0.077, ..., -0.033]  // 2048 维，融合整体语义
```

- query = `桌面上有红苹果` → 命中
- query = `桌上放着红色水果` → 也能命中（懂同义）

**稀疏向量** ：

```json
{ "红色": 0.86, "苹果": 0.92, "木": 0.61, "桌子": 0.78 }
```

- query = `红色苹果` → 高分命中
- query = `桌上红色水果` → 很难命中（没有"苹果"这个 token）

### 3.5 混合检索（Hybrid Search）

**hybrid** /ˈhaɪbrɪd/ （混合）检索是 RAG 的经典用法：

1. **稠密向量召回** ：抓语义相似片段
2. **稀疏向量召回** ：抓实体、编号、专业名词精确匹配
3. 两路结果融合打分，取 topK

> 稠密管意思，稀疏管关键词。

### 3.6 关键澄清

- **不需要人工指定关注维度** （宽、高、颜色等），稠密 / 稀疏都是模型自动算出来的
- 人工指定宽高颜色是传统 **CV** /ˌsiː ˈviː/ （ **Computer Vision** /kəmˈpjuːtə ˈvɪʒn/ ，计算机视觉）的 **手工特征** ，不属于 embedding
- 图片输入 **不支持稀疏向量**，只有稠密
- multi_embedding 是多个稠密子向量， **不是稀疏向量** （见 5.3 节）

## 4. 调用方式与入参

> ⚠️ DeepSeek 官方公有 **API** /ˌeɪ piː ˈaɪ/ （ **Application Programming Interface** /ˌæplɪˈkeɪʃn ˈprəʊɡræmɪŋ ˈɪntəfeɪs/ ，应用编程接口）（api.deepseek.com）**未开放独立 Embedding 接口**，需要向量化请走其他厂商或本地部署；业界调用格式已高度统一为 OpenAI 兼容的 `/v1/embeddings`。

### 4.1 标准 Embedding 接口（POST /v1/embeddings）

请求体（ **JSON** /ˈdʒeɪsən/ （ **JavaScript Object Notation** /ˈdʒɑːvəskrɪpt ˈɒbdʒɪkt nəʊˈteɪʃn/ ，JavaScript 对象表示法））：

```json
{
  "model": "deepseek-embedding",
  "input": "待向量化的文本",
  "encoding_format": "float"
}
```

| 参数 | 必选 | 类型 | 说明 |
|---|---|---|---|
| model | ✅ | string | 模型名，如 deepseek-embedding / bge-m3 / text-embedding-3-small |
| input | ✅ | string / string[] | 单文本或批量数组，单条上限常见 512 token |
| encoding_format | ❌ | string | float（默认）/ base64 |
| dimensions | ❌ | int | 部分模型支持（如 text-embedding-3、doubao 系列）；DeepSeek-Embedding 固定 1024 维，不可改 |

**落地示例** （主示例，Node.js + TypeScript）：用 OpenAI SDK 直连本地 Ollama 起的 BGE-M3：

```typescript
import OpenAI from "openai";

interface EmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format?: "float" | "base64";
}

// 指向本地 Ollama 的 OpenAI 兼容端点
const client = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama", // 本地服务不校验，占位即可
});

const req: EmbeddingRequest = {
  model: "bge-m3",
  input: "红色的苹果放在木桌子上",
  encoding_format: "float",
};

const resp = await client.embeddings.create(req);
console.log(resp.data[0].embedding.length); // 1024
```

> 接口兼容 ≠ 向量可互通：不同模型的向量空间互不相通，写入与查询必须用同一模型，详见 [03-向量数据库.md](03-向量数据库.md) 2.5 节。

### 4.2 Ollama 原生接口（/api/embeddings）

```json
{
  "model": "bge-m3",
  "prompt": "需要转为向量的文本"
}
```

- 原生接口不支持数组批量，一次一条
- 生产建议直接用 4.1 的 OpenAI 兼容端点（`/v1/embeddings`），支持批量且客户端生态通用

### 4.3 HuggingFace Transformers 加载（补充：Python）

Transformers 生态的模型加载只在 Python 有官方一等支持，故此处补 Python 版：

```python
# 补充（Python）：HuggingFace Transformers 加载开源权重
from transformers import AutoTokenizer, AutoModel

model_name = "BAAI/bge-m3"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)

inputs = tokenizer(text, return_tensors="pt", padding=True,
                   truncation=True, max_length=512)
```

> 注意：`transformers` 输出的是原始 token 向量矩阵，句级向量还需自己做 pooling + 归一化；想 `.encode()` 直接出句子向量，用 `sentence-transformers` 封装。

## 5. 多模态向量模型：doubao-embedding-vision

**multimodal** /ˌmʌltiˈməʊdl/ （多模态）向量模型可以统一编码文本 / 图片 / 视频。以火山方舟 doubao-embedding-vision 为例：

- 接口：`POST https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal`
- 支持：文本 / 图片 / 视频向量化
- 默认输出 **2048 维**稠密向量，可降维到 1024
- 模型 ID：`doubao-embedding-vision-251215` （新版，支持视频）

### 5.1 顶层入参

```json
{
  "model": "doubao-embedding-vision-251215",
  "encoding_format": "float",
  "dimensions": 2048,
  "instructions": "",
  "sparse_embedding": { "type": "disabled" },
  "multi_embedding": { "type": "disabled" },
  "input": []
}
```

| 参数 | 必选 | 说明 |
|---|---|---|
| model | ✅ | 模型 ID |
| input | ✅ | 数组，最多 10 条多模态对象 |
| encoding_format | ❌ | float / base64 |
| dimensions | ❌ | 2048（默认）/ 1024 |
| instructions | ❌ | 检索指令，提升跨模态召回 |
| sparse_embedding | ❌ | 仅 **纯文本** 可用，enabled / disabled |
| multi_embedding | ❌ | 分片向量开关，见 5.3 节 |

### 5.2 input 三种子类型

**文本** ：

```json
{ "type": "text", "text": "这是一张雪山风景图片" }
```

**图片** （支持公网 **URL** /ˌjuː ɑːr ˈel/ （ **Uniform Resource Locator** /ˈjuːnɪfɔːm rɪˈsɔːs ˈləʊkeɪtə/ ，统一资源定位符）/ 火山 TOS 对象存储（ **TOS** /tɒs/ （ **Tinder Object Storage** /ˈtaɪndə ˈɒbdʒɪkt ˈstɔːrɪdʒ/ ，火山引擎对象存储）），不支持 base64）：

```json
{ "type": "image_url", "image_url": { "url": "https://xxx/snow.jpg" } }
```

**视频** （仅 251215 版本）：

```json
{
  "type": "video_url",
  "video_url": {
    "url": "https://xxx/demo.mp4",
    "fps": 0.5,
    "min_frames": 2,
    "max_video_tokens": 2048
  }
}
```

### 5.3 multi_embedding：单条输入内部拆分片

> **不是物料切片！** 是模型内部把单条输入拆成 patch / token，返回每个分片独立向量。

开启方式：

```json
"multi_embedding": {
  "type": "enabled",
  "compression": "blosc2"
}
```

| 参数 | 说明 |
|---|---|
| type | enabled / disabled（默认） |
| compression | blosc2 / zstd；不传则返回原始 float 二维数组 |

**响应变化** ：

- `data[0].embedding` ：全局向量（一维）
- `data[0].multi_embedding` ：分片向量矩阵，shape = `[N, D]`
  - N = patch / token 数量（ **patch** /pætʃ/ ，图像块）
  - D = dimensions

**适用场景** ：

1. 图文细粒度跨模态检索（文本 token 向量 × 图片 patch 向量两两算相似度）
2. 局部图搜
3. 多模态交叉注意力

**⚠️ 限制** ：

- 开启后返回包体积暴涨
- **分片向量交叉打分逻辑由业务侧实现**，API 只输出分片向量
- 图片 / 视频的分片是图像 patch 稠密向量；文本的分片是 token 向量——都是稠密， **不是稀疏向量**

## 6. 文档切片与 chunk_overlap：API 不管的事

> **API 本身不提供切片！** 切片 + 重叠属于前置文档预处理逻辑，要自己写。**chunk** /tʃʌŋk/ （切片）与 overlap（重叠）的两个概念极易混淆：

| 概念 | 作用 | 位置 |
|---|---|---|
| 业务侧文档切片 | 长文档按 chunk_size 切，相邻片段保留 overlap | **调用 embedding 之前** ，自己代码做 |
| multi_embedding | 单张图 / 单段文本内部拆 patch / token | 模型 API 内部 |

**落地示例** （主示例，Node.js + TypeScript）：滑窗切片，chunk_size=500、overlap=100：

```typescript
function slidingChunk(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap; // 步长 = 片长 - 重叠
  }
  return chunks;
}

// 1200 字文档 → 切出 [0,500),[400,900),[800,1200) 三片
console.log(slidingChunk("…".repeat(1200), 500, 100).length); // 3
```

切完后循环调用 embedding 接口，每个 chunk 单独输入。

**视频场景** ：

- `fps` 只是抽帧策略， **不做时间片重叠**
- 长视频要"每 30 秒一段，重叠 5 秒" → 业务侧自己切视频片段再逐段送入

## 7. 向量模型选型

### 7.1 闭源 API-only（不能离线）

| 厂商 | 模型 |
|---|---|
| 火山 | doubao-embedding / doubao-embedding-vision |
| 阿里 | text-embedding-v2 / v3 |
| 百度 | ERNIE Embedding |
| 腾讯 | 混元 Embedding |

### 7.2 开源可离线：纯文本

| 模型 | 稠密 | 稀疏 | 多粒度分片 | 特点 |
|---|---|---|---|---|
| **BGE-M3** （智源） | ✅ | ✅ | ✅ ColBERT | 中文首选，8192 上下文，1024 维，MIT 协议 |
| BGE-Large-ZH v1.5 | ✅ | ❌ | ❌ | 经典纯稠密中文向量 |
| Qwen3-Embedding | ✅ | ❌ | ❌ | 阿里，支持 MRL 降维 |
| text2vec-base-chinese | ✅ | ❌ | ❌ | 轻量小模型，CPU 可跑 |
| M3E | ✅ | ❌ | ❌ | 轻量中文 |

> 表内术语：**BGE** /ˌbiː dʒiː ˈiː/ （ **BAAI General Embedding** /ˌbiː eɪ eɪ ˈaɪ ˈdʒenrəl ɪmˈbedɪŋ/ ，智源通用向量模型）；**ColBERT** /ˈkəʊlbɜːt/ （ **Contextualized Late Interaction BERT** /kənˈtekstʃuəlaɪzd leɪt ˌɪntərˈækʃn ˈbɜːt/ ，延迟交互式检索）；**MRL** /ˌem ɑːr ˈel/ （ **Matryoshka Representation Learning** /ˌmætrɪˈɒʃkə ˌreprɪzenˈteɪʃn ˈlɜːnɪŋ/ ，套娃表示学习，向量可截断降维）。质量横评优先看 **MTEB** /ˌem tiː iː ˈbiː/ （ **Massive Text Embedding Benchmark** /ˈmæsɪv tekst ɪmˈbedɪŋ ˈbentʃmɑːk/ ，大规模文本嵌入基准）榜单，详见 [03-向量数据库.md](03-向量数据库.md) 2.6 节。text2vec / M3E 这类小模型 **CPU** /ˌsiː piː ˈjuː/ （ **Central Processing Unit** /ˈsentrəl prəˈsesɪŋ ˈjuːnɪt/ ，中央处理器）即可跑。

### 7.3 开源可离线：多模态图文

| 模型 | 中文 | 稀疏 | 显存（量化） | 特点 |
|---|---|---|---|---|
| **Qwen3-VL-Embedding 2B** | ⭐⭐⭐⭐⭐ | ❌ | 6G+ | 阿里，32k 长文本，支持 instruction |
| **BGE-VL-v1.5** | ⭐⭐⭐⭐⭐ | ❌ | 4G+ | 智源，截图 / PDF 页面检索增强 |
| UEmbed | ⭐⭐⭐⭐ | ✅（仅文本侧） | 8G+ | 实验版，唯一多模态 + 稀疏 |
| Xenova/CLIP | ⭐⭐ | ❌ | WebGPU | 浏览器 ONNX，中文弱 |

> 表内 VL = **Vision-Language** /ˈvɪʒn ˈlæŋɡwɪdʒ/ （视觉-语言）；显存指 **GPU** /ˌdʒiː piː ˈjuː/ （ **Graphics Processing Unit** /ˈɡræfɪks prəˈsesɪŋ ˈjuːnɪt/ ，图形处理器）占用。

### 7.4 CLIP vs BGE-M3

**CLIP** /klɪp/ （ **Contrastive Language-Image Pre-training** /kənˈtræstɪv ˈlæŋɡwɪdʒ ˈɪmɪdʒ priːˈtreɪnɪŋ/ ，对比语言-图像预训练）：

| 项目 | CLIP（Xenova/clip-vit-base-patch32） | BGE-M3 |
|---|---|---|
| 模态 | ✅ 图片 + 文本（双塔，文搜图） | ❌ 仅文本 |
| 输出 | 只有稠密向量（512 维） | 稠密 + 稀疏 + ColBERT 分片 |
| 中文能力 | 弱（英文训练为主） | 专门优化中文 |
| 向量空间 | 图文共享同一空间 | 仅文本空间 |
| 适用场景 | 图片库检索、零样本图片分类 | 长文档 RAG、混合检索 |
| 运行环境 | 浏览器 Transformers.js | Python 后端 |

**本质区别** ：CLIP 有独立的图像编码器与文本编码器（双塔，映射到同一向量空间）；**BGE-M3 没有图像编码器**，只做纯文本的三合一输出（稠密 + 稀疏 + 分片）。

### 7.5 场景速查

| 场景 | 推荐模型 |
|---|---|
| 私有化后端、中文图文知识库、截图 / PDF | **BGE-VL-v1.5** |
| 图文检索 + 长文本 + 指令感知（对标 doubao-embedding-vision） | **Qwen3-VL-Embedding-2B** |
| 浏览器前端离线文搜图（中文要求不高） | Xenova CLIP / SigLIP |
| 多模态 + 稠密稀疏混合检索（愿意踩坑） | UEmbed |

> **SigLIP** /ˈsɪɡlɪp/ （ **Sigmoid Loss for Language Image Pre-training** ，Sigmoid 损失图文预训练模型）是 CLIP 的改进版训练方案，在 Transformers.js 生态同样有 ONNX 权重。

### 7.6 共性限制与部署方式

**多模态向量模型共性限制** ：

1. **图片部分都没有稀疏向量**，稀疏仅作用于文本 query
2. 开源模型 **不支持视频抽帧向量**，需业务侧自己抽帧、逐帧生成图片向量
3. 没有内置 chunk 切片 + overlap，长文档仍需业务代码滑窗（见第 6 节）

**部署方式** ：

- **Ollama** ：`ollama pull bge-m3` 一键本地起 OpenAI 兼容接口（见 4.1 示例）
- Python（补充）：SentenceTransformers / FlagEmbedding / vLLM 托管开源权重
- 第一次联网下载权重，之后 **断网纯内网运行**——私有化部署的关键特性

## 8. 浏览器端：Transformers.js

**Transformers.js** （`@huggingface/transformers`）是 JS 版推理框架， **不是向量模型本身**；模型权重需单独下载（Xenova 前缀为 **ONNX** /ˈɒnks/ （ **Open Neural Network Exchange** /ˈəʊpən ˈnjʊərəl ˈnetwɜːk ɪksˈtʃeɪndʒ/ ，开放神经网络交换格式）版本）。

### 8.1 定位区分

1. **transformers / Transformers.js** ：底层推理库，输出原始 token 向量矩阵， **不自动 pooling / 归一化**
2. **sentence-transformers** ：在 transformers 之上封装，`.encode()` 直接出句子向量
3. **向量模型** ：BGE-M3、Qwen-Embedding 等权重文件

### 8.2 能力

- ✅ 浏览器 / Node 本地推理，WebGPU 加速
- ✅ 离线稠密向量
- ❌ **原生不支持稀疏向量**（BGE-M3 的 sparse / lexical_weights 在 JS 生态支持弱）

### 8.3 落地示例（主示例，Node.js + TypeScript）

```typescript
import { pipeline } from "@huggingface/transformers";

// 第一次联网下载 ONNX 权重，缓存后断网可用
const extractor = await pipeline(
  "feature-extraction",
  "Xenova/bge-small-zh-v1.5",
  { device: "webgpu" },
);

const output = await extractor("红色的苹果放在木桌子上", {
  pooling: "mean", // JS 版需要显式指定 pooling 与归一化
  normalize: true,
});
console.log(output.data.length); // 512 维句向量
```

## 9. 常见误区

- **"向量模型能回答问题"** ：错，它只做匹配，答案是 LLM 生成的（见第 1 节比喻）。
- **"稀疏向量也是语义向量"** ：错，稀疏是词权重向量，稠密才是语义向量（见第 3 节）。
- **"multi_embedding 可以替代文档切片"** ：错，前者是输入内部拆 patch / token，后者是建库前的文档预处理（见第 6 节）。
- **"接口兼容就能混用向量"** ：错，OpenAI 兼容 API 只统一调用方式，向量空间互不相通，换模型必须全量重建（见 [03-向量数据库.md](03-向量数据库.md) 2.5 节）。
- **"图片也有稀疏向量"** ：错，稀疏仅作用于纯文本（见 5.1、7.6 节）。
- **"开源多模态模型能直接吃视频"** ：错，抽帧与切片都是业务侧的活（见 6、7.6 节）。

## 10. 速查口诀

- 写东西、聊天 → 普通大模型
- 难题、多步逻辑 → 推理模型
- 文档检索、找相似内容 → 向量模型
- 语义改写召回 → 稠密向量
- 实体编号精确命中 → 稀疏向量
- 中文私有化 RAG → BGE-M3（稠密 + 稀疏混合）
- 图文离线检索 → BGE-VL / Qwen3-VL-Embedding
- 浏览器前端向量化 → Transformers.js + Xenova ONNX

## 11. 参考资料

- 火山方舟 doubao-embedding-vision 官方文档（multimodal embeddings 接口）
- Chen et al., "M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation"（BGE-M3，2024）
- Radford et al., "Learning Transferable Visual Models From Natural Language Supervision"（CLIP，2021）
- Muennighoff et al., "MTEB: Massive Text Embedding Benchmark"（2022）
- Transformers.js：<https://huggingface.co/docs/transformers.js>

## 12. 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **LLM** | /ˌel el ˈem/ | Large Language Model | 大语言模型 |
| **RAG** | /ræɡ/ | Retrieval-Augmented Generation | 检索增强生成 |
| **API** | /ˌeɪ piː ˈaɪ/ | Application Programming Interface | 应用编程接口 |
| **PDF** | /ˌpiː diː ˈef/ | Portable Document Format | 便携式文档格式 |
| **BM25** | /ˌbiː em ˌtwenti ˈfaɪv/ | Best Matching 25 | 经典关键词打分算法 |
| **CV** | /ˌsiː ˈviː/ | Computer Vision | 计算机视觉 |
| **JSON** | /ˈdʒeɪsən/ | JavaScript Object Notation | JavaScript 对象表示法 |
| **URL** | /ˌjuː ɑːr ˈel/ | Uniform Resource Locator | 统一资源定位符 |
| **TOS** | /tɒs/ | Tinder Object Storage | 火山引擎对象存储 |
| **BGE** | /ˌbiː dʒiː ˈiː/ | BAAI General Embedding | 智源通用向量模型 |
| **ColBERT** | /ˈkəʊlbɜːt/ | Contextualized Late Interaction BERT | 延迟交互式检索 |
| **MRL** | /ˌem ɑːr ˈel/ | Matryoshka Representation Learning | 套娃表示学习 |
| **MTEB** | /ˌem tiː iː ˈbiː/ | Massive Text Embedding Benchmark | 大规模文本嵌入基准 |
| **VL** | /ˌviː ˈel/ | Vision-Language | 视觉-语言 |
| **CLIP** | /klɪp/ | Contrastive Language-Image Pre-training | 对比语言-图像预训练 |
| **SigLIP** | /ˈsɪɡlɪp/ | Sigmoid Loss for Language Image Pre-training | Sigmoid 损失图文预训练 |
| **ONNX** | /ˈɒnks/ | Open Neural Network Exchange | 开放神经网络交换格式 |
| **CPU** | /ˌsiː piː ˈjuː/ | Central Processing Unit | 中央处理器 |
| **GPU** | /ˌdʒiː piː ˈjuː/ | Graphics Processing Unit | 图形处理器 |
