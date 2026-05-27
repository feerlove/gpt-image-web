import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import './App.css'

const starterPrompts = [
  '一只赛博朋克风格的猫，穿着飞行员夹克，站在上海雨夜霓虹街头，电影感灯光',
  '极简产品海报，一瓶绿色玻璃香水置于石灰岩台面，晨光斜照，高级商业摄影',
  '国风山水与未来城市融合，云海中悬浮列车穿行，细腻笔触，超清细节',
]

const fallbackForm = {
  prompt: '',
  model: 'gpt-image-1.5',
  baseUrl: 'https://api.openai.com',
  apiPath: '/v1/images/generations',
  size: '1024x1024',
  quality: 'medium',
  background: 'auto',
  outputFormat: 'png',
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
          apiPath:
            data.defaults?.generatePath || data.defaults?.apiPath || current.apiPath,
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

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '图片生成失败，请检查配置。')
      }

      setImages(data.images || [])
      setRequestMeta({
        model: data.model,
        baseUrl: data.baseUrl,
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
          <h1>把你买到的图片 API，变成一个真正能用的生图工作台。</h1>
          <p className="lede">
            这个前端默认走后端代理模式，浏览器不直接暴露 `API Key`。你可以自由改
            `Base URL`、`model` 和附加参数，适配官方接口或第三方兼容接口。
          </p>
        </div>

        <div className="hero-notes">
          <div className="note-card">
            <strong>更安全</strong>
            <span>密钥放在 `.env`，前端只传生成参数。</span>
          </div>
          <div className="note-card">
            <strong>更灵活</strong>
            <span>支持自定义 `baseUrl`、`apiPath`、`model`。</span>
          </div>
          <div className="note-card">
            <strong>更实用</strong>
            <span>直接预览、下载图片，并显示失败原因。</span>
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
              <p className="panel-kicker">生成参数</p>
              <h2>把请求配完整</h2>
            </div>
            <button className="generate-button" type="submit" disabled={isLoading}>
              {isLoading ? '生成中...' : '开始生图'}
            </button>
          </div>

          <label className="field field-wide">
            <span>Prompt</span>
            <textarea
              name="prompt"
              rows="6"
              placeholder="描述你想生成的图像内容、风格、镜头、光线、材质..."
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
                placeholder="例如 gpt-image-1.5 或你的 gpt-image-2"
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
              <span>API Path</span>
              <input
                name="apiPath"
                value={form.apiPath}
                onChange={updateField}
                placeholder="/v1/images/generations"
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
              <p className="panel-kicker">生成结果</p>
              <h2>预览与下载</h2>
            </div>
            {requestMeta ? (
              <div className="request-meta">
                <span>{requestMeta.model}</span>
                <span>{requestMeta.createdAt}</span>
              </div>
            ) : null}
          </div>

          {images.length === 0 ? (
            <div className="empty-state">
              <p>生成成功后，图片会显示在这里。</p>
              <p>如果你用的是第三方兼容接口，可以先把 `model` 改成商家给你的模型名。</p>
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

export default App
