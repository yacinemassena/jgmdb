package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

var (
	stateMu   sync.Mutex
	stateFile string
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

func main() {
	stateFile = resolveStatePath()
	if dir := filepath.Dir(stateFile); dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}
	log.Printf("state file: %s", stateFile)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	mux := http.NewServeMux()
	mux.HandleFunc("/api/state", handleState)
	mux.Handle("/", http.FileServer(http.Dir(".")))

	log.Printf("serving on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
