package main

import (
	"bytes"
	"encoding/base64"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/stts-se/rec"
)

// TODO Hardwired GOB file should be changed to manually editable text file
var abbrevFilePath = path.Join(baseDir, "abbrevs.gob")
var abbrevs = make(map[string]string)
var abbrevMutex = &sync.RWMutex{}

// TODO Add  command line flag
var baseDir = "audio_files" // This is where the session sub-dirs live

var autosubCmd = "autosub"

// Abbrev is a tuple holding an abbreviation and its expansion.
type Abbrev struct {
	Abbrev    string `json:"abbrev"`
	Expansion string `json:"expansion"`
}

// SessionObject holds a session value
type SessionObject struct {
	SessionID string `json:"session_id"`
}

// TextObject holds values that can be used to produce a text file
type TextObject struct {
	JSONObject
	FileName  string `json:"file_name"`
	Data      string `json:"data"`
	OverWrite bool   `json:"over_write"`
}

// JSONObject holds values that can be used to produce a json file with a recording's metadata
type JSONObject struct {
	SessionObject

	// StartTime: start time (human readable text)
	StartTime string `json:"start_time"`

	// TimeCodeEnd: end time (human readable text)
	EndTime string `json:"end_time"`

	// TimeCodeStart: start time in milliseconds, relative to session start
	TimeCodeStart int64 `json:"time_code_start"`

	// EndTime: end time in milliseconds, relative to session start
	TimeCodeEnd int64 `json:"time_code_end"`
}

// AudioObject holds values that can be used to produce an audio file
type AudioObject struct {
	TextObject
	FileExtension string `json:"file_extension"`
}

// RequestResponse is used to marshal into JSON and return as a response to an HTTP request
type RequestResponse struct {
	Message string `json:"message"`
}

type audioResponse struct {
	JSONObject
	FileType string `json:"file_type"`
	Data     string `json:"data"`
	Message  string `json:"message"`
}

type textResponse struct {
	JSONObject
	FileType string `json:"file_type"`
	Text     string `json:"text"`
	Message  string `json:"message"`
}

type srtUnit struct {
	ID       int64  `json:"id"`
	TimeCode string `json:"time_code"`
	Text     string `json:"text"`
}

type srtResponse struct {
	JSONObject
	//FileType string    `json:"file_type"`
	Text    []srtUnit `json:"text"`
	Message string    `json:"message"`
}

type listResponse struct {
	Error  string   `json:"error"`
	Result []string `json:"result"`
}

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

func listSessions(w http.ResponseWriter, r *http.Request) {
	files, err := ioutil.ReadDir(baseDir)
	if err != nil {
		http.Error(w, fmt.Sprintf("couldnt' list sessions : %v", err), http.StatusInternalServerError)
		return
	}
	res := []string{}
	for _, f := range files {
		if f.IsDir() {
			res = append(res, f.Name())
		}
	}
	sort.Slice(res, func(i, j int) bool { return res[i] < res[j] })

	resJSON, err := json.Marshal(res)
	if err != nil {
		msg := fmt.Sprintf("listSessions: failed to marshal map of abbreviations : %v", err)
		log.Println(msg)
		http.Error(w, "failed to return list of sessions", http.StatusInternalServerError)
		return
	}
	fmt.Fprintf(w, string(resJSON))
}

func listFilenames(w http.ResponseWriter, r *http.Request) {
	res := listResponse{}
	params := mux.Vars(r)
	session := params["session"]
	if session == "" {
		http.Error(w, "param 'session' is required", http.StatusInternalServerError)
		return
	}

	if sessionExists(session) {
		files, err := listFiles(path.Join(baseDir, session))
		if err != nil {
			msg := fmt.Sprintf("listFilenames: couldn't list files : %v", err)
			log.Println(msg)
			http.Error(w, "failed to return list of files", http.StatusInternalServerError)
			return
		}
		res.Result = files
	} else {
		res.Error = fmt.Sprintf("No such session: %s", session)
	}

	resJSON, err := json.Marshal(res)
	if err != nil {
		msg := fmt.Sprintf("listFilenames: failed to marshal map of abbreviations : %v", err)
		log.Println(msg)
		http.Error(w, "failed to return list of files", http.StatusInternalServerError)
		return
	}
	fmt.Fprintf(w, string(resJSON))
}

func contains(s []string, e string) bool {
	for _, a := range s {
		if a == e {
			return true
		}
	}
	return false
}

func sessionExists(sessionName string) bool {
	if _, err := os.Stat(path.Join(baseDir, sessionName)); os.IsNotExist(err) {
		return false
	}
	return true
}

func listFiles(sessionDir string) ([]string, error) {
	res := []string{}
	files, err := ioutil.ReadDir(sessionDir)
	if err != nil {
		if os.IsNotExist(err) {
			return res, fmt.Errorf("no such session: %s", sessionDir)
		}
		return res, err
	}
	for _, f := range files {
		fName := f.Name()
		if strings.HasSuffix(fName, ".BAK") {
			continue
		}
		if strings.HasSuffix(fName, "~") {
			continue
		}
		res = append(res, fName)
	}
	sort.Slice(res, func(i, j int) bool { return res[i] < res[j] })
	return res, nil
}

func listBasenames(w http.ResponseWriter, r *http.Request) {
	res := listResponse{}
	params := mux.Vars(r)
	session := params["session"]
	if session == "" {
		http.Error(w, "param 'session' is required", http.StatusInternalServerError)
		return
	}
	if sessionExists(session) {
		fNames, err := listFiles(path.Join(baseDir, session))
		if err != nil {
			msg := fmt.Sprintf("listBasenames: couldn't list files : %v", err)
			log.Println(msg)
			http.Error(w, "failed to return list of files", http.StatusInternalServerError)
			return
		}
		for _, fName := range fNames {
			basename := strings.TrimSuffix(fName, filepath.Ext(fName))
			if !contains(res.Result, basename) {
				res.Result = append(res.Result, basename)
			}
		}
	} else {
		res.Error = fmt.Sprintf("No such session: %s", session)
	}

	resJSON, err := json.Marshal(res)
	if err != nil {
		msg := fmt.Sprintf("listBasenames: failed to marshal map of abbreviations : %v", err)
		log.Println(msg)
		http.Error(w, "failed to return list of files", http.StatusInternalServerError)
		return
	}
	fmt.Fprintf(w, string(resJSON))
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

	// This could be done concurrently, but easier to catch errors this way
	err := persistAbbrevs()
	if err != nil {
		msg := fmt.Sprintf("deleteAbbrev: failed to save abbrev map to gob file : %v", err)
		log.Println(msg)
		http.Error(w, "failed to save abbreviation(s)", http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "deleted abbbreviation '%s'\n", abbrev)
}

func (to TextObject) validate() []string {
	var res []string
	if to.SessionID == "" {
		res = append(res, "missing session_id")
	}
	if to.FileName == "" {
		res = append(res, "missing file_name")
	}
	if to.Data == "" {
		res = append(res, "missing data")
	}
	return res
}

func (so SessionObject) validate() []string {
	res := []string{}
	if so.SessionID == "" {
		res = append(res, "missing session_id")
	}
	return res
}

func (jo JSONObject) validate() []string {
	res := []string{}
	if jo.StartTime == "" {
		res = append(res, "missing start_time")
	}
	if jo.EndTime == "" {
		res = append(res, "missing end_time")
	}
	if jo.TimeCodeStart < 0 {
		res = append(res, "missing time_code_start")
	}
	if jo.TimeCodeEnd <= 0 {
		res = append(res, "missing time_code_end")
	}
	return res
}

func (ao AudioObject) validate() []string {
	res := ao.TextObject.validate()
	if ao.FileExtension == "" {
		res = append(res, "missing file_extension")
	}
	return res
}

// Let's lock everything when writing a file
var writeMutex = &sync.Mutex{}

func saveRecogniserText(w http.ResponseWriter, r *http.Request) {
	saveText(w, r, "rec")
}

func saveEditedText(w http.ResponseWriter, r *http.Request) {
	saveText(w, r, "edi")
}

// prettyMarshal returns a byte array with prettier formatted json (line breaks, etc)
func prettyMarshal(thing interface{}) ([]byte, error) {
	var res []byte

	j, err := json.Marshal(thing)
	if err != nil {
		return res, err
	}
	var prettyJSON bytes.Buffer
	err = json.Indent(&prettyJSON, j, "", "\t")
	if err != nil {
		return res, err
	}
	res = prettyJSON.Bytes()
	tmp := string(res) + "\n"
	res = []byte(tmp)
	return res, nil
}

func audioMimeType(fName string) string {
	ext := strings.TrimPrefix(filepath.Ext(fName), ".")
	if ext == "mp3" {
		return "audio/mpeg"
	}
	if ext == "" {
		return ""
	}
	return fmt.Sprintf("audio/%s", ext)
}

func getEditedText(w http.ResponseWriter, r *http.Request) {
	getText(w, r, "edi")
}

func getRecogniserText(w http.ResponseWriter, r *http.Request) {
	getText(w, r, "rec")
}

func readJSONFile(fileName string) (JSONObject, error) {
	res := JSONObject{}
	if _, err := os.Stat(fileName); os.IsNotExist(err) {
		return res, fmt.Errorf("no such file: %s", fileName)
	}
	bytes, err := ioutil.ReadFile(fileName)
	if err != nil {
		return res, err
	}
	err = json.Unmarshal(bytes, &res)
	if err != nil {
		return res, fmt.Errorf("couldn't unmarshal JSON : %v", err)
	}

	return res, nil
}

func getText(w http.ResponseWriter, r *http.Request, defaultExt string) {
	var res textResponse
	vars := mux.Vars(r)
	session := vars["session"]
	fileName := vars["filename"]
	if fileName == "" {
		msg := "text: missing param 'filename'"
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return

	}
	if session == "" {
		msg := "text: missing param 'session'"
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return

	}

	fullPath := filepath.Join(baseDir, session, fileName)
	ext := filepath.Ext(fullPath)
	if ext == "" {
		fullPath = fmt.Sprintf("%s.%s", fullPath, defaultExt)
	}
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		res.Message = fmt.Sprintf("no such file: %s", fileName)
	} else {
		bytes, err := ioutil.ReadFile(fullPath)
		if err != nil {
			msg := fmt.Sprintf("get_text: failed to read audio file : %v", err)
			log.Print(msg)
			http.Error(w, msg, http.StatusInternalServerError)
			return
		}
		res.FileType = "text/plain"
		res.Text = strings.TrimSpace(string(bytes))
	}
	basename := strings.TrimSuffix(fullPath, filepath.Ext(fullPath))
	jsonFile := basename + ".json"

	if _, err := os.Stat(jsonFile); os.IsNotExist(err) {
		log.Printf("No json file for basename %s", basename)
	} else {
		JSONObject, err := readJSONFile(jsonFile)
		if err != nil {
			msg := fmt.Sprintf("get_text: failed to read json file : %v", err)
			log.Print(msg)
			http.Error(w, msg, http.StatusInternalServerError)
			return
		}
		res.JSONObject = JSONObject
	}

	resJSON, err := rec.PrettyMarshal(res)
	if err != nil {
		msg := fmt.Sprintf("get_text: failed to create JSON from struct : %v", res)
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	log.Printf("Server served text file %s", fullPath)
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, "%s\n", string(resJSON))

}

func getAudio(w http.ResponseWriter, r *http.Request) {
	var res audioResponse
	vars := mux.Vars(r)
	session := vars["session"]
	fileName := vars["filename"]
	if fileName == "" {
		msg := "get_audio: missing param 'filename'"
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return

	}
	if session == "" {
		msg := "get_audio: missing param 'session'"
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return

	}
	fullPath := filepath.Join(baseDir, session, fileName)
	ext := filepath.Ext(fullPath)
	if ext == "" {
		fullPath = fmt.Sprintf("%s.%s", fullPath, "webm")
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		res.Message = fmt.Sprintf("no such file: %s", fileName)
	} else {
		bytes, err := ioutil.ReadFile(fullPath)
		if err != nil {
			msg := fmt.Sprintf("get_audio: failed to read audio file : %v", err)
			log.Print(msg)
			http.Error(w, msg, http.StatusInternalServerError)
			return
		}

		res.FileType = audioMimeType(fullPath)
		data := base64.StdEncoding.EncodeToString(bytes)
		res.Data = data
	}

	resJSON, err := rec.PrettyMarshal(res)
	if err != nil {
		msg := fmt.Sprintf("get_audio: failed to create JSON from struct : %v", res)
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, "%s\n", string(resJSON))
}

func autosubEnabled() error {
	_, err := exec.LookPath(autosubCmd)
	if err != nil {
		return fmt.Errorf("external '%s' command does not exist", autosubCmd)
	}
	return nil
}

func autosub(w http.ResponseWriter, r *http.Request) {
	if err := autosubEnabled(); err != nil {
		msg := fmt.Sprintf("autosub: %s", err)
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	var res srtResponse
	vars := mux.Vars(r)
	session := vars["session"]
	fileName := vars["filename"]
	if fileName == "" {
		msg := "autosub: missing param 'filename'"
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	if session == "" {
		msg := "autosub: missing param 'session'"
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	audioFile := filepath.Join(baseDir, session, fileName)
	ext := filepath.Ext(audioFile)
	if ext == "" {
		audioFile = fmt.Sprintf("%s.%s", audioFile, "webm")
	}
	srtFile := strings.Replace(audioFile, ".webm", ".srt", -1)
	lang := "sv"

	if _, err := os.Stat(audioFile); os.IsNotExist(err) {
		res.Message = fmt.Sprintf("no such file: %s", fileName)
	} else {
		cmd := exec.Command(autosubCmd, "-S", lang, "-D", lang, "-o", srtFile, audioFile)
		var out bytes.Buffer
		var sterr bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &sterr

		err := cmd.Run()
		if err != nil {
			msg := fmt.Sprintf("autosub: failed running %s : %v", cmd.Path, err)
			log.Print(msg)
			http.Error(w, msg, http.StatusInternalServerError)
			return
		}

		bytes, err := ioutil.ReadFile(srtFile)
		if err != nil {
			msg := fmt.Sprintf("autosub: failed to read srt file : %v", err)
			log.Print(msg)
			http.Error(w, msg, http.StatusInternalServerError)
			return
		}

		units := strings.Split(strings.TrimSpace(string(bytes)), "\n\n")
		res.Text = []srtUnit{}
		for _, unit := range units {
			lines := strings.Split(unit, "\n")
			if len(lines) != 3 {
			}
			idS := lines[0]
			id, err := strconv.ParseInt(idS, 10, 64)
			if err != nil {
				msg := fmt.Sprintf("autosub: failed to parse srt file : %v", err)
				log.Print(msg)
				http.Error(w, msg, http.StatusInternalServerError)
				return
			}
			timeCode := lines[1]
			text := lines[2]
			res.Text = append(res.Text, srtUnit{ID: id, TimeCode: timeCode, Text: text})
		}
	}

	resJSON, err := rec.PrettyMarshal(res)
	if err != nil {
		msg := fmt.Sprintf("autosub: failed to create JSON from struct : %v", res)
		log.Print(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, "%s\n", string(resJSON))
}

func saveBackupCopy(filePath string, fileContent []byte) (string, error) {
	newFilePath := filePath + ".BAK"
	err := ioutil.WriteFile(newFilePath, fileContent, 0644)
	if err != nil {
		return newFilePath, fmt.Errorf("failed to create backup file '%s' : %v", newFilePath, err)
	}
	fmt.Printf("Server saved %s\n", newFilePath)
	return newFilePath, nil
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
		msg := fmt.Sprintf("failed to unmarshal incoming JSON : %v", err)
		log.Println("[chromedictator] " + msg)
		//log.Printf("[chromedictator] incoming JSON string : %s\n", string(body))
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	vali := to.validate()
	if len(vali) > 0 {
		msg := fmt.Sprintf("incoming JSON not valid: %s", strings.Join(vali, " : "))
		log.Println(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	textFilePath := path.Join(baseDir, to.SessionID, to.FileName) + "." + ext

	writeMutex.Lock()
	defer writeMutex.Unlock()

	msg, err := checkAudioDirs(to.SessionID)
	if err != nil {
		log.Println(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	if msg != "" {
		respMessages = append(respMessages, msg)
	}

	textBytes := []byte(to.Data + "\n")

	if _, err := os.Stat(textFilePath); !os.IsNotExist(err) {
		if !to.OverWrite {
			msg := fmt.Sprintf("file with the same session ID and file name already exists: %s/%s.%s\nTo overwrite set over_write:true", to.SessionID, to.FileName, ext)
			newName, err := saveBackupCopy(textFilePath, textBytes)
			if err != nil {
				msg = fmt.Sprintf("%s\nCouldn't save backup file : %v", msg, err)
			} else {
				msg = fmt.Sprintf("%s\nSaved backup file %s", msg, newName)
			}

			log.Println(msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		msg := fmt.Sprintf("overwriting existing file '%s/%s.%s'", to.SessionID, to.FileName, ext)
		respMessages = append(respMessages, msg)
	}

	err = ioutil.WriteFile(textFilePath, textBytes, 0644)
	if err != nil {
		msg := fmt.Sprintf("failed to create file '%s' : %v", textFilePath, err)
		log.Println(msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}
	fmt.Printf("Server saved %s\n", textFilePath)

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

func writeJSON(jsonFilePath string, jsonObj JSONObject, overwrite bool) ([]string, error) {
	respMessages := []string{}
	jsonPretty, err := prettyMarshal(jsonObj)
	if _, err := os.Stat(jsonFilePath); !os.IsNotExist(err) {
		if overwrite {
			msg := fmt.Sprintf("file with the same session ID and file name already exists: %s\nTo overwrite set over_write:true", jsonFilePath)
			newName, err := saveBackupCopy(jsonFilePath, jsonPretty)
			if err != nil {
				msg = fmt.Sprintf("%s\nCouldn't save backup file : %v", msg, err)
			} else {
				msg = fmt.Sprintf("%s\nSaved backup file %s", msg, newName)
			}

			return respMessages, fmt.Errorf("%s", msg)
		}
		msg := fmt.Sprintf("overwriting existing file '%s'", jsonFilePath)
		respMessages = append(respMessages, msg)

	}
	if err != nil {
		msg := fmt.Sprintf("failed to marshal response struct to JSON : %v", err)
		return respMessages, fmt.Errorf("%s", msg)
	}
	err = ioutil.WriteFile(jsonFilePath, jsonPretty, 0644)
	if err != nil {
		msg := fmt.Sprintf("failed to save json file '%s' : %v", jsonFilePath, err)
		return respMessages, fmt.Errorf("%s", msg)
	}
	fmt.Printf("Server saved %s\n", jsonFilePath)
	return respMessages, nil
}

func checkAudioDirs(sessionID string) (string, error) {
	if _, err := os.Stat(baseDir); os.IsNotExist(err) {
		return "", fmt.Errorf("base dir not found: %v", err)
	}

	if _, err := os.Stat(path.Join(baseDir, sessionID)); os.IsNotExist(err) {
		err := os.Mkdir(path.Join(baseDir, sessionID), os.ModePerm)
		if err != nil {
			return "", fmt.Errorf("failed to create session ID dir : %v", err)
		}
		return fmt.Sprintf("created new session id dir: '%s'", path.Join(baseDir, sessionID)), nil
	}
	return "", nil
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
		//log.Printf("[chromedictator] incoming JSON string : %s\n", string(body))
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

	msg, err := checkAudioDirs(ao.SessionID)
	if err != nil {
		log.Println(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	if msg != "" {
		respMessages = append(respMessages, msg)
	}

	jsonObj := JSONObject{
		SessionObject: ao.SessionObject,
		StartTime:     ao.StartTime,
		EndTime:       ao.EndTime,
		TimeCodeStart: ao.TimeCodeStart,
		TimeCodeEnd:   ao.TimeCodeEnd,
	}
	jsonFilePath := path.Join(baseDir, ao.SessionID, ao.FileName) + ".json"
	jsonResps, err := writeJSON(jsonFilePath, jsonObj, ao.OverWrite)
	if err != nil {
		msg := fmt.Sprintf("failed to save json file '%s' : %v", jsonFilePath, err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}
	for _, msg := range jsonResps {
		respMessages = append(respMessages, msg)
	}

	ext := strings.TrimPrefix(ao.FileExtension, "audio/")

	audioFilePath := path.Join(baseDir, ao.SessionID, ao.FileName)
	audioFilePath = audioFilePath + "." + ext

	if _, err := os.Stat(audioFilePath); !os.IsNotExist(err) {
		if !ao.OverWrite {
			msg := fmt.Sprintf("file with the same session ID and file name already exists: %s/%s.%s\nTo overwrite set over_write:true", ao.SessionID, ao.FileName, ao.FileExtension)
			newName, err := saveBackupCopy(audioFilePath, audio)
			if err != nil {
				msg = fmt.Sprintf("%s\nCouldn't save backup file : %v", msg, err)
			} else {
				msg = fmt.Sprintf("%s\nSaved backup file %s", msg, newName)
			}

			log.Println(msg)
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		msg := fmt.Sprintf("overwriting existing file '%s/%s.%s'", ao.SessionID, ao.FileName, ao.FileExtension)
		respMessages = append(respMessages, msg)
	}
	err = ioutil.WriteFile(audioFilePath, audio, 0644)
	if err != nil {
		msg := fmt.Sprintf("failed to save audio file '%s' : %v", audioFilePath, err)
		log.Println("[chromedictator] " + msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}
	fmt.Printf("Server saved %s\n", audioFilePath)

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

	// load abbreviations gob
	if _, err := os.Stat(abbrevFilePath); !os.IsNotExist(err) {

		m, err := gobFile2Map(abbrevFilePath)
		if err != nil {
			fmt.Printf("Major disaster: %v\n", err)
			return
		}

		abbrevs = m
	} else {
		// no abbrev file exists, let's initialise one
		abbrevs["tst"] = "test"
		abbrevs["tstn"] = "testing"
		persistAbbrevs()
	}

	p := "7654"
	r := mux.NewRouter()
	r.StrictSlash(true)

	r.HandleFunc("/get_audio/{session}/{filename}", getAudio).Methods("GET")
	r.HandleFunc("/get_edited_text/{session}/{filename}", getEditedText).Methods("GET")
	r.HandleFunc("/get_recogniser_text/{session}/{filename}", getRecogniserText).Methods("GET")
	r.HandleFunc("/save_audio", saveAudio).Methods("POST")
	r.HandleFunc("/save_recogniser_text", saveRecogniserText).Methods("POST")
	r.HandleFunc("/save_edited_text", saveEditedText).Methods("POST")
	r.HandleFunc("/save_recogniser_text/{text_object}", saveRecogniserText).Methods("GET")
	r.HandleFunc("/save_edited_text/{text_object}", saveEditedText).Methods("GET")

	if err := autosubEnabled(); err == nil {
		log.Println("chromedictator autosub enabled")
		r.HandleFunc("/autosub/{session}/{filename}", autosub).Methods("GET")
	} else {
		log.Println("chromedictator autosub disnabled")
	}

	r.HandleFunc("/abbrev/list", listAbbrevs)
	r.HandleFunc("/abbrev/add/{abbrev}/{expansion}", addAbbrev)
	r.HandleFunc("/abbrev/delete/{abbrev}", deleteAbbrev)

	r.HandleFunc("/admin/list/sessions", listSessions)
	r.HandleFunc("/admin/list/files/{session}", listFilenames)
	r.HandleFunc("/admin/list/basenames/{session}", listBasenames)

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
