import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import './App.css'

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

function App() {
  const [form, setForm] = useState(fallbackForm)
  const [images, setImages] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [requestMeta, setRequestMeta] = useState(null)
  const [mobileAccess, setMobileAccess] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [referenceFiles, setReferenceFiles] = useState([])
  const [maskFile, setMaskFile] = useState(null)

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

  const modeLabel = useMemo(() => {
    if (isLoading) {
      return form.mode === 'edit' ? '改图中...' : '生成中...'
    }

    return form.mode === 'edit' ? '开始改图' : '开始生图'
  }, [form.mode, isLoading])

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
    setForm((current) => ({ ...current, mode }))
  }

  const handleReferenceFiles = (event) => {
    setReferenceFiles(Array.from(event.target.files || []))
  }

  const handleMaskFile = (event) => {
    const [file] = Array.from(event.target.files || [])
    setMaskFile(file || null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response =
        form.mode === 'edit'
          ? await submitEditRequest(form, referenceFiles, maskFile)
          : await submitGenerateRequest(form)

      const data = await parseApiResponse(response)

      if (!response.ok) {
        throw new Error(data.error || '图片处理失败，请检查配置。')
      }

      setImages(data.images || [])
      setRequestMeta({
        model: data.model,
        requestType: data.requestType || form.mode,
        createdAt: new Date().toLocaleString(),
      })
    } catch (submitError) {
      setImages([])
      setRequestMeta(null)
      setError(submitError.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="compact-hero">
        <div>
          <span className="eyebrow">GPT Image Studio</span>
          <h1>把页面收紧，只保留真正常用的功能。</h1>
          <p className="lede">
            现在首屏只保留生图、改图、上传、预览和开始按钮。其他参数都收进高级设置。
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
            <button className="generate-button" type="submit" disabled={isLoading}>
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
                  ? '描述你想怎么改图，比如换背景、补全人物、换风格、局部重绘...'
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
            <div className="upload-grid">
              <label className="upload-card">
                <span>原图 / 参考图</span>
                <input type="file" accept="image/*" multiple onChange={handleReferenceFiles} />
                <strong>
                  {referenceFiles.length
                    ? `已选择 ${referenceFiles.length} 张图片`
                    : '选择图片'}
                </strong>
                <small>至少上传一张。多图会一起作为参考输入。</small>
              </label>

              <label className="upload-card">
                <span>Mask 遮罩图</span>
                <input type="file" accept="image/*" onChange={handleMaskFile} />
                <strong>{maskFile ? maskFile.name : '可选：上传遮罩'}</strong>
                <small>透明区域一般表示允许重绘的位置。</small>
              </label>
            </div>
          ) : null}

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
              <h2>预览与下载</h2>
            </div>
            {requestMeta ? (
              <div className="request-meta">
                <span>{requestMeta.model}</span>
                <span>{requestMeta.requestType}</span>
                <span>{requestMeta.createdAt}</span>
              </div>
            ) : null}
          </div>

          {images.length === 0 ? (
            <div className="empty-state">
              <p>
                {form.mode === 'edit'
                  ? '上传图片后，改图结果会显示在这里。'
                  : '生成成功后，图片会显示在这里。'}
              </p>
              <p>高级参数都已经收进“高级设置”里了。</p>
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

  referenceFiles.forEach((file) => {
    body.append('imageFiles', file)
  })

  if (maskFile) {
    body.set('maskFile', maskFile)
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
    return '改图请求超时了。你的第三方图片编辑接口响应太慢，服务器已经在等待过程中断开。'
  }

  if (text.includes('413 Request Entity Too Large') || status === 413) {
    return '上传的图片太大，服务器拒绝了这次请求。请缩小图片后重试。'
  }

  if (text.includes('502 Bad Gateway') || status === 502) {
    return '上游图片编辑接口没有正常返回结果，请稍后再试。'
  }

  return `服务返回了非 JSON 错误页面，状态码 ${status}。`
}

export default App
