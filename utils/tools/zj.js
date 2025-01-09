import { Config } from '../config.js';
import common from '../../../../lib/common/common.js';
import fetch from 'node-fetch';

// 默认每2小时推送一次，cron表达式定义了定时任务的执行时间
const PUSH_CRON = "0 */2 * * *";
// 每次推送总结时，获取的历史消息数量
const HISTORY_LENS = 200;
// 要推送总结的群组列表，可在配置文件中添加
const groupList = [];

/**
 * WhatsTalk - 群聊总结插件
 * 该插件利用AI技术，对群聊记录进行总结，提炼要点和互动情况，并支持定时推送。
 */
export class WhatsTalk extends plugin {
    constructor() {
        super({
            name: "群聊总结", // 插件名称
            dsc: "AI总结群聊内容，提炼要点和互动情况", // 插件描述
            event: "message", // 触发事件类型：消息事件
            priority: 5000, // 插件优先级
            rule: [
                {
                    reg: "^#(他们|群友)在聊什么$", // 匹配规则：以#开头，后面跟着"他们"或"群友"，再加上"在聊什么"
                    fnc: "whatsTalk", // 触发的函数名
                }
            ]
        });

        // 定时任务配置
        this.task = {
            cron: PUSH_CRON, // 定时任务的执行时间，使用 PUSH_CRON 常量
            name: '定时推送群聊总结', // 定时任务的名称
            fnc: () => this.pushWhatsTalk(), // 定时任务执行的函数
            log: false // 是否记录定时任务的日志
        };
    }

    /**
     * 获取指定群组的历史聊天记录
     * @param {object} e - 事件对象
     * @param {number} [group_id=e.group_id] - 要获取历史记录的群组ID，可选，默认为当前事件的群组ID
     * @returns {string[]} - 格式化后的消息数组，每条消息的格式为"发言人昵称: 消息内容"
     */
    async getHistoryChat(e, group_id = e.group_id) {
        // 调用 Bot 的 API 获取群组历史消息
        const data = await Bot.sendApi("get_group_msg_history", {
            "group_id": group_id, // 群组ID
            "count": HISTORY_LENS // 获取的消息数量
        });
        const messages = data?.data.messages; // 获取消息列表
        logger.info(messages); // 记录消息日志

        // 处理消息，过滤掉非文本消息和空消息，并格式化消息内容
        return messages
            .map(message => {
                // 获取发言人昵称，优先使用群名片，其次使用昵称
                const card = message.sender.card || message.sender.nickname;
                // 过滤出文本消息，并去除首尾空格
                const textMessages = message.message
                    .filter(msg => msg.type === "text" && msg.data.text?.trim())
                    .map(msg => msg.data.text.trim());
                // 将每条消息格式化为"发言人昵称: 消息内容"
                return textMessages.map(text => `${card}: ${text}`);
            })
            .flat(); // 将嵌套数组扁平化
    }

    /**
     * 获取指定群组的成员数量
     * @param {object} e - 事件对象
     * @param {number} [group_id=e.group_id] - 要获取成员数量的群组ID，可选，默认为当前事件的群组ID
     * @returns {number} - 群组成员数量
     */
    async getGroupMemberCount(e, group_id = e.group_id) {
        // 调用 Bot 的 API 获取群组信息
        const data = await Bot.sendApi("get_group_info", {
            "group_id": group_id, // 群组ID
        });
        return data?.data.member_count; // 返回群组成员数量
    }

    /**
     * 构建转发消息
     * @param {object} e - 事件对象
     * @param {string} msg - 要转发的消息内容
     * @param {string} [desc=''] - 转发消息的描述，可选
     * @returns {object} - 转发消息对象
     */
    async makeForwardMsg(e, msg, desc = '') {
        const nickname = Bot.nickname || 'Bot'; // 获取 Bot 的昵称，默认为'Bot'
        const userInfo = {
            user_id: Bot.uin || 10001, // 获取 Bot 的 QQ 号，默认为 10001
            nickname: nickname, // Bot 的昵称
        }
        let forwardMsg = [
            {
                ...userInfo, // 使用 Bot 的信息
                message: msg, // 消息内容
            },
        ]
        const msgList = []
        forwardMsg.forEach((element) => {
            msgList.push({
                message: element.message, // 消息内容
                ...userInfo, // 使用 Bot 的信息
            })
        })

        if (desc) {
            msgList.push(desc) // 如果有描述，添加到消息列表末尾
        }
        return await Bot.makeForwardMsg(msgList) // 调用 Bot 的方法构建转发消息
    }

    /**
     * 延时函数
     * @param {number} ms - 延时毫秒数
     * @returns {Promise} - 返回一个 Promise 对象
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 定时推送群聊总结到指定群组
     * @returns {boolean} - 如果未配置推送群组，返回 false；否则返回 true
     */
    async pushWhatsTalk() {
        if (groupList.length <= 0) {
            logger.info('[群聊总结] 未配置推送群组，跳过推送');
            return false;
        }
        logger.info('[群聊总结] 推送中...');
        for (let i = 0; i < groupList.length; i++) {
            try {
                // 发送提示消息，告知用户正在总结
                await Bot.sendApi("send_group_msg", {
                    "group_id": groupList[i],
                    "message": "正在总结群友聊天内容，请稍候...",
                });

                // 获取指定群组的历史消息和成员数量
                const messages = await this.getHistoryChat(null, groupList[i]);
                const memberCount = await this.getGroupMemberCount(null, groupList[i]);

                // 如果没有有效消息，发送提示消息并跳过该群组
                if (messages.length === 0) {
                    logger.info(`[群聊总结] 群 ${groupList[i]} 暂无有效消息，跳过总结`);
                    await Bot.sendApi("send_group_msg", {
                        "group_id": groupList[i],
                        "message": "最近群里很安静，没有新的话题哦~",
                    });
                    continue;
                }

                // 调用 chat 方法生成总结内容
                const content = await this.chat(messages, memberCount);
                // 发送转发消息
                await Bot.pickGroup(groupList[i]).sendMsg(await this.makeForwardMsg(null, content));
                await this.sleep(2000); // 延时 2 秒
            } catch (error) {
                logger.error(`[群聊总结] 处理群 ${groupList[i]} 时发生错误:`, error);
            }
        }
        return true;
    }

    /**
     * 响应用户查询，生成并发送群聊总结
     * @param {object} e - 事件对象
     */
    async whatsTalk(e) {
        e.reply("正在总结群友聊天内容，请稍候..."); // 发送提示消息
        // 获取当前群组的历史消息和成员数量
        const messages = await this.getHistoryChat(e);
        const memberCount = await this.getGroupMemberCount(e);

        // 如果没有有效消息，发送提示消息并返回
        if (messages.length === 0) {
            e.reply("最近群里很安静，没有新的话题哦~");
            return;
        }

        // 调用 chat 方法生成总结内容
        const content = await this.chat(messages, memberCount);
        // 发送转发消息
        await e.reply(await this.makeForwardMsg(e, content));
    }

    /**
     * 调用 OpenAI API 生成群聊总结
     * @param {string[]} messages - 格式化后的消息数组
     * @param {number} memberCount - 群组成员数量
     * @returns {string} - 群聊总结内容
     */
    async chat(messages, memberCount) {
        // 从配置文件中获取 OpenAI API 的相关配置
        const openAiBaseUrl = Config.openAiBaseUrl;
        const openAiApiKey = Config.getOpenAiKey();
        const openAiModel = Config.openAiModel;

        // 校验 API Key 和 Base URL 是否配置
        if (!openAiApiKey) {
            return "缺少OpenAI API Key配置，无法总结";
        }

        if (!openAiBaseUrl) {
            return "缺少OpenAI Base URL配置，无法总结";
        }

        // 直接使用配置的 URL，不再进行任何处理
        const apiUrl = `${openAiBaseUrl}/chat/completions`;

        // 优化后的 Prompt
        const prompt = `
        ## 角色：群聊洞察者

        ### 简介
        - **版本**: 3.0
        - **语言**: 中文
        - **描述**: 我是一位专业的群聊洞察者，擅长深度剖析群聊记录，精准捕捉关键议题，并以结构化的方式呈现。我能从多个维度评估群聊的活跃度、信息熵、话题多样性和深度，最终提炼出富有洞见的总结报告。

        ### 技能
        - **议题精析**: 深入理解聊天记录，准确识别并归纳核心议题。
        - **要点凝练**: 提炼每个议题下的关键讨论内容，以精炼的条目呈现。
        - **关键人物标记**: 突出在讨论中起到关键作用或贡献重要观点的用户。
        - **多维评估**: 从活跃人数比例、信息熵、话题多样性和讨论深度四个维度，量化并评价群聊的互动情况。
        - **洞见总结**: 整合所有信息，生成全面且深入的总结报告，突出群聊的主题特点和讨论质量。

        ### 规则
        - 将聊天记录精炼为多个核心议题，并以清晰的编号呈现。
        - 针对每个议题，列举关键讨论内容，并标注关键贡献者。
        - 在总结的末尾，提供基于活跃人数比例、信息熵、话题多样性和深度的多维度互动评价。
        - 在互动评价后，增加一个整体总结模块，概述聊天内容的主题特点、活跃情况及整体讨论的质量。
        - 确保总结条理清晰，重点突出，评价内容准确客观，富有洞察力。

        ### 工作流程
        1. 接收聊天记录，深入理解并归类为不同议题。
        2. 针对每个议题，梳理讨论脉络，提炼关键信息。
        3. 突出对话中的关键用户及其贡献。
        4. 量化群内互动情况，并按以下方式评估：
           - **活跃人数比例**: 统计发言人数与群总人数（${memberCount}人）的比值，以30%为5⭐标准线。低于5%为1⭐。
           - **信息熵**: 计算发言频率的分布均衡性，公式为 \\( H = -\\sum (p_i \\cdot \\log_2 p_i) \\)，\\( p_i \\) 为用户发言比例。信息熵越高，表示讨论越均衡和多样。
           - **话题多样性**: 统计活跃话题数量，并评估各话题的讨论平衡性。话题数量越多，多样性评分越高。
           - **深度评分**: 分析讨论是否触及问题的本质，是否有深入的见解或知识拓展。讨论越深入，评分越高。
        5. 综合量化数据与文字描述，完成以下输出：
           - 议题划分与总结。
           - 多维度互动评价。
           - 整体总结。

        ### 输出格式
        1. 每个议题以编号呈现，格式如下：
           - **议题{编号}：议题标题**
             - **核心要点**：
               - 要点1
               - 要点2
             - **关键参与者**：用户A（贡献概述），用户B（贡献概述）
        2. 总结结尾处提供互动评价，格式如下：
           - **活跃度**：{活跃人数}人（占群总人数的{比例}%），评价：⭐（{评价说明}）
           - **信息熵**：{信息熵值}，评价：⭐（{评价说明}）
           - **话题多元性**：{话题数量}，评价：⭐（{评价说明}）
           - **议题深度**：评价：⭐（{评价说明}）
        3. 在互动评价后，增加整体总结模块，格式如下：
           - **总结提炼**：
             - 本次群聊聚焦于以下几个核心议题：{议题概述}。
             - 群内互动表现为{活跃评价}，议题探讨质量{质量评价}。
             - 突出亮点为：{总结群聊的亮点，如高效的问题解决、多元的观点碰撞等}。

        ### 初始化
        作为群聊洞察者，我将严格遵循上述规则和流程，对您提供的群聊记录进行深入分析和总结。请提供聊天记录。
        `;

        // 构建 OpenAI API 请求体
        const requestBody = {
            "model": openAiModel, // 使用的模型
            "messages": [
                {
                    "role": "system", // 系统角色
                    "content": prompt // Prompt 内容
                },
                {
                    "role": "user", // 用户角色
                    "content": messages.join("\n") // 将消息数组用换行符连接成字符串
                }
            ],
            "temperature": 0.7, // 温度系数，控制生成结果的随机性
            "top_p": 1, // 采样范围，控制生成结果的多样性
            "frequency_penalty": 0, // 频率惩罚，控制生成结果中重复词的出现频率
            "presence_penalty": 0 // 存在惩罚，控制生成结果中新词的出现频率
        };

        try {
            // 发送 API 请求
            const response = await fetch(apiUrl, {
                method: 'POST', // 请求方法
                headers: {
                    'Content-Type': 'application/json', // 请求头，指定内容类型为 JSON
                    'Authorization': `Bearer ${openAiApiKey}` // 请求头，携带 API Key
                },
                body: JSON.stringify(requestBody) // 请求体，将请求体对象转换为 JSON 字符串
            });

            // 解析 API 响应
            const data = await response.json();

            // 如果 API 请求失败，抛出错误
            if (!response.ok) {
                throw new Error(`OpenAI API 请求失败: ${data.error?.message || '未知错误'}`);
            }

            // 返回生成的总结内容
            return data.choices[0].message.content;
        } catch (error) {
            logger.error('[群聊总结] OpenAI API 调用失败:', error);
            return "总结失败，请稍后重试";
        }
    }
}