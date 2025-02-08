import { AbstractTool } from './AbstractTool.js'
import { ChatGPTAPI } from '../openai/chatgpt-api.js'
import { Config } from '../config.js'
import fetch from 'node-fetch'
import proxy from 'https-proxy-agent'
import { getMaxModelTokens } from '../common.js'
import { ChatGPTPuppeteer } from '../browser.js'
import { CustomGoogleGeminiClient } from '../../client/CustomGoogleGeminiClient.js'

export class WebsiteTool extends AbstractTool {
  name = 'website'

  parameters = {
    properties: {
      url: {
        type: 'string',
        description: '要访问的网站网址'
      }
    },
    required: ['url']
  }

  func = async function (opts) {
    let { url, mode, e } = opts
    let browser

    try {
      let text = await this.fetchPageContent(url)
      text = this.cleanHtmlContent(text)

      if (mode === 'gemini') {
        return this.processWithGemini(text, e)
      } else {
        return this.processWithGPT(text)
      }
    } catch (err) {
      return `访问网站失败，错误：${err.toString()}`
    } finally {
      if (browser) {
        try {
          await browser.close()
        } catch (err) {
          // 忽略关闭时的错误
        }
      }
    }
  }

  // 获取页面内容
  fetchPageContent = async (url) => {
    let browser
    let origin = false
    if (!Config.headless) {
      Config.headless = true
      origin = true
    }

    let ppt = new ChatGPTPuppeteer()
    browser = await ppt.getBrowser()
    let page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle2' })
    let text = await page.content()
    await page.close()

    if (origin) {
      Config.headless = false
    }

    return text
  }

  // 清理HTML内容，去除不需要的标签和元素
  cleanHtmlContent = (text) => {
    return text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
      .replace(/<figure\b[^<]*(?:(?!<\/figure>)<[^<]*)*<\/figure>/gi, '')
      .replace(/<path\b[^<]*(?:(?!<\/path>)<[^<]*)*<\/path>/gi, '')
      .replace(/<video\b[^<]*(?:(?!<\/video>)<[^<]*)*<\/video>/gi, '')
      .replace(/<audio\b[^<]*(?:(?!<\/audio>)<[^<]*)*<\/audio>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/gi, '')  // 去除注释
      .replace(/<(?!\/?(title|ul|li|td|tr|thead|tbody|blockquote|h[1-6]|H[1-6])[^>]*)\w+\s+[^>]*>/gi, '') // 去除不常用标签
      .replace(/<(\w+)(\s[^>]*)?>/gi, '<$1>') // 去除标签属性
      .replace(/<\/(?!\/?(title|ul|li|td|tr|thead|tbody|blockquote|h[1-6]|H[1-6])[^>]*)[a-z][a-z0-9]*>/gi, '') // 去除不常用结束标签
      .replace(/[\n\r]/gi, '')  // 去除回车换行
      .replace(/\s{2}/g, ' ')  // 多个空格只保留一个空格
      .replace('<!DOCTYPE html>', '')  // 去除<!DOCTYPE>声明
  }

  // 使用 Gemini 处理网页内容
  processWithGemini = async (text, e) => {
    let client = new CustomGoogleGeminiClient({
      e,
      userId: e?.sender?.user_id,
      key: Config.getGeminiKey(),
      model: Config.geminiModel,
      baseUrl: Config.geminiBaseUrl,
      debug: Config.debug
    })

    const response = await client.sendMessage(`去除与主体内容无关的部分，从中整理出主体内容并转换成md格式，不需要主观描述性的语言与冗余的空白行。${text}`)
    let htmlContentSummary = response.text
    return `网站主体内容如下：\n ${htmlContentSummary}`
  }

  // 使用 GPT 处理网页内容
  processWithGPT = async (text) => {
    let maxModelTokens = getMaxModelTokens(Config.model)
    text = text.slice(0, Math.min(text.length, maxModelTokens - 1600))

    const completionParams = { model: 'gpt-3.5-turbo-16k' }
    const api = new ChatGPTAPI({
      apiBaseUrl: Config.openAiBaseUrl,
      apiKey: Config.apiKey,
      debug: false,
      completionParams,
      fetch: this.createFetchFunction(),
      maxModelTokens
    })

    const response = await api.sendMessage(`去除与主体内容无关的部分，从中整理出主体内容并转换成md格式，不需要主观描述性的语言与冗余的空白行。${text}`, { completionParams })
    let htmlContentSummary = response.text
    return `网站主体内容如下：\n ${htmlContentSummary}`
  }

  // 创建 fetch 函数，支持代理
  createFetchFunction = () => {
    return (url, options = {}) => {
      const defaultOptions = Config.proxy
        ? { agent: proxy(Config.proxy) }
        : {}

      const mergedOptions = { ...defaultOptions, ...options }
      return fetch(url, mergedOptions)
    }
  }

  description = '当你需要通过 URL 访问网站时非常有用'
}