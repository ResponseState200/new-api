package middleware

import (
	"errors"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type WorkbenchTokenError struct {
	Status  int
	Message string
	Err     error
}

func (e *WorkbenchTokenError) Error() string {
	if e.Err == nil {
		return e.Message
	}
	return e.Message + ": " + e.Err.Error()
}

func (e *WorkbenchTokenError) Unwrap() error {
	return e.Err
}

func WriteWorkbenchTokenError(c *gin.Context, err error) {
	var tokenErr *WorkbenchTokenError
	if errors.As(err, &tokenErr) {
		c.AbortWithStatusJSON(tokenErr.Status, gin.H{
			"success": false,
			"message": tokenErr.Message,
		})
		return
	}
	c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
		"success": false,
		"message": "Database error",
	})
}

// SetupWorkbenchToken applies the same token restrictions as TokenAuth while
// resolving the token by its server-side database ID.
func SetupWorkbenchToken(c *gin.Context, tokenID int) (*model.Token, error) {
	if tokenID <= 0 {
		return nil, &WorkbenchTokenError{
			Status:  http.StatusNotFound,
			Message: "API key not found or unavailable",
		}
	}

	userID := c.GetInt("id")
	token, err := model.GetTokenByIds(tokenID, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &WorkbenchTokenError{
				Status:  http.StatusNotFound,
				Message: "API key not found or unavailable",
				Err:     err,
			}
		}
		return nil, &WorkbenchTokenError{
			Status:  http.StatusInternalServerError,
			Message: "Database error",
			Err:     err,
		}
	}

	validatedToken, err := model.ValidateUserToken(token.Key)
	if err != nil || validatedToken == nil ||
		validatedToken.Id != token.Id || validatedToken.UserId != userID {
		if errors.Is(err, model.ErrDatabase) {
			return nil, &WorkbenchTokenError{
				Status:  http.StatusInternalServerError,
				Message: "Database error",
				Err:     err,
			}
		}
		return nil, &WorkbenchTokenError{
			Status:  http.StatusForbidden,
			Message: "API key is unavailable",
		}
	}
	token = validatedToken

	allowIPs := token.GetIpLimits()
	if len(allowIPs) > 0 {
		clientIP := c.ClientIP()
		ip := net.ParseIP(clientIP)
		if ip == nil || !common.IsIpInCIDRList(ip, allowIPs) {
			logger.LogDebug(c, "Workbench token IP restriction rejected request")
			return nil, &WorkbenchTokenError{
				Status:  http.StatusForbidden,
				Message: "API key is not available from this IP address",
			}
		}
	}

	userCache, err := model.GetUserCache(userID)
	if err != nil {
		return nil, &WorkbenchTokenError{
			Status:  http.StatusInternalServerError,
			Message: "Database error",
			Err:     err,
		}
	}
	if userCache.Status != common.UserStatusEnabled {
		return nil, &WorkbenchTokenError{
			Status:  http.StatusForbidden,
			Message: "User account is unavailable",
		}
	}
	userCache.WriteContext(c)

	userGroup := userCache.Group
	tokenGroup := token.Group
	if tokenGroup != "" {
		if _, ok := service.GetUserUsableGroups(userGroup)[tokenGroup]; !ok {
			return nil, &WorkbenchTokenError{
				Status:  http.StatusForbidden,
				Message: "API key group is unavailable",
			}
		}
		if tokenGroup != "auto" && !ratio_setting.ContainsGroupRatio(tokenGroup) {
			return nil, &WorkbenchTokenError{
				Status:  http.StatusForbidden,
				Message: "API key group is unavailable",
			}
		}
		userGroup = tokenGroup
	}
	common.SetContextKey(c, constant.ContextKeyUsingGroup, userGroup)

	if err := SetupContextForToken(c, token); err != nil {
		return nil, &WorkbenchTokenError{
			Status:  http.StatusForbidden,
			Message: "API key is unavailable",
			Err:     err,
		}
	}
	return token, nil
}

func PrepareWorkbenchToken(path string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenID, err := strconv.Atoi(strings.TrimSpace(c.Param("token_id")))
		if err != nil {
			WriteWorkbenchTokenError(c, &WorkbenchTokenError{
				Status:  http.StatusNotFound,
				Message: "API key not found or unavailable",
				Err:     err,
			})
			return
		}
		if _, err := SetupWorkbenchToken(c, tokenID); err != nil {
			WriteWorkbenchTokenError(c, err)
			return
		}
		requestPath := strings.ReplaceAll(path, ":task_id", c.Param("task_id"))
		if requestPath != "" {
			RewriteWorkbenchRequestPath(c, requestPath)
		}
		c.Next()
	}
}

func ValidateWorkbenchImageRequest() gin.HandlerFunc {
	return func(c *gin.Context) {
		var request struct {
			Model  string `json:"model"`
			Prompt string `json:"prompt"`
			Size   string `json:"size"`
			N      *uint  `json:"n"`
		}
		if err := common.UnmarshalBodyReusable(c, &request); err != nil {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "invalid image request")
			return
		}
		if strings.TrimSpace(request.Model) == "" || strings.TrimSpace(request.Prompt) == "" {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "model and prompt are required")
			return
		}
		if request.N != nil && *request.N != 1 {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "n must be 1")
			return
		}
		if request.Size != "" {
			parts := strings.Split(strings.TrimSpace(request.Size), "x")
			if len(parts) != 2 {
				abortWithOpenAiMessage(c, http.StatusBadRequest, "size must be WIDTHxHEIGHT")
				return
			}
			width, widthErr := strconv.Atoi(parts[0])
			height, heightErr := strconv.Atoi(parts[1])
			if widthErr != nil || heightErr != nil ||
				width < 128 || width > 4096 || height < 128 || height > 4096 {
				abortWithOpenAiMessage(c, http.StatusBadRequest, "size is out of range")
				return
			}
		}
		c.Next()
	}
}

func ValidateWorkbenchVideoRequest() gin.HandlerFunc {
	return func(c *gin.Context) {
		var mode string
		var modelName string
		var prompt string
		var durationSeconds int
		var ratio string
		var videoResolution string
		isMultipart := strings.Contains(c.GetHeader("Content-Type"), "multipart/form-data")
		if isMultipart {
			form, err := common.ParseMultipartFormReusable(c)
			if err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, "invalid video request")
				return
			}
			defer form.RemoveAll()
			formValues := url.Values(form.Value)
			modelName = strings.TrimSpace(formValues.Get("model"))
			prompt = strings.TrimSpace(formValues.Get("prompt"))
			mode = formValues.Get("mode")
			durationSeconds, _ = strconv.Atoi(strings.TrimSpace(formValues.Get("duration_seconds")))
			ratio = strings.TrimSpace(formValues.Get("ratio"))
			videoResolution = strings.TrimSpace(formValues.Get("video_resolution"))
			if mode == "image_to_video" {
				files := form.File["input_reference"]
				if len(files) == 0 || files[0].Size <= 0 ||
					!strings.HasPrefix(strings.ToLower(files[0].Header.Get("Content-Type")), "image/") {
					abortWithOpenAiMessage(c, http.StatusBadRequest, "image_to_video requires an image upload")
					return
				}
			}
		} else {
			var request struct {
				Model           string `json:"model"`
				Prompt          string `json:"prompt"`
				Mode            string `json:"mode"`
				DurationSeconds *int   `json:"duration_seconds"`
				Ratio           string `json:"ratio"`
				VideoResolution string `json:"video_resolution"`
			}
			if err := common.UnmarshalBodyReusable(c, &request); err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, "invalid video request")
				return
			}
			modelName = strings.TrimSpace(request.Model)
			prompt = strings.TrimSpace(request.Prompt)
			mode = request.Mode
			ratio = strings.TrimSpace(request.Ratio)
			videoResolution = strings.TrimSpace(request.VideoResolution)
			if request.DurationSeconds != nil {
				durationSeconds = *request.DurationSeconds
			}
		}
		if modelName == "" || prompt == "" {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "model and prompt are required")
			return
		}
		if mode != "text_to_video" && mode != "image_to_video" {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "mode must be text_to_video or image_to_video")
			return
		}
		if durationSeconds < 1 || durationSeconds > relaycommon.MaxTaskDurationSeconds {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "duration_seconds is out of range")
			return
		}
		switch ratio {
		case "", "1:1", "3:4", "4:3", "9:16", "16:9", "21:9":
		default:
			abortWithOpenAiMessage(c, http.StatusBadRequest, "ratio is invalid")
			return
		}
		switch videoResolution {
		case "", "480p", "720p", "1080p", "4k":
		default:
			abortWithOpenAiMessage(c, http.StatusBadRequest, "video_resolution is invalid")
			return
		}
		if mode == "image_to_video" && !isMultipart {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "image_to_video requires an image upload")
			return
		}
		c.Next()
	}
}

func RewriteWorkbenchRequestPath(c *gin.Context, path string) {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return
	}
	c.Request.URL.Path = path
	c.Request.URL.RawPath = ""
	c.Request.RequestURI = c.Request.URL.RequestURI()
}
