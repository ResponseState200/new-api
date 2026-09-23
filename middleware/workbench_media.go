package middleware

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// workbenchImageCaptureBufferBytes 响应体缓冲上限 32MB；b64_json 形式的超大
// 图片响应超出上限后不再捕获（截断标记），仅转发。
const workbenchImageCaptureBufferBytes = 32 << 20

const workbenchImageFetchTimeout = 120 * time.Second

// workbenchImageCaptureWriter 包装 gin.ResponseWriter，把响应体复制到有限大小
// 的缓冲区（仿 auditResponseWriter），用于事后提取生成结果落盘。
type workbenchImageCaptureWriter struct {
	gin.ResponseWriter
	body      bytes.Buffer
	truncated bool
}

func (w *workbenchImageCaptureWriter) Write(b []byte) (int, error) {
	if !w.truncated {
		remain := workbenchImageCaptureBufferBytes - w.body.Len()
		if remain >= len(b) {
			w.body.Write(b)
		} else {
			w.body.Write(b[:remain])
			w.truncated = true
		}
	}
	return w.ResponseWriter.Write(b)
}

func (w *workbenchImageCaptureWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

// CaptureWorkbenchImageGeneration 在工作台图片生成响应成功后捕获结果图片：
// b64_json 直接解码保存；url 形式异步下载保存。任何失败只记日志，绝不影响响应。
func CaptureWorkbenchImageGeneration() gin.HandlerFunc {
	return func(c *gin.Context) {
		writer := &workbenchImageCaptureWriter{ResponseWriter: c.Writer}
		c.Writer = writer
		c.Next()
		if writer.Status() != http.StatusOK || writer.truncated || writer.body.Len() == 0 {
			return
		}
		captureWorkbenchImageGeneration(c, writer.body.Bytes())
	}
}

func captureWorkbenchImageGeneration(c *gin.Context, responseBody []byte) {
	ctx := c.Request.Context()
	var response struct {
		Data []struct {
			B64Json string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := common.Unmarshal(responseBody, &response); err != nil {
		logger.LogWarn(ctx, "workbench image capture: failed to parse response: "+err.Error())
		return
	}
	if len(response.Data) == 0 {
		return
	}

	var request struct {
		Model  string `json:"model"`
		Prompt string `json:"prompt"`
		Size   string `json:"size"`
	}
	if err := common.UnmarshalBodyReusable(c, &request); err != nil {
		logger.LogWarn(ctx, "workbench image capture: failed to re-read request body: "+err.Error())
		return
	}
	params := ""
	if request.Size != "" {
		if paramsBytes, err := common.Marshal(map[string]string{"size": request.Size}); err == nil {
			params = string(paramsBytes)
		}
	}
	userID := c.GetInt("id")
	tokenID := c.GetInt("token_id")
	item := response.Data[0]

	switch {
	case item.B64Json != "":
		captureWorkbenchImageFromBase64(ctx, userID, tokenID, request.Model, request.Prompt, params, item.B64Json)
	case item.URL != "":
		// 异步下载：请求结束后 c 及其 ctx 均不可再用，全部参数按值传入。
		go captureWorkbenchImageFromURL(userID, tokenID, request.Model, request.Prompt, params, item.URL)
	}
}

func captureWorkbenchImageFromBase64(ctx context.Context, userID, tokenID int, modelName, prompt, params, b64Payload string) {
	// base64 解码后约为原始长度的 3/4，先按编码长度拦截超限载荷。
	if int64(len(b64Payload)) > (service.WorkbenchMediaMaxImageBytes/3)*4+8 {
		logger.LogWarn(ctx, "workbench image capture: base64 payload exceeds size limit")
		return
	}
	raw, err := base64.StdEncoding.DecodeString(b64Payload)
	if err != nil {
		logger.LogWarn(ctx, "workbench image capture: invalid base64 payload: "+err.Error())
		return
	}
	if len(raw) == 0 || int64(len(raw)) > service.WorkbenchMediaMaxImageBytes {
		logger.LogWarn(ctx, "workbench image capture: decoded image is empty or exceeds size limit")
		return
	}
	mimeType := http.DetectContentType(raw)
	ext := service.WorkbenchMediaExtForMimeType(mimeType)
	if ext == "" {
		logger.LogWarn(ctx, fmt.Sprintf("workbench image capture: unsupported image content type %q", mimeType))
		return
	}
	relPath, sizeBytes, err := service.SaveWorkbenchMedia(userID, ext, bytes.NewReader(raw), service.WorkbenchMediaMaxImageBytes)
	if err != nil {
		logger.LogWarn(ctx, "workbench image capture: failed to save media: "+err.Error())
		return
	}
	if err := service.RecordWorkbenchGeneration(userID, tokenID, model.WorkbenchGenerationTypeImage,
		modelName, prompt, params, "", relPath, mimeType, sizeBytes); err != nil {
		logger.LogError(ctx, "workbench image capture: failed to record generation: "+err.Error())
		_ = service.DeleteWorkbenchMedia(relPath)
	}
}

func captureWorkbenchImageFromURL(userID, tokenID int, modelName, prompt, params, rawURL string) {
	ctx, cancel := context.WithTimeout(context.Background(), workbenchImageFetchTimeout)
	defer cancel()

	rawURL = strings.TrimSpace(rawURL)
	if len(rawURL) > 64<<10 {
		logger.LogWarn(ctx, "workbench image capture: result url is too long")
		return
	}
	if err := service.ValidateSSRFProtectedFetchURL(rawURL); err != nil {
		logger.LogWarn(ctx, "workbench image capture: result url rejected: "+err.Error())
		return
	}
	client := service.GetSSRFProtectedHTTPClient()
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		logger.LogWarn(ctx, "workbench image capture: failed to create fetch request: "+err.Error())
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		logger.LogWarn(ctx, "workbench image capture: failed to fetch result url: "+err.Error())
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		logger.LogWarn(ctx, fmt.Sprintf("workbench image capture: result url returned status %d", resp.StatusCode))
		return
	}
	if resp.ContentLength > service.WorkbenchMediaMaxImageBytes {
		logger.LogWarn(ctx, "workbench image capture: result content exceeds size limit")
		return
	}

	reader := bufio.NewReader(io.LimitReader(resp.Body, service.WorkbenchMediaMaxImageBytes+1))
	mimeType := strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0])
	if service.WorkbenchMediaExtForMimeType(mimeType) == "" {
		if peek, peekErr := reader.Peek(512); len(peek) > 0 {
			mimeType = http.DetectContentType(peek)
		} else if peekErr != nil {
			logger.LogWarn(ctx, "workbench image capture: failed to sniff result content: "+peekErr.Error())
			return
		}
	}
	ext := service.WorkbenchMediaExtForMimeType(mimeType)
	if ext == "" {
		logger.LogWarn(ctx, fmt.Sprintf("workbench image capture: unsupported image content type %q", mimeType))
		return
	}
	relPath, sizeBytes, err := service.SaveWorkbenchMedia(userID, ext, reader, service.WorkbenchMediaMaxImageBytes)
	if err != nil {
		logger.LogWarn(ctx, "workbench image capture: failed to save media: "+err.Error())
		return
	}
	if err := service.RecordWorkbenchGeneration(userID, tokenID, model.WorkbenchGenerationTypeImage,
		modelName, prompt, params, "", relPath, mimeType, sizeBytes); err != nil {
		logger.LogError(ctx, "workbench image capture: failed to record generation: "+err.Error())
		_ = service.DeleteWorkbenchMedia(relPath)
	}
}
