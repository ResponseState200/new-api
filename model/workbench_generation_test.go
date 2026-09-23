package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func insertWorkbenchGeneration(t *testing.T, generation *WorkbenchGeneration) {
	t.Helper()
	require.NoError(t, generation.Create())
	require.NotZero(t, generation.ID)
	t.Cleanup(func() {
		DB.Exec("DELETE FROM workbench_generations WHERE id = ?", generation.ID)
	})
}

func TestListUserGenerationsFiltersTypeExpiryAndOwnership(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()

	active := &WorkbenchGeneration{
		CreatedAt: now - 100, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeImage,
		Model: "gpt-image-1", Prompt: "cat", FilePath: "1/a.png", MimeType: "image/png",
		SizeBytes: 10, ExpiresAt: now + 3600,
	}
	newer := &WorkbenchGeneration{
		CreatedAt: now - 10, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeVideo,
		Model: "sora", Prompt: "dog", TaskID: "task_1", FilePath: "1/b.mp4", MimeType: "video/mp4",
		SizeBytes: 20, ExpiresAt: now + 3600,
	}
	expired := &WorkbenchGeneration{
		CreatedAt: now - 200, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeImage,
		Model: "gpt-image-1", Prompt: "old", FilePath: "1/c.png", MimeType: "image/png",
		SizeBytes: 10, ExpiresAt: now - 1,
	}
	otherUser := &WorkbenchGeneration{
		CreatedAt: now - 50, UserId: 2, TokenId: 22, Type: WorkbenchGenerationTypeImage,
		Model: "gpt-image-1", Prompt: "other", FilePath: "2/d.png", MimeType: "image/png",
		SizeBytes: 10, ExpiresAt: now + 3600,
	}
	for _, generation := range []*WorkbenchGeneration{active, newer, expired, otherUser} {
		insertWorkbenchGeneration(t, generation)
	}

	all, err := ListUserGenerations(1, "", now, 200)
	require.NoError(t, err)
	require.Len(t, all, 2)
	// created_at 倒序：新的在前
	assert.Equal(t, newer.ID, all[0].ID)
	assert.Equal(t, active.ID, all[1].ID)

	images, err := ListUserGenerations(1, WorkbenchGenerationTypeImage, now, 200)
	require.NoError(t, err)
	require.Len(t, images, 1)
	assert.Equal(t, active.ID, images[0].ID)

	videos, err := ListUserGenerations(1, WorkbenchGenerationTypeVideo, now, 200)
	require.NoError(t, err)
	require.Len(t, videos, 1)
	assert.Equal(t, newer.ID, videos[0].ID)

	// 过期记录不可见；expires_at == now 也不可见
	none, err := ListUserGenerations(1, "", now+3601, 200)
	require.NoError(t, err)
	assert.Empty(t, none)
}

func TestGetUserGenerationEnforcesOwnership(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()
	generation := &WorkbenchGeneration{
		CreatedAt: now, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeImage,
		FilePath: "1/a.png", MimeType: "image/png", ExpiresAt: now + 3600,
	}
	insertWorkbenchGeneration(t, generation)

	found, err := GetUserGeneration(generation.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, generation.ID, found.ID)

	_, err = GetUserGeneration(generation.ID, 2)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestGetByTokenTaskDedup(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()
	generation := &WorkbenchGeneration{
		CreatedAt: now, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeVideo,
		TaskID: "task_dedup", FilePath: "1/b.mp4", MimeType: "video/mp4", ExpiresAt: now + 3600,
	}
	insertWorkbenchGeneration(t, generation)

	found, err := GetByTokenTask(11, "task_dedup")
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, generation.ID, found.ID)

	// 其他 token 的同 task_id 不命中
	missing, err := GetByTokenTask(12, "task_dedup")
	require.NoError(t, err)
	assert.Nil(t, missing)

	missing, err = GetByTokenTask(11, "task_other")
	require.NoError(t, err)
	assert.Nil(t, missing)
}

func TestDeleteUserGeneration(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()
	generation := &WorkbenchGeneration{
		CreatedAt: now, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeImage,
		FilePath: "1/a.png", MimeType: "image/png", ExpiresAt: now + 3600,
	}
	insertWorkbenchGeneration(t, generation)

	_, err := DeleteUserGeneration(generation.ID, 2)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	deleted, err := DeleteUserGeneration(generation.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, "1/a.png", deleted.FilePath)

	_, err = GetUserGeneration(generation.ID, 1)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestDeleteExpiredBatchesReturnsRowsWithFilePaths(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()

	const expiredCount = 7
	for i := 0; i < expiredCount; i++ {
		insertWorkbenchGeneration(t, &WorkbenchGeneration{
			CreatedAt: now - 1000, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeImage,
			FilePath: "1/expired.png", MimeType: "image/png", ExpiresAt: now - int64(100-i),
		})
	}
	active := &WorkbenchGeneration{
		CreatedAt: now, UserId: 1, TokenId: 11, Type: WorkbenchGenerationTypeImage,
		FilePath: "1/active.png", MimeType: "image/png", ExpiresAt: now + 3600,
	}
	insertWorkbenchGeneration(t, active)

	// batchSize=3 强制多批：7 条过期记录需要 3 批删完
	deleted, err := DeleteExpiredBatches(now, 3)
	require.NoError(t, err)
	require.Len(t, deleted, expiredCount)
	for _, generation := range deleted {
		assert.Equal(t, "1/expired.png", generation.FilePath)
	}

	// 未过期记录保留；再次删除为空
	remaining, err := ListUserGenerations(1, "", now, 200)
	require.NoError(t, err)
	require.Len(t, remaining, 1)
	assert.Equal(t, active.ID, remaining[0].ID)

	deleted, err = DeleteExpiredBatches(now, 3)
	require.NoError(t, err)
	assert.Empty(t, deleted)
}
