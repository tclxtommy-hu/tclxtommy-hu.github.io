# 向量检索基础

向量检索（Vector Search）是指把文本、图片等非结构化数据转换为高维向量后，
按相似度进行搜索的技术。它是 RAG 与语义搜索的底层支撑。

## 向量是怎么来的

通过 Embedding 模型，文本被映射为一个稠密数值向量。语义相近的文本，
在向量空间中的距离也更近。这就是「语义搜索」能理解同义表达的原因。

## 相似度度量

最常用的是余弦相似度（Cosine Similarity），它衡量两个向量方向的接近程度，
取值范围为 [-1, 1]，值越接近 1 表示越相似。由于多数 Embedding 输出已归一化，
余弦相似度等价于向量内积。

## 存储方案

- 大规模：Qdrant、Milvus、Weaviate、Pinecone、pgvector；
- 轻量本地： **Milvus Lite** 以本地 `.db` 文件嵌入 Python 应用，无需 Docker 或独立服务，适合原型、Notebook 与小规模 RAG 索引；
- 教学场景：也可用 JSON 文件保存向量，内存中暴力计算余弦相似度。

生产流量较大时，应升级到 Milvus Standalone 或 Distributed；客户端 API 不变，只需把 `uri` 从本地文件改为服务端地址。
