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
          const devUrl = `http://${firstIp}:${data.access?.devPort || 5173}`
          setMobileAccess({
            ip: firstIp,
            devUrl,
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
          width: 220,
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

  const modeLabel = useMemo(
    () => (form.mode === 'edit' ? '开始改图' : isLoading ? '生成中...' : '开始生图'),
    [form.mode, isLoading],
  )

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

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '图片处理失败，请检查配置。')
      }

      setImages(data.images || [])
      setRequestMeta({
        model: data.model,
        baseUrl: data.baseUrl,
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
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">GPT Image Studio</span>
          <h1>不只生图，也能直接改图和局部重绘。</h1>
          <p className="lede">
            现在支持 `Generate` 和 `Edit` 双模式。你可以上传原图、参考图和遮罩图，
            直接从网页调用图片编辑接口。
          </p>

          <div className="mode-tabs">
            <button
              type="button"
              className={form.mode === 'generate' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => switchMode('generate')}
            >
              Generate
            </button>
            <button
              type="button"
              className={form.mode === 'edit' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => switchMode('edit')}
            >
              Edit / Inpaint
            </button>
          </div>
        </div>

        <div className="hero-notes">
          <div className="note-card">
            <strong>更安全</strong>
            <span>密钥放在 `.env`，前端只传生成或改图参数。</span>
          </div>
          <div className="note-card">
            <strong>更灵活</strong>
            <span>支持 `generatePath` 和 `editPath` 分开配置。</span>
          </div>
          <div className="note-card">
            <strong>更完整</strong>
            <span>现在可以上传参考图、原图和可选遮罩图做改图。</span>
          </div>
          {mobileAccess ? (
            <div className="qr-card">
              <div className="qr-copy">
                <strong>手机扫码打开</strong>
                <span>{mobileAccess.devUrl}</span>
              </div>
              {qrDataUrl ? <img src={qrDataUrl} alt="Mobile access QR code" /> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="workspace">
        <form className="control-panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                {form.mode === 'edit' ? '改图参数' : '生成参数'}
              </p>
              <h2>{form.mode === 'edit' ? '上传图片并修改' : '把请求配完整'}</h2>
            </div>
            <button className="generate-button" type="submit" disabled={isLoading}>
              {modeLabel}
            </button>
          </div>

          <label className="field field-wide">
            <span>Prompt</span>
            <textarea
              name="prompt"
              rows="6"
              placeholder={
                form.mode === 'edit'
                  ? '描述你想怎么改这张图，比如替换背景、补全主体、换风格、局部重绘...'
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

          <div className="field-grid">
            <label className="field">
              <span>Model</span>
              <input
                name="model"
                value={form.model}
                onChange={updateField}
                placeholder="例如 gpt-image-2"
              />
            </label>

            <label className="field">
              <span>Base URL</span>
              <input
                name="baseUrl"
                value={form.baseUrl}
                onChange={updateField}
                placeholder="https://api.openai.com"
              />
            </label>

            <label className="field">
              <span>Generate Path</span>
              <input
                name="generatePath"
                value={form.generatePath}
                onChange={updateField}
                placeholder="/v1/images/generations"
              />
            </label>

            <label className="field">
              <span>Edit Path</span>
              <input
                name="editPath"
                value={form.editPath}
                onChange={updateField}
                placeholder="/v1/images/edits"
              />
            </label>

            <label className="field">
              <span>Size</span>
              <select name="size" value={form.size} onChange={updateField}>
                <option value="1024x1024">1024 x 1024</option>
                <option value="1536x1024">1536 x 1024</option>
                <option value="1024x1536">1024 x 1536</option>
              </select>
            </label>

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
              <span>Moderation</span>
              <select name="moderation" value={form.moderation} onChange={updateField}>
                <option value="auto">auto</option>
                <option value="low">low</option>
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
          </div>

          {form.mode === 'edit' ? (
            <div className="upload-grid">
              <label className="upload-card">
                <span>原图 / 参考图</span>
                <input type="file" accept="image/*" multiple onChange={handleReferenceFiles} />
                <strong>
                  {referenceFiles.length
                    ? `已选择 ${referenceFiles.length} 张图片`
                    : '选择一张或多张图片'}
                </strong>
                <small>至少上传一张图。多图时会一起作为参考输入。</small>
              </label>

              <label className="upload-card">
                <span>Mask 遮罩图</span>
                <input type="file" accept="image/*" onChange={handleMaskFile} />
                <strong>{maskFile ? maskFile.name : '可选：上传局部重绘遮罩'}</strong>
                <small>透明区域通常表示允许模型重绘的位置。</small>
              </label>
            </div>
          ) : null}

          <label className="field field-wide">
            <span>附加 JSON 参数</span>
            <textarea
              name="extraBody"
              rows="5"
              placeholder='比如：{"response_format":"b64_json","style":"cinematic"}'
              value={form.extraBody}
              onChange={updateField}
            />
          </label>

          {error ? <p className="status-message error">{error}</p> : null}
        </form>

        <section className="preview-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                {form.mode === 'edit' ? '改图结果' : '生成结果'}
              </p>
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
                  ? '上传参考图后，编辑结果会显示在这里。'
                  : '生成成功后，图片会显示在这里。'}
              </p>
              <p>
                {form.mode === 'edit'
                  ? '如果改图失败，通常优先检查 editPath、字段名和你的第三方接口兼容性。'
                  : '如果你用的是第三方兼容接口，可以先把 model 改成商家给你的模型名。'}
              </p>
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
                  {image.revisedPrompt ? (
                    <p className="revised-prompt">{image.revisedPrompt}</p>
                  ) : null}
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

export default App
