"use strict";



// See e.g.:
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API 
// https://mozdevs.github.io/MediaRecorder-examples/record-live-audio.html
// https://github.com/mdn/voice-change-o-matic
// https://github.com/mdn/voice-change-o-matic/blob/gh-pages/scripts/app.js

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var recorder; 

var analyser = audioCtx.createAnalyser();
analyser.minDecibels = -90;
analyser.maxDecibels = -10;
analyser.smoothingTimeConstant = 0.85;

var visCanvas = document.querySelector('.visualizer');
var visCanvasCtx = visCanvas.getContext("2d");

var recStart;

// TODO
var baseURL = window.origin;

var sendAudio = false;

//var audioBlob;

window.onload = function () {
    
    disable(document.getElementById('rec_cancel'));
    disable(document.getElementById('rec_send'));
    
    var url = new URL(document.URL);
    var source;
    var stream;
    
    var mediaAccess = navigator.mediaDevices.getUserMedia({'audio': true, video: false});
    
    mediaAccess.then(function(stream) {
	visualize();
	source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
	recorder = new MediaRecorder(stream);
	recorder.addEventListener('dataavailable', async function (evt) {
	    //     updateAudio(evt.data);
	    //     sendAndReceiveBlob();
	    
	    //audioBlob = evt.data;
	    //console.log("CANCELED? ", document.getElementById("rec_cancel").disabled);
	    //console.log("STOPPED? ", document.getElementById("rec_send").disabled);
	    
	    
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
		
		let reader = new FileReader();
		reader.addEventListener("loadend", function() {
		    let rez = reader.result;
		    let payload = {
			"session_id" :"snorkfroeken",
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
    
    
    document.getElementById("refresh_time").innerText = new Date().toLocaleString();
    
    document.getElementById("current-utt").focus();
}

function disable(element) {
    element.setAttribute("disabled","true");
}

function enable(element) {
    element.removeAttribute("disabled","false");
}

function doRecord() {
    return document.getElementById('rec_start').disabled;
}

document.getElementById("rec_start").addEventListener("click", function() {
    disable(document.getElementById("rec_start"));
    enable(document.getElementById("rec_cancel"));
    enable(document.getElementById("rec_send"));
    recStart = new Date().getTime();
    //document.getElementById("audio").src = null; // Is this how you empty the src? 
    recorder.start();
});

document.getElementById("rec_cancel").addEventListener("click", function() {
    enable(document.getElementById("rec_start"));
    disable(document.getElementById("rec_cancel"));
    disable(document.getElementById("rec_send"));
    sendAudio = false;
    recorder.stop();
    recStart = null;
});


var currentBlobURL = null;

document.getElementById("rec_send").addEventListener("click", function() {
    enable(document.getElementById("rec_start"));
    disable(document.getElementById("rec_cancel"));
    disable(document.getElementById("rec_send"));
    sendAudio = true;
    recorder.stop();
    
    recStart = null;
});

function visualize() {

    var WIDTH = visCanvas.width;
    var HEIGHT = visCanvas.height;
        
    analyser.fftSize = 256;
    var bufferLengthAlt = analyser.frequencyBinCount;
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
	
	analyser.getByteFrequencyData(dataArrayAlt);
	
	visCanvasCtx.fillStyle = 'rgb(0, 0, 0)';
	visCanvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
	
	var barWidth = (WIDTH / bufferLengthAlt) * 2.5;
	var barHeight;
	var x = 0;
	
	if (doRecord()) { 
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

const enterKeyCode = 13;
function saveOnCtrlEnter() {
    if (event.ctrlKey && event.keyCode === enterKeyCode) {
	var src = event.srcElement
	console.log(src);
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

document.getElementById("break_everything").addEventListener("click", function() { breakEverything();})
document.getElementById("unbreak_everything").addEventListener("click", function() { unbreakEverything();})
document.getElementById("current-utt").addEventListener("keyup", function() { saveOnCtrlEnter();})
