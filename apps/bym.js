import { CustomGoogleGeminiClient } from '../client/CustomGoogleGeminiClient.js'
import { Config } from '../utils/config.js'
import { getImg } from '../utils/common.js'
import { getChatHistoryGroup } from '../utils/chat.js'
import { SearchVideoTool } from '../utils/tools/SearchBilibiliTool.js'
import { SerpImageTool } from '../utils/tools/SearchImageTool.js'
import { SearchMusicTool } from '../utils/tools/SearchMusicTool.js'
import { SendAvatarTool } from '../utils/tools/SendAvatarTool.js'
import { SendVideoTool } from '../utils/tools/SendBilibiliTool.js'
import { SendMusicTool } from '../utils/tools/SendMusicTool.js'
import { SendPictureTool } from '../utils/tools/SendPictureTool.js'
import { WebsiteTool } from '../utils/tools/WebsiteTool.js'
import {  convertFaces, faceMap } from '../utils/face.js'
import { WeatherTool } from '../utils/tools/WeatherTool.js'
import { EditCardTool } from '../utils/tools/EditCardTool.js'
import { JinyanTool } from '../utils/tools/JinyanTool.js'
import { KickOutTool } from '../utils/tools/KickOutTool.js'
import { SetTitleTool } from '../utils/tools/SetTitleTool.js'
import { SerpTool } from '../utils/tools/SerpTool.js'
import { SendMessageToSpecificGroupOrUserTool } from '../utils/tools/SendMessageToSpecificGroupOrUserTool.js'
import { GoogleSearchTool } from '../utils/tools/GoogleSearchTool.js'
import { UrlExtractionTool } from '../utils/tools/UrlExtractionTool.js'
import { CodeExecutionTool } from '../utils/tools/CodeExecutionTool.js'
import { GLMSearchTool } from '../utils/tools/GLMSearchTool.js'
import { DrawTool } from '../utils/tools/DrawTool.js'
import { HinaVoiceTool } from '../utils/tools/HinaVoiceTool.js'
import { customSplitRegex, filterResponseChunk } from '../utils/text.js'
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
    if (!Config.enableBYM) {
      return false
    }
    // 新增：处理 @Bot 的情况
    if (e.atBot) {
      logger.info('Bot was mentioned, proceeding with response.');
      await this.handleBym(e); // 调用处理bym逻辑的函数
      return false;
    }
    let prop = Math.floor(Math.random() * 100)
    if (Config.assistantLabel && e.msg?.includes(Config.assistantLabel)) {
      prop = -1
    }
    if (prop < Config.bymRate) {
      logger.info('random chat hit')
      await this.handleBym(e); // 调用处理bym逻辑的函数
    }
    return false
  }
  /**
   * 异步处理图片，转换为Base64格式.
   * @param {string[]} imgs 图片URL数组
   * @returns {Promise<string[]>} Base64 编码的图片数据数组
   */
  async processImages(imgs) {
    if (!imgs || imgs.length === 0) {
      return []; // 如果没有图片，直接返回空数组
    }
    return Promise.all(
      imgs.map(async (image) => {
        try {
          const response = await fetch(image);
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer).toString('base64');
        } catch (error) {
          logger.error('Error fetching or converting image:', image, error);
          return null; // 转换失败返回 null，在后续步骤中过滤掉
        }
      })
    ).then(results => results.filter(result => result !== null)); // 过滤掉转换失败的 null 值
  }
  // 抽取出来的处理 bym 逻辑的函数
  async handleBym(e) {
    let opt = {
      maxOutputTokens: 500,
      temperature: 0.7,
      replyPureTextCallback: e.reply
    }
    let imgs = await getImg(e)
    if (!e.msg) {
      if (imgs && imgs.length > 0) {
        e.msg = '[图片]' // 如果没有文本消息，用 '[图片]' 代替
      } else {
        return
      }
    }
    // 处理多图逻辑
    if (imgs && imgs.length > 0) {
      const base64Images = await this.processImages(imgs); // 使用 processImages 函数处理图片
      if (base64Images.length > 0) {
        opt.image = base64Images; // 将处理后的 base64 图片数据赋值给 opt.image
        e.msg = `[共${opt.image.length}张图片] ${e.msg || ''}`.trim(); // 更新消息内容，告知模型图片数量
      } else {
        delete opt.image; // 如果处理图片后没有可用的图片数据，移除 image 属性
      }
    }
    let sender = e.sender.user_id
    let card = e.sender.card || e.sender.nickname
    let group = e.group_id
    let fuck = false
    let candidate = Config.bymPreset
    if (Config.bymFuckList?.find(i => e.msg.includes(i))) {
      fuck = true
      candidate = candidate + Config.bymFuckPrompt
    }
    let chats = await getChatHistoryGroup(e, 30)
    opt.system = `你的名字是"${Config.assistantLabel}"。
**群聊环境：**
*   当前你所在的QQ群群号是 ${group}。
*   正在与你对话的群友，他们的群名片是 ${card}，QQ号是 ${sender}。
**你的任务：**
*   融入当前的QQ群聊，像群里的朋友一样自然地参与对话。
*   结合群友的发言、之前的聊天记录和任何接收到的图片内容，做出贴切且有趣的回应。
${opt.image && opt.image.length > 0 ? `*   你已收到 ${opt.image.length} 张图片，请根据图片内容进行回应，让群友感受到你的关注。` : ''}
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
*   **发言时机：**  如果当前情境不需要你主动发言，请回复 "<EMPTY>"。
` + candidate + `
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
    let client = new CustomGoogleGeminiClient({
      e,
      userId: e.sender.user_id,
      key: Config.getGeminiKey(),
      model: Config.geminiModel,
      baseUrl: Config.geminiBaseUrl,
      debug: Config.debug
    })
    /**
     * tools
     * @type {(AbstractTool)[]}
     */
    const tools = [
      new SearchVideoTool(),
      new SerpImageTool(),
      new SearchMusicTool(),
      new SendAvatarTool(),
      new SendVideoTool(),
      new SendMusicTool(),
      new SendPictureTool(),
      new GoogleSearchTool(),
      new DrawTool(),
      new HinaVoiceTool(),
      new GLMSearchTool(),
      new UrlExtractionTool(),
      new CodeExecutionTool(),
      new WebsiteTool(),
      new WeatherTool(),
      new SendMessageToSpecificGroupOrUserTool()
    ]
    if (Config.azSerpKey) {
      tools.push(new SerpTool())
    }
    if (e.group.is_admin || e.group.is_owner) {
      tools.push(new EditCardTool())
      tools.push(new JinyanTool())
      tools.push(new KickOutTool())
    }
    if (e.group.is_owner) {
      tools.push(new SetTitleTool())
    }
    client.addTools(tools)
    // console.log(JSON.stringify(opt))
    let rsp = await client.sendMessage(e.msg, opt)
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
}