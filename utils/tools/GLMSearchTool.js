import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import common from '../../../../lib/common/common.js';

/**
 * 自定义搜索工具类 - 使用 GLM Search API
 * @class GLMSearchTool
 * @extends {AbstractTool}
 */
export class GLMSearchTool extends AbstractTool {
  name = 'GLMSearchTool';

  parameters = {
    properties: {
      query: {
        type: 'string',
        description: '要搜索的内容或关键词',
      },
    },
    required: ['query'],
  };

  description = '使用 GLM Search API 进行搜索，根据输入的内容或关键词提供搜索结果和链接。';

  /**
   * 工具执行函数
   * @param {Object} opt - 工具参数
   * @param {string} opt.query - 搜索内容或关键词
   * @param {Object} e - 事件对象 (在此工具中未使用，但为了保持接口一致性而保留)
   * @returns {Promise<Array>} - 包含搜索结果的数组
   */
  func = async function (opt, e) {
    const { query } = opt;

    if (!query?.trim()) {
      throw new Error('搜索内容或关键词不能为空');
    }

    try {
      const searchResults = await this.searchWithGLM(query);
      console.debug(`[GLMSearchTool] 搜索结果:`, searchResults);

      // 构建转发消息
      const forwardMsg = [`${e.sender.card || e.sender.nickname || e.user_id}的搜索结果：`];
      searchResults.forEach((result, index) => {
        forwardMsg.push(`${index + 1}. 标题：${result.title}`);
        forwardMsg.push(`   内容摘要：${result.content}`);
        forwardMsg.push(`   链接：${result.link}`);
        forwardMsg.push(`   来源：${result.refer}`);
      });
      e.reply(await common.makeForwardMsg(e, forwardMsg, `${e.sender.card || e.sender.nickname || e.user_id}的搜索结果`));

      return searchResults;
    } catch (error) {
      console.error('[GLMSearchTool] 搜索失败:', error);
      throw new Error(`搜索失败: ${error.message}`);
    }
  };

  /**
   * 使用 GLM Search API 进行搜索
   * @param {string} query - 搜索内容或关键词
   * @returns {Promise<Array>} - 包含搜索结果的数组
   * @private
   */
  async searchWithGLM(query) {
    const apiUrl = `https://glm-search.deno.dev/search?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`API 请求失败: ${data.error?.message || '未知错误'}`);
      }

      return this.processGLMResponse(data);
    } catch (error) {
      console.error('[GLMSearchTool] API调用失败:', error);
      throw error;
    }
  }

  /**
   * 处理 GLM Search API 响应
   * @param {Object} data - API 响应数据
   * @returns {Array} - 处理后的搜索结果数组
   * @private
   */
  processGLMResponse(data) {
    if (!data?.choices?.[0]?.search_results?.search_results) {
      throw new Error('无效的 API 响应');
    }

    const results = data.choices[0].search_results.search_results.map(result => ({
      content: result.content, // 现在 content 是字符串
      link: result.link, // 现在 link 是字符串
      title: result.title, // 现在 title 是字符串
      refer: result.refer, // 现在 refer 是字符串
    }));

    return results;
  }
}