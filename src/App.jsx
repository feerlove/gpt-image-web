import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import './App.css'

const HISTORY_STORAGE_KEY = 'gpt-image-studio-history'
const MAX_HISTORY_ITEMS = 12
const EDIT_MAX_EDGE = 1600
const MASK_MAX_EDGE = 1400
const REFERENCE_TARGET_BYTES = 2.4 * 1024 * 1024
const MASK_TARGET_BYTES = 1.4 * 1024 * 1024

const starterPrompts = [
  '一只赛博朋克风格的猫，穿着飞行员夹克，站在上海雨夜霓虹街头，电影感灯光',
  '极简产品海报，一瓶绿色玻璃香水置于石灰岩台面，晨光斜照，高级商业摄影',
  '国风山水与未来城市融合，云海中悬浮列车穿行，细腻笔触，超清细节',
]

const fallbackForm = {
  mode: 'generate',
  prompt: '',
  model: 'gpt-image-2',
  baseUrl: 'https://api.openai.com',
  generatePath: '/v1/images/generations',
  editPath: '/v1/images/edits',
  size: '1024x1024',
  quality: 'medium',
  background: 'auto',
  outputFormat: 'png',
  moderation: 'auto',
  n: 1,
  extraBody: '',
}

const progressStages = [
  { at: 8, title: '正在准备任务', detail: '整理参数并校验请求内容。' },
  { at: 26, title: '正在上传素材', detail: '上传压缩后的图片，尽量减少超时。' },
  { at: 52, title: '模型处理中', detail: '图片服务正在生成或编辑图像。' },
  { at: 76, title: '正在整理结果', detail: '解析返回图片并准备预览。' },
  { at: 92, title: '即将完成', detail: '结果马上显示出来。' },
]

function App() {
  const [form, setForm] = useState(fallbackForm)
  const [images, setImages] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isPreparingAssets, setIsPreparingAssets] = useState(false)
  const [requestMeta, setRequestMeta] = useState(null)
  const [mobileAccess, setMobileAccess] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [referenceFiles, setReferenceFiles] = useState([])
  const [maskFile, setMaskFile] = useState(null)
  const [historyItems, setHistoryItems] = useState(loadStoredHistory)
  const [activeHistoryId, setActiveHistoryId] = useState('')
  const [compareRatio, setCompareRatio] = useState(50)
  const [compareView, setCompareView] = useState(null)
  const [progressValue, setProgressValue] = useState(0)

  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const response = await fetch('/api/config')
        if (!response.ok) {
          return
        }

        const data = await response.json()
        setForm((current) => ({
          ...current,
          model: data.defaults?.model || current.model,
          baseUrl: data.defaults?.baseUrl || current.baseUrl,
          generatePath: data.defaults?.generatePath || current.generatePath,
          editPath: data.defaults?.editPath || current.editPath,
        }))

        const firstIp = data.access?.localIps?.[0]
        if (firstIp) {
          setMobileAccess({
            devUrl: `http://${firstIp}:${data.access?.devPort || 5173}`,
          })
        }
      } catch {
        // Ignore config bootstrap errors and keep local defaults.
      }
    }

    loadDefaults()
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(historyItems.slice(0, MAX_HISTORY_ITEMS)),
      )
    } catch {
      // Ignore persistence failures.
    }
  }, [historyItems])

  useEffect(() => {
    const renderQr = async () => {
      if (!mobileAccess?.devUrl) {
        setQrDataUrl('')
        return
      }

      try {
        const next = await QRCode.toDataURL(mobileAccess.devUrl, {
          margin: 1,
          width: 180,
          color: {
            dark: '#12342d',
            light: '#fffdf8',
          },
        })
        setQrDataUrl(next)
      } catch {
        setQrDataUrl('')
      }
    }

    renderQr()
  }, [mobileAccess])

  useEffect(() => {
    if (!isLoading) {
      return
    }

    const timer = window.setInterval(() => {
      setProgressValue((current) =>
        Math.min(current + (current < 48 ? 8 : current < 80 ? 5 : 2), 94),
      )
    }, 700)

    return () => window.clearInterval(timer)
  }, [isLoading])

  useEffect(() => {
    return () => {
      referenceFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      if (maskFile?.previewUrl) {
        URL.revokeObjectURL(maskFile.previewUrl)
      }
    }
  }, [referenceFiles, maskFile])

  const modeLabel = useMemo(() => {
    if (isPreparingAssets) {
      return '优化图片中...'
    }

    if (isLoading) {
      return form.mode === 'edit' ? '改图中...' : '生成中...'
    }

    return form.mode === 'edit' ? '开始改图' : '开始生图'
  }, [form.mode, isLoading, isPreparingAssets])

  const activeHistory = useMemo(
    () => historyItems.find((item) => item.id === activeHistoryId) || null,
    [activeHistoryId, historyItems],
  )

  const progress = useMemo(() => {
    if (progressValue >= 100) {
      return {
        at: 100,
        title: '处理完成',
        detail: form.mode === 'edit' ? '改图结果已经准备好。' : '生成结果已经准备好。',
      }
    }

    return [...progressStages].reverse().find((stage) => progressValue >= stage.at) || progressStages[0]
  }, [form.mode, progressValue])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: name === 'n' ? Number(value) : value,
    }))
  }

  const applyPrompt = (prompt) => {
    setForm((current) => ({ ...current, prompt }))
  }

  const switchMode = (mode) => {
    setError('')
    setActiveHistoryId('')
    setForm((current) => ({ ...current, mode }))
  }

  const handleReferenceFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    releasePreparedFiles(referenceFiles)
    setReferenceFiles([])
    setActiveHistoryId('')
    setError('')

    if (files.length === 0) {
      return
    }

    setIsPreparingAssets(true)

    try {
      const prepared = await Promise.all(
        files.map((file) =>
          prepareImageAsset(file, {
            maxEdge: EDIT_MAX_EDGE,
            targetBytes: REFERENCE_TARGET_BYTES,
            outputType: pickReferenceOutputType(file.type),
            quality: 0.88,
          }),
        ),
      )

      setReferenceFiles(prepared)
    } catch (assetError) {
      setError(assetError.message)
    } finally {
      setIsPreparingAssets(false)
      event.target.value = ''
    }
  }

  const handleMaskFile = async (event) => {
    const [file] = Array.from(event.target.files || [])

    if (maskFile?.previewUrl) {
      URL.revokeObjectURL(maskFile.previewUrl)
    }

    setMaskFile(null)
    setError('')

    if (!file) {
      return
    }

    setIsPreparingAssets(true)

    try {
      const prepared = await prepareImageAsset(file, {
        maxEdge: MASK_MAX_EDGE,
        targetBytes: MASK_TARGET_BYTES,
        outputType: 'image/png',
        quality: 0.92,
      })
      setMaskFile(prepared)
    } catch (assetError) {
      setError(assetError.message)
    } finally {
      setIsPreparingAssets(false)
      event.target.value = ''
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setProgressValue(10)
    setIsLoading(true)
    setActiveHistoryId('')

    try {
      const response =
        form.mode === 'edit'
          ? await submitEditRequest(form, referenceFiles, maskFile)
          : await submitGenerateRequest(form)

      const data = await parseApiResponse(response)

      if (!response.ok) {
        throw new Error(data.error || '图片处理失败，请检查配置。')
      }

      setProgressValue(100)

      const nextImages = data.images || []
      const nextMeta = {
        model: data.model,
        requestType: data.requestType || form.mode,
        createdAt: new Date().toLocaleString(),
      }

      setImages(nextImages)
      setRequestMeta(nextMeta)

      const liveCompare = buildLiveCompare(form.mode, referenceFiles, nextImages)
      setCompareView(liveCompare)
      setCompareRatio(50)

      const historyEntry = await buildHistoryEntry({
        form,
        requestMeta: nextMeta,
        images: nextImages,
        referenceFiles,
      })
      setHistoryItems((current) => [historyEntry, ...current].slice(0, MAX_HISTORY_ITEMS))
    } catch (submitError) {
      setImages([])
      setRequestMeta(null)
      setCompareView(null)
      setError(submitError.message)
    } finally {
      window.setTimeout(() => {
        setIsLoading(false)
      }, 250)
    }
  }

  const openHistoryEntry = (entry) => {
    setActiveHistoryId(entry.id)
    setCompareRatio(50)
    setCompareView(
      entry.sourcePreview && entry.resultPreview
        ? {
            before: entry.sourcePreview,
            after: entry.resultPreview,
            title: '历史对比',
            detail: entry.prompt,
          }
        : null,
    )
  }

  return (
    <main className="page-shell">
      <section className="compact-hero">
        <div>
          <span className="eyebrow">GPT Image Studio</span>
          <h1>更稳的改图工作台，手机和电脑都能顺手用。</h1>
          <p className="lede">
            现在会自动压缩上传图片、显示处理中进度、保留最近历史，并支持前后对比查看。
          </p>
        </div>

        <div className="hero-side">
          <div className="mode-tabs">
            <button
              type="button"
              className={form.mode === 'generate' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => switchMode('generate')}
            >
              生图
            </button>
            <button
              type="button"
              className={form.mode === 'edit' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => switchMode('edit')}
            >
              改图
            </button>
          </div>

          {mobileAccess && qrDataUrl ? (
            <div className="mini-qr-card">
              <div className="mini-qr-copy">
                <strong>手机扫码</strong>
                <span>{mobileAccess.devUrl}</span>
              </div>
              <img src={qrDataUrl} alt="Mobile access QR code" />
            </div>
          ) : null}
        </div>
      </section>

      <section className="workspace">
        <form className="control-panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{form.mode === 'edit' ? '改图' : '生图'}</p>
              <h2>{form.mode === 'edit' ? '上传并修改' : '输入并生成'}</h2>
            </div>
            <button
              className="generate-button"
              type="submit"
              disabled={isLoading || isPreparingAssets}
            >
              {modeLabel}
            </button>
          </div>

          <label className="field field-wide">
            <span>Prompt</span>
            <textarea
              name="prompt"
              rows="5"
              placeholder={
                form.mode === 'edit'
                  ? '描述你想怎么改图，比如换背景、补全人物、修脸、局部重绘、统一风格...'
                  : '描述你想生成的图像内容、风格、镜头、光线、材质...'
              }
              value={form.prompt}
              onChange={updateField}
              required
            />
          </label>

          <div className="prompt-presets">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                className="preset-chip"
                type="button"
                onClick={() => applyPrompt(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="quick-grid">
            <label className="field">
              <span>Model</span>
              <input name="model" value={form.model} onChange={updateField} />
            </label>

            <label className="field">
              <span>尺寸</span>
              <select name="size" value={form.size} onChange={updateField}>
                <option value="1024x1024">1024 x 1024</option>
                <option value="1536x1024">1536 x 1024</option>
                <option value="1024x1536">1024 x 1536</option>
              </select>
            </label>
          </div>

          {form.mode === 'edit' ? (
            <>
              <div className="face-tip">
                <strong>人脸改图稳态优化已开启</strong>
                <span>上传时会自动缩边压缩，优先转成更稳的 JPEG 或 PNG，减少超时和失败概率。</span>
              </div>

              <div className="upload-grid">
                <label className="upload-card">
                  <span>原图 / 参考图</span>
                  <input type="file" accept="image/*" multiple onChange={handleReferenceFiles} />
                  <strong>
                    {referenceFiles.length
                      ? `已优化 ${referenceFiles.length} 张图片`
                      : '选择图片'}
                  </strong>
                  <small>至少上传一张。人脸照片会自动压缩到更稳的上传体积。</small>
                </label>

                <label className="upload-card">
                  <span>Mask 遮罩图</span>
                  <input type="file" accept="image/*" onChange={handleMaskFile} />
                  <strong>{maskFile ? maskFile.file.name : '可选：上传遮罩'}</strong>
                  <small>遮罩会自动转成 PNG，并尽量保留透明区域。</small>
                </label>
              </div>

              {referenceFiles.length > 0 ? (
                <div className="asset-strip">
                  {referenceFiles.map((item) => (
                    <article className="asset-pill" key={item.id}>
                      <img src={item.previewUrl} alt={item.file.name} />
                      <div>
                        <strong>{item.file.name}</strong>
                        <span>{formatAssetMeta(item)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {(isLoading || isPreparingAssets) && (
            <div className="progress-card" aria-live="polite">
              <div className="progress-copy">
                <strong>{isPreparingAssets ? '正在优化图片' : progress.title}</strong>
                <span>
                  {isPreparingAssets
                    ? '正在压缩上传文件，完成后会自动发起请求。'
                    : progress.detail}
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{ width: `${isPreparingAssets ? 32 : progressValue}%` }}
                />
              </div>
              <small>{isPreparingAssets ? '上传前预处理' : `${Math.round(progressValue)}%`}</small>
            </div>
          )}

          <details className="advanced-panel">
            <summary>高级设置</summary>

            <div className="field-grid">
              <label className="field">
                <span>Quality</span>
                <select name="quality" value={form.quality} onChange={updateField}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="auto">auto</option>
                </select>
              </label>

              <label className="field">
                <span>Background</span>
                <select name="background" value={form.background} onChange={updateField}>
                  <option value="auto">auto</option>
                  <option value="transparent">transparent</option>
                  <option value="opaque">opaque</option>
                </select>
              </label>

              <label className="field">
                <span>Output</span>
                <select name="outputFormat" value={form.outputFormat} onChange={updateField}>
                  <option value="png">png</option>
                  <option value="jpeg">jpeg</option>
                  <option value="webp">webp</option>
                </select>
              </label>

              <label className="field">
                <span>数量</span>
                <input
                  name="n"
                  type="number"
                  min="1"
                  max="4"
                  value={form.n}
                  onChange={updateField}
                />
              </label>

              <label className="field">
                <span>Moderation</span>
                <select name="moderation" value={form.moderation} onChange={updateField}>
                  <option value="auto">auto</option>
                  <option value="low">low</option>
                </select>
              </label>

              <label className="field">
                <span>Base URL</span>
                <input name="baseUrl" value={form.baseUrl} onChange={updateField} />
              </label>

              <label className="field">
                <span>Generate Path</span>
                <input name="generatePath" value={form.generatePath} onChange={updateField} />
              </label>

              <label className="field">
                <span>Edit Path</span>
                <input name="editPath" value={form.editPath} onChange={updateField} />
              </label>
            </div>

            <label className="field field-wide">
              <span>附加 JSON 参数</span>
              <textarea
                name="extraBody"
                rows="4"
                placeholder='比如：{"response_format":"b64_json","style":"cinematic"}'
                value={form.extraBody}
                onChange={updateField}
              />
            </label>
          </details>

          {error ? <p className="status-message error">{error}</p> : null}
        </form>

        <section className="preview-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{form.mode === 'edit' ? '改图结果' : '生成结果'}</p>
              <h2>预览、对比与历史</h2>
            </div>
            {requestMeta ? (
              <div className="request-meta">
                <span>{requestMeta.model}</span>
                <span>{requestMeta.requestType}</span>
                <span>{requestMeta.createdAt}</span>
              </div>
            ) : null}
          </div>

          {compareView ? (
            <section className="compare-card">
              <div className="compare-head">
                <div>
                  <strong>{compareView.title}</strong>
                  <span>{compareView.detail}</span>
                </div>
                <small>{compareRatio}% / {100 - compareRatio}%</small>
              </div>
              <div className="compare-stage">
                <img className="compare-after" src={compareView.after} alt="After result" />
                <img
                  className="compare-before"
                  src={compareView.before}
                  alt="Before source"
                  style={{ clipPath: `inset(0 ${100 - compareRatio}% 0 0)` }}
                />
                <div className="compare-divider" style={{ left: `${compareRatio}%` }} />
              </div>
              <input
                className="compare-slider"
                type="range"
                min="0"
                max="100"
                value={compareRatio}
                onChange={(event) => setCompareRatio(Number(event.target.value))}
              />
            </section>
          ) : null}

          {images.length === 0 ? (
            <div className="empty-state">
              <p>
                {form.mode === 'edit'
                  ? '上传图片后，改图结果会显示在这里。'
                  : '生成成功后，图片会显示在这里。'}
              </p>
              <p>最近历史会保存在当前浏览器，方便快速回看。</p>
            </div>
          ) : (
            <div className="gallery">
              {images.map((image, index) => (
                <article className="image-card" key={`${image.src}-${index}`}>
                  <img src={image.src} alt={image.revisedPrompt || `Generated ${index + 1}`} />
                  <div className="image-card-footer">
                    <div className="image-copy">
                      <strong>第 {index + 1} 张</strong>
                      <span>{image.mimeType || 'image/png'}</span>
                    </div>
                    <a
                      className="download-link"
                      href={image.src}
                      download={`gpt-image-${index + 1}.${form.outputFormat}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      下载
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}

          <section className="history-panel">
            <div className="history-head">
              <strong>最近历史</strong>
              <span>保留最近 {MAX_HISTORY_ITEMS} 条</span>
            </div>

            {historyItems.length === 0 ? (
              <p className="history-empty">还没有历史记录，完成一次任务后会自动保存。</p>
            ) : (
              <div className="history-list">
                {historyItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={activeHistory?.id === item.id ? 'history-item active' : 'history-item'}
                    onClick={() => openHistoryEntry(item)}
                  >
                    <div className="history-thumbs">
                      {item.sourcePreview ? <img src={item.sourcePreview} alt="" /> : null}
                      {item.resultPreview ? <img src={item.resultPreview} alt="" /> : null}
                    </div>
                    <div className="history-copy">
                      <strong>{item.mode === 'edit' ? '改图' : '生图'}</strong>
                      <span>{item.createdAt}</span>
                      <p>{item.prompt}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  )
}

async function submitGenerateRequest(form) {
  return fetch('/api/generate-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(form),
  })
}

async function submitEditRequest(form, referenceFiles, maskFile) {
  const response = await sendEditRequest(form, referenceFiles, maskFile)

  if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
    return sendEditRequest(form, referenceFiles, maskFile)
  }

  return response
}

async function sendEditRequest(form, referenceFiles, maskFile) {
  const body = new FormData()
  body.set('prompt', form.prompt)
  body.set('model', form.model)
  body.set('baseUrl', form.baseUrl)
  body.set('editPath', form.editPath)
  body.set('size', form.size)
  body.set('quality', form.quality)
  body.set('background', form.background)
  body.set('moderation', form.moderation)
  body.set('outputFormat', form.outputFormat)
  body.set('n', String(form.n))
  body.set('extraBody', form.extraBody)

  referenceFiles.forEach((item) => {
    body.append('imageFiles', item.file, item.file.name)
  })

  if (maskFile) {
    body.set('maskFile', maskFile.file, maskFile.file.name)
  }

  return fetch('/api/edit-image', {
    method: 'POST',
    body,
  })
}

async function parseApiResponse(response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch {
    if (!response.ok) {
      return {
        error: summarizeHtmlError(text, response.status),
      }
    }

    throw new Error('服务返回了非 JSON 响应。')
  }
}

function summarizeHtmlError(text, status) {
  if (text.includes('504 Gateway Time-out') || status === 504) {
    return '改图请求超时了。当前已启用自动压缩，但上游编辑接口仍然响应过慢，请稍后再试。'
  }

  if (text.includes('413 Request Entity Too Large') || status === 413) {
    return '上传的图片太大，服务器拒绝了这次请求。当前页面会自动压缩图片，建议重新选择原图后再试。'
  }

  if (text.includes('502 Bad Gateway') || status === 502) {
    return '上游图片编辑接口没有正常返回结果，请稍后再试。'
  }

  return `服务返回了非 JSON 错误页面，状态码 ${status}。`
}

function buildLiveCompare(mode, referenceFiles, images) {
  if (mode !== 'edit' || referenceFiles.length === 0 || images.length === 0) {
    return null
  }

  return {
    before: referenceFiles[0].previewUrl,
    after: images[0].src,
    title: '本次编辑前后对比',
    detail: '拖动滑块查看原图和改图结果。',
  }
}

async function buildHistoryEntry({ form, requestMeta, images, referenceFiles }) {
  const sourcePreview = referenceFiles[0]
    ? await makePreviewThumbnail(referenceFiles[0].previewUrl, 280, 'image/jpeg', 0.72)
    : ''
  const resultPreview = images[0]
    ? await makePreviewThumbnail(images[0].src, 280, 'image/jpeg', 0.72)
    : ''

  return {
    id: createRecordId(),
    mode: form.mode,
    prompt: form.prompt,
    createdAt: requestMeta.createdAt,
    model: requestMeta.model,
    requestType: requestMeta.requestType,
    imageCount: images.length,
    sourcePreview,
    resultPreview,
  }
}

function createRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function loadStoredHistory() {
  try {
    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function releasePreparedFiles(items) {
  items.forEach((item) => {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
    }
  })
}

function pickReferenceOutputType(mimeType) {
  if (mimeType === 'image/png') {
    return 'image/png'
  }

  if (mimeType === 'image/webp') {
    return 'image/webp'
  }

  return 'image/jpeg'
}

function formatAssetMeta(item) {
  const original = formatFileSize(item.originalSize)
  const next = formatFileSize(item.file.size)
  const ratio = item.originalSize > 0 ? Math.max(0, 100 - Math.round((item.file.size / item.originalSize) * 100)) : 0
  const compressText = item.wasCompressed ? `已压缩 ${ratio}%` : '保留原尺寸'
  return `${item.width}x${item.height} · ${original} -> ${next} · ${compressText}`
}

function formatFileSize(size) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

async function prepareImageAsset(file, options) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`文件 ${file.name} 不是可用的图片格式。`)
  }

  const sourceUrl = URL.createObjectURL(file)

  try {
    const image = await loadImageElement(sourceUrl)
    const { width, height } = calculateResize(image.naturalWidth, image.naturalHeight, options.maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('浏览器当前无法处理图片压缩。')
    }

    context.drawImage(image, 0, 0, width, height)

    let quality = options.quality
    let outputType = options.outputType
    let blob = await canvasToBlob(canvas, outputType, quality)

    while (blob.size > options.targetBytes && quality > 0.58 && outputType !== 'image/png') {
      quality -= 0.08
      blob = await canvasToBlob(canvas, outputType, quality)
    }

    const shouldKeepOriginal =
      blob.size >= file.size * 0.96 &&
      width === image.naturalWidth &&
      height === image.naturalHeight &&
      outputType === file.type

    const finalBlob = shouldKeepOriginal ? file : blob
    const extension = mimeTypeToExtension(shouldKeepOriginal ? file.type : outputType)
    const preparedFile =
      finalBlob instanceof File
        ? finalBlob
        : new File([finalBlob], renameFile(file.name, extension), {
            type: outputType,
            lastModified: Date.now(),
          })

    return {
      id: createRecordId(),
      file: preparedFile,
      originalSize: file.size,
      width,
      height,
      wasCompressed: !(finalBlob instanceof File),
      previewUrl: URL.createObjectURL(preparedFile),
    }
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

function renameFile(name, extension) {
  const baseName = name.replace(/\.[^.]+$/, '')
  return `${baseName}.${extension}`
}

function mimeTypeToExtension(mimeType) {
  if (mimeType === 'image/png') {
    return 'png'
  }

  if (mimeType === 'image/webp') {
    return 'webp'
  }

  return 'jpg'
}

function calculateResize(width, height, maxEdge) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) {
    return { width, height }
  }

  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败，请换一张图片再试。'))
    image.src = src
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('图片压缩失败，请重新选择图片。'))
        return
      }

      resolve(blob)
    }, type, quality)
  })
}

async function makePreviewThumbnail(src, maxEdge, outputType, quality) {
  if (!src) {
    return ''
  }

  if (!src.startsWith('data:image/') && !src.startsWith('blob:')) {
    return src
  }

  try {
    const image = await loadImageElement(src)
    const { width, height } = calculateResize(image.naturalWidth, image.naturalHeight, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return src
    }

    context.drawImage(image, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, outputType, quality)
    return await blobToDataUrl(blob)
  } catch {
    return src
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('预览处理失败。'))
    reader.readAsDataURL(blob)
  })
}

export default App
