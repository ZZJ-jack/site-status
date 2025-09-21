// https://uptimerobot.com/api/#v3-getMonitors
import dayjs from "dayjs";
import type { MonitorsDataResult, MonitorsResult } from "~~/types/main";
import { getCache, setCache } from "~/utils/cache-server";
import { formatSiteData } from "~/utils/format";
import { verifyJwt } from "../utils/jwt"; // 补充导入

const getRanges = ():
  | {
      dates: dayjs.Dayjs[];
      start: number;
      end: number;
      ranges: string;
    }
  | undefined => {
  try {
    const dates = [];
    const config = useRuntimeConfig();
    const days = config.public.countDays;
    const today = dayjs(new Date().setHours(0, 0, 0, 0));
    // 生成日期范围数组
    for (let d = 0; d < days; d++) dates.push(today.subtract(d, "day"));
    // 生成自定义历史数据范围（v3 API格式兼容）
    const ranges = dates.map(
      (date) => `${date.unix()}_${date.add(1, "day").unix()}`,
    );
    const start = dates[dates.length - 1].unix();
    const end = dates[0].add(1, "day").unix();
    ranges.push(`${start}_${end}`);
    return { dates, start, end, ranges: ranges.join("-") };
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

/**
 * 获取站点数据（适配API v3）
 */
export default defineEventHandler(async (event): Promise<MonitorsResult> => {
  try {
    const config = useRuntimeConfig();
    const { apiUrl, apiKey, sitePassword, siteSecretKey } = config;
    if (!apiUrl || !apiKey) {
      throw new Error("Missing API url or API key");
    }
    // 若需登录-验证token
    if (sitePassword && siteSecretKey) {
      const token = getCookie(event, "authToken");
      if (!token) throw new Error("Please log in first");
      const isLogin = await verifyJwt(token);
      if (!isLogin) throw new Error("Invalid or expired token");
    }
    // 缓存键
    const cacheKey = "site-data-v3"; // 区分v3缓存
    // 检查缓存
    const cachedData = getCache(cacheKey);
    if (cachedData) {
      return {
        code: 200,
        message: "success",
        source: "cache",
        data: cachedData as MonitorsDataResult,
      };
    }
    const rangesData = getRanges();
    if (!rangesData) throw new Error("Failed to generate date ranges");
    const { dates, ranges, start, end } = rangesData;
    // API v3参数（GET方法，query参数）
    const queryParams = new URLSearchParams({
      format: "json",
      logs: "1", // 返回日志
      log_types: "1-2", // 日志类型
      logs_start_date: start.toString(),
      logs_end_date: end.toString(),
      custom_uptime_ranges: ranges,
    });
    // 调用v3 API（使用GET和Header认证）
    const result = await $fetch(`${apiUrl}getMonitors?${queryParams.toString()}`, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey, // v3 API使用Header传递密钥
        "Content-Type": "application/json",
      },
    });
    // 处理v3 API响应（需根据实际响应结构调整formatSiteData）
    const data = formatSiteData(result, dates);
    // 缓存数据（1分钟）
    setCache(cacheKey, data, 1000 * 60);
    return {
      code: 200,
      message: "success",
      source: "api",
      data,
    };
  } catch (error) {
    setResponseStatus(event, 500);
    return {
      code: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      source: "api",
      data: undefined,
    };
  }
});
