/**
 * 共享配置与模拟数据
 */

export const SERVER_NAME = "weather-mcp-server";
export const SERVER_VERSION = "1.0.0";
export const PORT = Number(process.env.PORT) || 3000;

/** 模拟天气数据 */
export const weatherDB: Record<
  string,
  { temp: number; desc: string; humidity: number }
> = {
  "北京": { temp: 25, desc: "晴", humidity: 40 },
  "上海": { temp: 28, desc: "多云", humidity: 65 },
  "深圳": { temp: 30, desc: "阵雨", humidity: 80 },
  "广州": { temp: 32, desc: "雷阵雨", humidity: 85 },
  "成都": { temp: 22, desc: "阴", humidity: 70 },
  "杭州": { temp: 27, desc: "晴转多云", humidity: 55 },
};

/** 模拟未来天气预测 */
export const forecastDB: Record<
  string,
  { day1: string; day2: string; day3: string }
> = {
  "北京": { day1: "晴 26°C", day2: "多云 24°C", day3: "小雨 20°C" },
  "上海": { day1: "多云 29°C", day2: "阴 27°C", day3: "小雨 25°C" },
  "深圳": { day1: "阵雨 31°C", day2: "多云 30°C", day3: "晴 32°C" },
};
