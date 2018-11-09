package main

import (
	"encoding/base64"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// TODO Hardwired GOB file should be changed to text file
var abbrevFilePath = "abbrevs.gob"
var abbrevs = make(map[string]string)
var abbrevMutex = &sync.RWMutex{}

func persistAbbrevs() error {
	return map2GobFile(abbrevs, abbrevFilePath)
}

func map2GobFile(m map[string]string, fName string) error {

	abbrevMutex.Lock()
	defer abbrevMutex.Unlock()

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

	abbrevMutex.Lock()
	defer abbrevMutex.Unlock()

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

	return m, nil
}

// Abbrev is a tuple holding an abbreviation and its expansion.
type Abbrev struct {
	Abbrev    string `json:"abbrev"`
	Expansion string `json:"expansion"`
}

func listAbbrevs(w http.ResponseWriter, r *http.Request) {
	res := []Abbrev{}

	abbrevMutex.RLock()
	defer abbrevMutex.RUnlock()

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
	abbrevMutex.Lock()
	abbrevs[abbrev] = expansion
	abbrevMutex.Unlock() // Can't use defer here, since call below uses
	// locking

	// This could be done consurrently, but easier to catch errors this way
	err := persistAbbrevs()
	if err != nil {
		msg := fmt.Sprintf("addAbbrev: failed to save abbrev map to gob file : %v", err)
		log.Println(msg)
		http.Error(w, "failed to save abbreviation(s)", http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "saved abbbreviation '%s' '%s'\n", abbrev, expansion)
}

func deleteAbbrev(w http.ResponseWriter, r *http.Request) {
	params := mux.Vars(r)
	abbrev := params["abbrev"]
	//expansion := params["expansion"]

	// TODO Error check that abbrev doesn't already exist in map
	abbrevMutex.Lock()
	delete(abbrevs, abbrev)
	abbrevMutex.Unlock() // Can't use defer here, since call below uses
	// locking

	// This could be done consurrently, but easier to catch errors this way
	err := persistAbbrevs()
	if err != nil {
		msg := fmt.Sprintf("deleteAbbrev: failed to save abbrev map to gob file : %v", err)
		log.Println(msg)
		http.Error(w, "failed to save abbreviation(s)", http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "deleted abbbreviation '%s'\n", abbrev)
}

// TextObject holds values that can be used to produce a text file
type TextObject struct {
	SessionID string `json:"session_id"`
	FileName  string `json:"file_name"`
	TimeStamp string `json:"time_stamp"`
	Data      string `json:"data"`
	OverWrite bool   `json:"over_write"`
}

func (ao TextObject) validate() []string {
	var res []string

	if ao.SessionID == "" {
		res = append(res, "missing session_id")
	}
	if ao.FileName == "" {
		res = append(res, "missing file_name")

	}
	if ao.Data == "" {
		res = append(res, "missing data")
	}

	return res
}

// AudioObject holds values that can be used to produce an audio file
type AudioObject struct {
	TextObject

	FileExtension string `json:"file_extension"`
}

func (ao AudioObject) validate() []string {
	res := ao.TextObject.validate()
	if ao.FileExtension == "" {
		res = append(res, "missing file_extension")
	}
	return res
}

// RequestResponse is used to marshal into JSON and return as a response to an HTTP request
type RequestResponse struct {
	Message string `json:"message"`
}

// Let's lock everything when writing a file
var writeMutex = &sync.Mutex{}

func saveRecogniserText(w http.ResponseWriter, r *http.Request) {
	saveText(w, r, "rec")
}

func saveEditedText(w http.ResponseWriter, r *http.Request) {
	saveText(w, r, "edi")
}

func saveText(w http.ResponseWriter, r *http.Request, ext string) {
	var respMessages []string

	var data []byte
	if r.Method == "GET" {
		vars := mux.Vars(r)
		textData := vars["text_object"]
		if textData == "" {
			msg := "no text to save"
			log.Println("[chromedictator] " + msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		data = []byte(textData)
	}

	if r.Method == "POST" {
		// Different var names to avoid shadowing
		data0, err := ioutil.ReadAll(r.Body)
		data = data0
		if err != nil {
			msg := fmt.Sprintf("failed to read request body : %v", err)
			log.Println(msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
	}

	to := TextObject{}
	err := json.Unmarshal(data, &to)
	if err != nil {
		msg := fmt.Sprintf("failed to unmarshal incoming JSON '%s' : %v", string(data), err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	vali := to.validate()
	if len(vali) > 0 {
		msg := fmt.Sprintf("incomin JSON not valid: %s", strings.Join(vali, " : "))
		log.Println(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	textFilePath := path.Join(baseDir, to.SessionID, to.FileName) + "." + ext

	writeMutex.Lock()
	defer writeMutex.Unlock()

	if _, err := os.Stat(textFilePath); !os.IsNotExist(err) {
		if !to.OverWrite {
			msg := fmt.Sprintf("file with the same session ID and file name already exists: %s/%s.%s\nTo overwrite set over_write:true", to.SessionID, to.FileName, ext)

			log.Println(msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		} else {
			msg := fmt.Sprintf("overwriting existing file '%s/%s.%s'", to.SessionID, to.FileName, ext)
			respMessages = append(respMessages, msg)
		}
	}

	err = ioutil.WriteFile(textFilePath, []byte(to.Data+"\n"), 0644)
	if err != nil {
		msg := fmt.Sprintf("failed to create file '%s' : %v", textFilePath, err)
		log.Println(msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	respMessages = append(respMessages, fmt.Sprintf("saved text file '%s'", textFilePath))
	resp := RequestResponse{Message: strings.Join(respMessages, " : ")}

	respJSON, err := json.Marshal(resp)
	if err != nil {
		msg := fmt.Sprintf("failed to marshal response struct to JSON : %v", err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	fmt.Fprintf(w, "%s\n", string(respJSON))

}

func saveAudio(w http.ResponseWriter, r *http.Request) {
	var respMessages []string

	body, err := ioutil.ReadAll(r.Body)

	if err != nil {
		msg := fmt.Sprintf("failed to read request body : %v", err)
		log.Println(msg)
		// or return JSON response with error message?
		//res.Message = msg
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	ao := AudioObject{}
	err = json.Unmarshal(body, &ao)
	if err != nil {
		msg := fmt.Sprintf("failed to unmarshal incoming JSON : %v", err)
		log.Println("[chromedictator] " + msg)
		log.Printf("[chromedictator] incoming JSON string : %s\n", string(body))
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	vali := ao.validate()
	if len(vali) > 0 {
		msg := "Incomplete incoming JSON: " + strings.Join(vali, " : ")
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusBadRequest)
		return

	}

	var audio []byte
	audio, err = base64.StdEncoding.DecodeString(ao.Data)
	if err != nil {
		msg := fmt.Sprintf("server failed to decode base 64 audio data : %v", err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	writeMutex.Lock()
	defer writeMutex.Unlock()

	if _, err := os.Stat(baseDir); os.IsNotExist(err) {
		msg := fmt.Sprintf("base dir not found: %v", err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	if _, err := os.Stat(path.Join(baseDir, ao.SessionID)); os.IsNotExist(err) {
		err := os.Mkdir(path.Join(baseDir, ao.SessionID), os.ModePerm)
		if err != nil {
			msg := fmt.Sprintf("failed to create session ID dir : %v", err)
			log.Println("[chromedictator] " + msg)
			http.Error(w, msg, http.StatusInternalServerError)
			return
		}
		respMessages = append(respMessages, fmt.Sprintf("created new session id dir: '%s'", path.Join(baseDir, ao.SessionID)))
	}

	audioFilePath := path.Join(baseDir, ao.SessionID, ao.FileName)

	ext := strings.TrimPrefix(ao.FileExtension, "audio/")
	audioFilePath = audioFilePath + "." + ext

	fmt.Printf("Server saves %s\n", audioFilePath)

	if _, err := os.Stat(audioFilePath); !os.IsNotExist(err) {
		if !ao.OverWrite {
			msg := fmt.Sprintf("file with the same session ID and file name already exists: %s/%s.%s\nTo overwrite set over_write:true", ao.SessionID, ao.FileName, ao.FileExtension)

			log.Println(msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		} else {
			msg := fmt.Sprintf("overwriting existing file '%s/%s.%s'", ao.SessionID, ao.FileName, ao.FileExtension)
			respMessages = append(respMessages, msg)
		}
	}
	err = ioutil.WriteFile(audioFilePath, audio, 0644)
	if err != nil {
		msg := fmt.Sprintf("failed to save audio file '%s' : %v", audioFilePath, err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	respMessages = append(respMessages, fmt.Sprintf("server saved audio file '%s'", audioFilePath))
	// TODO Copypaste
	resp := RequestResponse{Message: strings.Join(respMessages, " : ")}
	respJSON, err := json.Marshal(resp)
	if err != nil {
		msg := fmt.Sprintf("failed to marshal response struct to JSON : %v", err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	fmt.Fprintf(w, "%s\n", string(respJSON))
}

// This is filled in by main, listing the URLs handled by the router,
// so that these can be shown in the generated docs.
var walkedURLs []string

// TODO Use a HTML template to generate complete page?
func generateDoc(w http.ResponseWriter, r *http.Request) {
	s := strings.Join(walkedURLs, "\n")

	fmt.Fprintf(w, "%s\n", s)
}

// TODO Add  command line flag
var baseDir = "audio_files"

func main() {

	if _, err := os.Stat(baseDir); os.IsNotExist(err) {

		err := os.Mkdir(baseDir, os.ModePerm)
		if err != nil {
			msg := fmt.Sprintf("failed to create base dir : %v", err)
			log.Println("[chromedictator] " + msg)
			log.Println("Exiting")
			return
		}

		fmt.Fprintf(os.Stderr, "[chromdictator] created base dir '%s'\n", baseDir)
	}

	if _, err := os.Stat(abbrevFilePath); !os.IsNotExist(err) {

		m, err := gobFile2Map(abbrevFilePath)
		if err != nil {
			fmt.Printf("Major disaster: %v\n", err)
			return
		}

		abbrevs = m
	}

	p := "7654"
	r := mux.NewRouter()
	r.StrictSlash(true)

	r.HandleFunc("/save_audio", saveAudio).Methods("POST")
	r.HandleFunc("/save_recogniser_text", saveRecogniserText).Methods("POST")
	r.HandleFunc("/save_edited_text", saveEditedText).Methods("POST")
	r.HandleFunc("/save_recogniser_text/{text_object}", saveRecogniserText).Methods("GET")
	r.HandleFunc("/save_edited_text/{text_object}", saveEditedText).Methods("GET")

	r.HandleFunc("/abbrev/list", listAbbrevs)
	r.HandleFunc("/abbrev/add/{abbrev}/{expansion}", addAbbrev)
	r.HandleFunc("/abbrev/delete/{abbrev}", deleteAbbrev)

	r.HandleFunc("/doc/", generateDoc).Methods("GET")

	// List route URLs to use as simple on-line documentation
	docs := make(map[string]string)
	r.Walk(func(route *mux.Route, router *mux.Router, ancestors []*mux.Route) error {
		t, err := route.GetPathTemplate()
		if err != nil {
			return err
		}
		if info, ok := docs[t]; ok {
			t = fmt.Sprintf("%s - %s", t, info)
		}
		walkedURLs = append(walkedURLs, t)
		return nil
	})

	r.PathPrefix("/").Handler(http.StripPrefix("/", http.FileServer(http.Dir("static/"))))

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
