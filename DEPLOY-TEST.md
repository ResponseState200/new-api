# 测试环境代码更新运行指南(docker-compose.test.yml)

> 你的测试环境是用项目自带的 `docker-compose.test.yml` 跑的:从当前 git 代码**完整构建镜像**(前端 bun build + 后端 Go 编译都在镜像构建里完成),配 PostgreSQL 15 + Redis。
> 所以每次同步代码后,**一条命令就能让新代码跑起来**,服务器上不需要装 Go、不需要装 bun。

---

## 0. 你的环境一张图

`docker-compose.test.yml` 定义了三个容器:

| 容器 | 作用 | 数据存在哪 |
|---|---|---|
| `new-api-test` | 应用本体(镜像 `new-api-local:test`,从源码构建) | `/data` → 项目目录下 `./data-test`;日志 → `./logs-test` |
| `new-api-test-postgres` | PostgreSQL 15,存全部业务数据 | named volume `test_pg_data`(在项目目录外,Docker 管理) |
| `new-api-test-redis` | Redis 缓存 | 内存,无需关心 |

配置文件是项目目录下的 **`.env.test`**(数据库密码、Redis 密码、`SESSION_SECRET`、端口等)。它已被 `.gitignore` 忽略——**`git pull` 永远不会覆盖它**,你的配置和测试数据都是安全的。

---

## 1. 每次更新的标准流程(核心就两条命令)

```bash
cd /你的/new-api 项目目录

# 第 1 步:同步代码
git status          # 确认没有本地改动;有的话先 git stash,更新完 git stash pop
git pull

# 第 2 步:重新构建并重启(一条命令搞定:前端+后端全部重新打进镜像)
docker compose --env-file .env.test -f docker-compose.test.yml up -d --build

# 第 3 步:看启动日志,确认起来了
docker compose --env-file .env.test -f docker-compose.test.yml logs -f new-api
```

就这么多。`up -d --build` 会自动:重新构建镜像(前端 dist 也在镜像里现做,不存在"界面没更新"的问题)→ 重建 `new-api-test` 容器 → 数据库和 Redis 容器保持不动。

**构建时间说明:** 首次构建慢(要拉基础镜像);之后有 Docker 层缓存,只重跑变化的部分——只改了后端 Go 代码通常 1~3 分钟;改了前端要重新跑 bun 构建,几分钟属正常。服务器内存建议 ≥ 2G。

**启动时自动发生的事(无需手动):**

1. 连接测试库,自动创建新表 `workbench_generations`(只加新表,不动已有数据);
2. 工作台媒体 24h 清理协程随进程启动,每 30 分钟扫一次;
3. 生成的图片/视频落在 `./data-test/data/workbench_media/`(容器内 `/data/data/workbench_media`)。

---

## 2. 更新后验证清单

```bash
# 服务活着 + 看版本号
curl http://localhost:3000/api/status

# 容器状态(healthy 为正常)
docker compose --env-file .env.test -f docker-compose.test.yml ps
```

| # | 检查项 | 预期 |
|---|---|---|
| 1 | `/api/status` 返回 `"success":true` | 服务正常 |
| 2 | 登录后台看用户/令牌/渠道 | 老数据都在 |
| 3 | 工作台的密钥下拉框 | 显示**密钥名称**,不再是数字 ID |
| 4 | 点一次生成视频 | 不再报 `crypto.randomUUID is not a function` |
| 5 | 生成一张图 → 历史记录 | 可预览/下载/删除;`./data-test/data/workbench_media/` 下有文件 |
| 6 | 浏览器 Ctrl+F5 强刷 | 看到重构后的工作台界面 |

> 端口如果不是 3000,看你 `.env.test` 里的 `NEW_API_TEST_PORT`。

---

## 3. 回滚(想退到更新前)

```bash
cd /你的/new-api 项目目录
git log --oneline -5          # 找到更新前的 commit,假设 abc1234
git checkout abc1234

# 同一条命令重新构建
docker compose --env-file .env.test -f docker-compose.test.yml up -d --build
```

数据库一般不用回滚:这次只新增了 `workbench_generations` 一张表,旧版本代码不认识它,留着无影响。想彻底清掉:

```bash
docker exec new-api-test-postgres psql -U root -d new-api -c "DROP TABLE IF EXISTS workbench_generations;"
```

退回分支继续干活:`git checkout <你的分支>`,再跑一次 `up -d --build`。

---

## 4. 数据管理(测试环境专用)

**停止但不删数据**(代码、数据库都保留):

```bash
docker compose --env-file .env.test -f docker-compose.test.yml down
```

**备份测试库**(比如想在搞破坏前留个底):

```bash
docker exec new-api-test-postgres pg_dump -U root -Fc new-api > test-backup-$(date +%F).dump
# 恢复:cat test-backup-XXXX.dump | docker exec -i new-api-test-postgres pg_restore -U root -d new-api --clean
```

**彻底重置(删库重来,慎用):**

```bash
docker compose --env-file .env.test -f docker-compose.test.yml down -v   # -v 会删掉 PG 数据卷
rm -rf data-test logs-test                                                # 可选:连媒体文件/日志一起清
docker compose --env-file .env.test -f docker-compose.test.yml up -d --build
```

**清理构建残留的旧镜像**(多次 `--build` 后会攒一些 `<none>` 悬空镜像,占磁盘):

```bash
docker image prune -f
```

---

## 5. 换一台机器重新部署测试环境(备忘)

```bash
git clone <你的仓库> && cd new-api && git checkout <分支>
cp .env.test.example .env.test
# 编辑 .env.test:填 POSTGRES_PASSWORD、REDIS_PASSWORD、SESSION_SECRET(随机长字符串),
# 可选改 NEW_API_TEST_PORT
docker compose --env-file .env.test -f docker-compose.test.yml up -d --build
```

---

## 6. FAQ

**Q:`git pull` 会冲掉我的 `.env.test` 或测试数据吗?**
A:不会。`.env.test` 被 gitignore;PG 数据在 Docker volume 里;媒体文件在 `./data-test`——三者都不归 git 管。

**Q:改了 `.env.test`(比如换端口)怎么生效?**
A:重新跑一次 `up -d`(不用 `--build`,改配置不需要重编译):
`docker compose --env-file .env.test -f docker-compose.test.yml up -d`

**Q:构建报 `POSTGRES_PASSWORD: Set POSTGRES_PASSWORD in .env.test` 之类错误?**
A:`.env.test` 缺失或里面必填项没填。对照 `.env.test.example` 补齐,注意启动命令里 `--env-file .env.test` 不能省。

**Q:构建时卡住/内存爆了?**
A:前端 bun build 吃内存,小机器(1G)可能扛不住。两个办法:加 swap;或者在本地/大机器上 `docker build` 后 `docker save | scp | docker load` 过去(参考《DEPLOY-PRODUCTION.md》方式 B)。

**Q:`docker compose` 命令不存在?**
A:老版本 Docker 用 `docker-compose`(带横杠),其余参数完全一样。

**Q:更新后界面没变?**
A:这个 compose 用的是完整 `Dockerfile`,前端在镜像里现构建,理论上不存在旧前端问题。先 Ctrl+F5 排除浏览器缓存;再看构建日志确认 build 真的重跑了(`--build` 没漏);最后确认你访问的是这台测试机、这个端口。

---

## 7. 贴墙上版(每次更新复制粘贴)

```bash
cd /你的/new-api 项目目录 && \
git pull && \
docker compose --env-file .env.test -f docker-compose.test.yml up -d --build && \
docker compose --env-file .env.test -f docker-compose.test.yml logs -f new-api
```

验证:`curl localhost:3000/api/status` + 浏览器 Ctrl+F5 过一遍第 2 节清单。测试服验收没问题,再上生产(见《DEPLOY-PRODUCTION.md》)。
