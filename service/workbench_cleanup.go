package service

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	workbenchGenerationCleanupInterval  = 30 * time.Minute
	workbenchGenerationCleanupBatchSize = 500
)

// StartWorkbenchGenerationCleanup 清理过期的生成记录与媒体文件。
// 媒体文件是节点本地存储且行删除幂等，因此与 auth_cleanup 不同，
// 所有节点（而非仅 master）都要运行本任务。
func StartWorkbenchGenerationCleanup() {
	go func() {
		cleanupWorkbenchGenerations()
		ticker := time.NewTicker(workbenchGenerationCleanupInterval)
		defer ticker.Stop()
		for range ticker.C {
			cleanupWorkbenchGenerations()
		}
	}()
}

func cleanupWorkbenchGenerations() {
	now := time.Now()
	deleted, err := model.DeleteExpiredBatches(now.Unix(), workbenchGenerationCleanupBatchSize)
	if err != nil {
		common.SysError("failed to delete expired workbench generations: " + err.Error())
	}
	for i := range deleted {
		if err := DeleteWorkbenchMedia(deleted[i].FilePath); err != nil {
			common.SysError(fmt.Sprintf("failed to delete workbench media %q: %s", deleted[i].FilePath, err.Error()))
		}
	}
	if len(deleted) > 0 {
		common.SysLog(fmt.Sprintf("workbench generation cleanup removed %d expired records", len(deleted)))
	}
	removed, err := CleanupWorkbenchMediaOrphans(now)
	if err != nil {
		common.SysError("failed to clean up workbench media orphans: " + err.Error())
	} else if removed > 0 {
		common.SysLog(fmt.Sprintf("workbench media orphan cleanup removed %d files", removed))
	}
}
