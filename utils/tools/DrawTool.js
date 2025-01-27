import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import { Config } from '../config.js';
import common from '../../../../lib/common/common.js'; // 引入 common 用于转发消息

/**
 * DrawTool 类，继承自 AbstractTool，用于处理绘图请求，并使用 Gemini API 生成提示词。
 * 目前已修改为仅支持使用 nai 插件进行绘图，并且不再依赖 Config 模块，绘图消息格式为 `#绘画` + `prompt`。
 * 强调提示词需要使用英文, 并且使用 Gemini API 进行提示词优化, 并开启 Google Search 工具辅助生成更精准的Tag，特别是针对角色和作品
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
        description: '绘图主题或关键词，用于生成更专业的绘图提示词 (中文亦可)。', // 允许中文输入
      },
    },
    required: ['prompt'], // prompt 变为 required
  };

  /**
   * 工具的描述
   * @type {string}
   */
  description = '用于绘图的工具，目前仅支持 nai 插件。使用 Gemini API 优化绘图提示词，并使用 Google Search 辅助生成更精准的相关 Tag，特别是针对角色和作品。'; // 更新描述

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
      // 如果 nai-plugin 导入失败，则返回错误信息，并立即返回，阻止后续代码执行
      console.error('[ChatGPT][DrawTool] 调用 nai 插件错误：未安装 nai 插件。', err);
      e.reply('未找到 nai 绘图插件，请安装 nai 插件。'); // 使用 e.reply 发送错误消息给用户
      return; // 关键修改：如果导入 nai 插件失败，立即返回，阻止后续代码执行
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
        `\n\nGemini API 建议的 Tag (可能有助于优化画面，**特别是针对角色和作品**):`, // 更新提示信息，强调 Tag 针对角色和作品
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
    const modelName = 'gemini-2.0-flash-exp';
    const apiUrl = `${apiBaseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    if (!apiKey || !apiBaseUrl) {
      throw new Error('Gemini API 配置缺失');
    }

    const promptConfig = {
      "name": "NovelAI 角色作品Tag专家", // 更明确的专家名称
      "description": "专注于为 NovelAI 绘画生成**角色和作品相关的精准英文 Tag** 和高质量提示词。尤其擅长识别用户query中的角色和作品信息，并使用 Google Search 针对性搜索和优化Tag。确保Tag与角色、作品高度相关，提升画面质量。", // 更新 description，强调角色作品Tag
      "personality": "专业、细致、对角色和作品信息敏感。善于理解用户需求，并能深入挖掘角色和作品的特点，提炼出精准的Tag。",
      "scenario": "作为 NovelAI 角色作品Tag专家，我能精准识别你query中的角色和作品名称。我会**立即使用 Google Search 搜索**，分析角色设定、作品风格等信息，为你提取并优化最合适的 NovelAI Tag。让我们一起创作出更符合预期的角色作品图像！", // 更新 scenario，强调立即使用 Google Search
      "first_mes": "你好！我是 NovelAI 角色作品Tag专家。请告诉我你想绘制的角色和作品，我会**立刻使用 Google Search** 搜索相关信息，为你生成最精准的 Tag 和高质量提示词。", // 更新 first_mes，强调立刻使用 Google Search
      "mes_example": "用户: 画一个原神里的雷电将军\n专家: 角色Tag和作品Tag推荐：\n提示词: {Raiden Shogun}, {Genshin Impact character}, detailed eyes, purple hair, ...\nTag: #raiden_shogun #genshin_impact #原神 #雷電將軍 #character_tag #game_tag\n\n用户: 想要明日方舟的阿米娅，场景是雪地\n专家: 角色作品Tag和场景Tag推荐：\n提示词: {Amiya}, {Arknights character}, snowy landscape, winter scene, ...\nTag: #amiya #arknights #明日方舟 #阿米娅 #character_tag #game_tag #snowy_landscape #winter", // 更新 mes_example，示例更侧重角色作品Tag
      "system_prompt": `你是顶级的 NovelAI **角色作品Tag** 专家。你的核心任务是：\n1. **精准识别用户 query 中的角色和作品名称**（例如：角色名、游戏名、动漫名等）。如果query中包含角色或作品信息，务必优先围绕角色和作品生成Tag。\n2. **立刻使用 Google Search 针对识别出的角色和作品进行详细搜索**，分析角色设定、作品风格、常用Tag等信息。\n3. **基于 Google Search 结果，提取并优化 NovelAI 绘图 Tag**。Tag 需与角色、作品高度相关，并考虑 NovelAI 的常用Tag格式和有效性。\n4. **Tag 建议应包含：角色Tag、作品Tag，以及其他与画面内容相关的Tag**（例如：场景、风格等）。\n5. **提供 5-10 个高质量、精准的 Tag 建议**，用'#'符号开头，以英文逗号分隔。\n6. **如果用户 query 中没有明显的角色或作品信息，则根据 query 内容生成通用的画面内容Tag**。\n7. 始终使用纯英文单词,拒绝其他语言。Tag 应该尽可能精准描述画面内容，风格，元素等。`, // **大幅更新 system_prompt**，更强调角色作品Tag，和使用 Google Search 的流程
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
    return `用户需求: ${query}\n\n请根据以下专家设定，作为 **NovelAI 角色作品Tag专家**， 针对我的需求，**立刻使用 Google Search 搜索**，分析与【${query}】相关的角色设定、作品信息、常用Tag等。 基于搜索结果，为我生成一段用于 NovelAI 的**纯英文**绘画提示词，**并提供 5-10 个最精准、最相关的 NovelAI 绘图 Tag 建议**（优先考虑角色Tag、作品Tag）。\n\n专家设定:\n名称: ${promptConfig.name}\n描述: ${promptConfig.description}\n个性: ${promptConfig.personality}\n创作场景: ${promptConfig.scenario}\n\n**请先返回生成的提示词部分，另起一行返回 Tag 建议部分，Tag 之间用英文逗号分隔，不要包含任何解释或说明文字。**`; // **大幅更新 Prompt**，更明确指示 Gemini 作为角色作品Tag专家，并立刻使用 Google Search
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

    // 尝试分割响应文本，假设提示词和 Tag 用换行符分隔
    const parts = responseText.split('\n').map(part => part.trim());
    const generatedPrompt = parts[0] || '';
    const tagsPart = parts[1] || '';
    const suggestedTags = tagsPart.split(',').map(tag => tag.trim()).filter(Boolean);

    return {
      prompt: generatedPrompt,
      tags: suggestedTags
    };
  }
}