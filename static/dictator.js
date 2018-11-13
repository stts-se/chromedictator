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

const saveTextButton = document.getElementById("save_edited_text");

var isRecording = false;

var filenameBase;

let baseURL = window.location.protocol + '//' + window.location.host + window.location.pathname.replace(/\/$/g,"");
//var baseURL = window.origin;

var sendAudio = false;

var abbrevMap = {};

window.onload = function () {

    disable(recCancelButton);
    disable(recSendButton);
    disable(saveTextButton);
    disable(document.getElementById("current-utt"));

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

    initAbbrevs();
    
    recognition = new webkitSpeechRecognition();
    let tempResponse = document.querySelector("#recognition-result .content");
    let finalResponse = document.getElementById("current-utt");
    finalResponse.addEventListener('keyup', checkForAbbrev);
    // finalResponse.addEventListener('keyup', signalUnsavedEdit);
    recognition.lang = "sv";
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = async function(event) {
	console.log("recognition.onresult");
	for (var i = event.resultIndex; i < event.results.length; ++i) {
	    let text = event.results[i][0].transcript.trim();
	    if (event.results[i].isFinal) {

		if (isRecording) {
		    await stopAndSend("rec auto break");
		    await recStart("rec auto break");
		}
		
	    	finalResponse.value = text.trim();
		finalResponse.focus();
	    	tempResponse.innerHTML = "";

		let isEdited = false;
		let overwrite = false;
		await textToServer(sessionField.value.trim(), filenameBase, text.trim(), isEdited, overwrite);
		
				
	    } else {
		tempResponse.innerHTML = event.results[i][0].transcript;
	    }
	}
    };    

    recognition.onstart = function() {
	console.log("recognition.onstart");
    }
    
    recognition.onend = function() {
	console.log("recognition.onend");
	if (isRecording) {
	    stopAndSend();
	}
	enable(recStartButton);
	disable(recSendButton);
	disable(recCancelButton);
    };
    
    recognition.onspeechend = function() {
	console.log("recognition.onspeechend");
	if (isRecording) {
	    stopAndSend();
	}
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
	    console.log("recorder.onstop");
	    isRecording = false;
	} 
	recorder.onstart = function(evt) {
	    console.log("recorder.onstart");
	    isRecording = true;
	} 
	recorder.addEventListener('dataavailable', async function (evt) {	    
	    console.log("recorder dataavailable");
	    let thisRecStart = new Date(recStartTime).toLocaleString();
	    recStartTime = null;
	    document.getElementById("rec_duration").innerHTML = "&nbsp;"; // TODO: called twice, async issue

	    let sess = sessionField.value.trim();
	    if (sess.length === 0) {
		logMessage("error","cannot send audio with empty session id");
		return;
	    }

	    if (sendAudio) {
		let recEnd = new Date().toLocaleString();
		
		let ou = URL.createObjectURL(evt.data);
		//currentBlobURL = ou;
		//console.log("Object URL ", ou);
		
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

function createIssueReport() {
    let url = "https://github.com/stts-se/chromedictator/issues/new?body=";
    let prefix = "%0A";
    //let verticalBar = "%20%7C%20";
    window.open(url,'_blank');
}

function initAbbrevs() {
    loadAbbrevTable();
}

async function loadAbbrevTable() {
    await fetch(baseURL+ "/abbrev/list").then(async function(r) {
	if (r.ok) {
	    let serverAbbrevs = await r.json();
	    //console.log("#######", serverAbbrevs);
	    abbrevMap = {};
	    for (var i = 0; i < serverAbbrevs.length; i++) {
		//console.log("i: ", i, serverAbbrevs[i]);
		let a = serverAbbrevs[i];
		abbrevMap[a.abbrev] = a.expansion;
	    };
	    updateAbbrevTable();
	} else {
	    logMessage("error","failed to list abbreviations");
	}
    });
};



function updateAbbrevTable() {
    let at = document.getElementById("abbrev_table_body");
    at.innerHTML = '';
    Object.keys(abbrevMap).forEach(function(k) {
    	let v = abbrevMap[k];
    	let tr = document.createElement('tr');
    	let td1 = document.createElement('td');
    	let td2 = document.createElement('td');
    	let td3 = document.createElement('td');

    	td1.innerText = k;
    	td2.innerText = v;
	td3.setAttribute("class","abbrev_row_delete");
	td3.setAttribute("style","vertical-align: middle; horizontal-align: left");
	let del = document.createElement('button');
	del.innerHTML = "&#x274C;";
	del.setAttribute("style","background: none; vertical-align: middle; text-align: left; border: none; font-size: 50%; width: 100%; height: 100%");
	del.setAttribute("title", "delete abbrev '" + k + "'");
	del.addEventListener('click', function(evt) {
	    deleteAbbrev(k);
	});
	td3.appendChild(del);
	
    	tr.appendChild(td1);
    	tr.appendChild(td2);
    	tr.appendChild(td3);
    	at.appendChild(tr);
    });       

    // 'add' section below
    let tr = document.createElement('tr');
    let td1 = document.createElement('td');
    let td2 = document.createElement('td');
    let td3 = document.createElement('td');
    
    td1.innerHTML = "<input id='abbrev_add_key' style='height: 20pt; font-size: 100%'/>";
    td2.innerHTML = "<input id='abbrev_add_value' style='height: 20pt; font-size: 100%'/>";
    td3.setAttribute("class","abbrev_row_add");
    td3.setAttribute("style","vertical-align: middle");
    let add = document.createElement('button');
    add.setAttribute("title", "add");
    add.setAttribute("class", "btn");
    add.setAttribute("style","vertical-align: middle; padding: .2rem .75rem;");
    add.innerHTML = "Add new";
    //add.setAttribute("style","background: none; vertical-align: middle; text-align: center; border: none; width: 100%; height: 100%");
    td3.appendChild(add);
    
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    at.appendChild(tr);

    let addThisAbbrev = function() {
	let from = document.getElementById("abbrev_add_key").value;
	let to = document.getElementById("abbrev_add_value").value;
	addAbbrev(from, to);
	loadAbbrevTable();
    }
    
    document.getElementById("abbrev_add_key").addEventListener('keyup', function(evt) {
	if (evt.keyCode === keyCodeEnter)
	    addThisAbbrev();
    });
    document.getElementById("abbrev_add_value").addEventListener('keyup', function(evt) {
	if (evt.keyCode === keyCodeEnter)
	    addThisAbbrev();
    });
    add.addEventListener('click', function(evt) {
	addThisAbbrev();
    });

    let nAbbrevs = Object.keys(abbrevMap).length;
    document.getElementById("abbrev_count").textContent = "(" + nAbbrevs + ")";

}

async function addAbbrev(abbrev, expansion) {
    await fetch(baseURL+ "/abbrev/add/"+ abbrev + "/" + expansion).then(async function(r) {
	if (r.ok) {
	    logMessage("info", "added abbrev " + abbrev + " => " + expansion);
	} else {
	    logMessage("error","couldn't add abbrev " + abbrev + " => " + expansion);
	}
    });
};

async function deleteAbbrev(abbrev) {
    await fetch(baseURL + "/abbrev/delete/" + abbrev).then(async function(r) {
	if (r.ok) {
	    logMessage("info", "deleted abbrev " + abbrev);
	    loadAbbrevTable();
	} else {
	    logMessage("error","couldn't delete abbrev " + abbrev);
	}
    });
};


var leftWordRE = /(?:^| +)([^ ]+)$/; // TODO Really no need for regexp,
				    // just pick off characters until
				    // space, etc, or end of string?

function checkForAbbrev(evt) {
    if ( evt.key === " ") {
	// Ugh... going in circles...
	let ta = document.getElementById("current-utt");
	let startPos = ta.selectionStart;
	let end = ta.selectionEnd;
	
	let text = ta.value;
	// -1 is to remove the trailing space
	let stringUp2Cursor = text.substring(0,startPos-1);
	
	// wordBeforeSpace will have a trailing space
	let regexRes = leftWordRE.exec(stringUp2Cursor);
	if (regexRes === null) {
	    return;
	};
	let wordBeforeSpace = regexRes[0]; 
	
	if (abbrevMap.hasOwnProperty(wordBeforeSpace.trim())) {
	    //console.log(wordBeforeSpace, abbrevMap[wordBeforeSpace]);
	    // Match found. Replace abbreviation with its expansion
	    let textBefore = text.substring(0,startPos - wordBeforeSpace.length);
	    let textAfter = text.substring(startPos);
	    let expansion = abbrevMap[wordBeforeSpace.trim()];
	    
	    
	    ta.value = textBefore.trim() + " " + expansion + " " + textAfter.trim();
	    // Move cursor to directly after expanded word + 1 (space)
	    ta.selectionEnd =  (textBefore.trim() + " " + expansion).length + 1;
	};	
	
    }
}


function disable(element) {
    element.setAttribute("disabled","true");
}

function enable(element) {
    element.removeAttribute("disabled","false");
}

async function recStart(caller) {
    console.log("recStart() called from " + caller);
    // save working text if unsaved
    let current = document.getElementById("current-utt");
    let text = current.value.trim();
    if (text.length > 0) {
	let fnb = filenameBase;
	await saveUttToList(sessionField.value.trim(), fnb, text, true);
	current.value = "";
    }    
    filenameBase = newFilenameBase();
    console.log("**** filenameBase set to " + filenameBase);
    enable(saveTextButton);
    enable(document.getElementById("current-utt"));
    await disable(recStartButton);
    await enable(recCancelButton);
    await enable(recSendButton);
    recStartTime = new Date().getTime();
    await recorder.start();
    logMessage("info", "Recording started");
    console.log("recStart() completed call from " + caller);
}

recStartButton.addEventListener("click", async function() {
    //if (!isRecording) {
	await recStart("button click");
	recognition.start();
    //}
});

recCancelButton.addEventListener("click", function() {
    filenameBase = null;
    console.log("**** filenameBase set to " + filenameBase);
    disable(saveTextButton);
    disable(document.getElementById("current-utt"));
    recognition.abort();
    enable(recStartButton);
    disable(recCancelButton);
    disable(recSendButton);
    sendAudio = false;
    try {
	recorder.stop();
    } catch {
	console.log("couldn't stop recorder (not running)");
    }
    document.getElementById("rec_duration").innerHTML = "&nbsp;";
    //recStartTime = null;
});


var currentBlobURL = null;

async function stopAndSend(caller) {
    console.log("stopAndSend() called from " + caller);
    await enable(recStartButton);
    await disable(recCancelButton);
    await disable(recSendButton);
    sendAudio = true;
    try {
	await recorder.stop();
    } catch {
	console.log("couldn't stop recorder (not running)");
    }
		 
    document.getElementById("rec_duration").innerHTML = "&nbsp;";
    console.log("stopAndSend() completed call from " + caller);
}

recSendButton.addEventListener("click", async function() {    
    //if (isRecording) {
	await stopAndSend("button click");
	recognition.stop();
    //}
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

    console.log("soundToServer", payload);
    
    //console.log("Här kommer ljud ", payload);
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

async function textToServer(sessionName, fileName, text, isEdited, overwrite) {

    console.log("textToServer", sessionName, fileName, text, isEdited, overwrite);
    
    let payload = {
	"session_id" : sessionName,
	"file_name" : fileName,
	"data" : text,
	"over_write" : overwrite,
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

    if (isEdited)
	logMessage("info", "saved edited text '" + text + "' on server");
    else
	logMessage("info", "saved recogniser result '" + text + "' on server");
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

function dontClick() {
    let divs = document.querySelectorAll("div");
    for (var i = 1; i < divs.length; i++) {
	var d = divs[i];
	var c = d.getAttribute("class")
	if (c !== null && c.indexOf("nobreak") < 0)
	    d.style["animation"] =  "spin "+ getRandomInt(4,12) + "s linear infinite";
    }
    
    document.getElementById("dontclick").style["display"] = "none";
    document.getElementById("toldyouso").style["display"] = "";
}

function toldYouSo() {
    let divs = document.querySelectorAll("div");
    for (var i = 1; i < divs.length; i++) {
	var d = divs[i];
	var c = d.getAttribute("class")
	if (c !== null && c.indexOf("nobreak") < 0)
	    d.style["animation"] =  "";
    }
    
    document.getElementById("dontclick").style["display"] = "";
    document.getElementById("toldyouso").style["display"] = "none";

}



const keyCodeEnter = 13;
const keyCodeSpace = 32;
const keyCodeEscape = 27;

async function saveUttToList(session, fName, text, isEdited) {
    var savedDiv = document.getElementById(fName);
    let savedIsUndefined = (savedDiv === undefined || savedDiv === null);
    let overwrite = !savedIsUndefined;
    console.log("saveUttToList", session, fName, text, isEdited, overwrite);
    if (text.length > 0 && fName !== undefined && fName !== null) {
	if (await textToServer(session, fName, text, isEdited, overwrite)) {
	    var saved = document.getElementById("saved-utts");
	    var div = null;
	    if (overwrite) {
		div = savedDiv;
	    } else {
		div = document.createElement("div")
		div.id = filenameBase;
		div.setAttribute("title",filenameBase);
		saved.appendChild(div);
	    }
	    div.textContent = text;
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

function logTextChanged() {
    let savedDiv = document.getElementById(filenameBase);
    let text = document.getElementById("current-utt").value.trim();
    let savedText = "";
    if (savedDiv !== undefined && savedDiv !== null)
	savedText = savedDiv.textContent.trim();
    // console.log("saved text", savedText);
    // console.log("current text", text);
    let textChanged = (savedText != text);
    if (textChanged) 
	enable(saveTextButton);
    else
     	disable(saveTextButton);
}

function saveOnCtrlEnter() {
    if (event.ctrlKey && event.keyCode === keyCodeEnter) {
	saveTextButton.click();
    }
}
function saveEditedText() {
    let src = document.getElementById("current-utt");
    let text = src.value.trim();
    saveUttToList(sessionField.value.trim(), filenameBase, text, true);
}

//document.getElementById("break_everything").addEventListener("click", function() { breakEverything();})
//document.getElementById("unbreak_everything").addEventListener("click", function() { unbreakEverything();})
document.getElementById("dontclick").addEventListener("click", function() { dontClick();})
document.getElementById("toldyouso").addEventListener("click", function() { toldYouSo();})


document.getElementById("current-utt").addEventListener("keyup", function() { saveOnCtrlEnter();})

document.addEventListener("keyup", function() { globalShortcuts() });

sessionField.addEventListener("keyup", function() { validateSessionName() });
sessionField.addEventListener("change", function() { validateSessionName() });

document.getElementById("report_issue").addEventListener("click", function() { createIssueReport() });
saveTextButton.addEventListener("click", function() { saveEditedText() });
document.getElementById("current-utt").addEventListener("keyup", function() { logTextChanged() });
//document.getElementById("current-utt").addEventListener("change", function() { logTextChanged() });
