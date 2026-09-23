package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	// WorkbenchMediaMaxImageBytes 图片捕获上限 32MB。
	WorkbenchMediaMaxImageBytes int64 = 32 << 20
	// WorkbenchMediaMaxVideoBytes 视频捕获上限 256MB。
	WorkbenchMediaMaxVideoBytes int64 = 256 << 20
	// WorkbenchGenerationRetention 生成记录跟随账户的保留时长。
	WorkbenchGenerationRetention = 24 * time.Hour
	// workbenchMediaOrphanMaxAge 孤儿文件（无对应记录，如捕获中断残留）的磁碟保留时长。
	workbenchMediaOrphanMaxAge = 48 * time.Hour
)

var ErrWorkbenchMediaTooLarge = errors.New("workbench media exceeds size limit")

// WorkbenchMediaRoot 返回媒体根目录。默认跟随项目数据目录约定（相对工作目录的
// data/workbench_media，与 ./logs、one-api.db 的默认位置同级），可用
// WORKBENCH_MEDIA_DIR 覆盖。每次调用实时解析，便于测试用 env 隔离。
func WorkbenchMediaRoot() string {
	dir := strings.TrimSpace(os.Getenv("WORKBENCH_MEDIA_DIR"))
	if dir == "" {
		dir = filepath.Join("data", "workbench_media")
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return dir
	}
	return abs
}

// WorkbenchMediaAbsPath 将库中存储的相对路径解析为绝对路径，并校验其必须位于
// 媒体根目录之内，防止 ../ 等方式逃逸。
func WorkbenchMediaAbsPath(relPath string) (string, error) {
	cleaned := filepath.Clean(filepath.FromSlash(strings.TrimSpace(relPath)))
	if cleaned == "." || filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("invalid workbench media path %q", relPath)
	}
	root := WorkbenchMediaRoot()
	abs := filepath.Join(root, cleaned)
	if abs != root && !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("workbench media path %q escapes media root", relPath)
	}
	return abs, nil
}

// SaveWorkbenchMedia 将媒体内容写入 `<root>/<userID>/<rand>.<ext>`，
// 超限（读取超过 maxBytes）时报错并清理半成品文件。返回相对 media root 的路径与实际字节数。
func SaveWorkbenchMedia(userID int, ext string, reader io.Reader, maxBytes int64) (string, int64, error) {
	if userID <= 0 {
		return "", 0, fmt.Errorf("invalid user id %d", userID)
	}
	if maxBytes <= 0 {
		return "", 0, fmt.Errorf("invalid max bytes %d", maxBytes)
	}
	ext = sanitizeWorkbenchMediaExt(ext)
	userDirName := strconv.Itoa(userID)
	userDir := filepath.Join(WorkbenchMediaRoot(), userDirName)
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		return "", 0, err
	}
	fileName, err := randomWorkbenchMediaName(ext)
	if err != nil {
		return "", 0, err
	}
	finalPath := filepath.Join(userDir, fileName)
	tmpPath := finalPath + ".part"

	file, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", 0, err
	}
	written, copyErr := io.Copy(file, io.LimitReader(reader, maxBytes+1))
	closeErr := file.Close()
	if copyErr == nil && closeErr == nil && written > maxBytes {
		copyErr = ErrWorkbenchMediaTooLarge
	}
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(tmpPath)
		if copyErr != nil {
			return "", 0, copyErr
		}
		return "", 0, closeErr
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", 0, err
	}
	return filepath.ToSlash(filepath.Join(userDirName, fileName)), written, nil
}

// OpenWorkbenchMedia 打开相对路径对应的媒体文件。
func OpenWorkbenchMedia(relPath string) (*os.File, error) {
	abs, err := WorkbenchMediaAbsPath(relPath)
	if err != nil {
		return nil, err
	}
	return os.Open(abs)
}

// DeleteWorkbenchMedia 删除相对路径对应的媒体文件；文件不存在视为成功（幂等）。
func DeleteWorkbenchMedia(relPath string) error {
	if strings.TrimSpace(relPath) == "" {
		return nil
	}
	abs, err := WorkbenchMediaAbsPath(relPath)
	if err != nil {
		return err
	}
	if err := os.Remove(abs); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// RecordWorkbenchGeneration 写入一条生成记录，保留期 24 小时。
func RecordWorkbenchGeneration(userID, tokenID int, genType, modelName, prompt, params, taskID, relPath, mimeType string, sizeBytes int64) error {
	now := time.Now()
	generation := &model.WorkbenchGeneration{
		CreatedAt: now.Unix(),
		UserId:    userID,
		TokenId:   tokenID,
		Type:      genType,
		Model:     modelName,
		Prompt:    prompt,
		Params:    params,
		TaskID:    taskID,
		FilePath:  relPath,
		MimeType:  mimeType,
		SizeBytes: sizeBytes,
		ExpiresAt: now.Add(WorkbenchGenerationRetention).Unix(),
	}
	return generation.Create()
}

// WorkbenchMediaExtForMimeType 返回已知媒体类型对应的扩展名；未知类型返回空串。
func WorkbenchMediaExtForMimeType(mimeType string) string {
	switch strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0])) {
	case "image/png":
		return "png"
	case "image/jpeg":
		return "jpg"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	case "video/mp4":
		return "mp4"
	case "video/webm":
		return "webm"
	case "video/quicktime":
		return "mov"
	default:
		return ""
	}
}

// CleanupWorkbenchMediaOrphans 删除媒体根目录下 mtime 早于 48h 的孤儿文件
// （含捕获中断残留的 .part 临时文件），并清理空用户目录。返回删除的文件数。
func CleanupWorkbenchMediaOrphans(now time.Time) (int, error) {
	root := WorkbenchMediaRoot()
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	cutoff := now.Add(-workbenchMediaOrphanMaxAge)
	removed := 0
	removeIfOld := func(dir string, entry os.DirEntry) {
		info, err := entry.Info()
		if err != nil || !info.ModTime().Before(cutoff) {
			return
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err == nil {
			removed++
		}
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			removeIfOld(root, entry)
			continue
		}
		userDir := filepath.Join(root, entry.Name())
		files, err := os.ReadDir(userDir)
		if err != nil {
			continue
		}
		for _, file := range files {
			if file.IsDir() {
				continue
			}
			removeIfOld(userDir, file)
		}
		// 仅在目录为空时成功，非空时忽略错误
		_ = os.Remove(userDir)
	}
	return removed, nil
}

func sanitizeWorkbenchMediaExt(ext string) string {
	ext = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
	if len(ext) == 0 || len(ext) > 8 {
		return "bin"
	}
	for _, r := range ext {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return "bin"
		}
	}
	return ext
}

func randomWorkbenchMediaName(ext string) (string, error) {
	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(randBytes) + "." + ext, nil
}

// WorkbenchMediaCaptureWriter 是一个 tee 响应 writer：写客户端优先，
// 同时把响应体写入节点本地临时文件；文件写失败或超过上限只标记不中断。
type WorkbenchMediaCaptureWriter struct {
	gin.ResponseWriter
	file    *os.File
	tmpPath string
	userID  int
	written int64
	failed  bool
}

// NewWorkbenchMediaCaptureWriter 在用户媒体目录下创建捕获临时文件并包装 writer。
// 创建失败时返回 error，调用方应回退为不捕获的普通代理。
func NewWorkbenchMediaCaptureWriter(w gin.ResponseWriter, userID int) (*WorkbenchMediaCaptureWriter, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("invalid user id %d", userID)
	}
	userDir := filepath.Join(WorkbenchMediaRoot(), strconv.Itoa(userID))
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		return nil, err
	}
	file, err := os.CreateTemp(userDir, ".capture-*.part")
	if err != nil {
		return nil, err
	}
	return &WorkbenchMediaCaptureWriter{
		ResponseWriter: w,
		file:           file,
		tmpPath:        file.Name(),
		userID:         userID,
	}, nil
}

func (w *WorkbenchMediaCaptureWriter) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	if err != nil {
		w.failed = true
	}
	if !w.failed && w.file != nil {
		if w.written+int64(len(b)) > WorkbenchMediaMaxVideoBytes {
			w.failed = true
		} else if _, ferr := w.file.Write(b); ferr != nil {
			w.failed = true
		} else {
			w.written += int64(len(b))
		}
	}
	return n, err
}

func (w *WorkbenchMediaCaptureWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

// WrittenBytes 返回已写入捕获文件的字节数。
func (w *WorkbenchMediaCaptureWriter) WrittenBytes() int64 {
	return w.written
}

// Discard 关闭并删除捕获临时文件（幂等）。
func (w *WorkbenchMediaCaptureWriter) Discard() {
	if w.file != nil {
		_ = w.file.Close()
		w.file = nil
	}
	if w.tmpPath != "" {
		_ = os.Remove(w.tmpPath)
		w.tmpPath = ""
	}
}

// Finalize 在代理结束后校验捕获结果：statusCode 必须为 200、无写错误、
// 字节数 >0 且不超上限、已知 Content-Length（>=0）必须与实际字节一致。
// 校验通过则把临时文件改名为正式媒体文件并返回相对路径；否则删除半成品。
func (w *WorkbenchMediaCaptureWriter) Finalize(statusCode int, contentType string, contentLength int64) (relPath, mimeType string, sizeBytes int64, keep bool, err error) {
	valid := !w.failed && statusCode == 200 && w.written > 0 && w.written <= WorkbenchMediaMaxVideoBytes &&
		(contentLength < 0 || contentLength == w.written)
	if !valid {
		w.Discard()
		return "", "", 0, false, nil
	}
	if w.file != nil {
		if cerr := w.file.Close(); cerr != nil {
			w.Discard()
			return "", "", 0, false, cerr
		}
		w.file = nil
	}
	mimeType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	ext := WorkbenchMediaExtForMimeType(mimeType)
	if ext == "" {
		ext = "bin"
	}
	fileName, err := randomWorkbenchMediaName(ext)
	if err != nil {
		w.Discard()
		return "", "", 0, false, err
	}
	userDirName := strconv.Itoa(w.userID)
	finalPath := filepath.Join(WorkbenchMediaRoot(), userDirName, fileName)
	if err := os.Rename(w.tmpPath, finalPath); err != nil {
		w.Discard()
		return "", "", 0, false, err
	}
	w.tmpPath = ""
	return filepath.ToSlash(filepath.Join(userDirName, fileName)), mimeType, w.written, true, nil
}
