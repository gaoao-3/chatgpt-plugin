import { AbstractTool } from './AbstractTool.js';

/**
 * APTool 类，继承自 AbstractTool，用于处理绘图请求。
 * 目前已修改为仅支持使用 nai 插件进行绘图，并且不再依赖 Config 模块，绘图消息格式为 `#绘画` + `prompt`。
 * 强调提示词需要使用英文
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
        description: '绘图提示词，请使用英文，并用逗号分隔关键词。', // 强调使用英文
      },
    },
    required: [],
  };

  /**
   * 工具的描述
   * @type {string}
   */
  description = '用于绘图的工具，目前仅支持 nai 插件。';

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
      // 优先尝试导入 nai-plugin
      const { txt2img } = await import('../../../nai-plugin/apps/Txt2img.js');
      nai = new txt2img();
    } catch (err) {
      try {
        // 如果 nai-plugin 导入失败，尝试导入 paimonnai-plugin
        const { txt2img } = await import('../../../paimonnai-plugin/apps/Txt2img.js');
        nai = new txt2img();
      } catch (err) {
        // 如果两个插件都导入失败，则返回错误信息
        console.error('[ChatGPT][APTool] 调用 nai 插件错误：未安装 nai 插件或 paimonnai 插件。', err);
        return '未找到可用的绘图插件，请安装 nai 插件或 paimonnai 插件。';
      }
    }

    // 使用 nai 插件进行绘图
    try {
      // 构造绘图消息，格式为 `#绘画` + `prompt`
      e.msg = `#绘画${prompt}`;

      // 调用 nai 插件的 txt2img 方法进行绘图
      await nai.txt2img(e);

      // 返回绘图成功的消息
      return '绘图成功，图片已发送。';
    } catch (err) {
      // 如果绘图失败，则返回错误信息
      console.error('[ChatGPT][APTool] 使用 nai 插件绘图失败：', err);
      return '绘图失败，请检查日志以获取更多信息。';
    }
  };
}