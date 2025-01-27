import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import { Config } from '../config.js';
import common from '../../../../lib/common/common.js'; // 引入 common 用于转发消息

/**
 * APTool 类，继承自 AbstractTool，用于处理绘图请求，并使用 Gemini API 生成提示词。
 * 目前已修改为仅支持使用 nai 插件进行绘图，并且不再依赖 Config 模块，绘图消息格式为 `#绘画` + `prompt`。
 * 强调提示词需要使用英文, 并且使用 Gemini API 进行提示词优化, 并开启 Google Search 工具辅助生成提示词
 */
export class APTool extends AbstractTool {
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
  description = '用于绘图的工具，目前仅支持 nai 插件。使用 Gemini API 优化绘图提示词，并开启 Google Search 工具。'; // 更新描述

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
      // 尝试导入 nai-plugin
      const { txt2img } = await import('../../../nai-plugin/apps/Txt2img.js');
      nai = new txt2img();
    } catch (err) {
      // 如果 nai-plugin 导入失败，则返回错误信息，不再尝试 paimonnai-plugin
      console.error('[ChatGPT][APTool] 调用 nai 插件错误：未安装 nai 插件。', err);
      return '未找到 nai 绘图插件，请安装 nai 插件。'; // 修改错误提示，更明确指出是 nai 插件
    }

    // 使用 Gemini API 生成提示词
    let generatedPrompt;
    try {
      generatedPrompt = await this.generatePromptWithGemini(prompt);
      console.debug('[APTool] Gemini API 生成的提示词:', generatedPrompt);

      // 构建转发消息展示生成的提示词
      const forwardPromptMsg = [`Gemini API 生成的 NovelAI 绘图提示词：`, generatedPrompt, `\n\n将使用以上提示词进行绘图，请稍候...`];
      e.reply(await common.makeForwardMsg(e, forwardPromptMsg, `${e.sender.card || e.sender.nickname || e.user_id} 的绘图提示词`));

    } catch (error) {
      console.error('[APTool] Gemini API 提示词生成失败:', error);
      return '提示词生成失败，请检查 Gemini API 配置或稍后重试。'; // 提示提示词生成失败
    }

    // 使用 nai 插件进行绘图
    try {
      // 构造绘图消息，格式为 `#绘画` + `生成的提示词`
      e.msg = `#绘画${generatedPrompt}`; // 使用 Gemini 生成的提示词

      // 调用 nai 插件的 txt2img 方法进行绘图
      await nai.txt2img(e);

      // 返回绘图请求已发送的消息，提示正在生成
      return '绘图请求已发送，正在生成...';
    } catch (err) {
      // 如果绘图失败，则返回错误信息
      console.error('[APTool] 使用 nai 插件绘图失败：', err);
      return '绘图失败，请检查日志以获取更多信息。';
    }
  };


  /**
   * 使用 Gemini API 生成 NovelAI 绘图提示词
   * @param {string} query - 用户输入的绘图主题或关键词
   * @returns {Promise<string>} - 生成的 NovelAI 绘图提示词
   * @private
   */
  async generatePromptWithGemini(query) {
    const apiKey = Config.getGeminiKey();
    const apiBaseUrl = Config.geminiBaseUrl;
    const modelName = 'gemini-2.0-flash-exp'; // 指定模型名称
    const apiUrl = `${apiBaseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`; // 构造 Gemini API 请求 URL，包含模型名称

    if (!apiKey || !apiBaseUrl) {
      throw new Error('Gemini API 配置缺失');
    }

    const promptConfig = { // 提示词专家配置，从你提供的配置中提取
      "name": "NovelAI提示词专家",
      "description": "专注于创造纯英文的AI绘画提示词，擅长将用户需求转化为精准的图像描述。对各种艺术风格和技法了如指掌，能准确把握画面重点和细节。注重提示词的逻辑性和组合效果，确保生成的画面既美观又符合预期。",
      "personality": "专业严谨，富有创意。善于倾听用户需求，通过渐进式优化提升作品质量。对艺术创作充满热情，乐于分享专业见解。",
      "scenario": "作为提示词专家，我专注于创造纯英文的提示词组合。我会根据你的需求，调整画面的风格、氛围和细节，直到达到理想效果。让我们一起探索艺术创作的无限可能!",
      "first_mes": "你好！我是专业的提示词顾问。我只使用纯英文单词来创作提示词,不使用其他语言。我们可以用{tag}增加元素权重，[tag]降低权重。请告诉我你想要创作的画面类型，我会为你量身定制独特的提示词组合。",
      "mes_example": "用户: 想要一个可爱的女孩\n专家: 推荐组合:\n{1girl}, {cute}, bright eyes, {smile}, casual dress, {detailed face}, natural pose, soft lighting,\n\n用户: 想要更梦幻的感觉\n专家: 调整如下:\n{1girl}, {ethereal}, floating hair, {magical}, sparkles, {dreamy}, soft glow, pastel colors,\n\n用户: 想要未来风格\n专家: 科技感设计:\n{1girl}, {futuristic}, neon lights, {cyber}, hologram effects, {tech}, clean lines, metallic,",
      "system_prompt": "你是专业的NovelAI提示词专家。始终使用纯英文单词,拒绝其他语言。根据用户需求灵活调整权重，创造独特的视觉效果。注重提示词的逻辑性和组合效果，确保生成的画面既美观又符合预期。"
    };


    const requestBody = { // 构造 Gemini API 请求 body
      "systemInstruction": { // 系统指令
        "parts": [{
          "text": promptConfig.system_prompt // 使用提示词专家的 system_prompt 作为系统指令
        }]
      },
      "contents": [{ // 内容
        "parts": [{
          "text": this.constructPromptForGemini(query, promptConfig) // 构建更详细的 prompt，包含用户需求和专家设定
        }],
        "role": "user" // 角色设置为用户
      }],
      "tools": [{ // 开启 Google Search 工具
        "googleSearch": {}
      }]
    };

    try {
      const response = await fetch(apiUrl, { // 发送 POST 请求到 Gemini API
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // 设置 Content-Type 为 application/json
        },
        body: JSON.stringify(requestBody) // 将请求 body 序列化为 JSON 字符串
      });

      const data = await response.json(); // 解析 JSON 响应

      if (!response.ok) { // 检查响应状态码是否为 2xx
        throw new Error(`API 请求失败: ${data.error?.message || '未知错误'}`); // 抛出错误，提示 API 请求失败
      }

      return this.processGeminiPromptResponse(data); // 处理 Gemini API 响应，提取生成的提示词
    } catch (error) { // 捕获 API 调用错误
      console.error('[APTool] Gemini API 调用失败:', error); // 打印 API 调用失败的错误日志
      throw error; // 抛出错误
    }
  }


  /**
   * 构建用于 Gemini API 生成 NovelAI 提示词的 Prompt
   * @param {string} query - 用户输入的绘图主题或关键词
   * @param {object} promptConfig - 提示词专家配置
   * @returns {string} - 完整的 Gemini API Prompt
   * @private
   */
  constructPromptForGemini(query, promptConfig) {
    return `用户需求: ${query}\n\n请根据以下专家设定，为我生成一段用于 NovelAI 的**纯英文**绘画提示词：\n\n专家设定:\n名称: ${promptConfig.name}\n描述: ${promptConfig.description}\n个性: ${promptConfig.personality}\n创作场景: ${promptConfig.scenario}\n\n**请只返回生成的提示词部分，不要包含任何解释或说明文字。**`; // 构建详细的 Prompt，要求 Gemini API 根据专家设定生成纯英文提示词，并只返回提示词部分
  }


  /**
   * 处理 Gemini API 响应，提取生成的 NovelAI 提示词
   * @param {Object} data - API 响应数据
   * @returns {string} - 生成的 NovelAI 提示词
   * @private
   */
  processGeminiPromptResponse(data) {
    if (!data?.candidates?.[0]?.content?.parts) { // 检查 API 响应数据结构是否有效
      throw new Error('无效的 API 响应'); // 抛出错误，提示 API 响应无效
    }

    const generatedPrompt = data.candidates[0].content.parts // 获取 API 响应中的提示词部分
      .map(part => part.text) // 提取文本内容
      .filter(Boolean) // 过滤掉空字符串或 null/undefined
      .join('\n').trim(); // 将文本内容连接成字符串，并去除首尾空格

    if (!generatedPrompt) { // 检查是否成功生成提示词
      throw new Error('Gemini API 未能生成有效的提示词'); // 抛出错误，提示 Gemini API 未能生成有效的提示词
    }

    return generatedPrompt; // 返回生成的提示词
  }
}