import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import common from '../../../../lib/common/common.js';

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

  description = '使用 GLM Search API 进行搜索，根据输入的内容或关键词提供搜索结果。';

  func = async function (opt, e) {
    const { query } = opt;

    if (!query?.trim()) {
      throw new Error('搜索内容或关键词不能为空');
    }

    try {
      const searchResults = await this.searchWithGLM(query);
      console.debug(`[GLMSearchTool] 搜索结果:`, searchResults);

      if (!searchResults || searchResults.length === 0) {
        await e.reply('未找到相关搜索结果');
        return [];
      }

      // 构建转发消息
      const forwardMsg = [`${e.sender.card || e.sender.nickname || e.user_id}的搜索结果：`];
      
      // 遍历并格式化搜索结果
      searchResults.forEach((result, index) => {
        const msg = [];
        msg.push(`${index + 1}. ${result.title || '无标题'}`);
        if (result.content) msg.push(`   ${result.content}`);
        if (result.link) msg.push(`   链接：${result.link}`);
        if (result.media) msg.push(`   来源：${result.media}`);
        forwardMsg.push(msg.join('\n'));
      });

      await e.reply(await common.makeForwardMsg(e, forwardMsg, `搜索结果`));
      return searchResults;
    } catch (error) {
      console.error('[GLMSearchTool] 搜索失败:', error);
      await e.reply(`搜索失败: ${error.message}`);
      throw error;
    }
  };

  async searchWithGLM(query) {
    const apiUrl = `https://glm-search.deno.dev/search?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`API请求失败: ${data.error?.message || '未知错误'}`);
      }

      return this.processGLMResponse(data);
    } catch (error) {
      console.error('[GLMSearchTool] API调用失败:', error);
      throw error;
    }
  }

  processGLMResponse(data) {
    // 验证基本响应结构
    if (!data?.choices?.[0]?.message?.tool_calls) {
      return [];
    }

    const toolCalls = data.choices[0].message.tool_calls;
    
    // 查找search_result类型的工具调用
    const searchResultCall = toolCalls.find(call => call.type === 'search_result');
    
    if (!searchResultCall?.search_result) {
      return [];
    }

    // 返回搜索结果数组
    return searchResultCall.search_result.map(result => ({
      content: result.content || '',
      link: result.link || '',
      title: result.title || '',
      media: result.media || '',
      icon: result.icon || '',
      refer: result.refer || ''
    }));
  }
}