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

var recStartTime;

const recStartButton = document.getElementById("rec_start");
const recSendButton = document.getElementById("rec_send");
const recCancelButton = document.getElementById("rec_cancel");
const sessionField = document.getElementById("sessionname");

var isRecording = false;

var prevFilenameBase;
var filenameBase;

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
	sessionField.value = session.trim();
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
    
    recognition.onresult = async function(event) {
	for (var i = event.resultIndex; i < event.results.length; ++i) {
	    let text = event.results[i][0].transcript.trim();
	    if (event.results[i].isFinal) {

		// if we have a cache: save current cache and start new recording
		if (isRecording) {
		    await stopAndSend();
		    await recStart();
		}
		
	    	finalResponse.value = text.trim();
	    	tempResponse.innerHTML = "";

		await textToServer(sessionField.value.trim(), filenameBase, text.trim(), false); // false: text from recogniser (not edited)
		
				
	    } else {
		tempResponse.innerHTML = event.results[i][0].transcript;
	    }
	}
    };    
    
    recognition.onend = function() {
	//console.log("recognition.onend");
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
	    logMessage("info", "Recording cancelled");	    
	} else {
	    logMessage("info", "Recording got error '" + event.error + "'");
	}
	audio.src = "";
	// enable(recStartButton);
	// disable(recSendButton);
	// disable(recCancelButton);
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
	    let thisRecStart = new Date(recStartTime).toLocaleString();
	    recStartTime = null;
	    document.getElementById("rec_duration").innerHTML = "&nbsp;"; // TODO: called twice, async issue

	    let sess = sessionField.value.trim();
	    if (sess.length === 0) {
		logMessage("error","cannot send audio with empty session id");
		return;
	    }

	    if (sendAudio) {

		// save working text if unsaved
		let oldText = document.getElementById("current-utt").value.trim();
		if (oldText.length > 0) {
		    await saveUttToList(sessionField.value.trim(), prevFilenameBase, oldText, true); // true : text is edited
		}	    

		let recEnd = new Date().toLocaleString();
		
		let ou = URL.createObjectURL(evt.data);
		//currentBlobURL = ou;
		console.log("Object URL ", ou);
		
		var audio = document.getElementById('audio');
		audio.src = ou;
		audio.disabled = false;
	    
		let blob = await fetch(ou).then(r => r.blob());
		//console.log("EN BLÅBB ", blob);

		let reader = new FileReader();
		reader.addEventListener("loadend", function() {
		    let rez = reader.result;
		    let payload = {
			"session_id" : sess,
			"file_name" : filenameBase,
			"data" : btoa(rez),
			"file_extension" : blob.type,
			"over_write" : false,
			"start_time": thisRecStart,
			"end_time": recEnd,
		    };
		    soundToServer(payload);		    
		});
		reader.readAsBinaryString(blob);
			
	    };
	});
	
    });
    
    mediaAccess.catch(function(err) {
	console.log("error from getUserMedia:", err);
	let msg = "Couldn't initialize recorder: " + err;
	alert(msg);
	logMessage("error", msg);
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


async function recStart() {
    prevFilenameBase = filenameBase;
    filenameBase = newFilenameBase();
    console.log("filenameBase set to " + filenameBase);
    await disable(recStartButton);
    await enable(recCancelButton);
    await enable(recSendButton);
    recStartTime = new Date().getTime();
    await recorder.start();
    logMessage("info", "Recording started");
}

recStartButton.addEventListener("click", async function() {
    await recStart();
    recognition.start();
});

recCancelButton.addEventListener("click", function() {
    prevFilenameBase = filenameBase;
    filenameBase = null;
    console.log("filenameBase set to " + filenameBase);
    recognition.abort();
    enable(recStartButton);
    disable(recCancelButton);
    disable(recSendButton);
    sendAudio = false;
    recorder.stop();
    document.getElementById("rec_duration").innerHTML = "&nbsp;";
    //recStartTime = null;
});


var currentBlobURL = null;

async function stopAndSend() {
    await enable(recStartButton);
    await disable(recCancelButton);
    await disable(recSendButton);
    sendAudio = true;
    await recorder.stop();
    document.getElementById("rec_duration").innerHTML = "&nbsp;";
}

recSendButton.addEventListener("click", async function() {    
    await stopAndSend();
    recognition.stop();
});

function visualize() {

    var WIDTH = visCanvas.width;
    var HEIGHT = visCanvas.height;
        
    visAnalyser.fftSize = 256;
    var bufferLengthAlt = visAnalyser.frequencyBinCount;
    var dataArrayAlt = new Uint8Array(bufferLengthAlt);
    
    visCanvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    
    var draw = function() {
	if (recStartTime != null) {
	    var recDur = new Date().getTime() - recStartTime;
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
	
	if (rawResponse.ok) {
	    const content = await rawResponse.text();
	    console.log(content);
	    try {
		const json = JSON.parse(content);
		logMessage("info", json.message);
	    } catch {
		logMessage("error", content);
	    }
	} else {
	    console.log(rawResponse);
	    logMessage("error", "couldn't save audio to server : " + rawResponse.statusText);
	}

	
    })();
};

async function textToServer(sessionName, fileName, text, isEdited) {

    console.log("textToServer", sessionName, fileName, text, isEdited);
    
    let payload = {
	"session_id" : sessionName,
	"file_name" : fileName,
	"data" : text,
	"over_write" : false,
    };
    let res = true;

    let url = baseURL + "/save_recogniser_text";
    if (isEdited)
	url = baseURL + "/save_edited_text";
    
    let f = (async () => {
	
	const rawResponse = await fetch(url, {
	    method: "POST",
	    headers: {
		'Accept': 'application/json',
		'Content-Type': 'application/json'
	    },
	    body: JSON.stringify(payload)
	});
	
	if (rawResponse.ok) {
	    const content = await rawResponse.text();
	    console.log(content);
	    try {
		const json = JSON.parse(content);
		logMessage("info", json.message);
		return true;
	    } catch {
		logMessage("error", content);
		res = false;
		return false;
	    }
	} else {
	    console.log(rawResponse);
	    logMessage("error", "couldn't save text to server : " + rawResponse.statusText);
	    res = false;
	    return false;
	}
	
    });
    await f();

    logMessage("info", "saved text '" + text + "'");
    return res;
};

function logMessage(title, text) {
    console.log(title, text);
    document.getElementById("messages").textContent = title + ": " + text;    
}


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
	saveUttToList(sessionField.value.trim(), filenameBase, text, true); // true: is edited
	src.value = "";
    }
}

async function saveUttToList(session, fName, text, isEdited) {
	if (text.length > 0 && fName !== undefined && fName !== null) {
	    if (await textToServer(session, fName, text, isEdited)) {
		var saved = document.getElementById("saved-utts");
		var div = document.createElement("div")
		saved.appendChild(div);
		div.textContent = text;
		div.id = filenameBase;
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


function newFilenameBase() {
    return uuidv4();
}

// Snippet lifted from https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript#2117523:
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}

function populateShortcuts() {
    document.getElementById("shortcuts").innerHTML = "<table>" +
	"<tr><td style='text-align: right'>Ctrl-Space :</td><td>Start/Send recording</td></tr>" +
	"<tr><td style='text-align: right'>Ctrl-Enter :</td><td>Save text</td></tr>" +
	"<tr><td style='text-align: right'>Escape :</td><td>Cancel recording</td></tr>" + 
	"</table>";
}

function validateSessionName() {
    if (sessionField.value.trim().length > 0) {
	enable(recStartButton);
	sessionField.style['border-color'] = "";
   }
    else {
	logMessage("info","session name is empty");
	disable(recStartButton);
	sessionField.style['border-color'] = "red";
    }
}

document.getElementById("break_everything").addEventListener("click", function() { breakEverything();})
document.getElementById("unbreak_everything").addEventListener("click", function() { unbreakEverything();})
document.getElementById("current-utt").addEventListener("keyup", function() { saveOnCtrlEnter();})

document.addEventListener("keyup", function() { globalShortcuts() });

sessionField.addEventListener("keyup", function() { validateSessionName() });
sessionField.addEventListener("change", function() { validateSessionName() });
