# 德州扑克在线（独立部署版）

一个可以独立部署的在线德州扑克网站：好友组局、随机匹配、虚拟金币、管理员后台充值。

- 前端：React 19 + Vite + Tailwind CSS
- 后端：NestJS 10
- 数据库：PostgreSQL（Supabase，独立数据库）
- 部署：Render 免费 Web Service，一个服务同时托管网页和 API

> 这套代码已经做过"去平台化"改造，不再依赖豆包/妙搭平台，可以直接部署到你自己的服务器或 Render。

## 当前发布进度（已上线）

- **公网地址**：<https://poker-online-8cum.onrender.com>
- **管理员账号**：`admin`，密码见本机 `.deploy-secrets.txt` 的 `ADMIN_PASSWORD`
- **GitHub 仓库**：<https://github.com/laoying991014-dev/poker-online>，分支 `main`
- **Supabase**：独立项目 `poker-online`，ref `xrwygmxyzaesgfmppxlh`，新加坡区域；5 张表已建好并开启 RLS
- **Render**：免费 Web Service `poker-online`，Service ID `srv-dc15hsrl550s73dg1m70`，新加坡区域
- 线上已实测：注册、登录、管理员充值、管理员建房、用户加入、开局、跟注、过牌、翻牌/转牌/河牌、摊牌结算、离开房间退回筹码
- 生产数据已清理：仅保留管理员，测试用户/房间/牌局/充值记录均已删除

> Render 免费实例空闲后会休眠，首次打开可能需要 30–60 秒唤醒，属于正常现象。

---

## 一、本地运行（可选，先看效果）

1. 安装 Node.js 22（当前机器已装 22.23.2）
2. 安装依赖：

   ```powershell
   npm install
   ```

3. 复制环境变量文件：

   ```powershell
   Copy-Item .env.example .env
   ```

   打开 `.env`，把 `DATABASE_URL` 换成你的 Supabase 连接串。

4. 到 Supabase 的 SQL Editor 执行 `supabase/schema.sql`（建 5 张表）。

5. 启动开发环境：

   ```powershell
   npm run dev
   ```

   浏览器打开 http://localhost:5173

6. 管理员账号默认是 `admin / admin123`（首次启动自动创建，可用 `.env` 里的
   `ADMIN_USERNAME`、`ADMIN_PASSWORD` 修改）。**线上生产环境不要使用 `admin123`，
   本项目线上密码在 `.deploy-secrets.txt` 中。**

---

## 二、正式部署：Supabase + Render（和 nankhannet 一样的模式）

### 第 1 步：新建一个独立的 Supabase 项目

1. 打开 https://supabase.com/dashboard ，登录。
2. 点 **New project**。
3. 填写：
   - Name：`poker-online`（随便起）
   - Region：**Southeast Asia (Singapore)**
   - Database Password：设置一个密码并记下来
4. 点 **Create new project**，等待 1–2 分钟初始化完成。

> 这是一个全新的数据库，和你的 nankhannet 项目完全分开，数据互不影响。

### 第 2 步：建表

1. 进入这个新项目，左侧点 **SQL Editor**。
2. 点 **New query**，把项目里 `supabase/schema.sql` 的全部内容复制进去。
3. 点 **Run**，看到 Success 即建表完成。

### 第 3 步：拿到数据库连接串

1. 项目里点 **Project Settings** → **Database**。
2. 找到 **Connection string**，选择 **Session pooler**（兼容 IPv4，Render 可用）。
3. 复制这串地址，把里面的 `[YOUR-PASSWORD]` 换成第 1 步设置的数据库密码。
4. 地址结尾保留 `?sslmode=require`。

格式类似：

```
postgresql://postgres.abcdefgh:你的密码@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require
```

### 第 4 步：把代码传到 GitHub

1. 打开 https://github.com/new 新建一个仓库，例如 `poker-online`，设为 Private 或 Public 都可以。
2. 在项目目录执行（把地址换成你自己的仓库地址）：

   ```powershell
   git init
   git add .
   git commit -m "poker online standalone"
   git branch -M main
   git remote add origin https://github.com/你的用户名/poker-online.git
   git push -u origin main
   ```

> `.env`、`node_modules`、`dist` 已经在 `.gitignore` 里，不会被上传。

### 第 5 步：在 Render 创建 Web Service

1. 打开 https://dashboard.render.com ，登录。
2. 点 **New** → **Web Service**。
3. 连接刚才的 GitHub 仓库。
4. 填写：
   - Name：`poker-online`
   - Region：**Singapore**
   - Runtime：**Node**
   - Build Command：`npm install && npm run build`
   - Start Command：`npm start`
   - Instance Type：**Free**
   - Health Check Path：`/`
5. 点 **Create Web Service**。

> 也可以在 Render 点 **New → Blueprint**，选择仓库后它会自动读取 `render.yaml`。

### 第 6 步：填环境变量

在 Render 服务的 **Environment** 页面添加：

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `DATABASE_URL` | 第 3 步复制的 Supabase 连接串 |
| `JWT_SECRET` | 随便一串长随机字符（例如 32 位以上） |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | 你自己的管理员密码（不要用 admin123） |
| `ADMIN_INITIAL_COINS` | `0` |

保存后 Render 会自动重新部署。

### 第 7 步：访问

部署成功后 Render 会给你一个地址，形如：

```
https://poker-online-xxxx.onrender.com
```

- 打开就是大厅，未登录也能浏览房间
- 点"快速匹配/创建房间/加入房间"会提示登录
- 用管理员账号登录后，右上角/个人中心可进入管理后台，给用户充值金币

---

## 三、规则说明

- 新用户注册后金币为 **0**，需要管理员在后台充值
- 每局结束后，赢家被抽取 **1 个小盲** 作为平台抽水
- 带入金额最低 **50000**
- 只有管理员可以创建房间
- 好友组局：创建后得到 6 位房间码，朋友输入房间码加入
- 随机匹配：达到人数或等待 30 秒后自动开局

---

## 四、常见问题

**Render 免费实例打开很慢？**
免费实例 15 分钟无访问会休眠，再次访问需要 30–60 秒唤醒，属于正常现象。

**Supabase 数据库连不上？**
- 确认用的是 **Session pooler** 连接串（不要用 Direct connection，Render 可能没有 IPv6）
- 确认密码替换正确、结尾带 `?sslmode=require`
- Supabase 免费项目 7 天无活动会暂停，去 Dashboard 点 Restore 恢复

**想改管理员密码？**
改 Render 的 `ADMIN_PASSWORD` 后，用本地环境执行一次：

```powershell
$env:DATABASE_URL="你的连接串"; $env:ADMIN_PASSWORD="新密码"; node scripts/create-admin.mjs
```

**数据在哪里？**
全部在你新建的 Supabase 项目里，表名以 `poker_` 开头，和 nankhannet 完全隔离。

---

## 五、目录结构

```
client/            前端页面（React）
server/            后端 API（NestJS）
shared/            前后端共用的类型定义
supabase/schema.sql  建表脚本
scripts/create-admin.mjs  管理员账号初始化脚本
render.yaml        Render 部署配置
```
