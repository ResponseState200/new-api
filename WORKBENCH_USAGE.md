# Workbench 使用教程

本文说明 `new-api` 的 Workbench 界面如何使用，以及 Workbench 里可选模型从哪里配置出来。

## 入口

登录后台后，进入：

```text
/workbench
```

Workbench 是一个面向当前账号 API Key 的调试界面，可以直接测试图片生成和视频生成能力。

## 基本使用流程

1. 进入 Workbench 页面。
2. 先选择一个可用的 API Key。
3. 选择任务类型：
   - 图片生成
   - 视频生成
4. 系统会根据当前 API Key、用户分组、渠道能力和模型配置，自动加载可用模型。
5. 选择模型后填写参数并提交。

如果模型列表为空，通常不是 Workbench 本身的问题，而是 API Key、分组、渠道、模型端点或计费配置没有满足条件。

## 图片生成

图片生成会走 OpenAI 兼容的图片接口：

```text
/v1/images/generations
```

页面参数一般包括：

- API Key：用于本次请求的令牌
- Model：图片模型
- Prompt：图片提示词
- Size：图片尺寸
- Custom Size：自定义尺寸时填写，例如 `1024x1024`

注意：

- 图片数量当前固定为 `1`。
- 图片尺寸需要符合后端校验范围。
- 模型必须支持 `image-generation` 端点。

## 视频生成

视频生成会走 OpenAI 兼容的视频接口：

```text
/v1/videos
```

页面支持两种模式：

- 文生视频：`text_to_video`
- 图生视频：`image_to_video`

常见参数：

- API Key：用于本次请求的令牌
- Model：视频模型
- Prompt：视频提示词
- Mode：文生视频或图生视频
- Duration：视频时长，单位秒
- Ratio：画面比例，例如 `16:9`、`9:16`
- Video Resolution：视频清晰度，例如 `720p`、`1080p`
- Input Reference：图生视频时上传参考图片

视频任务提交后，Workbench 会轮询任务状态。任务完成后会拉取视频内容并展示结果。

## 模型从哪里配置出来

Workbench 里的模型不是手动在 Workbench 页面新增的，而是从后台已有配置中筛选出来的。

一个模型要出现在 Workbench，至少需要满足下面几类条件。

### 1. 配置渠道

进入后台渠道管理，新增或编辑一个渠道。

需要配置：

- 渠道类型
- 上游地址
- 上游 API Key
- 模型列表
- 分组
- 启用状态

例如模型列表里填写：

```text
gpt-image-1,sora-2
```

渠道必须处于启用状态，并且渠道所在分组要和当前用户/API Key 能访问的分组匹配。

### 2. API Key 必须可用

Workbench 只会列出当前账号下可用的 API Key。

API Key 需要满足：

- 已启用
- 未过期
- 有额度，或不限制额度
- 所属用户可以访问对应分组
- 如果 API Key 开启了模型限制，必须允许目标模型

### 3. 模型必须支持对应端点

图片模型需要支持：

```text
image-generation
```

视频模型需要支持：

```text
openai-video
```

有些渠道类型会自动推导端点能力；如果没有自动推导，可以到模型配置里设置模型元数据的 `endpoints`。

图片模型示例：

```json
{
  "image-generation": {
    "path": "/v1/images/generations",
    "method": "POST"
  }
}
```

视频模型示例：

```json
{
  "openai-video": {
    "path": "/v1/videos",
    "method": "POST"
  }
}
```

注意：给模型加上 `openai-video` 只代表它会被识别为视频端点模型。真正能否生成视频，还取决于渠道适配器和上游平台是否真的支持对应视频接口。

### 4. 需要有计费配置

如果系统不是自用模式，模型通常还需要有可用的计费/倍率配置，否则可能不会出现在可选模型列表里。

需要检查：

- 模型价格
- 模型倍率
- 分组倍率
- 当前用户是否允许使用未设置倍率的模型

## 模型不显示时的排查顺序

如果 Workbench 里选不到模型，按下面顺序检查：

1. 当前账号是否有可用 API Key。
2. API Key 是否启用、未过期、有额度。
3. API Key 是否开启了模型限制；如果开启，是否包含目标模型。
4. 用户/API Key 的分组是否能访问对应渠道分组。
5. 渠道是否启用。
6. 渠道模型列表里是否包含目标模型名。
7. 模型是否支持 `image-generation` 或 `openai-video`。
8. 模型是否有计费/倍率配置。
9. 上游渠道本身是否真的支持图片或视频生成。

## 快速验证

如果你刚刚构建了镜像，可以先用测试容器启动：

```bash
docker run -d --name new-api-test -p 3000:3000 new-api
```

然后访问：

```text
http://服务器IP:3000/workbench
```

如果要保留测试数据，建议挂载数据目录：

```bash
docker run -d \
  --name new-api-test \
  -p 3000:3000 \
  -v /root/new-api/data:/data \
  new-api
```

生产部署建议使用 `docker compose`，并配置数据库、Redis、数据挂载、反向代理和 HTTPS。
