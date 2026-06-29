import * as fs from "node:fs";
import * as path from "node:path";
import { BaseListChatMessageHistory } from "@langchain/core/chat_history";
import {
  type BaseMessage,
  type StoredMessage,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";

/**
 * 基于 JSON 文件的聊天历史持久化实现
 * - 读取/写入本地文件，进程重启不丢失
 * - 配合 BufferWindowMemory 使用，自动受窗口大小限制
 */
export class FileChatMessageHistory extends BaseListChatMessageHistory {
  private filePath: string;

  constructor(filePath: string = "./data/chat_history.json") {
    super();
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /** 获取所有历史消息 */
  async getMessages(): Promise<BaseMessage[]> {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const raw = fs.readFileSync(this.filePath, "utf-8");
      if (!raw.trim()) return [];
      const stored: StoredMessage[] = JSON.parse(raw);
      return mapStoredMessagesToChatMessages(stored);
    } catch {
      return [];
    }
  }

  /** 添加一条消息 */
  async addMessage(message: BaseMessage): Promise<void> {
    const messages = await this.getMessages();
    messages.push(message);
    this._persist(messages);
  }

  /** 批量添加消息（关键方法，AgentExecutor 每次对话后调用） */
  async addMessages(messages: BaseMessage[]): Promise<void> {
    const existing = await this.getMessages();
    existing.push(...messages);
    this._persist(existing);
  }

  /** 清空所有历史 */
  async clear(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.writeFileSync(this.filePath, "[]", "utf-8");
      }
    } catch {
      /* ignore */
    }
  }

  /** 序列化并写入文件 */
  private _persist(messages: BaseMessage[]): void {
    const stored = messages.map((m) => m.toDict());
    fs.writeFileSync(this.filePath, JSON.stringify(stored, null, 2), "utf-8");
  }
}
