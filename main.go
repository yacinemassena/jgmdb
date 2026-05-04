package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

func init() {
	// Some hosts don't ship text/vtt in the default MIME table; browsers
	// reject WebVTT served with the wrong content type.
	_ = mime.AddExtensionType(".vtt", "text/vtt; charset=utf-8")
}

const (
	maxVideoBytes = int64(10) * 1024 * 1024 * 1024 // 10 GB ceiling for video uploads
	partSize      = int64(32) * 1024 * 1024        // 32 MB per multipart chunk
)

var (
	stateMu       sync.Mutex
	stateFile     string
	s3Client      *s3.Client
	s3Presigner   *s3.PresignClient
	r2Bucket      string
	r2PublicBase  string
	adminPassword string
)

const emptyState = `{"profiles":[],"activeProfileId":null,"watchEvents":[]}`

func resolveStatePath() string {
	if p := os.Getenv("STATE_FILE"); p != "" {
		return p
	}
	if _, err := os.Stat("/data"); err == nil {
		return "/data/state.json"
	}
	return "./state.json"
}

func handleState(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		stateMu.Lock()
		defer stateMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		f, err := os.Open(stateFile)
		if err != nil {
			if os.IsNotExist(err) {
				io.WriteString(w, emptyState)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()
		io.Copy(w, f)

	case http.MethodPost:
		body, err := io.ReadAll(io.LimitReader(r.Body, 5<<20)) // 5 MB cap
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var raw json.RawMessage
		if err := json.Unmarshal(body, &raw); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		stateMu.Lock()
		defer stateMu.Unlock()
		tmp := stateFile + ".tmp"
		if err := os.WriteFile(tmp, body, 0644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := os.Rename(tmp, stateFile); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── R2 upload presigning ─────────────────────────────────────────────────────

var slugRegexp = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(s)
	s = slugRegexp.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "file"
	}
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

var allowedVideo = map[string]string{
	"video/mp4":       ".mp4",
	"video/quicktime": ".mov",
}

var allowedImage = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
}

func requireAdmin(r *http.Request) bool {
	got := r.Header.Get("X-Admin-Pass")
	return adminPassword != "" &&
		subtle.ConstantTimeCompare([]byte(got), []byte(adminPassword)) == 1
}

func r2Ready() bool { return s3Client != nil }

func newKey(prefix, filename, ext string) string {
	base := filename
	if i := strings.LastIndex(base, "."); i >= 0 {
		base = base[:i]
	}
	return fmt.Sprintf("%s%s-%d%s", prefix, slugify(base), time.Now().Unix(), ext)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

// POST /api/upload-url — single presigned PUT for thumbnails (small files).
//
// body: {kind: "thumbnail", filename, contentType}
// resp: {uploadUrl, publicUrl, key}
func handleUploadURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !r2Ready() {
		http.Error(w, "r2 not configured", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Kind        string `json:"kind"`
		Filename    string `json:"filename"`
		ContentType string `json:"contentType"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Kind != "thumbnail" {
		http.Error(w, "use /api/upload-init for video uploads", http.StatusBadRequest)
		return
	}
	ext := allowedImage[req.ContentType]
	if ext == "" {
		http.Error(w, "unsupported image type", http.StatusBadRequest)
		return
	}

	key := newKey("thumbnails/", req.Filename, ext)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	presigned, err := s3Presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r2Bucket),
		Key:         aws.String(key),
		ContentType: aws.String(req.ContentType),
	}, s3.WithPresignExpires(1*time.Hour))
	if err != nil {
		log.Printf("[r2] presign error: %v", err)
		http.Error(w, "presign failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"uploadUrl": presigned.URL,
		"publicUrl": strings.TrimRight(r2PublicBase, "/") + "/" + key,
		"key":       key,
	})
}

// POST /api/upload-init — start a multipart upload for a video.
//
// body: {filename, contentType}
// resp: {uploadId, key, publicUrl, partSize, maxBytes}
func handleUploadInit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !r2Ready() {
		http.Error(w, "r2 not configured", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Filename    string `json:"filename"`
		ContentType string `json:"contentType"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	ext := allowedVideo[req.ContentType]
	if ext == "" {
		http.Error(w, "unsupported video type", http.StatusBadRequest)
		return
	}

	key := newKey("videos/", req.Filename, ext)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	out, err := s3Client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(r2Bucket),
		Key:         aws.String(key),
		ContentType: aws.String(req.ContentType),
	})
	if err != nil {
		log.Printf("[r2] create multipart error: %v", err)
		http.Error(w, "init failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"uploadId":  aws.ToString(out.UploadId),
		"key":       key,
		"publicUrl": strings.TrimRight(r2PublicBase, "/") + "/" + key,
		"partSize":  partSize,
		"maxBytes":  maxVideoBytes,
	})
}

// POST /api/upload-part — presigned URL for one part of a multipart upload.
//
// body: {key, uploadId, partNumber}
// resp: {url}
func handleUploadPart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !r2Ready() {
		http.Error(w, "r2 not configured", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Key        string `json:"key"`
		UploadId   string `json:"uploadId"`
		PartNumber int32  `json:"partNumber"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Key == "" || req.UploadId == "" || req.PartNumber < 1 || req.PartNumber > 10000 {
		http.Error(w, "invalid params", http.StatusBadRequest)
		return
	}
	// Hard ceiling: maxVideoBytes / partSize parts. Above this, refuse.
	if int64(req.PartNumber)*partSize > maxVideoBytes+partSize {
		http.Error(w, "part number exceeds 10 GB cap", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	presigned, err := s3Presigner.PresignUploadPart(ctx, &s3.UploadPartInput{
		Bucket:     aws.String(r2Bucket),
		Key:        aws.String(req.Key),
		UploadId:   aws.String(req.UploadId),
		PartNumber: aws.Int32(req.PartNumber),
	}, s3.WithPresignExpires(1*time.Hour))
	if err != nil {
		log.Printf("[r2] presign part error: %v", err)
		http.Error(w, "presign failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"url": presigned.URL})
}

// POST /api/upload-complete — finalize multipart upload.
//
// body: {key, uploadId, parts: [{etag, partNumber}, ...]}
// resp: {publicUrl}
func handleUploadComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !r2Ready() {
		http.Error(w, "r2 not configured", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Key      string `json:"key"`
		UploadId string `json:"uploadId"`
		Parts    []struct {
			ETag       string `json:"etag"`
			PartNumber int32  `json:"partNumber"`
		} `json:"parts"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Key == "" || req.UploadId == "" || len(req.Parts) == 0 {
		http.Error(w, "invalid params", http.StatusBadRequest)
		return
	}

	completed := make([]types.CompletedPart, len(req.Parts))
	for i, p := range req.Parts {
		completed[i] = types.CompletedPart{
			ETag:       aws.String(p.ETag),
			PartNumber: aws.Int32(p.PartNumber),
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	_, err := s3Client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:          aws.String(r2Bucket),
		Key:             aws.String(req.Key),
		UploadId:        aws.String(req.UploadId),
		MultipartUpload: &types.CompletedMultipartUpload{Parts: completed},
	})
	if err != nil {
		log.Printf("[r2] complete multipart error: %v", err)
		http.Error(w, "complete failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"publicUrl": strings.TrimRight(r2PublicBase, "/") + "/" + req.Key,
	})
}

// POST /api/upload-abort — cancel a multipart upload (call on tab close / cancel).
//
// body: {key, uploadId}
func handleUploadAbort(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requireAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !r2Ready() {
		http.Error(w, "r2 not configured", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Key      string `json:"key"`
		UploadId string `json:"uploadId"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Key == "" || req.UploadId == "" {
		http.Error(w, "invalid params", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if _, err := s3Client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(r2Bucket),
		Key:      aws.String(req.Key),
		UploadId: aws.String(req.UploadId),
	}); err != nil {
		log.Printf("[r2] abort multipart error: %v", err)
		http.Error(w, "abort failed", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func setupR2() {
	accountID := os.Getenv("R2_ACCOUNT_ID")
	accessKey := os.Getenv("R2_ACCESS_KEY_ID")
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	bucket := os.Getenv("R2_BUCKET")
	publicBase := os.Getenv("R2_PUBLIC_BASE")

	if accountID == "" || accessKey == "" || secretKey == "" || bucket == "" || publicBase == "" {
		log.Printf("[r2] credentials not set — upload endpoints disabled")
		return
	}

	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)

	cfg := aws.Config{
		Region:                     "auto",
		Credentials:                credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
	}

	s3Client = s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})
	s3Presigner = s3.NewPresignClient(s3Client)
	r2Bucket = bucket
	r2PublicBase = publicBase

	log.Printf("[r2] configured: bucket=%s endpoint=%s", bucket, endpoint)
}

func main() {
	stateFile = resolveStatePath()
	if dir := filepath.Dir(stateFile); dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}
	log.Printf("state file: %s", stateFile)

	adminPassword = os.Getenv("ADMIN_PASS")
	if adminPassword == "" {
		// Matches the JS-side ADMIN_PASSWORD constant for local-dev convenience.
		adminPassword = "nourjamo"
	}

	setupR2()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	mux := http.NewServeMux()
	mux.HandleFunc("/api/state", handleState)
	mux.HandleFunc("/api/upload-url", handleUploadURL)
	mux.HandleFunc("/api/upload-init", handleUploadInit)
	mux.HandleFunc("/api/upload-part", handleUploadPart)
	mux.HandleFunc("/api/upload-complete", handleUploadComplete)
	mux.HandleFunc("/api/upload-abort", handleUploadAbort)
	mux.Handle("/", http.FileServer(http.Dir(".")))

	log.Printf("serving on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
