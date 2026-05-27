import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'

dotenv.config()

const envPath = path.resolve('.env')
const envExamplePath = path.resolve('.env.example')

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  dotenv.config({ path: envExamplePath, override: false })
}

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, 'dist')

const port = Number(process.env.PORT || 8787)
const defaultBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com'
const defaultGeneratePath = process.env.IMAGE_API_PATH || '/v1/images/generations'
const defaultEditPath = process.env.IMAGE_EDIT_PATH || '/v1/images/edits'
const defaultModel = process.env.IMAGE_MODEL || 'gpt-image-2'

app.use(express.json({ limit: '25mb' }))

app.get('/api/config', (request, response) => {
  const localIps = getLocalIpv4Addresses()

  response.json({
    defaults: {
      baseUrl: defaultBaseUrl,
      generatePath: defaultGeneratePath,
      editPath: defaultEditPath,
      model: defaultModel,
    },
    capabilities: {
      supportsEdits: true,
      supportsMasks: true,
      supportsReferences: true,
      maxFileMb: 25,
    },
    access: {
      devPort: 5173,
      previewPort: 4173,
      localIps,
    },
  })
})

app.post('/api/generate-image', async (request, response) => {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    response.status(500).json({
      error: '缺少 OPENAI_API_KEY。请先在 .env 或 .env.example 中配置你的 API Key。',
    })
    return
  }

  const {
    prompt,
    model,
    size,
    quality,
    background,
    moderation,
    outputFormat,
    n,
    baseUrl,
    generatePath,
    apiPath,
    extraBody,
  } = request.body || {}

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    response.status(400).json({ error: 'Prompt 不能为空。' })
    return
  }

  const extraPayload = parseExtraBody(extraBody, response)
  if (extraPayload === null) {
    return
  }

  const payload = cleanObject({
    model: model || defaultModel,
    prompt: prompt.trim(),
    size,
    quality,
    background,
    moderation,
    n: Number.isFinite(Number(n)) ? Number(n) : 1,
    output_format: outputFormat,
    ...extraPayload,
  })

  const endpoint = resolveEndpoint(
    baseUrl,
    generatePath || apiPath,
    defaultBaseUrl,
    defaultGeneratePath,
  )

  await forwardJsonRequest({
    response,
    endpoint,
    apiKey,
    payload,
    requestType: 'generate',
  })
})

app.post(
  '/api/edit-image',
  upload.fields([
    { name: 'imageFiles', maxCount: 8 },
    { name: 'maskFile', maxCount: 1 },
  ]),
  async (request, response) => {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      response.status(500).json({
        error: '缺少 OPENAI_API_KEY。请先在 .env 或 .env.example 中配置你的 API Key。',
      })
      return
    }

    const files = request.files || {}
    const imageFiles = files.imageFiles || []
    const maskFile = files.maskFile?.[0]

    if (imageFiles.length === 0) {
      response.status(400).json({ error: '请至少上传一张原图或参考图。' })
      return
    }

    const prompt = request.body.prompt
    if (!prompt || !prompt.trim()) {
      response.status(400).json({ error: '编辑模式同样需要填写 Prompt。' })
      return
    }

    const extraPayload = parseExtraBody(request.body.extraBody, response)
    if (extraPayload === null) {
      return
    }

    const endpoint = resolveEndpoint(
      request.body.baseUrl,
      request.body.editPath,
      defaultBaseUrl,
      defaultEditPath,
    )

    const formData = new FormData()
    formData.set('prompt', prompt.trim())
    formData.set('model', request.body.model || defaultModel)

    appendOptionalFormField(formData, 'size', request.body.size)
    appendOptionalFormField(formData, 'quality', request.body.quality)
    appendOptionalFormField(formData, 'background', request.body.background)
    appendOptionalFormField(formData, 'moderation', request.body.moderation)
    appendOptionalFormField(formData, 'output_format', request.body.outputFormat)
    appendOptionalFormField(formData, 'n', request.body.n)

    for (const [key, value] of Object.entries(extraPayload)) {
      appendFlexibleField(formData, key, value)
    }

    imageFiles.forEach((file, index) => {
      formData.append(
        'image[]',
        new Blob([file.buffer], { type: file.mimetype }),
        file.originalname || `reference-${index + 1}.png`,
      )
    })

    if (maskFile) {
      formData.set(
        'mask',
        new Blob([maskFile.buffer], { type: maskFile.mimetype }),
        maskFile.originalname || 'mask.png',
      )
    }

    await forwardMultipartRequest({
      response,
      endpoint,
      apiKey,
      formData,
      model: request.body.model || defaultModel,
      requestType: 'edit',
      outputFormat: request.body.outputFormat,
    })
  },
)

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))

  app.get(/^(?!\/api).*/, (request, response) => {
    response.sendFile(path.join(distDir, 'index.html'))
  })
}

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`GPT Image Studio server is running at http://localhost:${port}`)
  })
}

export default app

function parseExtraBody(extraBody, response) {
  if (!extraBody || typeof extraBody !== 'string' || !extraBody.trim()) {
    return {}
  }

  try {
    return JSON.parse(extraBody)
  } catch {
    response.status(400).json({
      error: '附加 JSON 参数格式不正确，请检查 extraBody。',
    })
    return null
  }
}

function resolveEndpoint(baseUrl, apiPath, fallbackBaseUrl, fallbackPath) {
  const normalizedBaseUrl = (baseUrl || fallbackBaseUrl).replace(/\/+$/, '')
  const pathValue = apiPath || fallbackPath
  const normalizedPath = pathValue.startsWith('/') ? pathValue : `/${pathValue}`

  return {
    baseUrl: normalizedBaseUrl,
    path: normalizedPath,
    url: `${normalizedBaseUrl}${normalizedPath}`,
  }
}

async function forwardJsonRequest({ response, endpoint, apiKey, payload, requestType }) {
  try {
    const upstream = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const rawText = await upstream.text()
    const result = safeJsonParse(rawText)

    await handleUpstreamResponse({
      response,
      upstream,
      result,
      model: payload.model,
      baseUrl: endpoint.baseUrl,
      requestType,
      outputFormat: payload.output_format,
    })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : '请求图片接口时发生未知错误。',
    })
  }
}

async function forwardMultipartRequest({
  response,
  endpoint,
  apiKey,
  formData,
  model,
  requestType,
  outputFormat,
}) {
  try {
    const upstream = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    const rawText = await upstream.text()
    const result = safeJsonParse(rawText)

    await handleUpstreamResponse({
      response,
      upstream,
      result,
      model,
      baseUrl: endpoint.baseUrl,
      requestType,
      outputFormat,
    })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : '上传图片并请求编辑时发生错误。',
    })
  }
}

async function handleUpstreamResponse({
  response,
  upstream,
  result,
  model,
  baseUrl,
  requestType,
  outputFormat,
}) {
  if (!upstream.ok) {
    response.status(upstream.status).json({
      error: extractErrorMessage(result) || `上游接口报错，状态码 ${upstream.status}。`,
      details: result,
    })
    return
  }

  const images = extractImages(result, outputFormat)

  if (images.length === 0) {
    response.status(502).json({
      error: '接口返回成功，但没有解析到图片数据。',
      details: result,
    })
    return
  }

  response.json({
    model,
    baseUrl,
    requestType,
    images,
  })
}

function appendOptionalFormField(formData, key, value) {
  if (value !== undefined && value !== null && value !== '') {
    formData.set(key, String(value))
  }
}

function appendFlexibleField(formData, key, value) {
  if (Array.isArray(value)) {
    value.forEach((entry) => appendFlexibleField(formData, key, entry))
    return
  }

  if (value !== undefined && value !== null) {
    formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== '' && entry !== undefined && entry !== null),
  )
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return { raw: value }
  }
}

function extractErrorMessage(payload) {
  if (typeof payload?.error === 'string') {
    return payload.error
  }

  if (typeof payload?.error?.message === 'string') {
    return payload.error.message
  }

  if (typeof payload?.message === 'string') {
    return payload.message
  }

  return ''
}

function extractImages(payload, outputFormat) {
  const candidates = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.images)
      ? payload.images
      : Array.isArray(payload?.result)
        ? payload.result
        : []

  return candidates
    .map((item) => {
      const mimeType = detectMimeType(item, outputFormat)

      if (typeof item?.url === 'string' && item.url) {
        return {
          src: item.url,
          mimeType,
          revisedPrompt: item.revised_prompt || item.prompt || '',
        }
      }

      const base64Value =
        item?.b64_json ||
        item?.base64 ||
        item?.image_base64 ||
        item?.image ||
        item?.content

      if (typeof base64Value === 'string' && base64Value) {
        return {
          src: base64Value.startsWith('data:')
            ? base64Value
            : `data:${mimeType};base64,${base64Value}`,
          mimeType,
          revisedPrompt: item.revised_prompt || item.prompt || '',
        }
      }

      return null
    })
    .filter(Boolean)
}

function detectMimeType(item, outputFormat) {
  if (typeof item?.mime_type === 'string' && item.mime_type) {
    return item.mime_type
  }

  const format = item?.output_format || outputFormat || 'png'

  if (format === 'jpg') {
    return 'image/jpeg'
  }

  return `image/${format}`
}

function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces()

  return Object.values(interfaces)
    .flat()
    .filter(Boolean)
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
}
