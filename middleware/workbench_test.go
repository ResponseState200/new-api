package middleware

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func runWorkbenchValidation(t *testing.T, method string, body *bytes.Buffer, contentType string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	router := gin.New()
	router.Handle(method, "/", handler, func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(method, "/", body)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestValidateWorkbenchImageRequest(t *testing.T) {
	valid := runWorkbenchValidation(
		t,
		http.MethodPost,
		bytes.NewBufferString(`{"model":"image-2","prompt":"a lighthouse","size":"1024x1024","n":1}`),
		"application/json",
		ValidateWorkbenchImageRequest(),
	)
	assert.Equal(t, http.StatusNoContent, valid.Code)

	invalid := runWorkbenchValidation(
		t,
		http.MethodPost,
		bytes.NewBufferString(`{"model":"image-2","prompt":"a lighthouse","size":"64x64","n":1}`),
		"application/json",
		ValidateWorkbenchImageRequest(),
	)
	assert.Equal(t, http.StatusBadRequest, invalid.Code)
	assert.Contains(t, invalid.Body.String(), "size is out of range")
}

func TestValidateWorkbenchVideoRequest(t *testing.T) {
	valid := runWorkbenchValidation(
		t,
		http.MethodPost,
		bytes.NewBufferString(`{"model":"video-2","prompt":"a lighthouse","mode":"text_to_video","duration_seconds":5,"ratio":"16:9","video_resolution":"720p"}`),
		"application/json",
		ValidateWorkbenchVideoRequest(),
	)
	assert.Equal(t, http.StatusNoContent, valid.Code)

	missingPrompt := runWorkbenchValidation(
		t,
		http.MethodPost,
		bytes.NewBufferString(`{"model":"video-2","mode":"text_to_video","duration_seconds":5}`),
		"application/json",
		ValidateWorkbenchVideoRequest(),
	)
	assert.Equal(t, http.StatusBadRequest, missingPrompt.Code)
	assert.Contains(t, missingPrompt.Body.String(), "model and prompt are required")

	invalidDuration := runWorkbenchValidation(
		t,
		http.MethodPost,
		bytes.NewBufferString(`{"model":"video-2","prompt":"a lighthouse","mode":"text_to_video","duration_seconds":3601}`),
		"application/json",
		ValidateWorkbenchVideoRequest(),
	)
	assert.Equal(t, http.StatusBadRequest, invalidDuration.Code)
	assert.Contains(t, invalidDuration.Body.String(), "duration_seconds is out of range")
}

func TestValidateWorkbenchImageToVideoMultipartRequest(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "video-2"))
	require.NoError(t, writer.WriteField("prompt", "animate the lighthouse"))
	require.NoError(t, writer.WriteField("mode", "image_to_video"))
	require.NoError(t, writer.WriteField("duration_seconds", "5"))
	require.NoError(t, writer.WriteField("ratio", "16:9"))
	require.NoError(t, writer.WriteField("video_resolution", "720p"))

	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="input_reference"; filename="reference.png"`)
	header.Set("Content-Type", "image/png")
	part, err := writer.CreatePart(header)
	require.NoError(t, err)
	_, err = part.Write([]byte("png-data"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	valid := runWorkbenchValidation(
		t,
		http.MethodPost,
		&body,
		writer.FormDataContentType(),
		ValidateWorkbenchVideoRequest(),
	)
	assert.Equal(t, http.StatusNoContent, valid.Code)

	var missingImage bytes.Buffer
	missingImageWriter := multipart.NewWriter(&missingImage)
	require.NoError(t, missingImageWriter.WriteField("model", "video-2"))
	require.NoError(t, missingImageWriter.WriteField("prompt", "animate the lighthouse"))
	require.NoError(t, missingImageWriter.WriteField("mode", "image_to_video"))
	require.NoError(t, missingImageWriter.WriteField("duration_seconds", "5"))
	require.NoError(t, missingImageWriter.Close())

	invalid := runWorkbenchValidation(
		t,
		http.MethodPost,
		&missingImage,
		missingImageWriter.FormDataContentType(),
		ValidateWorkbenchVideoRequest(),
	)
	assert.Equal(t, http.StatusBadRequest, invalid.Code)
	assert.Contains(t, invalid.Body.String(), "image_to_video requires an image upload")
}
