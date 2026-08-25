/**
 * 日志记录结构（示例）。
 * 实际场景可按需扩展字段。
 */
export interface LogRecord {
  id: number;
  level: "info" | "warn" | "error";
  msg: string;
  ts: string;
}
