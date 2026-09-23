package service

import (
	"bytes"
	"errors"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWorkbenchMediaSaveOpenDeleteRoundTrip(t *testing.T) {
	t.Setenv("WORKBENCH_MEDIA_DIR", t.TempDir())

	content := []byte("fake-image-bytes")
	relPath, size, err := SaveWorkbenchMedia(42, "PNG", bytes.NewReader(content), WorkbenchMediaMaxImageBytes)
	require.NoError(t, err)
	assert.Equal(t, int64(len(content)), size)
	assert.True(t, strings.HasPrefix(relPath, "42/"))
	assert.True(t, strings.HasSuffix(relPath, ".png"))

	file, err := OpenWorkbenchMedia(relPath)
	require.NoError(t, err)
	readBack, err := io.ReadAll(file)
	require.NoError(t, err)
	require.NoError(t, file.Close())
	assert.Equal(t, content, readBack)

	require.NoError(t, DeleteWorkbenchMedia(relPath))
	// 幂等：重复删除不报错
	require.NoError(t, DeleteWorkbenchMedia(relPath))
}

func TestWorkbenchMediaSaveRejectsOversize(t *testing.T) {
	t.Setenv("WORKBENCH_MEDIA_DIR", t.TempDir())

	_, _, err := SaveWorkbenchMedia(42, "png", strings.NewReader("0123456789abcdef"), 8)
	require.ErrorIs(t, err, ErrWorkbenchMediaTooLarge)

	// 不残留半成品文件
	entries, err := os.ReadDir(filepath.Join(WorkbenchMediaRoot(), "42"))
	require.NoError(t, err)
	assert.Empty(t, entries)
}

func TestWorkbenchMediaAbsPathRejectsEscape(t *testing.T) {
	t.Setenv("WORKBENCH_MEDIA_DIR", t.TempDir())

	// 注意："/abs/path" 在 Windows 上不是绝对路径（无卷名），会被解析到 root 之内，
	// 不构成逃逸，因此只断言解析结果必须留在 root 内（见下方用例）。
	for _, relPath := range []string{"../outside.txt", "..", "1/../../outside.txt", ""} {
		_, err := WorkbenchMediaAbsPath(relPath)
		assert.Error(t, err, "path %q must be rejected", relPath)
		_, err = OpenWorkbenchMedia(relPath)
		assert.Error(t, err, "open %q must be rejected", relPath)
	}

	abs, err := WorkbenchMediaAbsPath("1/abc.png")
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(abs, WorkbenchMediaRoot()+string(os.PathSeparator)))
}

func TestRecordWorkbenchGenerationSetsExpiry(t *testing.T) {
	t.Setenv("WORKBENCH_MEDIA_DIR", t.TempDir())
	before := time.Now()
	require.NoError(t, RecordWorkbenchGeneration(42, 7, model.WorkbenchGenerationTypeImage,
		"gpt-image-1", "a cat", `{"size":"1024x1024"}`, "", "42/x.png", "image/png", 123))
	after := time.Now()

	var generation model.WorkbenchGeneration
	require.NoError(t, model.DB.Where("user_id = ? AND token_id = ?", 42, 7).Take(&generation).Error)
	assert.Equal(t, model.WorkbenchGenerationTypeImage, generation.Type)
	assert.Equal(t, "42/x.png", generation.FilePath)
	assert.GreaterOrEqual(t, generation.ExpiresAt, before.Add(WorkbenchGenerationRetention).Unix())
	assert.LessOrEqual(t, generation.ExpiresAt, after.Add(WorkbenchGenerationRetention).Unix())
	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM workbench_generations WHERE id = ?", generation.ID)
	})
}

func newCaptureTestWriter(t *testing.T) (*WorkbenchMediaCaptureWriter, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	writer, err := NewWorkbenchMediaCaptureWriter(ctx.Writer, 42)
	require.NoError(t, err)
	t.Cleanup(writer.Discard)
	return writer, recorder
}

func TestCaptureWriterFinalizeKeepsValidCapture(t *testing.T) {
	t.Setenv("WORKBENCH_MEDIA_DIR", t.TempDir())
	writer, recorder := newCaptureTestWriter(t)

	payload := []byte("video-bytes")
	_, err := writer.Write(payload)
	require.NoError(t, err)
	assert.Equal(t, payload, recorder.Body.Bytes())

	relPath, mimeType, sizeBytes, keep, err := writer.Finalize(200, "video/mp4", int64(len(payload)))
	require.NoError(t, err)
	require.True(t, keep)
	assert.Equal(t, "video/mp4", mimeType)
	assert.Equal(t, int64(len(payload)), sizeBytes)
	assert.True(t, strings.HasSuffix(relPath, ".mp4"))

	file, err := OpenWorkbenchMedia(relPath)
	require.NoError(t, err)
	readBack, err := io.ReadAll(file)
	require.NoError(t, err)
	require.NoError(t, file.Close())
	assert.Equal(t, payload, readBack)
}

func TestCaptureWriterFinalizeDiscardsInvalidCapture(t *testing.T) {
	t.Setenv("WORKBENCH_MEDIA_DIR", t.TempDir())

	t.Run("non-200 status", func(t *testing.T) {
		writer, _ := newCaptureTestWriter(t)
		_, err := writer.Write([]byte("bytes"))
		require.NoError(t, err)
		_, _, _, keep, err := writer.Finalize(206, "video/mp4", -1)
		require.NoError(t, err)
		assert.False(t, keep)
	})

	t.Run("content length mismatch", func(t *testing.T) {
		writer, _ := newCaptureTestWriter(t)
		_, err := writer.Write([]byte("bytes"))
		require.NoError(t, err)
		_, _, _, keep, err := writer.Finalize(200, "video/mp4", 999)
		require.NoError(t, err)
		assert.False(t, keep)
	})

	t.Run("empty body", func(t *testing.T) {
		writer, _ := newCaptureTestWriter(t)
		_, _, _, keep, err := writer.Finalize(200, "video/mp4", -1)
		require.NoError(t, err)
		assert.False(t, keep)
	})

	t.Run("client write error marks failed", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		writer, err := NewWorkbenchMediaCaptureWriter(ctx.Writer, 42)
		require.NoError(t, err)
		defer writer.Discard()
		// 关闭捕获文件模拟文件写失败
		require.NoError(t, writer.file.Close())
		_, err = writer.Write([]byte("bytes"))
		require.NoError(t, err) // 客户端写不受影响
		_, _, _, keep, err := writer.Finalize(200, "video/mp4", -1)
		require.NoError(t, err)
		assert.False(t, keep)
	})

	t.Run("oversize marks failed", func(t *testing.T) {
		writer, _ := newCaptureTestWriter(t)
		writer.written = WorkbenchMediaMaxVideoBytes
		_, err := writer.Write([]byte("x"))
		require.NoError(t, err)
		_, _, _, keep, err := writer.Finalize(200, "video/mp4", -1)
		require.NoError(t, err)
		assert.False(t, keep)
	})
}

func TestCleanupWorkbenchMediaOrphans(t *testing.T) {
	t.Setenv("WORKBENCH_MEDIA_DIR", t.TempDir())
	root := WorkbenchMediaRoot()
	userDir := filepath.Join(root, "42")
	require.NoError(t, os.MkdirAll(userDir, 0o755))

	now := time.Now()
	oldFile := filepath.Join(userDir, "old.mp4")
	freshFile := filepath.Join(userDir, "fresh.mp4")
	oldPart := filepath.Join(userDir, ".capture-stale.part")
	for _, path := range []string{oldFile, freshFile, oldPart} {
		require.NoError(t, os.WriteFile(path, []byte("x"), 0o600))
	}
	oldTime := now.Add(-49 * time.Hour)
	require.NoError(t, os.Chtimes(oldFile, oldTime, oldTime))
	require.NoError(t, os.Chtimes(oldPart, oldTime, oldTime))

	removed, err := CleanupWorkbenchMediaOrphans(now)
	require.NoError(t, err)
	assert.Equal(t, 2, removed)
	_, err = os.Stat(oldFile)
	assert.True(t, errors.Is(err, os.ErrNotExist))
	_, err = os.Stat(oldPart)
	assert.True(t, errors.Is(err, os.ErrNotExist))
	_, err = os.Stat(freshFile)
	assert.NoError(t, err)
	// 目录非空，不删除
	_, err = os.Stat(userDir)
	assert.NoError(t, err)

	// 删掉剩余文件后再次清理，空用户目录被移除
	require.NoError(t, os.Remove(freshFile))
	removed, err = CleanupWorkbenchMediaOrphans(now)
	require.NoError(t, err)
	assert.Equal(t, 0, removed)
	_, err = os.Stat(userDir)
	assert.True(t, errors.Is(err, os.ErrNotExist))
}
