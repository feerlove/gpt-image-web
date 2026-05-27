# GPT Image 2 Studio

这是一个可正式上线的图片工作台，支持：

- 文生图
- 多参考图编辑
- 局部重绘 / Inpaint
- 手机浏览器访问
- EC2 / Vercel / 宝塔部署

## 我建议的上线方式

如果你现在要走 AWS，优先推荐 `EC2`。

原因：

- 你已经能进入 `EC2`
- 这个项目是完整的 `Node + Express + React` 应用
- `EC2` 对这类项目最直接
- 不依赖 `App Runner` 资格

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

`.env.example` 只是模板，真实密钥请放在 `.env` 或服务器环境变量里。

```env
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://img.example.com
IMAGE_API_PATH=/v1/images/generations
IMAGE_EDIT_PATH=/v1/images/edits
IMAGE_MODEL=gpt-image-2
PORT=8787
```

## 部署到 AWS EC2

推荐系统：

- `Ubuntu 24.04 LTS`

推荐实例：

- `t3.micro`

### 服务器初始化

```bash
sudo apt update
sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 拉代码

```bash
git clone https://github.com/feerlove/gpt-image-web.git
cd gpt-image-web
npm install
cp .env.example .env
```

然后编辑 `.env`，填入你的真实密钥和接口地址。

### 构建并启动

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

项目会监听：

```text
127.0.0.1:8787
```

### Nginx 反向代理

把域名或公网 IP 反代到 `8787`。

示例配置：

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用：

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo tee /etc/nginx/sites-available/gpt-image-web >/dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/gpt-image-web /etc/nginx/sites-enabled/gpt-image-web
sudo nginx -t
sudo systemctl restart nginx
```

## 用 PM2 运行

项目已带 [ecosystem.config.cjs](E:\Users\cbb52\Documents\转录组代谢组聊天\gpt-image-web\ecosystem.config.cjs)。

常用命令：

```bash
pm2 start ecosystem.config.cjs
pm2 restart gpt-image-web
pm2 logs gpt-image-web
pm2 status
```

## 部署到 Vercel

项目也带 [vercel.json](E:\Users\cbb52\Documents\转录组代谢组聊天\gpt-image-web\vercel.json)，可以作为备选。

## 手机访问

### 同一 Wi-Fi

访问电脑局域网地址，例如：

```text
http://10.21.68.19:5173
```

### 不同网络

需要公网部署地址，例如：

- EC2 公网 IP
- 域名
- Vercel 地址

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
