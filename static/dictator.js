"use strict";



// See e.g.:
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API 
// https://mozdevs.github.io/MediaRecorder-examples/record-live-audio.html
// https://github.com/mdn/voice-change-o-matic
// https://github.com/mdn/voice-change-o-matic/blob/gh-pages/scripts/app.js

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var recorder;
var recognition;

var visAnalyser = audioCtx.createAnalyser();
visAnalyser.minDecibels = -90;
visAnalyser.maxDecibels = -10;
visAnalyser.smoothingTimeConstant = 0.85;

var visCanvas = document.querySelector('.visualiser');
var visCanvasCtx = visCanvas.getContext("2d");

var recStart;

const recStartButton = document.getElementById("rec_start");
const recSendButton = document.getElementById("rec_send");
const recCancelButton = document.getElementById("rec_cancel");
const sessionName = document.getElementById("sessionname");

var isRecording = false;

// TODO
var baseURL = window.origin;

var sendAudio = false;

//var audioBlob;

window.onload = function () {
    
    disable(recCancelButton);
    disable(recSendButton);
    
    var url = new URL(document.URL);
    var session = url.searchParams.get('session')
    if (session != null && session != "") {
	sessionName.value.trim() = session;
    }

    
    // google speech rec
    if (!('webkitSpeechRecognition' in window)) {
	alert("This browser does not support webkit speech recognition. Try Google Chrome.");
	return;
    };

    recognition = new webkitSpeechRecognition();
    let tempResponse = document.querySelector("#recognition-result .content");
    let finalResponse = document.getElementById("current-utt");
    // finalResponse.addEventListener('keyup', checkForAbbrev);
    // finalResponse.addEventListener('keyup', singnalUnsavedEdit);
    recognition.lang = "sv";
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = function(event) {
	for (var i = event.resultIndex; i < event.results.length; ++i) {
	    let text = event.results[i][0].transcript.trim();
	    if (event.results[i].isFinal) {
	    	finalResponse.value = text.trim();
	    	tempResponse.innerHTML = '';

		//TODO: is this a good signal to send current recording and start a new one?
		// recSendButton.click();
		// recStartButton.click();
		
	    } else {
		tempResponse.innerHTML = event.results[i][0].transcript;
	    }
	}
    };    
    
    recognition.onend = function() {
	// TODO?
	console.log("recognition.onend");
	enable(recStartButton);
	disable(recSendButton);
	disable(recCancelButton);
    };
    
    recognition.onerror = function(event) {
	if (event.error === 'no-speech') {
	    logMessage("error", "No speech input");	    
	} else if (event.error === 'audio-capture') {
	    logMessage("error", "Microphone failure");	    	    
	} else if (event.error === 'not-allowed') {
	    if (event.timeStamp - start_timestamp < 100) {
		logMessage("error", "Audio blocked");	    	    
	    } else {
		logMessage("error", "Audio denied");	    	    
	    }	    
	} else if (event.error === 'network') {
	    logMessage("error", "Network error");	    	    
	} else if (event.error === 'aborted') {
	    logMessage("info", "Recording aborted");	    	    
	} else {
	    logMessage("info", "Recording got error '" + event.error + "'");
	}
    };

    
    var source;
    var stream;
    
    var mediaAccess = navigator.mediaDevices.getUserMedia({'audio': true, video: false});
    
    mediaAccess.then(function(stream) {
	visualize();
	source = audioCtx.createMediaStreamSource(stream);
        source.connect(visAnalyser);
	recorder = new MediaRecorder(stream);
	recorder.onstop = function(evt) {
	    isRecording = false;
	} 
	recorder.onstart = function(evt) {
	    isRecording = true;
	} 
	recorder.addEventListener('dataavailable', async function (evt) {	    
	    //     updateAudio(evt.data);
	    //     sendAndReceiveBlob();
	    
	    //audioBlob = evt.data;
	    //console.log("CANCELED? ", recCancelButton.disabled);
	    //console.log("STOPPED? ", recSendButton.disabled);
	    
	    
	    // use the blob from the MediaRecorder as source for the audio tag
	    
	    let ou = URL.createObjectURL(evt.data);
	    //currentBlobURL = ou;
	    console.log("Object URL ", ou);

	    var audio = document.getElementById('audio');
	    audio.src = ou;
	    audio.disabled = false;
	    
	    if (sendAudio) {
		let blob = await fetch(ou).then(r => r.blob());
		console.log("EN BLÅBB ", blob);

		let sess = sessionName.value.trim();
		if (sess.length === 0) {
		    logMessage("error","cannot send audio with empty session id");
		    return;
		}

		
		let reader = new FileReader();
		reader.addEventListener("loadend", function() {
		    let rez = reader.result;
		    let payload = {
			"session_id" : sess,
			"file_name" : "apmamman",
			"data" : btoa(rez),
			"file_extension" : blob.type,
			"over_write" : true, // TODO
		    };
		    soundToServer(payload);	
		    
		});
		reader.readAsBinaryString(blob);
			
	    };
	});
	
    });
    
    mediaAccess.catch(function(err) {
	console.log("error from getUserMedia:", err);
	alert("Couldn't initialize recorder: " + err);
    });
    

    populateShortcuts();
    
    document.getElementById("refresh_time").innerText = new Date().toLocaleString();

    validateSessionName();
    
    document.getElementById("current-utt").focus();
}

function disable(element) {
    element.setAttribute("disabled","true");
}

function enable(element) {
    element.removeAttribute("disabled","false");
}

recStartButton.addEventListener("click", function() {
    recognition.start();
    disable(recStartButton);
    enable(recCancelButton);
    enable(recSendButton);
    recStart = new Date().getTime();
    //document.getElementById("audio").src = null; // Is this how you empty the src? 
    recorder.start();
    logMessage("info", "Recording started");
});

recCancelButton.addEventListener("click", function() {
    recognition.abort();
    enable(recStartButton);
    disable(recCancelButton);
    disable(recSendButton);
    sendAudio = false;
    recorder.stop();
    recStart = null;
});


var currentBlobURL = null;

recSendButton.addEventListener("click", function() {
    recognition.stop();
    enable(recStartButton);
    disable(recCancelButton);
    disable(recSendButton);
    sendAudio = true;
    recorder.stop();
    
    recStart = null;
});

function visualize() {

    var WIDTH = visCanvas.width;
    var HEIGHT = visCanvas.height;
        
    visAnalyser.fftSize = 256;
    var bufferLengthAlt = visAnalyser.frequencyBinCount;
    var dataArrayAlt = new Uint8Array(bufferLengthAlt);
    
    visCanvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    
    var draw = function() {
	if (recStart != null) {
	    var recDur = new Date().getTime() - recStart;
	    //if (recDur % 1000 === 0) {
	    document.getElementById("rec_duration").textContent = Math.floor(recDur/1000) + "s";
	    //}
	}
    
	var drawVisual = requestAnimationFrame(draw);
	
	visAnalyser.getByteFrequencyData(dataArrayAlt);
	
	visCanvasCtx.fillStyle = 'rgb(0, 0, 0)';
	visCanvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
	
	var barWidth = (WIDTH / bufferLengthAlt) * 2.5;
	var barHeight;
	var x = 0;
	
	if (isRecording) { 
	    for(var i = 0; i < bufferLengthAlt; i++) {
		barHeight = dataArrayAlt[i];
		
		//visCanvasCtx.fillStyle = 'green';
		visCanvasCtx.fillStyle = 'rgb(' + (barHeight+100) + ',50,50)';		
		visCanvasCtx.fillRect(x,HEIGHT-barHeight/2,barWidth,barHeight/2);
		
		x += barWidth + 1;
	    };
	}
    };
    
    draw(); 
}

// payload: {"session_id": "sess1", "file_name":"sentence1", "data": "GkXfo59ChoEBQ ..."}
// type AudioObject struct {
// 	SessionID string `json:"session_id"`
// 	FileName  string `json:"file_name"`
// 	TimeStamp string `json:"time_stamp"`
// 	FileType  string `json:"file_type"`
// 	Data      string `json:"data"`
// }


async function soundToServer(payload) {

    console.log("Här kommer ljud ", payload);
    //if (payload.session_)
    
    let url = baseURL + "/save_audio";
    
    (async () => {
	
	const rawResponse = await fetch(url, {
	    method: "POST",
	    headers: {
		'Accept': 'application/json',
		'Content-Type': 'application/json'
	    },
	    body: JSON.stringify(payload)
	});
	
	const content = await rawResponse.text();
	console.log(content);
	try {
	    const json = JSON.parse(content);
	    logMessage("info", json.message);
	} catch {
	    logMessage("error", content);
	}
	
    })();
};

function logMessage(title, text) {
    console.log(title, text);
    document.getElementById("messages").textContent = title + ": " + text;    
}

// payload: {"session_id": "sess1", "file_name":"sentence1", "text_data": "My name is Prince, and I am funky..."}
function textToServer(payload) {};


window.onbeforeunload = function() {
    return "Are you sure you want to navigate away?";
}


function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function breakEverything() {
    let divs = document.querySelectorAll("div");
    for (var i = 1; i < divs.length; i++) {
	var d = divs[i];
	var c = d.getAttribute("class")
	if (c !== null && c.indexOf("nobreak") < 0)
	    d.style["transform"] =  "rotate("+ getRandomInt(-180,180) + "deg)";
    }
    document.getElementById("unbreak_everything").style["display"] = "";
    document.getElementById("break_everything").style["display"] = "none";
}

function unbreakEverything() {
    let divs = document.querySelectorAll("div");
    for (var i = 1; i < divs.length; i++) {
	var d = divs[i];
	d.style["transform"] =  "";
    }
    document.getElementById("break_everything").style["display"] = "";
    document.getElementById("unbreak_everything").style["display"] = "none";
}

const keyCodeEnter = 13;
const keyCodeSpace = 32;
const keyCodeEscape = 27;
function saveOnCtrlEnter() {
    if (event.ctrlKey && event.keyCode === keyCodeEnter) {
	var src = event.srcElement
	var text = src.value.trim();
	if (text.length > 0) {
	    var saved = document.getElementById("saved-utts");
	    var div = document.createElement("div")
	    saved.appendChild(div);
	    div.textContent = text;
	    src.value = "";
	    logMessage("info", "added text '" + text + "'");
	}
    }
}

function globalShortcuts() {
    if (event.keyCode === keyCodeEscape && !recCancelButton.disabled) {
	recCancelButton.click();
    }
    if (event.ctrlKey && event.keyCode === keyCodeSpace) {
	if (!recSendButton.disabled)
	    recSendButton.click();
	else if  (!recStartButton.disabled) {
	    recStartButton.click();
	}
    }
    
}


function populateShortcuts() {
    document.getElementById("shortcuts").innerHTML = "<table>" +
	"<tr><td style='text-align: right'>Ctrl-Space :</td><td>Start/Send recording</td></tr>" +
	"<tr><td style='text-align: right'>Ctrl-Enter :</td><td>Save text</td></tr>" +
	"<tr><td style='text-align: right'>Escape :</td><td>Cancel recording</td></tr>" + 
	"</table>";
}

function validateSessionName() {
    if (sessionName.value.trim().length > 0) {
	enable(recStartButton);
	sessionName.style['border-color'] = "";
   }
    else {
	logMessage("info","session name is empty");
	disable(recStartButton);
	sessionName.style['border-color'] = "red";
    }
}

document.getElementById("break_everything").addEventListener("click", function() { breakEverything();})
document.getElementById("unbreak_everything").addEventListener("click", function() { unbreakEverything();})
document.getElementById("current-utt").addEventListener("keyup", function() { saveOnCtrlEnter();})

document.addEventListener("keyup", function() { globalShortcuts() });

sessionName.addEventListener("keyup", function() { validateSessionName() });
sessionName.addEventListener("change", function() { validateSessionName() });
