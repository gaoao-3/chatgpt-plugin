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
import { APTool } from '../utils/tools/APTool.js'
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

  // 抽取出来的处理 bym 逻辑的函数
  async handleBym(e) {
    let opt = {
      maxOutputTokens: 500,
      temperature: 1,
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
      opt.image = []; // 初始化一个数组来存储 base64 图像数据
      for (const image of imgs) {
        try {
          const response = await fetch(image);
          const arrayBuffer = await response.arrayBuffer();
          const base64Image = Buffer.from(arrayBuffer).toString('base64');
          opt.image.push(base64Image);
        } catch (error) {
          logger.error('Error fetching or converting image:', error);
          // 可以选择跳过当前图片或进行其他错误处理
        }
      }
      if (opt.image.length > 0) {
        e.msg = `[共${opt.image.length}张图片] ${e.msg || ''}`.trim(); // 更新消息内容，告知模型图片数量
      } else {
        delete opt.image; // 如果处理图片失败，移除 image 属性
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

    let chats = await getChatHistoryGroup(e, 50)
    opt.system = `你的名字是“${Config.assistantLabel}”，你在一个qq群里，群号是${group}。当前和你说话的人群名片是${card}，QQ号是${sender}。请结合群友的发言和之前的聊天记录以及图片内容来回应，记住要像你一样参与到群聊中。
    ${opt.image && opt.image.length > 0 ? `你收到了 ${opt.image.length} 张图片，请根据图片内容进行回应。` : ''}

    **你擅长做的事情包括：**
    - 分享有趣的图片、视频和音乐。
    - 在网上搜索信息来帮助群友。
    - 提供一些好玩的主意或建议。
    - 解答问题，但你的语气要自然随意。

    **请注意以下几点：**
    - **你的目标**：你的回复要像真人一样，有趣但不要太闹。
    - **使用工具**：当需要找东西时，你可以假装是自己找到的，但实际上你会用工具。你不会只发文字，你会去用工具找到内容再分享。
    - **语言**：你总是说中文。
    - **简洁**：如果不知道说什么，你可以复读群友说的话，就像你也在参与一样。
    - 如果现在不需要你说话，你可以回复 "<EMPTY>"。` +
      candidate +
      '以下是之前的聊天记录:' + chats
        .map(chat => {
          let sender = chat.sender || chat || {}
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
        .join('\n') +
      `\n记住你是“${Config.assistantLabel}”，用自然的语气来和群友对话，不要模仿聊天记录的格式。`;

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
      new APTool(),
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