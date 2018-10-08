package main

import (
	"encoding/gob"
	"encoding/json"
	"fmt"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"
)

//func js(w http.ResponseWriter, r *http.Request) {
//	http.ServeFile(w, r, "./js/dictator.js")
//}

var abbrevFilePath = "abbrevs.gob"
var abbrevs = make(map[string]string)
var mutex = &sync.RWMutex{}

func persistAbbrevs() error {
	return map2GobFile(abbrevs, abbrevFilePath)
}

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

type Abbrev struct {
	Abbrev    string `json:"abbrev"`
	Expansion string `json:"expansion"`
}

func listAbbrevs(w http.ResponseWriter, r *http.Request) {
	res := []Abbrev{}

	mutex.RLock()
	defer mutex.RUnlock()

	for k, v := range abbrevs {
		res = append(res, Abbrev{Abbrev: k, Expansion: v})
	}

	//Sort abbreviations alphabetically-ish
	sort.Slice(res, func(i, j int) bool { return res[i].Abbrev < res[j].Abbrev })

	resJSON, err := json.Marshal(res)
	if err != nil {
		msg := fmt.Sprintf("listAbbrevs: failed to marshal map of abbreviations : %v", err)
		log.Println(msg)
		http.Error(w, "failed to return list of abbreviations", http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, string(resJSON))

}

func addAbbrev(w http.ResponseWriter, r *http.Request) {
	params := mux.Vars(r)
	abbrev := params["abbrev"]
	expansion := params["expansion"]

	// TODO Error check that abbrev doesn't already exist in map
	mutex.Lock()
	abbrevs[abbrev] = expansion
	mutex.Unlock() // Can't use defer here, since call below uses
	// locking

	// This could be done consurrently, but easier to catch errors this way
	err := persistAbbrevs()
	if err != nil {
		msg := fmt.Sprintf("addAbbrev: failed to save abbrev map to gob file : %v", err)
		log.Println(msg)
		http.Error(w, "failed to save abbreviation(s)", http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "saved abbbreviation %s %s\n", abbrev, expansion)
}

func main() {

	//fn := "abbrevs_map.gob"
	//m := map[string]string{"a": "apa", "b": "bepa", "c": "cepa", "d": "depa"}
	//err := map2GobFile(m, fn)
	//if err != nil {
	//	fmt.Printf("Major disaster: %v\n", err)
	//	return
	//}

	// Load persisted abbrev map if it exists
	if _, err := os.Stat(abbrevFilePath); !os.IsNotExist(err) {

		m, err := gobFile2Map(abbrevFilePath)
		if err != nil {
			fmt.Printf("Major disaster: %v\n", err)
			return
		}

		abbrevs = m
	}

	//fmt.Printf("%#v\n", m2)

	p := "7654"
	r := mux.NewRouter()
	r.StrictSlash(true)

	// TODO Probably needs prefix, e.g. /dict/
	r.HandleFunc("/", index)
	r.HandleFunc("/list_abbrevs", listAbbrevs)
	r.HandleFunc("/add_abbrev/{abbrev}/{expansion}", addAbbrev)
	// TODO delete function
	//r.HandleFunc("/delete_abbrev/{abbrev}", deleteAbbrev)

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
