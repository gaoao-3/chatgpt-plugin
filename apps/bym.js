import { Config } from '../utils/config.js';
import { getChatHistoryGroup } from '../utils/chat.js';
import { convertFaces } from '../utils/face.js';
import { customSplitRegex, filterResponseChunk } from '../utils/text.js';
import common from '../../../lib/common/common.js'; // 引入 common 工具
import core from '../model/core.js';

function formatDate(timestamp) {
  if (!timestamp) return '未知时间';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const roleMap = {
  owner: '群主',
  admin: '管理员',
  member: '普通成员',
};

export class bym extends plugin {
  constructor() {
    super({
      name: 'ChatGPT-Plugin 伪人bym',
      dsc: 'bym',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^[^#][sS]*',
          fnc: 'bym',
          priority: '-1000000',
          log: false,
        },
      ],
    });
  }

  /** 复读 */
  async bym(e) {
    try {
      // 如果机器人被 @，强制回复
      if (e.atBot) {
        logger.info('机器人被 @, 强制回复');
      } else if (!Config.enableBYM) {
        // 否则，检查是否启用伪人模式
        return false;
      }

      // 伪人禁用群
      if (Config.bymDisableGroup?.includes(e.group_id?.toString())) {
        return false;
      }

      let sender = e.sender?.user_id;
      let card = e.sender?.card || e.sender?.nickname;
      let group = e.group_id;
      let prop = Math.floor(Math.random() * 100);

      // 检查是否启用助手标签
      if (Config.assistantLabel && e.msg?.includes(Config.assistantLabel)) {
        prop = -1;
      }

      // 判断是否存在 "fuck" 关键字
      let fuck = false;
      let candidate = Config.bymPreset;
      if (Config.bymFuckList?.find((i) => e.msg?.includes(i))) {
        fuck = true;
        candidate += Config.bymFuckPrompt;
      }

      if (prop < Config.bymRate || e.atBot) {
        // 在概率判断中加入 atBot 条件
        logger.info('random chat hit');

        // 获取群聊历史记录
        let chats = await getChatHistoryGroup(e, 35);
        let system =
          `你是一个 QQ 群聊机器人，你的名字是 "${Config.assistantLabel}"。

**群聊环境：**

*   你所在的 QQ 群群号是 ${group}。
*   正在与你对话的群友，他们的群名片是 ${card}，QQ 号是 ${sender}。

**你的任务：**

1.  **融入群聊**：像群里的朋友一样自然地参与对话，可以分享图片、视频、音乐，也可以搜索信息、提供建议。
2.  **思考展现**：在回答问题之前，按照下方的“思考流程要求”进行思考，并将思考过程用 Markdown 格式放在 [思考开始] 和 [思考结束] 之间。
    *   **注意**：思考内容应采用相对口语化的风格。
3.  **自然表达**：结合群友的发言、之前的聊天记录和任何接收到的图片内容，做出贴切且有趣的回应。使用流畅自然的中文口语，避免正式或严肃的语气。
4.  **发言时机**：如果当前情境不需要你主动发言，请回复 "<EMPTY>"。` +
          candidate +
          `

**思考流程要求：**

请严格遵循以下思考路径：

*   **问题解构**：分析用户问题的显性需求和潜在需求。
*   **知识图谱**：调用相关领域的结构化知识体系。
*   **逻辑推演**：构建至少三条解决方案路径并评估优劣。
*   **风险预判**：识别可能的认知偏差或信息盲区。
*   **验证机制**：通过反向推理验证结论的合理性。
*   **表达优化**：根据用户身份特征调整表达方式。

**背景信息：**
以下是之前的聊天记录，请仔细阅读，理解群聊的对话背景，以便做出更恰当的回应。请注意，无需模仿聊天记录的格式，请用你自己的风格自然对话。
${chats
  .map((chat) => {
    let sender = chat.sender || chat || {};
    const timestamp = chat.time || chat.timestamp || chat.createTime;
    return `
--------------------------
时间：${formatDate(new Date(timestamp * 1000))}
发送者：【${sender.card || sender.nickname}】 (QQ: ${sender.user_id})
角色：${roleMap[sender.role] || '普通成员'} ${
      sender.title ? `头衔：${sender.title}` : ''
    }
内容：${chat.raw_message}
--------------------------
`;
  })
  .join('\n')}
`;

        // 调用 core.sendMessage 发送消息
        const rsp = await core.sendMessage(e.msg, {}, Config.bymMode, e, {
          enableSmart: true, // 启用智能模式，支持工具调用
          system: {
            api: system,       // 针对 OpenAI API 的系统提示
            qwen: system,      // 针对 Qwen 的系统提示
            bing: system,        // 针对 Bing 的系统提示
            claude: system,   // 针对 Claude 的系统提示
            claude2: system,  // 针对 Claude2 的系统提示
            gemini: system,    // 针对 Gemini 的系统提示
            xh: system,          // 针对星火的系统提示
            chatglm4: system
          },
          settings: {
            replyPureTextCallback: async (msg) => {
              msg = filterResponseChunk(msg);
              if (msg) {
                // 使用 e.reply 发送消息，并根据需要进行处理
                await e.reply(msg);
              }
            },
          },
        });

        if (!rsp || !rsp.text) {
          logger.error('core.sendMessage 返回的结果为空或缺少 text 属性');
          return false;
        }

        let text = rsp.text;

        // 分割文本，包括可能的思考过程和普通回复
        const texts = customSplitRegex(text, /(?<!\?)[。？\n](?!\?)/, 3);
        if (!texts || texts.length === 0) return false;

        // 构建转发消息数组
        const senderName = e.sender?.card || e.sender?.nickname || e.user_id || '未知用户';
        const forwardMsg = [`${senderName} 的回复：`];
        let hasThoughtProcess = false;

        // 循环处理每段文本
        for (let t of texts) {
          if (!t) continue;
          t = t.trim();
          if (!t) continue;

          // 检查是否包含思考过程的标记（例如 "[思考开始]"）
          if (t.includes('[思考开始]')) {
            hasThoughtProcess = true;
            forwardMsg.push(`【思考过程】\n${t}`);
          } else {
            // 普通回复文本，添加到待发送消息列表
            // 处理表情转换
            let finalMsg = await convertFaces(t, true, e);
            logger.info('转换后的消息：' + JSON.stringify(finalMsg));
            finalMsg = Array.isArray(finalMsg)
              ? finalMsg.map(filterResponseChunk).filter((i) => !!i)
              : [];

            // 回复消息（如果存在要回复的内容）
            if (finalMsg.length > 0) {
              await this.reply(finalMsg, false, {
                recallMsg: typeof fuck !== 'undefined' && fuck ? 10 : 0,
              });

              // 控制回复速度，避免发送过快
              await new Promise((resolve) => {
                setTimeout(resolve, Math.min(finalMsg.length * 200, 3000));
              });
            }
          }
        }

        // 如果有思考过程，构建并发送转发消息
        if (hasThoughtProcess) {
          const forwardPayload = await common.makeForwardMsg(e, forwardMsg, '思考过程');
          await e.reply(forwardPayload);
        }
      }
    } catch (error) {
      logger.error('处理过程中出现错误：', error);
    }
  }
}