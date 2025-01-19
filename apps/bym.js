import plugin from '../../lib/plugins/plugin.js'
import { segment } from 'icqq'
import cfg from '../../lib/config/config.js'
import common from '../../lib/common/common.js'
import moment from 'moment'
import { CustomGoogleGeminiClient } from '../client/CustomGoogleGeminiClient.js'
import { Config } from '../utils/config.js' // 确保这里引用的是你的 Config
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
import { convertFaces, faceMap } from '../utils/face.js'
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

const path = process.cwd()

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
    constructor() {
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
        });
        this.on('notice.group.poke', this.handleGroupPoke);
    }

    async handleGroupPoke(e) {
        // **代码更新：检查戳戳回复开关**
        if (!Config.enablePokeReply) {
            return false;
        }

        logger.info('[戳一戳生效]')
        if (e.target_id == Bot.uin) { // 机器人被戳
            let count = await redis.get(`Mz:pokecount:${e.group_id}`);
            // ... (戳戳计数逻辑) ...

            // **代码更新：概率反击戳戳并触发 AI 回复**
            if (Math.random() < Config.pokeReplyRate) {
                await e.group.pokeMember(e.operator_id);
                await common.sleep(100);
                e.msg = '被戳了一下，反击！'; // 设置消息内容触发 AI 回复
                await this.handleBym(e);
                return; // 提前返回
            }

            // **代码更新：机器人被戳后触发 AI 回复**
            e.msg = '被戳了一下'; // 设置消息内容触发 AI 回复
            await this.handleBym(e);

        } else if (cfg.masterQQ.includes(e.target_id)) { // 主人被戳
            logger.info('主人被戳了！');
            e.msg = Config.bymFuckTrigger || '主人被戳了'; // 设置消息内容触发包含 "fuck" prompt 的 AI 回复
            await this.handleBym(e);
        }
    }

    /** 复读 */
    async bym(e) {
        if (!Config.enableBYM) {
            return false
        }

        // 处理 @Bot 的情况
        if (e.atBot) {
            logger.info('Bot was mentioned, proceeding with response.');
            await this.handleBym(e);
            return false;
        }

        // 处理引用自身消息的情况
        if (e.source && e.source.user_id === Bot.uin) {
            logger.info('Received a message quoting myself, proceeding with response.');
            await this.handleBym(e);
            return false;
        }

        let prop = Math.floor(Math.random() * 100)
        if (Config.assistantLabel && e.msg?.includes(Config.assistantLabel)) {
            prop = -1
        }
        if (prop < Config.bymRate) {
            logger.info('random chat hit')
            await this.handleBym(e);
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
                let image = imgs[0]
                const response = await fetch(image)
                const base64Image = Buffer.from(await response.arrayBuffer())
                opt.image = base64Image.toString('base64')
                e.msg = '[图片]'
            } else {
                return;
            }
        }
        if (!opt.image && imgs && imgs.length > 0) {
            let image = imgs[0]
            const response = await fetch(image)
            const base64Image = Buffer.from(await response.arrayBuffer())
            opt.image = base64Image.toString('base64')
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

        let chats = await getChatHistoryGroup(e, 20)
        opt.system = `你的名字是“${Config.assistantLabel}”，你在一个qq群里，群号是${group},当前和你说话的人群名片是${card}, qq号是${sender}, 请你结合用户的发言和聊天记录作出回应，要求表现得随性一点，最好参与讨论，混入其中。

    **你擅长做的事情包括：**
- 分享图片、视频、音乐、画图、发语音（你可以找到有趣的内容和大家分享）。
- 搜索信息（如果群友需要帮助，你可以查找并提供答案）。
- 提供一些有趣的想法或建议（比如活动推荐、闲聊互动）。
- 帮助解答疑问，但请以一种轻松自然的语气。

    **注意事项：**
- **聊天目标**：你的回复应像人类一样自然随意，有趣但不过分插科打诨。
- **工具使用**：当需要查找或分享内容时，你可以假装是自己找的，但实际上可以调用工具完成任务。禁止敷衍只发文字来敷衍别人，你必须去调用工具。
- **语言优先**：优先使用中文。
- **简练表达**：如果不知道说什么，可以���意复读群友的某句话，表现得像一个真实的参与者。
- 如果当前情况下不需要你说话，可以返回 "<EMPTY>"。` +
            candidate +
            '以下是聊天记录:' + chats
                .map(chat => {
                    let sender = chat.sender || chat || {}
                    const timestamp = chat.time || chat.timestamp || chat.createTime;
                    return `
\`\`\`
[${formatDate(new Date(timestamp * 1000))}] 【${sender.card || sender.nickname}】 (QQ: ${sender.user_id})
角色：${roleMap[sender.role] || '普通成员'} ${sender.title ? `头衔：${sender.title}` : ''}
内容：${chat.raw_message}
\`\`\`
`;
                })
                .join('\n') +
            `\n根据上面的群聊消息来进行第一人称对话，保留“${Config.assistantLabel}”的角色风格，不要附加任何奇怪的东西，不能模仿聊天记录的格式，禁止重复聊天记录。`

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