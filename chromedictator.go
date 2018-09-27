package main

import (
	"encoding/gob"
	"fmt"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

//func js(w http.ResponseWriter, r *http.Request) {
//	http.ServeFile(w, r, "./js/dictator.js")
//}

var abbrevs = make(map[string]string)
var mutex = &sync.RWMutex{}

func mapGob2File(m map[string]string, fName string) error {

	mutex.Lock()
	defer mutex.Unlock()

	fh, err := os.Open(fName)
	if err != nil {
		return fmt.Errorf("mapGob2File: failed to open file: %v", err)
	}
	defer fh.Close()

	encoder := gob.NewEncoder(fh)
	err = encoder.Encode(m)
	if err != nil {
		return fmt.Errorf("mapGob2File: gob encoding failed: %v", err)
	}

	return nil
}

func gobFile2Map(fName string) (map[string]string, error) {

	mutex.Lock()
	defer mutex.Unlock()

	fh, err := os.Open(fName)
	if err != nil {
		return nil, fmt.Errorf("gobFile2Map: failed to open file: %v", err)
	}
	defer fh.Close()

	decoder := gob.NewDecoder(fh)
	m := make(map[string]string)
	err = decoder.Decode(m)
	if err != nil {
		return nil, fmt.Errorf("gobFile2Map: gob decoding failed: %v", err)
	}

	return m, nil
}

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
