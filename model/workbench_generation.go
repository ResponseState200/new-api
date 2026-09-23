package model

import (
	"errors"

	"gorm.io/gorm"
)

const (
	WorkbenchGenerationTypeImage = "image"
	WorkbenchGenerationTypeVideo = "video"
)

const workbenchGenerationListMaxLimit = 200
const workbenchGenerationDeleteDefaultBatch = 500

// WorkbenchGeneration 记录工作台在线生成（图片/视频）的媒体元数据。
// 媒体文件本体存放在节点本地磁盘，FilePath 为相对媒体根目录的路径；
// 行与文件在 ExpiresAt 之后由清理任务删除。
type WorkbenchGeneration struct {
	ID        int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatedAt int64  `json:"created_at" gorm:"index"`
	UserId    int    `json:"user_id" gorm:"index"`
	TokenId   int    `json:"token_id" gorm:"index"`
	Type      string `json:"type" gorm:"type:varchar(10);index"` // image | video
	Model     string `json:"model" gorm:"type:varchar(191)"`
	Prompt    string `json:"prompt" gorm:"type:text"`
	Params    string `json:"params" gorm:"type:text"`                // JSON：size 或 ratio/resolution/duration_seconds
	TaskID    string `json:"task_id" gorm:"type:varchar(191);index"` // 视频任务 ID，用于去重
	FilePath  string `json:"-" gorm:"type:varchar(512)"`             // 相对 media root 的路径
	MimeType  string `json:"mime_type" gorm:"type:varchar(100)"`
	SizeBytes int64  `json:"size_bytes"`
	ExpiresAt int64  `json:"expires_at" gorm:"index"`
}

func (g *WorkbenchGeneration) Create() error {
	return DB.Create(g).Error
}

// ListUserGenerations 返回用户未过期的生成记录，created_at 倒序；
// genType 为空时返回全部类型。
func ListUserGenerations(userID int, genType string, now int64, limit int) ([]*WorkbenchGeneration, error) {
	if limit <= 0 || limit > workbenchGenerationListMaxLimit {
		limit = workbenchGenerationListMaxLimit
	}
	generations := make([]*WorkbenchGeneration, 0)
	query := DB.Where("user_id = ? AND expires_at > ?", userID, now)
	if genType != "" {
		query = query.Where("type = ?", genType)
	}
	err := query.Order("created_at DESC").Order("id DESC").Limit(limit).Find(&generations).Error
	return generations, err
}

func GetUserGeneration(id int64, userID int) (*WorkbenchGeneration, error) {
	var generation WorkbenchGeneration
	if err := DB.Where("id = ? AND user_id = ?", id, userID).Take(&generation).Error; err != nil {
		return nil, err
	}
	return &generation, nil
}

// GetByTokenTask 用于视频捕获去重；未找到时返回 (nil, nil)。
func GetByTokenTask(tokenID int, taskID string) (*WorkbenchGeneration, error) {
	if taskID == "" {
		return nil, nil
	}
	var generation WorkbenchGeneration
	err := DB.Where("token_id = ? AND task_id = ?", tokenID, taskID).Take(&generation).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &generation, nil
}

// DeleteUserGeneration 删除归属该用户的记录并返回被删行（含 FilePath 供删文件）。
func DeleteUserGeneration(id int64, userID int) (*WorkbenchGeneration, error) {
	generation, err := GetUserGeneration(id, userID)
	if err != nil {
		return nil, err
	}
	if err := DB.Where("id = ? AND user_id = ?", id, userID).Delete(&WorkbenchGeneration{}).Error; err != nil {
		return nil, err
	}
	return generation, nil
}

// DeleteExpiredBatches 分批删除 expires_at < now 的记录并返回全部被删行。
// 行删除按主键进行，多节点并发执行是幂等的。
func DeleteExpiredBatches(now int64, batchSize int) ([]WorkbenchGeneration, error) {
	if batchSize <= 0 {
		batchSize = workbenchGenerationDeleteDefaultBatch
	}
	deleted := make([]WorkbenchGeneration, 0)
	for {
		var batch []WorkbenchGeneration
		if err := DB.Where("expires_at < ?", now).
			Order("expires_at").Limit(batchSize).Find(&batch).Error; err != nil {
			return deleted, err
		}
		if len(batch) == 0 {
			return deleted, nil
		}
		ids := make([]int64, len(batch))
		for i := range batch {
			ids[i] = batch[i].ID
		}
		if err := DB.Where("id IN ? AND expires_at < ?", ids, now).
			Delete(&WorkbenchGeneration{}).Error; err != nil {
			return deleted, err
		}
		deleted = append(deleted, batch...)
		if len(batch) < batchSize {
			return deleted, nil
		}
	}
}
