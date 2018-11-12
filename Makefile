chromedictator:
	go build
	GOOS=darwin GOARCH=amd64 go build -o chromedict_mac
	GOOS=windows GOARCH=amd64 go build -o chromedict_win.exe
	zip chromedictator.zip chromedictator chromedict_mac chromedict_win.exe static/*css static/*html static/*js static/*ico static/*gif

clean:
	rm -f chromedictator chromedict_mac chromedict_win.exe chromedictator.zip
