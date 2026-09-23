package controller

import (
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

type workbenchKeyResponse struct {
	ID         int      `json:"id"`
	Name       string   `json:"name"`
	Group      string   `json:"group"`
	AutoGroups []string `json:"auto_groups,omitempty"`
}

func ListWorkbenchKeys(c *gin.Context) {
	userID := c.GetInt("id")
	total, err := model.CountUserTokens(userID)
	if err != nil {
		common.ApiErrorMsg(c, "Database error")
		return
	}

	keys := make([]workbenchKeyResponse, 0)
	const pageSize = 200
	for offset := 0; int64(offset) < total; offset += pageSize {
		tokens, err := model.GetAllUserTokens(userID, offset, pageSize)
		if err != nil {
			common.ApiErrorMsg(c, "Database error")
			return
		}
		for _, token := range tokens {
			if !isWorkbenchTokenAvailable(token) {
				continue
			}
			autoGroups, err := token.GetAutoGroups()
			if err != nil {
				autoGroups = nil
			}
			keys = append(keys, workbenchKeyResponse{
				ID:         token.Id,
				Name:       token.Name,
				Group:      token.Group,
				AutoGroups: autoGroups,
			})
		}
		if len(tokens) < pageSize {
			break
		}
	}
	common.ApiSuccess(c, gin.H{"items": keys})
}

func isWorkbenchTokenAvailable(token *model.Token) bool {
	if token == nil || token.Status != common.TokenStatusEnabled {
		return false
	}
	if token.ExpiredTime != -1 && token.ExpiredTime < common.GetTimestamp() {
		return false
	}
	return token.UnlimitedQuota || token.RemainQuota > 0
}

func ListWorkbenchModels(c *gin.Context) {
	mode := strings.TrimSpace(c.Query("mode"))
	var endpointType constant.EndpointType
	switch mode {
	case "image":
		endpointType = constant.EndpointTypeImageGeneration
	case "video":
		endpointType = constant.EndpointTypeOpenAIVideo
	default:
		common.ApiErrorMsg(c, "Invalid workbench mode")
		return
	}

	tokenID, err := strconv.Atoi(strings.TrimSpace(c.Query("token_id")))
	if err != nil {
		common.ApiErrorMsg(c, "API key not found or unavailable")
		return
	}
	if _, err := middleware.SetupWorkbenchToken(c, tokenID); err != nil {
		middleware.WriteWorkbenchTokenError(c, err)
		return
	}

	groups, err := getModelListGroups(c)
	if err != nil {
		common.ApiErrorMsg(c, "Failed to load API key groups")
		return
	}
	acceptUnsetRatioModel := operation_setting.SelfUseModeEnabled
	if !acceptUnsetRatioModel {
		userSettings, _ := model.GetUserSetting(c.GetInt("id"), false)
		acceptUnsetRatioModel = userSettings.AcceptUnsetRatioModel
	}

	_ = model.GetPricing()
	modelLimitEnabled := common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled)
	tokenModelLimit := map[string]bool{}
	if value, ok := common.GetContextKey(c, constant.ContextKeyTokenModelLimit); ok {
		tokenModelLimit, _ = value.(map[string]bool)
	}
	models := make([]string, 0)
	for _, modelName := range service.GetGroupsEnabledModels(groups.ownerGroups) {
		if modelLimitEnabled {
			matchingName := ratio_setting.RoutingMatchModelName(modelName)
			if !tokenModelLimit[modelName] && !tokenModelLimit[matchingName] {
				continue
			}
		}
		if !acceptUnsetRatioModel && !helper.HasModelBillingConfig(modelName) {
			continue
		}
		if !slices.Contains(model.GetModelSupportEndpointTypes(modelName), endpointType) {
			continue
		}
		models = append(models, modelName)
	}
	common.ApiSuccess(c, gin.H{"models": models})
}

func WorkbenchVideoFetch(c *gin.Context) {
	if _, ok := workbenchTaskBelongsToToken(c); !ok {
		return
	}
	middleware.RewriteWorkbenchRequestPath(c, "/v1/videos/"+c.Param("task_id"))
	RelayTaskFetch(c)
}

func WorkbenchVideoContent(c *gin.Context) {
	task, ok := workbenchTaskBelongsToToken(c)
	if !ok {
		return
	}
	taskID := strings.TrimSpace(c.Param("task_id"))
	tokenID := c.GetInt("token_id")

	// 已在 24h 保留期内捕获过的视频直接本地回放，不回源上游。
	if generation, err := model.GetByTokenTask(tokenID, taskID); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Failed to query workbench generation for task %s: %s", taskID, err.Error()))
	} else if generation != nil && generation.Type == model.WorkbenchGenerationTypeVideo {
		if serveWorkbenchGenerationContent(c, generation) {
			return
		}
	}

	middleware.RewriteWorkbenchRequestPath(c, "/v1/videos/"+taskID+"/content")
	// 仅普通 GET（无 Range）捕获；HEAD/条件请求/206 不捕获。
	if c.Request.Method != http.MethodGet || c.Request.Header.Get("Range") != "" {
		VideoProxy(c)
		return
	}
	capture, err := service.NewWorkbenchMediaCaptureWriter(c.Writer, c.GetInt("id"))
	if err != nil {
		logger.LogWarn(c.Request.Context(), "workbench video capture: failed to create capture file: "+err.Error())
		VideoProxy(c)
		return
	}
	c.Writer = capture
	VideoProxy(c)
	finalizeWorkbenchVideoCapture(c, capture, task, tokenID, taskID)
}

// finalizeWorkbenchVideoCapture 校验捕获结果并建行；任何失败只删半成品、记日志。
func finalizeWorkbenchVideoCapture(c *gin.Context, capture *service.WorkbenchMediaCaptureWriter, task *model.Task, tokenID int, taskID string) {
	ctx := c.Request.Context()
	contentLength := int64(-1)
	if header := strings.TrimSpace(capture.Header().Get("Content-Length")); header != "" {
		parsed, err := strconv.ParseInt(header, 10, 64)
		if err != nil {
			capture.Discard()
			return
		}
		contentLength = parsed
	}
	mimeType := strings.TrimSpace(strings.Split(capture.Header().Get("Content-Type"), ";")[0])
	if !strings.HasPrefix(mimeType, "video/") && mimeType != "application/octet-stream" {
		capture.Discard()
		return
	}
	relPath, mimeType, sizeBytes, keep, err := capture.Finalize(capture.Status(), mimeType, contentLength)
	if err != nil {
		logger.LogWarn(ctx, "workbench video capture: failed to finalize capture: "+err.Error())
		return
	}
	if !keep {
		return
	}
	// 并发重复捕获去重：已有记录则丢弃本次文件。
	if existing, err := model.GetByTokenTask(tokenID, taskID); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("workbench video capture: dedup check failed for task %s: %s", taskID, err.Error()))
		_ = service.DeleteWorkbenchMedia(relPath)
		return
	} else if existing != nil {
		_ = service.DeleteWorkbenchMedia(relPath)
		return
	}
	modelName := task.Properties.OriginModelName
	if modelName == "" {
		modelName = task.Properties.UpstreamModelName
	}
	if err := service.RecordWorkbenchGeneration(c.GetInt("id"), tokenID, model.WorkbenchGenerationTypeVideo,
		modelName, task.Properties.Input, workbenchVideoParamsJSON(task), taskID, relPath, mimeType, sizeBytes); err != nil {
		logger.LogError(ctx, "workbench video capture: failed to record generation: "+err.Error())
		_ = service.DeleteWorkbenchMedia(relPath)
	}
}

// workbenchVideoParamsJSON 从任务响应数据中尽力提取视频生成参数
// （duration_seconds / ratio / resolution），供生成记录展示；提取不到时返回空串。
func workbenchVideoParamsJSON(task *model.Task) string {
	var taskData map[string]any
	if err := task.GetData(&taskData); err != nil || len(taskData) == 0 {
		return ""
	}
	params := make(map[string]any)
	switch seconds := taskData["seconds"].(type) {
	case string:
		if n, err := strconv.Atoi(strings.TrimSpace(seconds)); err == nil && n > 0 {
			params["duration_seconds"] = n
		}
	case float64:
		if seconds > 0 {
			params["duration_seconds"] = int(seconds)
		}
	}
	if ratio, ok := taskData["ratio"].(string); ok && ratio != "" {
		params["ratio"] = ratio
	}
	for _, key := range []string{"video_resolution", "resolution", "size"} {
		if resolution, ok := taskData[key].(string); ok && resolution != "" {
			params["resolution"] = resolution
			break
		}
	}
	if len(params) == 0 {
		return ""
	}
	paramsBytes, err := common.Marshal(params)
	if err != nil {
		return ""
	}
	return string(paramsBytes)
}

func workbenchTaskBelongsToToken(c *gin.Context) (*model.Task, bool) {
	taskID := strings.TrimSpace(c.Param("task_id"))
	tokenID := c.GetInt("token_id")
	if taskID == "" || tokenID <= 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"message": "Task not found",
				"type":    "invalid_request_error",
			},
		})
		return nil, false
	}

	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": "Failed to query task",
				"type":    "server_error",
			},
		})
		return nil, false
	}
	if !exists || task == nil || task.PrivateData.TokenId != tokenID {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"message": "Task not found",
				"type":    "invalid_request_error",
			},
		})
		return nil, false
	}
	return task, true
}
