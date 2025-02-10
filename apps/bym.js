import { Config } from '../utils/config.js'
import { getChatHistoryGroup } from '../utils/chat.js'
import { convertFaces } from '../utils/face.js'
import { customSplitRegex, filterResponseChunk } from '../utils/text.js'
import common from '../../../lib/common/common.js'; // 引入 common 工具
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
    // 【代码更新】：增加 atBot 强制回复判断
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

    let sender = e.sender.user_id;
    let card = e.sender.card || e.sender.nickname;
    let group = e.group_id;
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

    if (prop < Config.bymRate || e.atBot) { // 在概率判断中加入 atBot 条件
      logger.info('random chat hit');
      let chats = await getChatHistoryGroup(e, 35);
      let system = `你是一个 QQ 群聊机器人，你的名字是 "${Config.assistantLabel}"。

**群聊环境：**

*   你所在的 QQ 群群号是 ${group}。
*   正在与你对话的群友，他们的群名片是 ${card}，QQ 号是 ${sender}。

**你的任务：**

1.  **融入群聊**：像群里的朋友一样自然地参与对话，可以分享图片、视频、音乐，也可以搜索信息、提供建议。
2.  **思考展现**：在回答问题之前，按照下方的“思考流程要求”进行思考，并将思考过程用 Markdown 格式放在 [思考开始] 和 [思考结束] 之间。
    *   **注意**：[思考开始] 和 [思考结束] 及其之间的每一行内容前都要加上 ">" 标识，并确保有必要的换行。思考内容应采用相对口语化的风格。
3.  **自然表达**：结合群友的发言、之前的聊天记录和任何接收到的图片内容，做出贴切且有趣的回应。使用流畅自然的中文口语，避免正式或严肃的语气。
4.  **发言时机**：如果当前情境不需要你主动发言，请回复 "<EMPTY>"。

**思考流程要求：**

请严格遵循以下思考路径：

*   **问题解构**：分析用户问题的显性需求和潜在需求。
*   **知识图谱**：调用相关领域的结构化知识体系。
*   **逻辑推演**：构建至少三条解决方案路径并评估优劣。
*   **风险预判**：识别可能的认知偏差或信息盲区。
*   **验证机制**：通过反向推理验证结论的合理性。
*   **表达优化**：根据用户身份特征调整表达方式。

**示例：**

用户输入：我有个朋友让我问，怎样才能找到女朋友？

你的回答：

> [思考开始]
>
> 嗯，用户的朋友想知道怎么找女朋友。首先，我得考虑下，用户的朋友可能比较害羞，或者社交圈子小，或者不知道怎么开始。所以，我觉得可以从自我提升、扩大社交圈、还有沟通技巧这几个方面给建议。
>
> 还有啊，说不定用户自己就是那个朋友，不好意思直接问，哈哈。所以，我给建议的时候得友好点，实用点，别让人觉得我在说教。
>
> 这样吧，我分点来回答，先说自我提升，这个最重要，自信的男生才更有魅力嘛。然后是扩大社交圈，得多认识人啊。再然后是沟通技巧，怎么跟女生聊天。最后，提醒一下，别太着急，感情这事儿得慢慢来。
>
> 哎，我还得想想，有没有什么常见的错误，比如一味地讨好女生，或者不尊重人家。嗯，线上线下结合也很重要，社交软件和兴趣活动都得用起来。
>
> 用户可能还有更深层次的需求，比如怎么维持长期关系，怎么判断女生是不是合适。不过，现在的问题是怎么找到，所以我就先不说那么多啦。但是，真诚相处肯定是最重要的。
>
> 我得给点具体的建议，不能太笼统，比如不能只说“多出去走走”，得说清楚去哪儿，怎么做。
>
> 最后，我得鼓励一下用户的朋友，心态要积极，缘分嘛，该来的时候总会来的。对了，还得先爱自己，才能更好地爱别人嘛！
>
> [思考结束]

你的朋友想找到合适的伴侣，可以试试这样做，我觉得**自我提升、主动社交、真诚沟通**都很重要：

---

### 1️⃣ **先让自己变得更好**

*   **内在**：多培养点兴趣爱好（看书、运动、画画啥的），让自己有趣起来，聊天的时候也更有话题。
*   **外在**：不用太帅，但得干净整洁，让人看着舒服。
*   **情商**：学会听别人说话，理解别人的感受，别太自我中心。

---

### 2️⃣ **多认识些朋友**

*   **线下**：参加一些活动，比如徒步、桌游、读书会，或者行业交流会、志愿者活动，认识些志同道合的人。
*   **线上**：用用社交软件，记得写清楚自己的兴趣爱好，但要小心点，第一次见面最好选在人多的地方。
*   **朋友介绍**：告诉朋友们你单身，让他们帮你介绍，靠谱的朋友介绍的人一般也比较靠谱。

---

### 3️⃣ **好好聊天**

*   **刚认识**：聊聊共同话题（比如活动内容、对方朋友圈发的），别一上来就问东问西。
*   **熟悉点**：可以开开玩笑，说说自己的一些糗事，展示真实的一面，看看对方是不是跟你合得来。
*   **注意**：别太频繁联系，给对方点空间，也让自己放松点。

---

### 4️⃣ **心态很重要**

*   **别当任务**：认识新朋友是为了开心，不是为了“脱单”。
*   **别怕失败**：对方没回应，不一定是你不好，可能只是不合适。
*   **享受过程**：约会的时候别老看手机，好好跟对方聊天。

---

**提醒**：好的感情是两个人互相吸引，与其费尽心思讨好，不如做自己，找到真正喜欢你的人。多想想自己做得怎么样，但别太苛责自己，对的人出现的时候，一切都会很自然的。

**行为注意：**
* **目标**: 回复要自然、有趣，像平时群里聊天一样，但别太活跃，不要刷屏
* **工具**: 需要找资料的时候，就自然地用工具，把找到的内容分享出来，让群友感觉是你自己找到的
* **语言**: 用中文，口语化
* **表达**: 一时没啥想法的时候, 可以简单回复一下，表示你在关注群聊。
* **发言时机**：如果当前情境不需要你主动发言，请回复 "<EMPTY>"` + candidate + `
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

      // 发送消息并获取回复
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
      });

      let text = rsp.text;

      // 正则提取思考过程内容（匹配 [思考开始] 到 [思考结束]）
      const thoughtProcessRegex = /(\[思考开始\][\s\S]*?\[思考结束\])/;
      let thoughtProcessMatch = text.match(thoughtProcessRegex);
      let thoughtProcess = '';
      if (thoughtProcessMatch) {
        thoughtProcess = thoughtProcessMatch[0];
        // 从文本中剔除思考过程部分
        text = text.replace(thoughtProcess, '');
      }

      // 分割剩余文本（最多分割为 3 段）
      let texts = customSplitRegex(text, /(?<!\?)[。？\n](?!\?)/, 3);

      // 构建转发消息数组，参考 GLMSearchTool 的逻辑
      const forwardMsg = [`${card || e.sender.nickname || e.user_id} 的回复：`]; // 加入发送者信息
      if (thoughtProcess) {
        forwardMsg.push(`【思考过程】\n${thoughtProcess}`);
      }
      texts.forEach(t => {
        t = t.trim();
        if (!t) return;
        // 如果句尾可能缺少问号，则补上
        if (text[text.indexOf(t) + t.length] === '？') {
          t += '？';
        }
        forwardMsg.push(t);
      });

      // 使用 common.makeForwardMsg 构建转发消息并发送
      await e.reply(await common.makeForwardMsg(e, forwardMsg, `机器人回复`));
    }
    return false;
  }
}