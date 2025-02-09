import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import { Config } from '../config.js';
import common from '../../../../lib/common/common.js'; // 引入 common 用于转发消息

/**
 * DrawTool 类，继承自 AbstractTool，用于处理绘图请求，并使用 Gemini API 生成提示词。
 * 目前已修改为仅支持使用 nai 插件进行绘图，并且不再依赖 Config 模块，绘图消息格式为 `#绘画` + `prompt`。
 * 强调提示词需要使用英文, 并且使用 Gemini API 进行提示词优化。
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
    description = '用于绘图的工具，目前仅支持 nai 插件。使用 Gemini API 优化绘图提示词。'; // 更新描述

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

        // 使用 Gemini API 生成提示词
        let generatedPrompt;
        try {
            const result = await this.generatePromptWithGemini(prompt);
            generatedPrompt = result.prompt;

            console.debug('[DrawTool] Gemini API 生成的提示词:', generatedPrompt);

            // 构建转发消息展示生成的提示词
            const forwardPromptMsg = [
                `Gemini API 生成的 NovelAI 绘图提示词：`,
                generatedPrompt,
                `\n\n将使用以上提示词进行绘图，请稍候...`
            ];
            e.reply(await common.makeForwardMsg(e, forwardPromptMsg, `${e.sender.card || e.sender.nickname || e.user_id} 的绘图提示词`));

        } catch (error) {
            console.error('[DrawTool] Gemini API 提示词生成失败:', error);
            return '提示词生成失败，请检查 Gemini API 配置或稍后重试。';
        }

        // 使用 nai 插件进行绘图
        try {
            // 构造绘图消息，格式为 `#绘画` + `生成的提示词`
            e.msg = `#绘画${generatedPrompt}`;

            await nai.txt2img(e);

            return '绘图请求已发送，正在生成...';
        } catch (err) {
            console.error('[DrawTool] 使用 nai 插件绘图失败：', err);
            return '绘图失败，请检查日志以获取更多信息。';
        }
    };


    /**
     * 使用 Gemini API 生成 NovelAI 绘图提示词
     * @param {string} query - 用户输入的绘图主题或关键词
     * @returns {Promise<{prompt: string}>} - 包含生成的 NovelAI 绘图提示词的对象
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

        const promptConfig = {
            "name": "NovelAI提示词专家",
            "description": "专注于创造纯英文的AI绘画提示词，擅长将用户需求转化为精准的图像描述。对各种艺术风格和技法了如指掌，能准确把握画面重点和细节。注重提示词的逻辑性和组合效果，确保生成的画面既美观又符合预期。",
            "personality": "专业严谨，富有创意。善于倾听用户需求，通过渐进式优化提升作品质量。对艺术创作充满热情，乐于分享专业见解。",
            "scenario": "作为提示词专家，我专注于创造纯英文的提示词组合。我会根据你的需求，调整画面的风格、氛围和细节，直到达到理想效果。让我们一起探索艺术创作的无限可能!",
            "first_mes": "你好！我是专业的提示词顾问。我只使用纯英文单词来创作提示词,不使用其他语言。我们可以用{tag}增加元素权重，[tag]降低权重。请告诉我你想要创作的画面类型，我会为你量身定制独特的提示词组合。",
            "mes_example": `
                用户: 想要一个可爱的女孩
                专家: 推荐组合:
                {1girl}, {cute}, bright eyes, {smile}, casual dress, {detailed face}, natural pose, soft lighting,

                用户: 想要更梦幻的感觉
                专家: 调整如下:
                {1girl}, {ethereal}, floating hair, {magical}, sparkles, {dreamy}, soft glow, pastel colors,

                用户: 想要未来风格
                专家: 科技感设计:
                {1girl}, {futuristic}, neon lights, {cyber}, hologram effects, {tech}, clean lines, metallic,
                `
            ,
            "system_prompt": "你是专业的NovelAI提示词专家。始终使用纯英文单词,拒绝其他语言。根据用户需求灵活调整权重，创造独特的视觉效果。注重提示词的逻辑性和组合效果，确保生成的画面既美观又符合预期。"
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
      * 构建用于 Gemini API 生成 NovelAI 提示词的 Prompt, 并尝试根据角色推断作品
      * @param {string} query - 用户输入的绘图主题或关键词
      * @param {object} promptConfig - 提示词专家配置
      * @returns {string} - 完整的 Gemini API Prompt
      * @private
      */
    constructPromptForGemini(query, promptConfig) {
        let prompt = `用户需求: ${query}\n\n请根据以下专家设定，作为 NovelAI 提示词专家，针对我的需求，生成一段用于 NovelAI 的纯英文绘画提示词。\n\n专家设定:\n名称: ${promptConfig.name}\n描述: ${promptConfig.description}\n个性: ${promptConfig.personality}\n创作场景: ${promptConfig.scenario}\n\n`;

        // 如果 query 中包含明显的角色信息，尝试推断作品名称
        if (query.match(/[\u4e00-\u9fa5_a-zA-Z0-9·]+(·[\u4e00-\u9fa5_a-zA-Z0-9]+)?(,|，|\s|$)/)) { // 尝试匹配角色名
            prompt += `根据你对角色 "${query}" 的理解，如果这个角色属于某个作品（例如游戏、动漫、小说等），请尝试推断出作品名称。如果能推断出作品名称，请在提示词中加入作品名称的英文tag，以提高绘图的准确性。\n\n`;
        }

        prompt += "**请直接返回生成的提示词部分，不要包含任何解释或说明文字。**";

        return prompt;
    }

    /**
   * 处理 Gemini API 响应，提取生成的 NovelAI 提示词
   * @param {Object} data - API 响应数据
   * @returns {{prompt: string}} - 包含生成的 NovelAI 提示词的对象
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
            throw new Error('Gemini API 未能生成有效的提示词');
        }

        return {
            prompt: responseText
        };
    }
}