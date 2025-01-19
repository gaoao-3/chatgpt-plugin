import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import { Config } from '../config.js';
import common from '../../../../lib/common/common.js';

/**
 * 自定义搜索工具类 - 使用 Gemini API
 * @class GoogleSearchTool
 * @extends {AbstractTool}
 */
export class GoogleSearchTool extends AbstractTool {
  name = 'GoogleSearchTool';

  parameters = {
    properties: {
      query: {
        type: 'string',
        description: '要搜索的内容或关键词',
      },
      length: {
        type: 'integer',
        description: '期望的摘要长度（句子数），默认为3',
      }
    },
    required: ['query'],
  };

  description = '使用 Gemini API 进行智能搜索，根据输入的内容或关键词提供全面的搜索结果和摘要。支持自定义摘要长度。';

  /**
   * 工具执行函数
   * @param {Object} opt - 工具参数
   * @param {string} opt.query - 搜索内容或关键词
   * @param {number} [opt.length=3] - 摘要长度
   * @param {Object} e - 事件对象
   * @returns {Promise<Object>} - 包含答案和来源的对象
   */
  func = async function (opt, e) {
    const { query, length = 3 } = opt;

    if (!query?.trim()) {
      throw new Error('搜索内容或关键词不能为空');
    }

    try {
      const result = await this.searchWithGemini(query, length);
      console.debug(`[GoogleSearchTool] 搜索结果:`, result);
      
      // 构建转发消息
      const { answer, sources } = result;
      const forwardMsg = [answer];
      if (sources && sources.length > 0) {
        forwardMsg.push('信息来源：');
        sources.forEach((source, index) => {
          forwardMsg.push(`${index + 1}. ${source.title}\n${source.url}`);
        });
      }
      e.reply(await common.makeForwardMsg(e, forwardMsg, `${e.sender.card || e.sender.nickname || e.user_id}的搜索结果`));
      
      return result;
    } catch (error) {
      console.error('[GoogleSearchTool] 搜索失败:', error);
      throw new Error(`搜索失败: ${error.message}`);
    }
  };

  /**
   * 使用 Gemini API 进行搜索
   * @param {string} query - 搜索内容或关键词
   * @param {number} length - 摘要长度
   * @returns {Promise<Object>} - 包含答案和来源的对象
   * @private
   */
  async searchWithGemini(query, length) {
    const apiKey = Config.getGeminiKey();
    const apiBaseUrl = Config.geminiBaseUrl;
    const apiUrl = `${apiBaseUrl}/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    if (!apiKey || !apiBaseUrl) {
      throw new Error('Gemini API 配置缺失');
    }

    const requestBody = {
      "systemInstruction": {
        "parts": [{
          "text": "你是一个专业的信息搜索与整合助手。你的主要任务是：1. 基于搜索结果提供最新、准确的信息 2. 保持客观中立的态度 3. 如果信息有时效性，请标注日期 4. 如果存在争议，需说明不同观点 5. 优先使用中文回复"
        }]
      },
      "contents": [{
        "parts": [{
          "text": this.constructPrompt(query, length)
        }],
        "role": "user"
      }],
      "tools": [{
        "googleSearch": {}
      }]
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`API 请求失败: ${data.error?.message || '未知错误'}`);
      }

      return this.processGeminiResponse(data);
    } catch (error) {
      console.error('[GoogleSearchTool] API调用失败:', error);
      throw error;
    }
  }

  /**
   * 构建提示词
   * @param {string} query - 搜索内容或关键词
   * @param {number} length - 摘要长度
   * @returns {string} - 格式化的提示词
   * @private
   */
  constructPrompt(query, length) {
    return `请对以下问题进行搜索并提供${length}句话的专业解答：

搜索内容：${query}

回答要求：
1. 内容需要准确、全面，包含具体数据和事实
2. 如果信息带有时效性，请注明具体时间
3. 如果有多个观点，请客观陈述各方立场
4. 避免主观评价，保持中立的表述方式
5. 如果内容可能存在争议，请说明原因

请基于最新的搜索结果，按照以上要求进行回答。`;
  }

  /**
   * 处理 Gemini API 响应
   * @param {Object} data - API 响应数据
   * @returns {Object} - 处理后的结果对象
   * @private
   */
  processGeminiResponse(data) {
    if (!data?.candidates?.[0]?.content?.parts) {
      throw new Error('无效的 API 响应');
    }

    // 合并所有文本部分作为答案
    const answer = data.candidates[0].content.parts
      .map(part => part.text)
      .filter(Boolean)
      .join('\n');

    // 处理来源信息
    let sources = [];
    if (data.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      sources = data.candidates[0].groundingMetadata.groundingChunks
        .filter(chunk => chunk.web)
        .map(chunk => {
          return {
            title: chunk.web.title || '未知标题',
            url: chunk.web.uri
          };
        })
        .filter((v, i, a) => 
          a.findIndex(t => (t.title === v.title && t.url === v.url)) === i
        );
    }

    console.debug('[GoogleSearchTool] 处理后的来源信息:', sources);

    return {
      answer,
      sources
    };
  }
}