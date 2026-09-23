# 二开版本生产环境部署教程(Docker 方式 · 保留全部用户数据)

> 适用场景:生产环境正在跑官方镜像 `calciumion/new-api`,现在要切换成你自己二次开发的版本,且用户、令牌、渠道、日志、额度等数据全部保留。

---

## 0. 先搞懂原理:为什么换镜像不会丢数据

new-api 的容器本身是**无状态**的,所有数据都在容器之外:

| 数据 | 位置 | 说明 |
|---|---|---|
| 用户/令牌/渠道/日志等业务数据 | 数据库:SQLite 文件 `/data/one-api.db`,或外部 MySQL / PostgreSQL(由 `SQL_DSN` 决定) | 切换镜像时数据库不动 |
| 上传/生成文件、本次二开的工作台媒体 | `/data` 目录(本次新增内容默认在容器内 `/data/data/workbench_media`) | 只要 `/data` 卷映射不变就在 |
| 配置 | 环境变量 / `docker-compose.yml` / `.env` | 部署时原样照抄即可 |

程序启动时会自动执行数据库**增量迁移**(GORM AutoMigrate):只新增表和列,**绝不删除或修改已有数据**。本次二开对数据库的唯一变更就是新增一张 `workbench_generations` 表(存生成记录的元数据),对存量数据零影响。

**唯一的高危点是"版本回退"**:如果线上官方镜像的版本比你二开代码基于的版本**新**,直接切换相当于给程序降级——数据库结构比代码新,可能出现兼容问题。所以第 1 步必须先对齐版本。

### 一分钟速览(熟手版)

```bash
# 1. 备份(数据库 + /data 目录 + 配置文件)
# 2. 同步二开代码到官方最新版(如基线落后)
# 3. 构建镜像:docker build -t my-new-api:v1.0.0-custom .
# 4. 把 compose 里的 image: calciumion/new-api:latest 改成 my-new-api:v1.0.0-custom
# 5. docker compose up -d new-api && docker compose logs -f new-api
# 6. 验证老数据 + 新功能;出问题把 image 改回去即可回滚
```

---

## 1. 部署前准备

### 1.1 摸清线上现状(在服务器上执行)

```bash
# 找到容器和镜像 tag
docker ps --filter name=new-api

# 查看 /data 挂载到宿主机的哪个目录、有哪些环境变量
docker inspect new-api --format '{{json .Mounts}}' | python3 -m json.tool
docker inspect new-api --format '{{range .Config.Env}}{{println .}}{{end}}'

# 如果是 compose 部署,找到编排文件
cat docker-compose.yml
```

**逐项记录下来**(切换时要原样照抄):

- [ ] 镜像名称和 tag(例如 `calciumion/new-api:latest`)
- [ ] `/data` 卷映射(宿主机目录 → `/data`),以及可能的 logs 目录映射
- [ ] 端口映射(通常 `3000:3000`)
- [ ] 全部环境变量:`SQL_DSN`、`LOG_SQL_DSN`、`REDIS_CONN_STRING`、`SESSION_SECRET`、`TZ` 等
- [ ] 网络、`--restart` 策略、依赖的数据库/Redis 容器

> ⚠️ 如果线上还挂了 `--log-dir /app/logs` 之类的启动命令(官方 compose 默认有),也要记下来一起带走。

### 1.2 确认版本关系(关键!)

- **线上版本**:管理后台"关于"页面,或 `docker logs new-api` 首行,或镜像 digest。
- **你的二开基线**:代码根目录 `cat VERSION`,以及 `git log` 里你基于的 upstream 提交。

判断:

- 二开基线 **≥** 线上版本 → 可以直接上。
- 二开基线 **<** 线上版本 → **先不要上线**。先把官方最新代码合并进你的分支(方法见第 7 节),本地验证通过后再继续。否则相当于降级,数据库结构比程序新,可能起不来或行为异常。

### 1.3 本地构建一次验证(可选但推荐)

在开发机上(需要 Docker;没有的话跳过,直接在服务器上构建):

```bash
docker build -t my-new-api:v1.0.0-custom .
```

构建分三个阶段:bun 构建前端 → Go 编译后端 → debian 运行时,首次构建拉基础镜像和依赖会比较慢,属正常现象。

---

## 2. 备份(上线前必须做,一样都不能少)

> 建议先在业务低峰期 `docker stop new-api` 停机备份,保证文件一致性;备份完先 `docker start new-api` 拉起来继续跑,等正式切换时还有一次短暂停机。

### 2.1 备份数据库

按你的实际情况三选一(怎么判断:没设 `SQL_DSN` 就是 SQLite):

**SQLite(默认)**

```bash
# one-api.db 在宿主机挂载的 data 目录里,注意 -wal / -shm 文件要一起拷
docker stop new-api
mkdir -p ~/new-api-backup
cp -a /你的/data目录/one-api.db* ~/new-api-backup/
docker start new-api
```

**MySQL**

```bash
docker exec mysql mysqldump -uroot -p'你的密码' \
  --single-transaction --routines --triggers new-api \
  > ~/new-api-backup/db-$(date +%F).sql
```

**PostgreSQL**

```bash
docker exec postgres pg_dump -U root -Fc new-api \
  > ~/new-api-backup/db-$(date +%F).dump
```

> 如果配了独立的日志库(`LOG_SQL_DSN`),用同样方式再备份一次日志库。

### 2.2 备份 /data 目录和配置

```bash
tar czf ~/new-api-backup/data-$(date +%F).tar.gz /你的/data目录
cp docker-compose.yml .env ~/new-api-backup/ 2>/dev/null  # 有什么备份什么
```

### 2.3 验证备份可用

```bash
tar tzf ~/new-api-backup/data-*.tar.gz | head    # 压缩包能解开、有内容
head -20 ~/new-api-backup/db-*.sql               # SQL 文件非空、内容正常(SQLite 跳过)
```

---

## 3. 把自定义镜像弄上服务器(三种方式选一)

### 方式 A:服务器上直接构建(推荐;要求服务器能访问外网、内存 ≥ 2G)

**先把二开源码弄到服务器上**,两种途径:

```bash
# 途径 1:你的代码已推到私有 Git 仓库
git clone <你的私有仓库地址> new-api-custom
cd new-api-custom && git checkout <你的分支或tag>

# 途径 2:从本地开发机直接打包上传(Windows 本地用 Git Bash 执行)
# 本地:
tar czf new-api-src.tar.gz --exclude=.git --exclude=node_modules --exclude='web/node_modules' --exclude=data new-api/
scp new-api-src.tar.gz user@服务器IP:~
# 服务器:
mkdir new-api-custom && tar xzf new-api-src.tar.gz -C new-api-custom --strip-components=1
cd new-api-custom
```

**构建镜像:**

```bash
docker build -t my-new-api:v1.0.0-custom .
docker images | grep my-new-api   # 确认构建成功
```

> 镜像 tag 建议带版本号和日期(如 `v1.0.0-custom-20250101`),方便以后区分和回滚。

### 方式 B:本地构建 → 导出 → 导入(服务器无外网或配置太低)

```bash
# 本地(注意架构:服务器是 x86 就加 --platform linux/amd64,ARM 服务器用 linux/arm64)
docker build --platform linux/amd64 -t my-new-api:v1.0.0-custom .
docker save my-new-api:v1.0.0-custom | gzip > my-new-api.tar.gz
scp my-new-api.tar.gz user@服务器IP:~

# 服务器
gunzip -c my-new-api.tar.gz | docker load
docker images | grep my-new-api
```

### 方式 C:推送到镜像仓库(多台服务器时推荐)

```bash
docker tag my-new-api:v1.0.0-custom <你的registry>/my-new-api:v1.0.0-custom
docker push <你的registry>/my-new-api:v1.0.0-custom

# 服务器上
docker login <你的registry>
docker pull <你的registry>/my-new-api:v1.0.0-custom
```

> ⚠️ 镜像里包含完整源码和前端产物,仓库**务必设为私有**。可用 Docker Hub 私有仓库、阿里云 ACR 个人版(免费)等。

---

## 4. 切换上线(低峰期操作,停机约 1~3 分钟)

### 4.1 docker-compose 方式

**第 1 步**:编辑 `docker-compose.yml`,只改 `image` 一行,其余(ports / volumes / environment / command)**一个字都不要动**:

```yaml
services:
  new-api:
    image: my-new-api:v1.0.0-custom    # ← 原来是 calciumion/new-api:latest,只改这里
    container_name: new-api
    restart: always
    # ...以下全部保持原样
```

**第 2 步**:只重建 new-api 服务,数据库和 Redis 不动:

```bash
docker compose up -d new-api        # 老版本 Docker 用 docker-compose up -d new-api
docker compose logs -f new-api      # 盯启动日志,看到正常监听端口即成功
```

### 4.2 纯 docker run 方式

```bash
# 旧容器改名保留,作为回滚保险(先别删!)
docker stop new-api && docker rename new-api new-api-old

# 用第 1.1 步记录的原参数启动新镜像,端口/卷/环境变量/网络/重启策略完全一致
docker run --name new-api -d --restart always \
  -p 3000:3000 \
  -v /你的/data目录:/data \
  -e TZ=Asia/Shanghai \
  -e SQL_DSN="root:xxx@tcp(mysql:3306)/new-api" \
  -e REDIS_CONN_STRING="redis://:xxx@redis:6379" \
  -e SESSION_SECRET="原来的值" \
  --network 原来的网络 \
  my-new-api:v1.0.0-custom

docker logs -f new-api
```

> `SQL_DSN`、`SESSION_SECRET` 这类值**必须和旧容器完全一致**,尤其是 `SESSION_SECRET`——换了会导致所有已登录用户的会话失效。

### 4.3 启动时会发生什么(预期行为)

1. 程序连接原来的数据库;
2. AutoMigrate 自动创建 `workbench_generations` 表(只加新表,不碰旧表);
3. 正常监听 3000 端口对外服务,用户、令牌、渠道、日志、余额全部原样保留;
4. 工作台媒体的 24 小时自动清理协程随进程启动,每 30 分钟扫描一次,无需任何配置。

### 4.4 官方镜像先别删

`docker images` 里保留 `calciumion/new-api`(和 `new-api-old` 容器)至少观察一到两周,它们是回滚保险。确认稳定后再清理。

---

## 5. 上线后验证清单

| # | 检查项 | 方法 | 预期 |
|---|---|---|---|
| 1 | 容器状态 | `docker ps` / `docker compose ps` | running / healthy |
| 2 | 启动日志 | `docker logs new-api` | 无 panic、无迁移报错 |
| 3 | 老数据 | 登录管理后台 | 用户、令牌、渠道、兑换、日志、额度都在 |
| 4 | 老功能 | 用存量 key 调一次 `/v1/chat/completions` | 正常返回、正常扣费 |
| 5 | 密钥下拉反显 | 打开在线工作台 | 下拉框显示**密钥名称**,不再是数字 ID |
| 6 | 生图全流程 | 工作台生成一张图片 | 生成成功(不再报 `crypto.randomUUID` 错误),历史记录出现该图,可预览/下载/删除 |
| 7 | 生视频全流程 | 工作台生成一个短视频 | 任务完成后历史记录可回放 |
| 8 | 媒体落盘 | 看宿主机 data 目录 | 出现 `data/workbench_media/`(容器 WORKDIR 是 `/data`,默认相对路径拼出来是 `/data/data/workbench_media`,随 `/data` 卷持久化) |
| 9 | 清理协程 | 30 分钟后 `docker logs new-api` | 有过期清理相关日志(无过期文件时很安静,属正常) |
| 10 | 前端缓存 | 浏览器 Ctrl+F5 强刷 | 看到新版界面 |

---

## 6. 出问题怎么回滚

本次二开**没有破坏性数据库变更**(只新增一张表),所以回滚 = 换回旧镜像/旧容器,数据库不用动。`workbench_generations` 表留在库里对官方版毫无影响。

**compose 方式:**

```bash
# 把 docker-compose.yml 的 image 改回 calciumion/new-api:latest(或线上原来的 tag)
docker compose up -d new-api
```

**docker run 方式:**

```bash
docker stop new-api && docker rm new-api
docker rename new-api-old new-api && docker start new-api
```

**极端情况才需要恢复数据库**(例如你自己手动跑过别的迁移):

```bash
# MySQL
docker exec -i mysql mysql -uroot -p'密码' new-api < ~/new-api-backup/db-XXXX.sql
# PostgreSQL
docker exec -i postgres pg_restore -U root -d new-api --clean ~/new-api-backup/db-XXXX.dump
# SQLite
docker stop new-api && cp -a ~/new-api-backup/one-api.db* /你的/data目录/ && docker start new-api
```

---

## 7. 以后怎么持续跟进官方更新(fork 维护方式)

```bash
# 一次性:把官方仓库加为 upstream
git remote add upstream https://github.com/QuantumNous/new-api.git

# 每次官方发新版:
git fetch upstream
git merge upstream/main          # 解决冲突(如有)
# 跑一遍你的验证:前端 typecheck/lint/build、后端 go build ./... + 相关测试
# 然后重复本教程:备份 → 构建新镜像(tag 递增)→ 切换 → 验证
```

**降低冲突的原则:**

- 二开代码尽量收敛在独立新增文件里(本次就是范例:`web/src/features/workbench/`、`service/workbench_*.go`、`controller/workbench.go` 等),少改官方原有文件;
- 每次升级镜像 tag 递增(`v1.1.0-custom-日期`),旧镜像保留一个版本周期;
- 不要执行 `docker pull calciumion/new-api:latest` 去覆盖你的自定义镜像名,两条线分开;
- 每次升级都走同一套「备份 → 切换 → 验证 → 留旧镜像」流程,形成肌肉记忆。

---

## 8. 本次二开带来的运维新事项

| 事项 | 说明 |
|---|---|
| 磁盘占用 | 工作台生成的图片/视频会落盘(默认 `/data/data/workbench_media`),**24 小时后自动删除**(记录和媒体一起删),正常业务不会膨胀;高峰期留意一下 `df -h` 即可 |
| 自定义媒体目录 | 环境变量 `WORKBENCH_MEDIA_DIR`(如 `/data/workbench_media`),不设就用默认 |
| 新表 | `workbench_generations`,只存元数据(类型/模型/状态/文件路径/过期时间),行体积小 |
| 媒体大小上限 | 图片 32MB、视频 256MB,超限只影响该条记录落盘,不影响生成请求本身 |
| 多节点部署 | 每个节点都会跑清理协程,删除操作幂等(按各自记录的文件路径删,重复删不报错),无需额外协调;`SESSION_SECRET` 保持各节点一致即可 |
| 前端 | 已打进镜像(`web/dist` 由 Dockerfile 构建),无额外静态资源要部署 |

---

## 9. 常见问题 FAQ

**Q:切换后打开页面还是老界面 / 白屏?**
A:浏览器缓存了旧前端,Ctrl+F5(Cmd+Shift+R)强刷;还不行检查是否访问到了旧容器(`docker ps` 确认旧容器已停)。

**Q:启动报 `database is locked`(SQLite)?**
A:旧容器没停干净,两个进程抢一个 SQLite 文件。`docker ps` 找到旧容器停掉。

**Q:启动日志里迁移报权限错误?**
A:数据库账号需要建表(DDL)权限。MySQL 确认账号对库有 `CREATE/ALTER`;PostgreSQL 确认账号是库的 owner 或有 schema 权限。

**Q:切换后"数据全没了"?**
A:99% 是 `/data` 卷没挂对或 `SQL_DSN` 写错,新容器连到了一个空库。旧数据还在宿主机原目录/原数据库里,改回正确挂载和 DSN 重启即可。

**Q:构建镜像很慢 / 拉不动基础镜像?**
A:给 Docker 配镜像加速器;Go 模块走代理可在构建参数里加 `GOPROXY`(国内服务器尤其需要)。

**Q:忘了线上原来有哪些环境变量?**
A:只要 `new-api-old` 容器或官方镜像容器记录还在:`docker inspect new-api-old --format '{{range .Config.Env}}{{println .}}{{end}}'`。

**Q:用户会被迫重新登录吗?**
A:只要 `SESSION_SECRET` 没变,会话不受影响;没配过 `SESSION_SECRET` 的单节点部署,重启后按程序默认行为处理(官方升级同理)。

---

*文档版本:基于本次工作台二开(生成记录 24h 保留、crypto.randomUUID 修复、密钥反显修复、工作台交互重构)编写。*
