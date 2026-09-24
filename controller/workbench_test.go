package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	_ "github.com/QuantumNous/new-api/plugins"
	"github.com/stretchr/testify/assert"
)

// 视频模式的模型列表必须与 POST /v1/videos 的实际提交路径一致:
// 插件声明的视频模型即使渠道端点类型推断为空也必须可选,
// 否则用户添加了视频渠道模型却无法在工作台选择。
func TestIsWorkbenchModeModelSupportedVideo(t *testing.T) {
	// 任务插件(doubao)声明的视频模型:无端点类型推断也可选
	assert.True(t, isWorkbenchModeModelSupported("video", "doubao-seedance-1-0-pro-250528", nil))
	// 大小写折叠后命中插件声明模型也可选
	assert.True(t, isWorkbenchModeModelSupported("video", "Doubao-Seedance-1-0-Pro-250528", nil))
	// 原生 openai-video 端点类型(如 Sora 渠道)直接放行
	assert.True(t, isWorkbenchModeModelSupported("video", "custom-video-model",
		[]constant.EndpointType{constant.EndpointTypeOpenAIVideo}))
	// 未被任何插件声明、也没有视频端点类型的模型不可选
	assert.False(t, isWorkbenchModeModelSupported("video", "gpt-4o", nil))
	assert.False(t, isWorkbenchModeModelSupported("video", "gpt-4o",
		[]constant.EndpointType{constant.EndpointTypeOpenAI}))
}

func TestIsWorkbenchModeModelSupportedImage(t *testing.T) {
	// 图片模式仍以端点类型推断为准
	assert.True(t, isWorkbenchModeModelSupported("image", "gpt-image-2.5",
		[]constant.EndpointType{constant.EndpointTypeImageGeneration}))
	// 插件声明的视频模型不能被误判为图片模型
	assert.False(t, isWorkbenchModeModelSupported("image", "doubao-seedance-1-0-pro-250528", nil))
}
