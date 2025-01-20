import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { segment } from 'oicq';
import { fileURLToPath } from 'url';
import { Config } from '../config.js';

const streamPipeline = promisify(pipeline);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 配置信息
const config = {
  TTS_SERVICE_URL: 'http://127.0.0.1:23456/voice/gpt-sovits', // TTS 服务地址
  AI_SERVICE_URL: 'YOUR_AI_TEXT_GENERATION_ENDPOINT', // **需要替换：你的 AI 文本生成服务地址**
  PRESETS: [ // 预设配置，每个预设对应一个提示文本
    { id: 'hina1', prompt_text: 'どこかに座って...練習したいところだけど...' },
    { id: 'hina2', prompt_text: '突然のパーティーだなんて、本当に、一体何を考えているのかしら...' },
    { id: 'hina3', prompt_text: 'こんな騒動、ゲヘナでは日常茶飯事なんだけどね。' },
    { id: 'hina4', prompt_text: 'こんなに続けてるのにまだ終わらないのねー。' },
    { id: 'hina5', prompt_text: '仕事の手を抜くつもりはないよ。私は、ゲヘナの風紀委員長だから。' },
    { id: 'hina6', prompt_text: 'これを、私に...？ありがとう、せんせい...' },
    { id: 'hina7', prompt_text: 'あ、いや...あの時は...ふ...二人きりじゃなかったから...' },
    { id: 'hina8', prompt_text: 'このまま、披露できなかったら...絶対後悔しそうだったから...' },
  ],
  NOUN_MAPPING: {
    '老师': 'せんせい',
    // 可以在这里添加更多需要替换的名词，例如人名
  },
};

/**
 * 下载文件函数
 * @param {string} url - 要下载的文件的 URL
 * @param {string} filepath - 文件保存路径
 * @param {object} headers - 请求头 (可选)
 * @param {number} retries - 重试次数 (默认 3 次)
 * @returns {Promise<string>} - 返回文件保存路径
 * @throws {Error} - 如果下载失败，抛出错误
 */
const downloadFile = async (url, filepath, headers = {}, retries = 3) => {
  while (retries > 0) {
    try {
      const response = await fetch(url, { headers, timeout: 30000 }); // 设置超时时间为 30 秒
      if (!response.ok) {
        console.error(`下载文件失败: ${response.status} ${response.statusText}`); // 记录 HTTP 错误信息
        console.error('下载失败的 URL:', url); // 记录下载失败的 URL
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }
      await streamPipeline(response.body, fs.createWriteStream(filepath));
      return filepath;
    } catch (error) {
      console.error(`下载文件失败，剩余重试次数：${retries - 1}`, error);
      retries -= 1;
      if (retries === 0) throw error;
    }
  }
};

/**
 * 随机选择一个预设
 * @returns {object} - 返回随机选择的预设对象
 */
const getRandomPreset = () => {
  const randomIndex = Math.floor(Math.random() * config.PRESETS.length);
  const randomEntry = config.PRESETS[randomIndex];
  console.log(`随机选择的预设：id=${randomEntry.id}, prompt_text=${randomEntry.prompt_text}`);
  return randomEntry;
};

/**
 * 将文本中的特定名词替换为假名
 * @param {string} text - 要替换的文本
 * @returns {string} - 返回替换后的文本
 */
const replaceNounsWithKana = (text) => {
  let replacedText = text;
  for (const [noun, kana] of Object.entries(config.NOUN_MAPPING)) {
    replacedText = replacedText.replace(new RegExp(noun, 'g'), kana);
  }
  console.log(`替换前: ${text} -> 替换后: ${replacedText}`);
  return replacedText;
};

/**
 * 调用 AI 服务生成文本
 * @param {string} prompt - 引导 AI 生成文本的提示
 * @returns {Promise<string>} - 返回 AI 生成的文本
 */
const generateText = async (prompt) => {
  try {
    const apiKey = Config.getGeminiKey();
    const apiBaseUrl = Config.geminiBaseUrl;
    const apiUrl = `${apiBaseUrl}/v1beta/models/gemini-pro:generateContent?key=${apiKey}`; // 假设使用 gemini-pro 生成，您可以根据需要调整

    if (!apiKey || !apiBaseUrl) {
      throw new Error('Gemini API 配置缺失');
    }

    const requestBody = {
      "contents": [{
        "parts": [{
          "text": prompt
        }],
        "role": "user"
      }]
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`AI 文本生成请求失败: ${data.error?.message || '未知错误'}`);
    }

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('AI 服务返回无效的文本');
    }

    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error('调用 AI 服务生成文本时发生错误:', error);
    throw error;
  }
};

/**
 * 使用 Gemini API 进行翻译 (指定模型为 gemini-2.0-flash-exp)
 * @param {string} text - 要翻译的文本
 * @returns {Promise<string>} - 翻译后的文本
 */
const translateToJapanese = async (text) => {
  const apiKey = Config.getGeminiKey();
  const apiBaseUrl = Config.geminiBaseUrl;
  const apiUrl = `${apiBaseUrl}/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`; // 指定使用 gemini-2.0-flash-exp 模型

  if (!apiKey || !apiBaseUrl) {
    throw new Error('Gemini API 配置缺失');
  }

  // 优化的 Prompt，指示翻译成日语并将名字翻译成假名
  const prompt = `请将以下文本翻译成日语。在翻译过程中，请务必将人名、地名等专有名词翻译成对应的片假名或平假名（日文假名）。

待翻译的文本：
\`\`\`
${text}
\`\`\`

翻译结果：`;

  const requestBody = {
    "contents": [{
      "parts": [{
        "text": prompt
      }],
      "role": "user"
    }]
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`API 翻译请求失败: ${data.error?.message || '未知错误'}`);
    }

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('无效的 API 翻译响应');
    }

    return data.candidates[0].content.parts[0].text.trim(); // 去除首尾空格
  } catch (error) {
    console.error('[HinaVoiceTool] API 翻译调用失败:', error);
    throw error;
  }
};

export class HinaVoiceTool extends AbstractTool {
  name = 'HinaVoice'; // 工具名称

  // 工具参数定义
  parameters = {
    properties: {
      aiPrompt: {
        type: 'string',
        description: '用于引导 AI 生成文本的提示。',
      },
    },
    required: ['aiPrompt'], // 必填参数
  };

  constructor() {
    super();
    // 可以在构造函数中进行一些初始化操作，例如检查 TTS 服务和 AI 服务是否可用
  }

  /**
   * 工具的主要功能函数
   * @param {object} opt - 包含用户输入的参数对象
   * @param {object} e - 包含事件信息的对象 (例如 oicq 的事件对象)
   * @returns {Promise<string>} - 返回处理结果或错误信息
   */
  func = async function (opt, e) {
    let { aiPrompt } = opt;
    if (!aiPrompt) {
      return 'aiPrompt parameter is required.'; // 如果没有提供 aiPrompt 参数，返回错误信息
    }

    let aiGeneratedText;
    try {
      aiGeneratedText = await generateText(aiPrompt);
      console.log('AI 生成的原始文本:', aiGeneratedText);
    } catch (error) {
      return '调用 AI 服务生成文本失败，请检查日志。';
    }

    let japaneseText = aiGeneratedText;
    // 尝试翻译成日语，这里没有明确判断是否为日语的步骤
    // 可以考虑添加语言检测的 API 调用，或者假设 AI 输出为非日语进行翻译
    try {
      const translatedText = await translateToJapanese(aiGeneratedText);
      console.log('翻译后的日语文本:', translatedText);
      japaneseText = translatedText;
    } catch (error) {
      console.error('翻译到日语失败，可能已经是日语:', error);
      // 如果翻译失败，则认为原始文本已经是日语
    }

    // 始终随机选择预设
    const randomPreset = getRandomPreset();
    const preset = randomPreset.id;
    console.log(`使用随机预设：${preset}`);

    // 查找预设对应的 prompt_text
    const presetObj = config.PRESETS.find((p) => p.id === preset);
    const prompt_text = presetObj ? replaceNounsWithKana(presetObj.prompt_text) : '';

    // 将文本中的特定名词替换为假名
    const processedText = replaceNounsWithKana(japaneseText);

    // 构建 URL
    const urlParams = new URLSearchParams({
      id: '0',
      prompt_lang: 'ja',
      prompt_text: prompt_text,
      preset: preset,
      text: processedText,
    });
    const url = `${config.TTS_SERVICE_URL}?${urlParams.toString()}`;
    console.log('生成语音的URL:', url); // 记录完整的 URL

    let audioFilePath; // 用于保存音频文件的路径

    try {
      // 下载音频文件
      audioFilePath = path.join(__dirname, `${Date.now()}.wav`);
      await downloadFile(url, audioFilePath);

      // 检查下载的音频文件是否存在且大小不为 0
      if (!fs.existsSync(audioFilePath) || fs.statSync(audioFilePath).size === 0) {
        console.error('下载的音频文件为空或不存在:', audioFilePath);
        return '下载的音频文件有问题，请重试。';
      }

      // 将音频文件转换为 base64 编码
      const audioData = fs.readFileSync(audioFilePath);
      const audioBase64 = audioData.toString('base64');

      // 创建 oicq 的音频消息段
      const audioSegment = segment.record(`base64://${audioBase64}`);

      // 根据消息来源类型发送音频消息
      if (e.isGroup) {
        // 如果是群聊消息，延迟500毫秒发送
        setTimeout(async () => {
          await e.reply(audioSegment);
        }, 500);
      } else {
        // 如果是私聊消息，直接发送
        await e.friend.sendMsg(audioSegment);
      }

      return '语音消息已发送';
    } catch (error) {
      console.error('TTS 请求或文件处理失败:', error);
      // 如果是下载失败，记录详细的错误信息
      if (error.message.startsWith('Failed to fetch')) {
        console.error('下载失败的 URL:', url);
      }
      return '发生错误，请检查日志。';
    } finally {
      // 删除临时音频文件
      if (audioFilePath) {
        try {
          fs.unlinkSync(audioFilePath);
        } catch (err) {
          console.error('删除临时文件失败:', err);
        }
      }
    }
  };

  // 工具描述
  description = 'AI 语音发送工具，输入用于引导 AI 生成文本的提示，AI 将生成文本，并尝试将其翻译成日语后转换为语音发送。文本中的部分名词会被替换为对应的假名。';
}