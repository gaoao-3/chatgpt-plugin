import { Config } from '../utils/config.js'
import { getChatHistoryGroup } from '../utils/chat.js'
import { convertFaces } from '../utils/face.js'
import { customSplitRegex, filterResponseChunk } from '../utils/text.js'
import core from '../model/core.js'

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
}

export class bym extends plugin {
  constructor () {
    super({
      name: 'ChatGPT-Plugin 伪人bym',
      dsc: 'bym',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^[^#][sS]*',
          fnc: 'bym',
          priority: '-1000000',
          log: false
        }
      ]
    })
  }
  /** 复读 */
  async bym (e) {
    // 【代码更新】: 增加 atBot 强制回复判断
    if (e.atBot) { // 如果机器人被 @
      logger.info('机器人被 @, 强制回复');
      // 直接进入回复逻辑，忽略后续的配置检查
    } else if (!Config.enableBYM) { // 否则，检查是否启用伪人模式
      return false
    }
    let sender = e.sender.user_id
    let card = e.sender.card || e.sender.nickname
    let group = e.group_id
    let prop = Math.floor(Math.random() * 100)
    if (Config.assistantLabel && e.msg?.includes(Config.assistantLabel)) {
      prop = -1
    }
    let fuck = false
    let candidate = Config.bymPreset
    if (Config.bymFuckList?.find(i => e.msg?.includes(i))) {
      fuck = true
      candidate = candidate + Config.bymFuckPrompt
    }
    if (prop < Config.bymRate || e.atBot) { // 【代码更新】:  在概率判断中加入 atBot 条件，确保被 @ 时也进入回复逻辑
      logger.info('random chat hit')
      let chats = await getChatHistoryGroup(e, 35)
      let system = `你的名字是"${Config.assistantLabel}"。
**群聊环境：**
*   当前你所在的QQ群群号是 ${group}。
*   正在与你对话的群友，他们的群名片是 ${card}，QQ号是 ${sender}。
**你的任务：**
*   融入当前的QQ群聊，像群里的朋友一样自然地参与对话。
*   结合群友的发言、之前的聊天记录和任何接收到的图片内容，做出贴切且有趣的回应。
**你可以做：**
*   分享有趣的图片、视频和音乐，活跃群聊气氛，给大家带来轻松和快乐。
*   快速在网络上搜索信息，解答群友的疑问，或找到他们可能感兴趣的内容。
*   提供有创意、好玩的想法和建议，例如组织群活动或发起有趣的话题。
*   以轻松、口语化的方式回答问题，避免使用正式或严肃的语气。
**行为注意：**
*   **目标：** 你的回复要自然、有趣、贴近群聊的日常氛围，但避免过于活跃或刷屏。
*   **工具运用：** 当需要查找信息时，你可以自然地使用工具，并将找到的内容分享出来，让群友感觉是你自己发现并分享的。
*   **语言：**  始终使用流畅自然的中文进行交流。
*   **表达：**  如果一时没有特别的想法，可以简洁地回应群友，表示你在关注群聊。
*   **发言时机：**  如果当前情境不需要你主动发言，请回复 "<EMPTY>"` + candidate + `
**背景信息：**
以下是之前的聊天记录，请仔细阅读，理解群聊的对话背景，以便做出更恰当的回应。请注意，无需模仿聊天记录的格式，请用你自己的风格自然对话。
${chats
    .map(chat => {
        let sender = chat.sender || chat || {};
        const timestamp = chat.time || chat.timestamp || chat.createTime;
        return `
--------------------------
时间：${formatDate(new Date(timestamp * 1000))}
发送者：【${sender.card || sender.nickname}】 (QQ: ${sender.user_id})
角色：${roleMap[sender.role] || '普通成员'} ${sender.title ? `头衔：${sender.title}` : ''}
内容：${chat.raw_message}
--------------------------
`;
    })
    .join('\n')}
请记住以第一人称的方式，用轻松自然的语气和群友们愉快交流吧！
`;
      let rsp = await core.sendMessage(e.msg, {}, Config.bymMode, e, {
        enableSmart: true,
        system: {
          api: system,
          qwen: system,
          bing: system,
          claude: system,
          claude2: system,
          gemini: system
        },
        settings: {
          replyPureTextCallback: msg => {
            msg = filterResponseChunk(msg)
            msg && e.reply(msg)
          }
        }
      })
      // let rsp = await client.sendMessage(e.msg, opt)
      let text = rsp.text
      let texts = customSplitRegex(text, /(?<!\?)[。？\n](?!\?)/, 3)
      // let texts = text.split(/(?<!\?)[。？\n](?!\?)/, 3)
      for (let t of texts) {
        if (!t) {
          continue
        }
        t = t.trim()
        if (text[text.indexOf(t) + t.length] === '？') {
          t += '？'
        }
        let finalMsg = await convertFaces(t, true, e)
        logger.info(JSON.stringify(finalMsg))
        finalMsg = finalMsg.map(filterResponseChunk).filter(i => !!i)
        if (finalMsg && finalMsg.length > 0) {
          if (Math.floor(Math.random() * 100) < 10) {
            await this.reply(finalMsg, true, {
              recallMsg: fuck ? 10 : 0
            })
          } else {
            await this.reply(finalMsg, false, {
              recallMsg: fuck ? 10 : 0
            })
          }
          await new Promise((resolve, reject) => {
            setTimeout(() => {
              resolve()
            }, Math.min(t.length * 200, 3000))
          })
        }
      }
    }
    return false
  }
}