# chromedictator

https://github.com/stts-se/chromedictator

[![Go Report Card](https://goreportcard.com/badge/github.com/stts-se/chromedictator)](https://goreportcard.com/report/github.com/stts-se/chromedictator)

## Build and run from source


 Requires Go >= 1.12.

 If you do not already have Go installed, download and install the most recent stable version from https://golang.org/dl/, then:


    git clone https://github.com/stts-se/chromedictator
    cd chromedictator
    go get

To start the server:

     go run chromedictator.go

or

     go build
     ./chromedictator


Go to the following URL in Google Chrome: 

     http://localhost:7654


The server will create a `audio_files` sub-directory in the corrent directory if it does not already exist.

The server will create a `abbrevs.gob` file, containing mappings from abbreviations to expanded forms, if it does not already exist.

## Run from pre-built binaries

Download the latest zip file from [releases](https://github.com/stts-se/chromedictator/releases), unzip, and run the binary for your OS.

## Build and package pre-compiled version

The `make` command will generate a zip file containing everything needed to run the server, including default executables for the following operating systems:

* chromedictator (linux)
* chromedict_win
* chromedict_mac (darwin, untested)


## Run pre-compiled version

1. Unzip the zip file
2. Start the server using the pre-compiled executable for your OS.
3. Start Google Chrome and visit http://localhost:7654


## Record from audio output

Here's a neat trick to record from your audio output of your computer, using PulseAudio (for Linux):
https://unix.stackexchange.com/questions/130774/creating-a-virtual-microphone/153528#153528


## Requirements


* Google Chrome


## Files ending up in the server's session folder

### .webm

Audio (media) file used by Google Chrome. Can be converted into .wav or other formats using e.g. `ffmpeg`.

### .json

Metadata file accompanying the .webm file with the following fields:

* session_id : the name of the session
* start_time : recording start timestamp (ISO format) 
* end_time : recording end timestamp (ISO format) 
* time_code_start : recording start time relative to session start time (milliseconds)
* time_code_end : recording end time relative to session start time (milliseconds)

Sample JSON can be found in audio_files/default/audiotst.json:

    {
      "session_id": "default",
      "start_time": "2018-11-16T15:38:00.606Z",
      "end_time": "2018-11-16T15:38:03.305Z",
      "time_code_start": 12593,
      "time_code_end": 15292
    }



### .rec

Text file containing the original recognition result.

### .edi

Text file containing manually edited recognition result. May be identical to the contents of the .rec file.

