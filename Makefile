chromedictator:
	go build
	GOOS=windows GOARCH=amd64 go build -o chromedict_win.exe 
	zip chromedictator.zip chromedictator chromedict_win.exe static/*css static/*html static/*js static/*ico static/*gif

clean:
	rm -f chromedictator chromedict_win.exe chromedictator.zip
