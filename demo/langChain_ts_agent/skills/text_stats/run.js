// 文本统计脚本：被沙盒（node:vm + 子进程）执行，拿不到 fs/process/require。
// 约定：module.exports = function run(input) { ... return 结果 }
//   input 为传入的原始文本（string）
//   返回值会被原样（或 JSON.stringify 后）写回 stdout，作为「沙盒权威结果」
module.exports = function run(text) {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/) : [];
  const wordCount = words.length;

  const freq = {};
  for (const w of words) {
    const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (k) freq[k] = (freq[k] || 0) + 1;
  }
  const topWords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word, count]) => ({ word, count }));

  const sentences = text.split(/[。.!?！？]+/).filter((s) => s.trim()).length;

  return JSON.stringify({ chars, wordCount, sentences, topWords });
};
