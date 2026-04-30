package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	log.Printf("serving static files on %s", addr)
	if err := http.ListenAndServe(addr, http.FileServer(http.Dir("."))); err != nil {
		log.Fatal(err)
	}
}
