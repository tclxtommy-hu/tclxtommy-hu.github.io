/**
 * LangChain TypeScript Agent 项目入口
 *
 * 使用方式：
 *   npm run chat   - 交互式多轮对话
 *   npm run agent  - 交互式 Agent + 工具调用
 *   npm run dev    - 开发模式（热重载）
 *
 * 使用前请配置 .env 文件：
 *   填入 DEEPSEEK_API_KEY
 */

console.log(`
╔══════════════════════════════════════════════╗
║   LangChain TypeScript Agent  with DeepSeek  ║
╠══════════════════════════════════════════════╣
║                                              ║
║   运行交互示例：                              ║
║     npm run chat   → 多轮对话交互             ║
║     npm run agent  → Agent + 工具交互         ║
║                                              ║
║   使用前请配置 .env 文件：                     ║
║     复制 .env.example 为 .env 文件            ║
║     填入 DEEPSEEK_API_KEY                    ║
║                                              ║
╚══════════════════════════════════════════════╝
`);

// 默认运行 agent 交互
import("./agent.js").catch((err) => {
  console.error("请先配置 .env 文件中的 DEEPSEEK_API_KEY");
  console.error(err.message);
});
