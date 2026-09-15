package controller

import (
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
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
	if !workbenchTaskBelongsToToken(c) {
		return
	}
	middleware.RewriteWorkbenchRequestPath(c, "/v1/videos/"+c.Param("task_id"))
	RelayTaskFetch(c)
}

func WorkbenchVideoContent(c *gin.Context) {
	if !workbenchTaskBelongsToToken(c) {
		return
	}
	middleware.RewriteWorkbenchRequestPath(c, "/v1/videos/"+c.Param("task_id")+"/content")
	VideoProxy(c)
}

func workbenchTaskBelongsToToken(c *gin.Context) bool {
	taskID := strings.TrimSpace(c.Param("task_id"))
	tokenID := c.GetInt("token_id")
	if taskID == "" || tokenID <= 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"message": "Task not found",
				"type":    "invalid_request_error",
			},
		})
		return false
	}

	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": "Failed to query task",
				"type":    "server_error",
			},
		})
		return false
	}
	if !exists || task == nil || task.PrivateData.TokenId != tokenID {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"message": "Task not found",
				"type":    "invalid_request_error",
			},
		})
		return false
	}
	return true
}
