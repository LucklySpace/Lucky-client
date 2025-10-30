import { invoke } from "@tauri-apps/api/core";

// 日志
const log = useLogger();

/**
 * 分词工具类
 */
class Segmenter {
  /**
   * 分词工具类构造函数
   */
  constructor() {
  }

  /**
   * 使用 Rust 后端的 jieba-rs 进行批量文本分词
   * @param inputs 包含 ID 和文本的元组数组
   * @returns 包含 ID 和分词结果的元组数组
   */
  async batchSegment(inputs: Record<string, string>): Promise<Record<string, string[]>> {
    try {
      // 将 Record 转换为 Tauri 需要的元组数组
      const inputArray: [string, string][] = Object.entries(inputs).map(([id, text]) => [id, text]);
      // 调用 Tauri 命令进行批量分词
      const result: [string, string[]][] = await invoke("batch_segment_text", { inputs: inputArray, exact: true });
      // 将结果转换回 Record 格式
      return Object.fromEntries(result);
    } catch (error) {
      log.prettyError("database", "Error during batch segmentation:", error);
      return {};
    }
  }

  /**
   * 使用 Rust 后端的 jieba-rs 进行单条文本分词
   * @param text 要进行分词的文本
   * @returns 分词后的字符串数组
   */
  async segment(text: string): Promise<string[]> {
    try {
      // 调用 Tauri 命令进行分词
      const result: string[] = await invoke("segment_text", { text, exact: true });
      return result;
    } catch (error) {
      log.prettyError("database", "Error during segmentation:", error);
      return [];
    }
  }

  /**
   * 根据分词结果统计词频
   * @param words 分词后的字符串数组
   * @returns 一个包含词频统计结果的对象
   */
  countWords(words: string[]): Record<string, number> {
    const wordCount: Record<string, number> = {};

    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return wordCount;
  }

  /**
   * 获取文本的关键词
   * @param words 分词后的字符串数组
   * @param topN 要获取的关键词数量
   * @returns 包含前 N 个高频词的数组
   */
  getTopKeywords(words: string[], topN: number = 5): string[] {
    const wordCount = this.countWords(words);

    // 根据词频排序并取前 N 个关键词
    return Object.entries(wordCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([word]) => word);
  }
}

export default new Segmenter();
