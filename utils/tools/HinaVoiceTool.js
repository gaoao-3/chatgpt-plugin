import { AbstractTool } from './AbstractTool.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { segment } from 'oicq';
import { fileURLToPath } from 'url';

const streamPipeline = promisify(pipeline);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 直接在代码中定义配置信息
const TTS_SERVICE_URL = 'http://127.0.0.1:23456/voice/gpt-sovits'; // TTS 服务地址
const PRESETS = [ // 预设配置，每个预设对应一个提示文本
  { id: 'hina1', prompt_text: 'どこかに座って...練習したいところだけど...' },
  { id: 'hina2', prompt_text: '突然のパーティーだなんて、本当に、一体何を考えているのかしら...' },
  { id: 'hina3', prompt_text: 'こんな騒動、ゲヘナでは日常茶飯事なんだけどね。' },
  { id: 'hina4', prompt_text: 'こんなに続けてるのにまだ終わらないのねー。' },
  { id: 'hina5', prompt_text: '仕事の手を抜くつもりはないよ。私は、ゲヘナの風紀委員長だから。' },
  { id: 'hina6', prompt_text: 'これを、私に...？ありがとう、せんせい...' },
  { id: 'hina7', prompt_text: 'あ、いや...あの時は...ふ...二人きりじゃなかったから...' },
  { id: 'hina8', prompt_text: 'このまま、披露できなかったら...絶対後悔しそうだったから...' },
];

// 需要替换的名词及其对应的假名
const NOUN_MAPPING = {
  '老师': 'せんせい',
  // 可以在这里添加更多需要替换的名词，例如人名
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
  const randomIndex = Math.floor(Math.random() * PRESETS.length);
  const randomEntry = PRESETS[randomIndex];
  console.log(`随机选择的预设参数：id=${randomEntry.id}, prompt_text=${randomEntry.prompt_text}`);
  return randomEntry;
};

/**
 * 将文本中的特定名词替换为假名
 * @param {string} text - 要替换的文本
 * @returns {string} - 返回替换后的文本
 */
const replaceNounsWithKana = (text) => {
  let replacedText = text;
  for (const [noun, kana] of Object.entries(NOUN_MAPPING)) {
    replacedText = replacedText.replace(new RegExp(noun, 'g'), kana);
  }
  console.log(`替换前: ${text} -> 替换后: ${replacedText}`);
  return replacedText;
};

export class HinaVoiceTool extends AbstractTool {
  name = 'HinaVoice'; // 工具名称

  // 工具参数定义
  parameters = {
    properties: {
      text: {
        type: 'string',
        description: '要转换为语音的文本。**请使用日语。**某些名词将被替换为其对应的假名。',
      },
      preset: {
        type: 'string',
        description: '用于 TTS 的预设。如果未提供，将随机选择一个预设。',
      },
    },
    required: ['text'], // 必填参数
  };

  constructor() {
    super();
    // 可以在构造函数中进行一些初始化操作，例如检查 TTS 服务是否可用
  }

  /**
   * 工具的主要功能函数
   * @param {object} opt - 包含用户输入的参数对象
   * @param {object} e - 包含事件信息的对象 (例如 oicq 的事件对象)
   * @returns {Promise<string>} - 返回处理结果或错误信息
   */
  func = async function (opt, e) {
    let { text, preset } = opt;
    if (!text) {
      return 'Text parameter is required.'; // 如果没有提供 text 参数，返回错误信息
    }

    // 优化 preset 选择逻辑
    if (!preset) {
      const randomPreset = getRandomPreset();
      preset = randomPreset.id;
      console.log(`未指定 preset，已随机选择：${preset}`);
    } else if (!PRESETS.find((p) => p.id === preset)) {
      console.warn(`指定的 preset "${preset}" 不存在，将随机选择一个预设`);
      const randomPreset = getRandomPreset();
      preset = randomPreset.id;
      console.log(`已随机选择 preset：${preset}`);
    } else {
      console.log(`已使用指定的 preset：${preset}`);
    }

    // 查找预设对应的 prompt_text
    const presetObj = PRESETS.find((p) => p.id === preset);
    const prompt_text = presetObj ? replaceNounsWithKana(presetObj.prompt_text) : '';

    // 将文本中的特定名词替换为假名
    const processedText = replaceNounsWithKana(text);

    // 使用更新后的 URL 和参数
    const url = `${TTS_SERVICE_URL}?id=0&prompt_lang=ja&prompt_text=${encodeURIComponent(prompt_text)}&preset=${preset}&text=${encodeURIComponent(processedText)}`;
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
      if (audioFilePath && fs.existsSync(audioFilePath)) {
        try {
          fs.unlinkSync(audioFilePath);
        } catch (err) {
          console.error('删除临时文件失败:', err);
        }
      }
    }
  };

  // 工具描述
  description = 'Generates speech from text using AI TTS technology. **Please provide text in Japanese.** Certain nouns, **especially names, should be provided in their corresponding kana**. For example, "老师" should be converted to "せんせい", and names should also be provided in kana.';
}