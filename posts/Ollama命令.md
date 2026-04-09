# Ollama 命令参考手册

> 整理时间：2026-02-28 13:47  
> 适用版本：Ollama 最新版

---

## 📚 目录

1. [安装与启动](#1-安装与启动)
2. [模型管理](#2-模型管理)
3. [运行对话](#3-运行对话)
4. [API 调用](#4-api-调用)
5. [高级配置](#5-高级配置)
6. [常用模型推荐](#6-常用模型推荐)

---

## 1. 安装与启动

### 安装

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# 下载安装器：https://ollama.com/download/OllamaSetup.exe

# Docker
docker run -d -v ollama:/root/.ollama -p 11434:11434 ollama/ollama
```

### 启动服务

```bash
ollama serve              # 启动 Ollama 服务（默认端口 11434）
```

### 环境变量

```bash
OLLAMA_HOST=0.0.0.0       # 监听所有接口（远程访问）
OLLAMA_PORT=11434         # 自定义端口
OLLAMA_MODELS=/path       # 自定义模型存储路径
```

---

## 2. 模型管理

### 下载模型

```bash
ollama pull <model>                   # 下载模型
ollama pull qwen2.5:7b                # 下载 Qwen2.5 7B
ollama pull llama3.2:3b               # 下载 Llama 3.2 3B
ollama pull qwen2.5-coder:7b          # 下载代码专用模型
```

### 查看模型

```bash
ollama list                           # 列出已下载模型
ollama list --running                 # 列出运行中的模型
```

### 删除模型

```bash
ollama rm <model>                     # 删除模型
ollama rm qwen2.5:7b                  # 删除指定模型
```

### 复制模型

```bash
ollama cp <source> <target>           # 复制模型
ollama cp llama3.2 my-llama           # 复制为自定义名称
```

### 导出模型

```bash
ollama show --modelfile <model> > Modelfile  # 导出模型文件
```

---

## 3. 运行对话

### 交互式对话

```bash
ollama run <model>                    # 启动交互对话
ollama run qwen2.5:7b                 # 运行 Qwen2.5
ollama run llama3.2:3b "你好"         # 单次问答
```

### 对话命令

在交互模式下：

```
>>> /?                  # 显示帮助
>>> /set parameter      # 设置参数
>>> /set temperature 0.8
>>> /show info          # 显示模型信息
>>> /exit               # 退出对话
```

### 多轮对话示例

```bash
ollama run qwen2.5:7b <<EOF
你好
介绍一下你自己
写个快速排序
EOF
```

### 从管道输入

```bash
echo "解释量子纠缠" | ollama run qwen2.5:7b
cat file.txt | ollama run qwen2.5:7b "总结这篇文章"
```

---

## 4. API 调用

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/tags` | GET | 列出本地模型 |
| `/api/generate` | POST | 基础生成 |
| `/api/chat` | POST | 对话格式（推荐） |
| `/api/pull` | POST | 下载模型 |
| `/api/delete/:name` | DELETE | 删除模型 |
| `/api/version` | GET | 版本信息 |
| `/v1/chat/completions` | POST | OpenAI 兼容 |

### cURL 示例

**列出模型：**
```bash
curl http://localhost:11434/api/tags
```

**基础对话：**
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:7b",
  "prompt": "你好",
  "stream": false
}'
```

**对话格式（推荐）：**
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:7b",
  "messages": [{"role": "user", "content": "你好"}],
  "stream": false
}'
```

**多轮对话：**
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:7b",
  "messages": [
    {"role": "system", "content": "你是编程助手"},
    {"role": "user", "content": "写个快速排序"},
    {"role": "assistant", "content": "def quick_sort(arr):..."},
    {"role": "user", "content": "加上注释"}
  ],
  "stream": false
}'
```

**OpenAI 兼容模式：**
```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:7b",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### Python 调用

**原生 requests：**
```python
import requests

def chat(prompt, model="qwen2.5:7b"):
    response = requests.post(
        "http://localhost:11434/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
    )
    return response.json()["message"]["content"]

print(chat("你好"))
```

**官方库：**
```bash
pip install ollama
```

```python
import ollama

# 简单调用
response = ollama.chat(model='qwen2.5:7b', messages=[
    {'role': 'user', 'content': '你好'}
])

# 流式输出
stream = ollama.chat(
    model='qwen2.5:7b',
    messages=[{'role': 'user', 'content': '写个故事'}],
    stream=True
)
for chunk in stream:
    print(chunk['message']['content'], end='')
```

### Node.js 调用

```bash
npm install ollama
```

```javascript
import ollama from 'ollama'

const response = await ollama.chat({
  model: 'qwen2.5:7b',
  messages: [{ role: 'user', content: '你好' }]
})
console.log(response.message.content)
```

---

## 5. 高级配置

### 模型参数

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:7b",
  "prompt": "写首诗",
  "stream": false,
  "options": {
    "temperature": 0.8,      # 创造性 (0-1, 越高越随机)
    "top_p": 0.9,            # 核采样
    "top_k": 40,             # 采样范围
    "num_predict": 512,      # 最大输出 token
    "repeat_penalty": 1.1    # 重复惩罚
  }
}'
```

### 创建自定义模型

**Modelfile 示例：**
```dockerfile
FROM qwen2.5:7b

# 设置系统提示
SYSTEM """
你是一个专业的编程助手，擅长 Python 和 JavaScript。
回答要简洁，提供代码示例。
"""

# 设置参数
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_predict 2048
```

**构建模型：**
```bash
ollama create my-coder -f Modelfile
ollama run my-coder
```

### 查看模型信息

```bash
ollama show qwen2.5:7b              # 显示模型信息
ollama show --modelfile qwen2.5:7b  # 显示模型文件
```

### 远程访问配置

```bash
# Linux/Mac
OLLAMA_HOST=0.0.0.0 ollama serve

# Windows (PowerShell)
$env:OLLAMA_HOST="0.0.0.0"
ollama serve

# systemd 服务
sudo systemctl edit ollama.service
# 添加：Environment="OLLAMA_HOST=0.0.0.0"
sudo systemctl restart ollama
```

⚠️ **注意：** 开放远程访问需配置防火墙和认证！

---

## 6. 常用模型推荐

### 中文对话

| 模型 | 大小 | 显存 | 说明 |
|------|------|------|------|
| `qwen2.5:7b` | 7B | 6-8GB | 阿里开源，中文优秀 |
| `qwen2.5:1.5b` | 1.5B | 2GB | 轻量级，低配可用 |
| `chatglm3:6b` | 6B | 6GB | 清华开源，中文优化 |

### 代码生成

| 模型 | 大小 | 显存 | 说明 |
|------|------|------|------|
| `qwen2.5-coder:7b` | 7B | 6-8GB | 代码专用 |
| `deepseek-coder:6.7b` | 6.7B | 6GB | 深度求索 |
| `codellama:7b` | 7B | 6GB | Meta 代码模型 |

### 通用对话

| 模型 | 大小 | 显存 | 说明 |
|------|------|------|------|
| `llama3.2:3b` | 3B | 4GB | Meta 轻量版 |
| `llama3.1:8b` | 8B | 8GB | Meta 主流版 |
| `phi3:mini` | 3.8B | 4GB | 微软，性能惊喜 |
| `mistral:7b` | 7B | 6GB | Mistral AI |

### 快速测试

```bash
# 中文测试
ollama run qwen2.5:7b "用一句话解释量子纠缠"

# 代码测试
ollama run qwen2.5-coder:7b "写个 Python 快速排序"

# 逻辑测试
ollama run llama3.2:3b "鸡兔同笼，共 35 个头，94 只脚，问各几只"
```

---

## 🔧 故障排查

### 检查服务状态

```bash
# 检查是否运行
curl http://localhost:11434/api/version

# 查看进程
ps aux | grep ollama

# Windows
Get-Process ollama
```

### 常见问题

**Q: 端口被占用？**
```bash
# 查看占用端口的进程
lsof -i :11434  # Linux/Mac
netstat -ano | findstr 11434  # Windows
```

**Q: 显存不足？**
- 使用更小模型：`ollama pull qwen2.5:1.5b`
- 使用量化版本：`ollama pull qwen2.5:7b-q4_K_M`

**Q: 下载慢？**
- 使用镜像源或本地导入 GGUF 文件

---

## 🔗 相关资源

- 官网：https://ollama.com
- GitHub: https://github.com/ollama/ollama
- 模型库：https://ollama.com/library
- 文档：https://github.com/ollama/ollama/blob/main/docs/

---

*本手册由 OpenClaw 自动整理生成*
