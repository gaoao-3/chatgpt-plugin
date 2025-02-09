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
        description: 'The URL of the website to visit'
      }
    },
    required: ['url']
  }

  func = async function (opts) {
    const { url, mode, e } = opts
    let browser

    try {
      // Fetch and clean the HTML content of the webpage
      let text = await this.fetchPageContent(url)
      text = this.cleanHtmlContent(text)

      // Depending on the mode, process with either Gemini or GPT
      if (mode === 'gemini') {
        return await this.processWithGemini(text, e)
      } else {
        return await this.processWithGPT(text)
      }
    } catch (err) {
      // Error handling with detailed message
      return `Failed to access the website, error: ${err.toString()}`
    } finally {
      // Ensure browser is closed
      if (browser) {
        try {
          await browser.close()
        } catch (err) {
          // Ignore any error during browser close
        }
      }
    }
  }

  // Fetch webpage content with Puppeteer
  fetchPageContent = async (url) => {
    let browser
    let origin = false

    if (!Config.headless) {
      Config.headless = true
      origin = true
    }

    // Reuse Puppeteer browser instance
    const ppt = new ChatGPTPuppeteer()
    browser = await ppt.getBrowser()

    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'networkidle2' })
      let text = await page.content()
      await page.close()

      return text
    } catch (err) {
      logger.error(`Error fetching content from ${url}: ${err.message}`)
      return ''
    }
  }

  // Clean up the HTML content by removing unnecessary tags and elements
  cleanHtmlContent = (text) => {
    return text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
      .replace(/<figure\b[^<]*(?:(?!<\/figure>)<[^<]*)*<\/figure>/gi, '')
      .replace(/<path\b[^<]*(?:(?!<\/path>)<[^<]*)*<\/path>/gi, '')
      .replace(/<video\b[^<]*(?:(?!<\/video>)<[^<]*)*<\/video>/gi, '')
      .replace(/<audio\b[^<]*(?:(?!<\/audio>)<[^<]*)*<\/audio>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/gi, '')  // Remove comments
      .replace(/<(?!\/?(title|ul|li|td|tr|thead|tbody|blockquote|h[1-6]|H[1-6])[^>]*)\w+\s+[^>]*>/gi, '') // Remove uncommon tags
      .replace(/<(\w+)(\s[^>]*)?>/gi, '<$1>') // Remove tag attributes
      .replace(/<\/(?!\/?(title|ul|li|td|tr|thead|tbody|blockquote|h[1-6]|H[1-6])[^>]*)[a-z][a-z0-9]*>/gi, '') // Remove uncommon closing tags
      .replace(/[\n\r]/gi, '')  // Remove line breaks
      .replace(/\s{2}/g, ' ')  // Keep only a single space for multiple spaces
      .replace('<!DOCTYPE html>', '')  // Remove <!DOCTYPE> declaration
  }

  // Process webpage content using Gemini
  processWithGemini = async (text, e) => {
    const client = new CustomGoogleGeminiClient({
      e,
      userId: e?.sender?.user_id,
      key: Config.getGeminiKey(),
      model: Config.geminiModel,
      baseUrl: Config.geminiBaseUrl,
      debug: Config.debug
    })

    try {
      const response = await client.sendMessage(`Remove irrelevant content, extract the main content, and convert it to MD format. Avoid subjective language and redundant blank lines. ${text}`)
      const htmlContentSummary = response.text
      return `Main content of the website:\n${htmlContentSummary}`
    } catch (err) {
      logger.error(`Error processing content with Gemini: ${err.message}`)
      return `Error processing content with Gemini: ${err.message}`
    }
  }

  // Process webpage content using GPT-3
  processWithGPT = async (text) => {
    const maxModelTokens = getMaxModelTokens(Config.model)
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

    try {
      const response = await api.sendMessage(`Remove irrelevant content, extract the main content, and convert it to MD format. Avoid subjective language and redundant blank lines. ${text}`, { completionParams })
      const htmlContentSummary = response.text
      return `Main content of the website:\n${htmlContentSummary}`
    } catch (err) {
      logger.error(`Error processing content with GPT: ${err.message}`)
      return `Error processing content with GPT: ${err.message}`
    }
  }

  // Create a fetch function that supports proxy if configured
  createFetchFunction = () => {
    return (url, options = {}) => {
      const defaultOptions = Config.proxy
        ? { agent: proxy(Config.proxy) }
        : {}

      const mergedOptions = { ...defaultOptions, ...options }
      return fetch(url, mergedOptions)
    }
  }

  description = 'Useful when you need to access a website via URL'
}