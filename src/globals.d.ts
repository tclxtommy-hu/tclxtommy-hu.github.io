// 页面内联脚本注入到 window 上的全局变量（类型检查用，不参与打包）。
// 逻辑上它们由 scripts/build-posts.js 生成的 <script> 写入，运行时一定有；
// 这里声明成可选，读取处仍需判空。

interface Window {
  /** archive.html 里内联注入的文章树（见 build-posts.js 的 treeJson） */
  __POSTS_TREE__?: PostsTreeNode;
  /** room-chat.js 是否已完成初始化（three-room.js 用它给出"模块没加载"的提示） */
  __roomChatReady?: boolean;
  /** 部署环境注入的聊天后端地址，优先于 /chat.config.json */
  __CHAT_API_BASE__?: string;
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

interface PostsTreeNode {
  name: string;
  path: string;
  readme?: string | null;
  totalCount?: number;
  children?: PostsTreeNode[];
  posts?: Array<{ slug: string; title: string; date: string; relativeDir: string }>;
}
