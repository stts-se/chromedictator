.PHONY: all
all: chromedictator chromedict_mac chromedict_win.exe chromedictator.zip

chromedictator: chromedictator.go static/*css static/*html static/*js static/*ico static/*png README.md
	GOOS=linux GOARCH=amd64 go build -o chromedictator chromedictator.go

chromedict_mac: chromedictator.go static/*css static/*html static/*js static/*ico static/*png README.md
	GOOS=darwin GOARCH=amd64 go build -o chromedict_mac chromedictator.go


chromedict_win.exe: chromedictator.go static/*css static/*html static/*js static/*ico static/*png README.md
	GOOS=windows GOARCH=amd64 go build -o chromedict_win.exe chromedictator.go


chromedictator.zip: chromedictator chromedict_mac chromedict_win.exe static/*css static/*html static/*js static/*ico static/*png README.md
	zip -q chromedictator.zip chromedictator chromedict_mac chromedict_win.exe static/*css static/*html static/*js static/*ico static/*png README.md
	rm chromedictator
	rm chromedict_mac
	rm chromedict_win.exe


clean:
	rm -f chromedictator chromedict_mac chromedict_win.exe chromedictator.zip
