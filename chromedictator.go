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

func map2GobFile(m map[string]string, fName string) error {

	mutex.Lock()
	defer mutex.Unlock()

	fh, err := os.OpenFile(fName, os.O_RDWR|os.O_CREATE, 0755)
	if err != nil {
		return fmt.Errorf("map2GobFile: failed to open file: %v", err)
	}
	defer fh.Close()

	encoder := gob.NewEncoder(fh)
	err = encoder.Encode(m)
	if err != nil {
		return fmt.Errorf("map2GobFile: gob encoding failed: %v", err)
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
	err = decoder.Decode(&m)
	if err != nil {
		return nil, fmt.Errorf("gobFile2Map: gob decoding failed: %v", err)
	}

	// test
	//fmt.Printf("%#v", m)

	return m, nil
}

func index(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "./js/index.html")
}

func main() {

	fn := "testfile.gob"
	m := map[string]string{"a": "apa", "b": "bepa", "c": "cepa", "d": "depa"}
	err := map2GobFile(m, fn)
	if err != nil {
		fmt.Printf("Major disaster: %v\n", err)
		return
	}

	m2, err := gobFile2Map(fn)
	if err != nil {
		fmt.Printf("Major disaster: %v\n", err)
		return
	}

	fmt.Printf("%#v\n", m2)

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
