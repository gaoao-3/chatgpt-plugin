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
const PRESETS = [ // 预设配置
  { id: 'hina1', prompt_text: 'どこかに座って...練習したいところだけど...' },
  { id: 'hina2', prompt_text: '突然のパーティーだなんて、本当に、一体何を考えているのかしら...' },
  { id: 'hina3', prompt_text: 'こんな騒動、ゲヘナでは日常茶飯事なんだけどね。' },
  { id: 'hina4', prompt_text: 'こんなに続けてるのにまだ終わらないのねー。' },
  { id: 'hina5', prompt_text: '仕事の手を抜くつもりはないよ。私は、ゲヘナの風紀委員長だから。' },
  { id: 'hina6', prompt_text: 'これを、私に...？ありがとう、せんせい...' }, // “老师”已替换为“せんせい”
  { id: 'hina7', prompt_text: 'あ、いや...あの時は...ふ...二人きりじゃなかったから...' },
  { id: 'hina8', prompt_text: 'このまま、披露できなかったら...絶対後悔しそうだったから...' },
];

// 需要替换的名词及其对应的假名
const NOUN_MAPPING = {
  '老师': 'せんせい',
  // 可以在这里添加更多需要替换的名词
};

// 下载文件函数
const downloadFile = async (url, filepath, headers = {}, retries = 3) => {
  while (retries > 0) {
    try {
      const response = await fetch(url, { headers, timeout: 20000 });
      if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      await streamPipeline(response.body, fs.createWriteStream(filepath));
      return filepath;
    } catch (error) {
      console.error(`下载文件失败，剩余重试次数：${retries - 1}`, error);
      retries -= 1;
      if (retries === 0) throw error;
    }
  }
};

// 随机选择一个预设
const getRandomPreset = () => {
  const randomIndex = Math.floor(Math.random() * PRESETS.length);
  const randomEntry = PRESETS[randomIndex];
  console.log(`随机选择的预设参数：id=${randomEntry.id}, prompt_text=${randomEntry.prompt_text}`);
  return randomEntry;
};

// 将文本中的特定名词替换为假名
const replaceNounsWithKana = (text) => {
  let replacedText = text;
  for (const [noun, kana] of Object.entries(NOUN_MAPPING)) {
    replacedText = replacedText.replace(new RegExp(noun, 'g'), kana);
  }
  console.log(`替换前: ${text} -> 替换后: ${replacedText}`);
  return replacedText;
};

export class HinaVoiceTool extends AbstractTool { // 类名更改为 HinaVoiceTool
  name = 'HinaVoice'; // 工具名称更改为 HinaVoice

  parameters = {
    properties: {
      text: {
        type: 'string',
        description: 'The text to be converted to speech. **Please use Japanese.** Certain nouns will be replaced with their corresponding kana.',
      },
      preset: {
        type: 'string',
        description: 'The preset to be used for TTS. If not provided, a random preset will be selected.',
      },
    },
    required: ['text'],
  };

  constructor() {
    super();
    // 可以在构造函数中进行一些初始化操作，例如检查 TTS 服务是否可用
  }

  func = async function (opt, e) {
    let { text, preset } = opt;
    if (!text) {
      return 'Text parameter is required.';
    }

    if (!preset) {
      const randomPreset = getRandomPreset();
      preset = randomPreset.id;
    }

    // 查找预设对应的 prompt_text
    const presetObj = PRESETS.find((p) => p.id === preset);
    const prompt_text = presetObj ? replaceNounsWithKana(presetObj.prompt_text) : ''; // 对 prompt_text 进行名词替换

    // 将文本中的特定名词替换为假名
    const processedText = replaceNounsWithKana(text);

    // 使用更新后的 URL 和参数
    const url = `${TTS_SERVICE_URL}?id=0&prompt_lang=ja&prompt_text=${encodeURIComponent(prompt_text)}&preset=${preset}&text=${encodeURIComponent(processedText)}`;
    console.log('生成语音的URL:', url);

    let audioFilePath;

    try {
      audioFilePath = path.join(__dirname, `${Date.now()}.wav`);
      await downloadFile(url, audioFilePath);

      if (!fs.existsSync(audioFilePath) || fs.statSync(audioFilePath).size === 0) {
        console.error('下载的音频文件为空或不存在:', audioFilePath);
        return '下载的音频文件有问题，请重试。';
      }

      const audioData = fs.readFileSync(audioFilePath);
      const audioBase64 = audioData.toString('base64');

      const audioSegment = segment.record(`base64://${audioBase64}`);

      // 直接发送语音消息
      if (e.isGroup) {
        await e.reply(audioSegment);
      } else {
        await e.friend.sendMsg(audioSegment);
      }

      return '语音消息已发送';
    } catch (error) {
      console.error('TTS 请求或文件处理失败:', error);
      return '发生错误，请检查日志。';
    } finally {
      if (audioFilePath && fs.existsSync(audioFilePath)) {
        try {
          fs.unlinkSync(audioFilePath);
        } catch (err) {
          console.error('删除临时文件失败:', err);
        }
      }
    }
  };

  description = 'Generates speech from text using AI TTS technology. **Please provide text in Japanese.** Certain nouns will be automatically converted to their corresponding kana. For example, "老师" will be converted to "せんせい".';
}