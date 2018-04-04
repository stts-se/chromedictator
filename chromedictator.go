package main

import (
	"fmt"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"time"
)

//func js(w http.ResponseWriter, r *http.Request) {
//	http.ServeFile(w, r, "./js/dictator.js")
//}

func index(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "./js/index.html")
}

func main() {

	p := "7654"
	r := mux.NewRouter()
	r.StrictSlash(true)

	// TODO Probably needs prefix, e.g. /dict/
	r.HandleFunc("/", index)

	r.PathPrefix("/js/").Handler(http.StripPrefix("/js/", http.FileServer(http.Dir("js/"))))

	srv := &http.Server{
		Handler:      r,
		Addr:         "127.0.0.1:" + p,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}
	log.Println("chromedictator server started on localhost:" + p)
	log.Fatal(srv.ListenAndServe())
	fmt.Println("No fun")
}
