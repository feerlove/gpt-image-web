# GPT Image 2 Studio

这是一个可正式上线的图片工作台，支持：

- 文生图
- 多参考图编辑
- 局部重绘 / Inpaint
- 手机浏览器访问
- AWS / Vercel / 宝塔部署

## 我建议的上线方式

如果你已经有 AWS，最推荐直接用 `AWS App Runner`。

原因很简单：

- 这个项目有 `Express` 后端代理
- 还支持图片上传和 `multipart/form-data`
- App Runner 很适合这种“一整个 Node Web 服务”的项目
- 比把它拆成纯静态页 + Serverless 接口更省心

## 本地开发

```bash
npm install
copy .env.example .env
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`

## 环境变量

`.env.example` 只是模板，真实密钥请放在 `.env` 或云平台环境变量里。

```env
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://img.example.com
IMAGE_API_PATH=/v1/images/generations
IMAGE_EDIT_PATH=/v1/images/edits
IMAGE_MODEL=gpt-image-2
PORT=8787
```

## 部署到 AWS App Runner

项目已经带了 [Dockerfile](E:\Users\cbb52\Documents\转录组代谢组聊天\gpt-image-web\Dockerfile)，可以直接走容器部署。
也已经带了 [apprunner.yaml](E:\Users\cbb52\Documents\转录组代谢组聊天\gpt-image-web\apprunner.yaml)，可以让 App Runner 直接按源码构建。

### 路线

1. 把项目上传到 GitHub
2. 在 AWS 创建 `ECR` 仓库，或者直接让 App Runner 从源码构建
3. 在 `App Runner` 创建服务
4. 配置环境变量
5. 等待部署完成，拿到公网域名

### 推荐环境变量

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `IMAGE_API_PATH`
- `IMAGE_EDIT_PATH`
- `IMAGE_MODEL`
- `PORT=8787`

### 如果你想本地先做镜像测试

```bash
docker build -t gpt-image-web .
docker run -p 8787:8787 --env-file .env gpt-image-web
```

然后浏览器打开：

```text
http://localhost:8787
```

## 部署到 Vercel

项目已带 [vercel.json](E:\Users\cbb52\Documents\转录组代谢组聊天\gpt-image-web\vercel.json)，可以用，但我仍然更推荐 AWS。

适合场景：

- 你想最快拿到一个公网地址
- 上传编辑流量不大
- 你更熟悉前端平台部署

## 部署到宝塔

如果你自己有云服务器，也可以直接宝塔跑 Node：

```bash
npm install && npm run build && npm start
```

然后把域名反代到：

```text
127.0.0.1:8787
```

## 手机访问

### 同一 Wi-Fi

直接访问电脑局域网地址，比如：

```text
http://10.21.68.19:5173
```

### 不同网络

必须使用公网部署地址，或者内网穿透地址。

也就是说：

- 本地开发地址只能局域网访问
- AWS / Vercel / 宝塔上线后，手机 4G/5G 也能访问

## 接口

- `GET /api/config`
- `POST /api/generate-image`
- `POST /api/edit-image`

## 兼容性提示

如果第三方供应商接口和官方略有差异，优先检查：

- `IMAGE_API_PATH`
- `IMAGE_EDIT_PATH`
- `model`
- 编辑上传字段要求
- 返回字段名

当前项目已兼容常见返回字段：`url`、`b64_json`、`base64`、`image_base64`。
