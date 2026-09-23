package controller

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type workbenchGenerationItem struct {
	ID        int64  `json:"id"`
	Type      string `json:"type"`
	Model     string `json:"model"`
	Prompt    string `json:"prompt"`
	Params    string `json:"params"` // JSON 文本，前端自行 JSON.parse
	TaskID    string `json:"task_id,omitempty"`
	MimeType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
	CreatedAt int64  `json:"created_at"`
	ExpiresAt int64  `json:"expires_at"`
}

// ListWorkbenchGenerations 返回当前用户未过期（24h 保留期内）的生成记录。
func ListWorkbenchGenerations(c *gin.Context) {
	genType := strings.TrimSpace(c.Query("type"))
	if genType != "" && genType != model.WorkbenchGenerationTypeImage && genType != model.WorkbenchGenerationTypeVideo {
		common.ApiErrorMsg(c, "Invalid type")
		return
	}
	generations, err := model.ListUserGenerations(c.GetInt("id"), genType, common.GetTimestamp(), 200)
	if err != nil {
		common.ApiErrorMsg(c, "Database error")
		return
	}
	items := make([]workbenchGenerationItem, 0, len(generations))
	for _, generation := range generations {
		items = append(items, workbenchGenerationItem{
			ID:        generation.ID,
			Type:      generation.Type,
			Model:     generation.Model,
			Prompt:    generation.Prompt,
			Params:    generation.Params,
			TaskID:    generation.TaskID,
			MimeType:  generation.MimeType,
			SizeBytes: generation.SizeBytes,
			CreatedAt: generation.CreatedAt,
			ExpiresAt: generation.ExpiresAt,
		})
	}
	common.ApiSuccess(c, gin.H{"items": items})
}

// GetWorkbenchGenerationContent 本地回放生成媒体文件（支持 Range）。
func GetWorkbenchGenerationContent(c *gin.Context) {
	generation := lookupUserWorkbenchGeneration(c)
	if generation == nil {
		return
	}
	if !serveWorkbenchGenerationContent(c, generation) {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Generation content not found",
		})
	}
}

// DeleteWorkbenchGeneration 删除生成记录与对应媒体文件。
func DeleteWorkbenchGeneration(c *gin.Context) {
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Generation not found")
		return
	}
	generation, err := model.DeleteUserGeneration(id, c.GetInt("id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, "Generation not found")
			return
		}
		common.ApiErrorMsg(c, "Database error")
		return
	}
	if err := service.DeleteWorkbenchMedia(generation.FilePath); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("failed to delete workbench media %q: %s", generation.FilePath, err.Error()))
	}
	common.ApiSuccess(c, gin.H{"id": generation.ID})
}

func lookupUserWorkbenchGeneration(c *gin.Context) *model.WorkbenchGeneration {
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Generation not found",
		})
		return nil
	}
	generation, err := model.GetUserGeneration(id, c.GetInt("id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"message": "Generation not found",
			})
		} else {
			common.ApiErrorMsg(c, "Database error")
		}
		return nil
	}
	return generation
}

// serveWorkbenchGenerationContent 以本地文件响应生成媒体内容，复用任务媒体的
// 安全响应头（含 Cache-Control: private, no-store），由 http.ServeContent 支持 Range。
// 文件缺失或不可读时返回 false，由调用方决定回退行为。
func serveWorkbenchGenerationContent(c *gin.Context, generation *model.WorkbenchGeneration) bool {
	file, err := service.OpenWorkbenchMedia(generation.FilePath)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("failed to open workbench generation %d media: %s", generation.ID, err.Error()))
		}
		return false
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil || stat.IsDir() {
		return false
	}
	if generation.MimeType != "" {
		c.Writer.Header().Set("Content-Type", generation.MimeType)
	}
	setTaskMediaResponseSecurityHeaders(c.Writer.Header())
	http.ServeContent(c.Writer, c.Request, "", time.Unix(generation.CreatedAt, 0), file)
	return true
}
