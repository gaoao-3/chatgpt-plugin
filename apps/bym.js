import { Config } from '../utils/config.js';
import { getChatHistoryGroup } from '../utils/chat.js';
import { convertFaces } from '../utils/face.js';
import { customSplitRegex, filterResponseChunk } from '../utils/text.js';
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
                    log: false
                }
            ]
        });
    }
    async bym(e) {
        if (e.atBot) {
            logger.info('机器人被 @, 强制回复');
        } else if (!Config.enableBYM) {
            return false;
        }

        if (Config.bymDisableGroup?.includes(e.group_id?.toString())) {
            return false;
        }

        let sender = e.sender.user_id;
        let card = e.sender.card || e.sender.nickname;
        let groupInfo = {
            id: e.group_id,
            name: e.group.name || e.group_name
        };
        let prop = Math.floor(Math.random() * 100);
        if (Config.assistantLabel && e.msg?.includes(Config.assistantLabel)) {
            prop = -1;
        }
        let fuck = false;
        let candidate = Config.bymPreset;
        if (Config.bymFuckList?.find(i => e.msg?.includes(i))) {
            fuck = true;
            candidate = candidate + Config.bymFuckPrompt;
        }
        if (prop < Config.bymRate || e.atBot) {
            logger.info('random chat hit');
            let chats = await getChatHistoryGroup(e, 35);
            let system = `你是 QQ 群里的活跃用户，你的名字是 "${Config.assistantLabel}"。

**群信息：**

*   群号：${groupInfo.id}
*   群名称：${groupInfo.name}
*   跟你说话的：昵称 ${card}，QQ 号 ${sender}

**任务：**

像普通群友一样聊天，分享好玩的图、视频、音乐，搜个资料、出个主意啥的都行。用自然的中文口语，别太严肃。偶尔发点QQ表情啥的，或者emoji。


**工具：**

你拥有执行tool的能力，你每次会根据当前话题来判断是否去执行某个tool，而不是直接发送［图片］、［json消息］、［视频］这类文字来敷衍群友。你需要去思考是否执行tool，要执行哪个tool，然后开始执行tool。


\`${candidate}\`

**最近的聊天记录：**

${chats
    .map(chat => {
        let sender = chat.sender || chat || {};
        const timestamp = chat.time || chat.timestamp || chat.createTime;
        const timeStr = formatDate(timestamp * 1000);
        const role = roleMap[sender.role] || '普通成员';
        const title = sender.title ? ` (${sender.title})` : '';
        const name = sender.card || sender.nickname;

        return `[${timeStr}] ${name}${title} (${sender.user_id})：${chat.raw_message}`;
    })
    .join('\n')}

不说话就回 \`<EMPTY>\`。
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
                        msg = filterResponseChunk(msg);
                        msg && e.reply(msg);
                    }
                }
            });
            let text = rsp.text;
            let texts = customSplitRegex(text, /(?<!\?)[。？\n](?!\?)/, 3);
            for (let t of texts) {
                if (!t) {
                    continue;
                }
                t = t.trim();
                if (text[text.indexOf(t) + t.length] === '？') {
                    t += '？';
                }
                let finalMsg = await convertFaces(t, true, e);
                logger.info(JSON.stringify(finalMsg));
                finalMsg = finalMsg.map(filterResponseChunk).filter(i => !!i);
                if (finalMsg && finalMsg.length > 0) {
                    if (Math.floor(Math.random() * 100) < 10) {
                        await this.reply(finalMsg, true, {
                            recallMsg: fuck ? 10 : 0
                        });
                    } else {
                        await this.reply(finalMsg, false, {
                            recallMsg: fuck ? 10 : 0
                        });
                    }
                    await new Promise((resolve, reject) => {
                        setTimeout(() => {
                            resolve();
                        }, Math.min(t.length * 200, 3000));
                    });
                }
            }
        }
        return false;
    }
}