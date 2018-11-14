# chromedictator

https://github.com/stts-se/chromedictator

[![Go Report Card](https://goreportcard.com/badge/github.com/stts-se/chromedictator)](https://goreportcard.com/report/github.com/stts-se/chromedictator)

## Build and run from source

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


The server will create a `audio_files` sub-directory in the corrent direktory if it does not already exist.

The server will create a `abbrevs.gob` file, containing mappings from abbreviations to expanded forms, if it does not already exist.

## Build and package pre-compiled version

The `make` command will generate a zip file containing everything needed to run the server, including default executables for the following operating systems:

* chromedictator (linux)
* chromedict_win
* chromedict_mac (darwin, untested)


## Run pre-compiled version

1. Unzip the zip file
2. Start the server using the pre-compiled executable for your OS.
3. Start Google Chrome and visit http://localhost:7654


## Requirements


* Google Chrome


## Files ending up in the server's session folder

### .webm

Audio (media) file used by Google Chrome. Can be converted into .wav or other formats using e.g. `ffmpeg`.

### .json

Metadata file accompanying the .webm file.

### .rec

Text file containing the original recognition result.

### .edi

Text file containing manually edited recognition result. May be identical to the contents of the .rec file.

