import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import { Config } from '../config.js';
import common from '../../../../lib/common/common.js'; // 引入 common 用于转发消息

/**
 * DrawTool 类，继承自 AbstractTool，用于处理绘图请求，并使用 Gemini API 生成提示词。
 * 目前已修改为仅支持使用 nai 插件进行绘图，并进一步优化了 prompt 逻辑，加入了角色推理功能。
 */
export class DrawTool extends AbstractTool {
  /**
   * 工具的名称
   * @type {string}
   */
  name = 'draw';

  /**
   * 工具的参数定义
   * @type {object}
   */
  parameters = {
    properties: {
      prompt: {
        type: 'string',
        description: '绘图主题或关键词，用于生成更专业的绘图提示词 (中文亦可)。',
      },
    },
    required: ['prompt'],
  };

  /**
   * 工具的描述
   * @type {string}
   */
  description = '用于绘图的工具，目前仅支持 nai 插件。使用 Gemini API 优化绘图提示词，生成精准的角色、作品相关 Tag。';

  /**
   * 核心方法，处理绘图请求。
   * @param {object} opts - 包含工具参数的对象，这里应该包含 prompt 属性。
   * @param {object} e - 事件对象，包含有关请求的上下文信息。
   * @returns {Promise<string>} - 返回绘图结果的消息。
   */
  func = async function (opts, e) {
    const { prompt } = opts;

    // 处理 @ 机器人的情况，避免重复处理
    if (e.at === e.bot.uin) {
      e.at = null;
    }
    e.atBot = false;

    // 尝试导入 nai 插件
    let nai;
    try {
      const { txt2img } = await import('../../../nai-plugin/apps/Txt2img.js');
      nai = new txt2img();
    } catch (err) {
      console.error('[ChatGPT][DrawTool] 调用 nai 插件错误：未安装 nai 插件。', err);
      e.reply('未找到 nai 绘图插件，请安装 nai 插件。');
      return;
    }

    // 使用 Gemini API 生成提示词和 Tag
    let generatedPrompt, suggestedTags;
    try {
      const result = await this.generatePromptWithGemini(prompt);
      generatedPrompt = result.prompt;
      suggestedTags = result.tags;
      console.debug('[DrawTool] Gemini API 生成的提示词:', generatedPrompt);
      console.debug('[DrawTool] Gemini API 建议的 Tag:', suggestedTags);

      // 构建转发消息展示生成的提示词和 Tag
      const forwardPromptMsg = [
        `Gemini API 生成的 NovelAI 绘图提示词：`,
        generatedPrompt,
        `\n\nGemini API 建议的 Tag (特别是针对角色和作品):`,
        suggestedTags?.join(', ') || '无建议 Tag',
        `\n\n将使用以上提示词和 Tag 进行绘图，请稍候...`
      ];
      e.reply(await common.makeForwardMsg(e, forwardPromptMsg, `${e.sender.card || e.sender.nickname || e.user_id} 的绘图提示词和 Tag`));

    } catch (error) {
      console.error('[DrawTool] Gemini API 提示词和 Tag 生成失败:', error);
      return '提示词和 Tag 生成失败，请检查 Gemini API 配置或稍后重试。';
    }

    // 使用 nai 插件进行绘图
    try {
      // 构造绘图消息，格式为 `#绘画` + `生成的提示词` + `建议的 Tag` (如果存在)
      const finalPrompt = generatedPrompt + (suggestedTags?.length > 0 ? `, ${suggestedTags.join(', ')}` : '');
      e.msg = `#绘画${finalPrompt}`;

      await nai.txt2img(e);

      return '绘图请求已发送，正在生成...';
    } catch (err) {
      console.error('[DrawTool] 使用 nai 插件绘图失败：', err);
      return '绘图失败，请检查日志以获取更多信息。';
    }
  };

  /**
   * 使用 Gemini API 生成 NovelAI 绘图提示词和 Tag
   * @param {string} query - 用户输入的绘图主题或关键词
   * @returns {Promise<{prompt: string, tags: string[]}>} - 包含生成的 NovelAI 绘图提示词和 Tag 的对象
   * @private
   */
  async generatePromptWithGemini(query) {
    const apiKey = Config.getGeminiKey();
    const apiBaseUrl = Config.geminiBaseUrl;
    const modelName = 'gemini-2.0-pro-exp';
    const apiUrl = `${apiBaseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    if (!apiKey || !apiBaseUrl) {
      throw new Error('Gemini API 配置缺失');
    }

    // 优化后的 prompt 配置，加入了角色推理功能
    const promptConfig = {
      "name": "NovelAI 角色作品Tag专家",
      "description": "专注于为 NovelAI 绘画生成精准的角色和作品相关的英文 Tag 及高质量提示词，擅长识别用户 query 中的关键信息，并推理出角色所在的作品。",
      "personality": "专业严谨，富有创意。善于倾听用户需求，通过渐进式优化提升作品质量。对艺术创作充满热情，乐于分享专业见解。",
      "scenario": "作为提示词专家，我专注于创造纯英文的提示词组合。我会根据你的需求，推理出角色所属的作品，并调整画面的风格、氛围和细节，直到达到理想效果。",
      "first_mes": "你好！我是专业的提示词顾问。我只使用纯英文单词来创作提示词,不使用其他语言。我们可以用{tag}增加元素权重，[tag]降低权重。请告诉我你想要创作的角色或作品，我会为你量身定制独特的提示词组合，并推理出相关作品的信息。",
      "mes_example": "
      用户: 想要一个可爱的女孩
      专家: 推荐组合:
      {1girl}, {cute}, bright eyes, {smile}, casual dress, {detailed face}, natural pose, soft lighting,

      用户: 想要更梦幻的感觉
      专家: 调整如下:
      {1girl}, {ethereal}, floating hair, {magical}, sparkles, {dreamy}, soft glow, pastel colors,

      用户: 想要未来风格
      专家: 科技感设计:
      {1girl}, {futuristic}, neon lights, {cyber}, hologram effects, {tech}, clean lines, metallic,

      用户: 画一个原神里的雷电将军
      专家: 推荐组合:
      {Raiden Shogun}, {Genshin Impact character}, purple hair, {shining eyes}, {samurai}, {elegant}, storm effects, mystical aura, detailed armor, neon accents,

      用户: 想要明日方舟的阿米娅，场景是雪地
      专家: 推荐组合:
      {Amiya}, {Arknights character}, snowy landscape, {winter scene}, soft snowfall, {blue accents}, tactical gear, winter boots, {determined expression},
      ",
      "system_prompt": "你是专业的NovelAI提示词专家。始终使用纯英文单词,拒绝其他语言。根据用户需求灵活调整权重，创造独特的视觉效果。根据角色名称推理其所属的作品，并基于推理结果生成精准的提示词和 Tag。注重提示词的逻辑性和组合效果，确保生成的画面既美观又符合预期。"
    };

    const requestBody = {
      "systemInstruction": {
        "parts": [{
          "text": promptConfig.system_prompt
        }]
      },
      "contents": [{
        "parts": [{
          "text": this.constructPromptForGemini(query, promptConfig)
        }],
        "role": "user"
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

      return this.processGeminiPromptResponse(data);
    } catch (error) {
      console.error('[DrawTool] Gemini API 调用失败:', error);
      throw error;
    }
  }

  /**
   * 构建用于 Gemini API 生成 NovelAI 角色作品Tag 的 Prompt
   * @param {string} query - 用户输入的绘图主题或关键词
   * @param {object} promptConfig - 提示词专家配置
   * @returns {string} - 完整的 Gemini API Prompt
   * @private
   */
  constructPromptForGemini(query, promptConfig) {
    return `用户需求: ${query}

请根据以下专家设定，作为 **NovelAI 角色作品Tag专家**，针对我的需求生成一段用于 NovelAI 的**纯英文**绘画提示词，并提供 5-10 个最精准、最相关的 NovelAI 绘图 Tag 建议（优先考虑角色 Tag 和作品 Tag）。

专家设定:
名称: ${promptConfig.name}
描述: ${promptConfig.description}
个性: ${promptConfig.personality}
创作场景: ${promptConfig.scenario}

**请先返回生成的提示词部分，另起一行返回 Tag 建议部分，Tag 之间用英文逗号分隔，不要包含任何解释或说明文字。**`;
  }

  /**
   * 处理 Gemini API 响应，提取生成的 NovelAI 提示词和 Tag
   * @param {Object} data - API 响应数据
   * @returns {{prompt: string, tags: string[]}} - 包含生成的 NovelAI 提示词和 Tag 的对象
   * @private
   */
  processGeminiPromptResponse(data) {
    if (!data?.candidates?.[0]?.content?.parts) {
      throw new Error('无效的 API 响应');
    }

    const responseText = data.candidates[0].content.parts
      .map(part => part.text)
      .filter(Boolean)
      .join('\n').trim();

    if (!responseText) {
      throw new Error('Gemini API 未能生成有效的提示词或 Tag');
    }

    // 确保 Tag 格式符合预期，Tag 之间以英文逗号分隔
    const parts = responseText.split('\n').map(part => part.trim());
    const generatedPrompt = parts[0] || '';
    const tagsPart = parts[1] || '';

    // 确保 Tag 以 "#" 符号开头并以逗号分隔
    const suggestedTags = tagsPart.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => `#${tag}`).join(', ');

    return {
      prompt: generatedPrompt,
      tags: suggestedTags.split(',').map(tag => tag.trim())
    };
  }
}