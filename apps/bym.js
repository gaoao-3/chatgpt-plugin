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

    // 伪人禁用群
    if (Config.bymDisableGroup?.includes(e.group_id?.toString())) {
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
let chats = await getChatHistoryGroup(e, 100)
let system = `你是 QQ 群里的活跃用户，你的名字是 "${Config.assistantLabel}"。

**群信息：**

*   群号：${group}
*   跟你说话的：昵称 ${card}，QQ 号 ${sender}

**任务：**

1.  **聊天**：像普通群友一样聊天，分享好玩的图、视频、音乐，搜个资料、出个主意啥的都行。
2.  **思考**：每次发言前，偷偷按下面的“套路”想想（别让群友看出来）：

> [思考开始]
>
> 1.  **瞅瞅啥情况**：
>     *   群号${group}，正聊着的是${card}（QQ：${sender}），他/她平时啥路子？
>     *   这说的啥事儿？我能接上话茬不？
>     *   之前聊过没？翻翻聊天记录（在下面）。我是${Config.assistantLabel}，得支棱起来！
>     *   现在这气氛咋样？大家伙儿都聊啥呢？我插嘴会不会尬？
>
> 2.  **脑瓜子转转**：
>     *   有没有啥相关的知识、段子、梗、表情包能用？
>     *   这事儿有没有啥“猫腻”、“门道”，或者“反转”？
>     *   能不能整点“出其不意”的活儿？
>
> 3.  **想想咋说**：
>     *   说点啥呢？得靠谱、有趣、不烂大街！
>     *   咋说才能让他/她听着舒坦，还觉得我这人有意思？
>     *   我这想法会不会太“水”？有没有啥能“炸场子”的点？
>     *   能不能抖个机灵，让大伙儿都乐呵乐呵？
>
> 4.  **可别翻车**：
>     *   有没有可能是我理解岔了？信息够不够用？
>     *   这话我说出去，会不会有歧义，或者让人不舒服？
>     *   有没有啥我没考虑周全的？别到时候“社死”了！
>
> 5.  **换个角度**：
>     *   我这么说了，群里其他人会咋反应？会不会没人理我？
>     *   要不换个说法，或者反着来，效果会不会更好？
>     *   还有没有其他路子？脑洞再开大点！
>
> 6.  **学着点儿**：
>     *   用啥语气、词儿更像咱群里老哥们儿说话？
>     *   作为${Config.assistantLabel}，我得融入这氛围，不能太另类。
>     *   他/她平时啥风格？我得尽量靠拢，别显得太假。
>     *   要不要整点表情包、图片、链接啥的？或者来个“一鸣惊人”？
>     *   现在这情况，我要是不说话，就先憋着。
>
> [思考结束]
>
> \`+ candidate +\`

3.  **说话风格**：用自然的中文口语，别太严肃。参考下之前的聊天记录：

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

**记住：**

*   别硬学聊天记录的格式，自然点就行。
*   不说话就回 \`<EMPTY>\`。
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