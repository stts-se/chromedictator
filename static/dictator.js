"use strict";

// For recording API, see e.g.:
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API 
// https://mozdevs.github.io/MediaRecorder-examples/record-live-audio.html
// https://github.com/mdn/voice-change-o-matic
// https://github.com/mdn/voice-change-o-matic/blob/gh-pages/scripts/app.js

const baseURL = window.location.protocol + '//' + window.location.host + window.location.pathname.replace(/\/$/g,"");

const keyCodeEnter = 13;
const keyCodeSpace = 32;
const keyCodeEscape = 27;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let recorder;
let recognition;

const visAnalyser = audioCtx.createAnalyser();
visAnalyser.minDecibels = -90;
visAnalyser.maxDecibels = -10;
visAnalyser.smoothingTimeConstant = 0.85;

const visCanvas = document.querySelector('.visualiser');
const visCanvasCtx = visCanvas.getContext("2d");
   
const headerTxt = "<b style='margin-block-start: 5pt; display: block'>STTS | Chrome Dictator | DEMO</b>";
const headerOnAir = "<span id='onair'>ON AIR</span>"

const recStartButton = document.getElementById("rec_start");
const recSendButton = document.getElementById("rec_send");
const recCancelButton = document.getElementById("rec_cancel");
const sessionField = document.getElementById("sessionname");

const saveTextButton = document.getElementById("save_edited_text");

let filenameBase;
let recStartTime;
let sessionStart;

let abbrevMap = {};
let breakKeywords = {
    "sv" : {
	"punkt": ".",
	"frågetecken": "?"
    },
    "da" : {
	"punkt": ".",
	"spørgsmålstegn": "?",
    }
};


// ------------------
// INITIALISATION

window.onload = function () {
    
    sessionStart = new Date();
    
    document.getElementById("headertxt").innerHTML = headerTxt;

    const url = new URL(document.URL);
    const session = url.searchParams.get('session')
    if (session !== null && session !== "") {
	sessionField.value = session.trim();
    }
    validateSessionName();

    disable(recCancelButton);
    disable(recSendButton);
    disable(saveTextButton);
    disable(document.getElementById("current-utt"));

    initWebkitSpeechRecognition();
    initMediaAccess();
    
    loadAbbrevTable();
    populateLanguages();
    populateShortcuts();

    document.getElementById("current-utt").focus();

    updateSessionClock();
    
    const loadFromServer = url.searchParams.get('load_from_server')
    if (loadFromServer !== null) {
	console.log("loading utterances from server for session " + session);
	document.getElementById("load_saved_text").click();	
    } else {
	// insert dummy text/audio
	//readFromServerAndAddToUttList(sessionField.value.trim(), "audiotst");
    }
}

window.onbeforeunload = function() {
    return "Are you sure you want to navigate away?";
}

function initMediaAccess() {
    const mediaAccess = navigator.mediaDevices.getUserMedia({'audio': true, video: false});
    
    mediaAccess.then(function(stream) {
	visualize();
	const source = audioCtx.createMediaStreamSource(stream);
        source.connect(visAnalyser);
	recorder = new MediaRecorder(stream);
	recorder.sendAudio = false;
	recorder.isRecording = false;
	recorder.onstop = function(evt) {
	    document.getElementById("headertxt").innerHTML = headerTxt;
	    //console.log("recorder.onstop called");
	    enable(recStartButton);
	    disable(recCancelButton);
	    disable(recSendButton);
	    document.getElementById("rec_duration").innerHTML = "&nbsp;";
	    recorder.isRecording = false;
	    recorder.sendAudio = false;
	    //console.log("recorder.onstop completed");
	    trackTextChanges();
	} 
	recorder.onerror = function(evt) {
	    console.log("recorder.onerror", evt);
	    trackTextChanges();
	}
	recorder.onpause = function(evt) {
	    console.log("recorder.onpause");
	}
	recorder.onstart = async function(evt) {
	    document.getElementById("headertxt").innerHTML = headerOnAir;
	    //console.log("recorder.onstart called");
	    recorder.sendAudio = false;

	    // save working text if unsaved
	    const current = document.getElementById("current-utt");
	    const text = current.value.trim();
	    if (text.length > 0) {
		const fnb = filenameBase;
		await saveAndAddToUttList(sessionField.value.trim(), fnb, text, true);
		current.value = "";
	    }
	    // prepare new recording
	    renewFilenameBase();
	    enable(saveTextButton);
	    enable(document.getElementById("current-utt"));
	    await disable(recStartButton);
	    await enable(recCancelButton);
	    await enable(recSendButton);
	    recStartTime = new Date();
	    recorder.isRecording = true;
	    //console.log("recorder.onstart completed");
	    logMessage("info", "Recording started");
	} 
	recorder.ondataavailable = async function (evt) {	    
	    const thisRecStart = recStartTime;
	    console.log("recorder.ondataavailable | recorder.sendAudio: " + recorder.sendAudio + " | thisRecStart: " + thisRecStart);
	    recStartTime = null;
	    document.getElementById("rec_duration").innerHTML = "&nbsp;"; 

	    const sess = sessionField.value.trim();
	    if (sess.length === 0) {
		logMessage("error","cannot send audio with empty session id");
		return;
	    }

	    if (recorder.sendAudio) {
		const thisRecEnd = new Date();
		const timeCodeStart = thisRecStart.getTime()-sessionStart.getTime();
		const recStart = thisRecStart.getTime();
		const recEnd = thisRecEnd.toISOString();
		const timeCodeEnd = thisRecEnd.getTime()-sessionStart.getTime();
		
		const ou = URL.createObjectURL(evt.data);
		
		const audio = document.getElementById('audio');
		audio.src = ou;
		audio.disabled = false;
	    
		const blob = await fetch(ou).then(r => r.blob());

		const reader = new FileReader();
		reader.addEventListener("loadend", function() {
		    const rez = reader.result;
		    const payload = {
			"session_id" : sess,
			"file_name" : filenameBase,
			"data" : btoa(rez),
			"file_extension" : blob.type,
			"over_write" : false,
			"start_time": thisRecStart.toISOString(),
			"end_time": recEnd,
			"time_code_start": timeCodeStart,
			"time_code_end": timeCodeEnd,
		    };
		    soundToServer(payload);
		});
		reader.readAsBinaryString(blob);
			
	    };
	};
	
    });
    
    mediaAccess.catch(function(err) {
	console.log("error from getUserMedia:", err);
	const msg = "Couldn't initialize recorder: " + err;
	alert(msg);
	logMessage("error", msg, err);
    });
    
}

function initWebkitSpeechRecognition() {
    // Google speech rec 
    if (!('webkitSpeechRecognition' in window)) {
	alert("This browser does not support webkit speech recognition. Try Google Chrome.");
	return;
    };

    recognition = new webkitSpeechRecognition();

    const langSelect = document.getElementById("lang_select");
    langSelect.addEventListener("change", function(event) {
	const i = langSelect.selectedIndex
	const lang = langSelect.options[i].value;
	recognition.lang = lang;
	logMessage("info", "language set to: " + recognition.lang);
    });


    const tempResponse = document.querySelector("#recognition-result .content");
    const finalResponse = document.getElementById("current-utt");
    finalResponse.addEventListener('keyup', checkForAbbrev);
    recognition.lang = "sv";
    //recognition.continuous = true;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.isCancelled = false;
    recognition.restartable = false;

    const doRecBreak = async function(recognisedText) {
	const wds = recognisedText.split(/ +/);
	const lastWd = wds[wds.length-1];
	const breakKeywordsForLang = breakKeywords[recognition.lang.replace(/-.*/,"")];
	if (breakKeywordsForLang !== undefined && breakKeywordsForLang !== null) {
	    const replacement = breakKeywordsForLang[lastWd];
	    if (replacement !== undefined && replacement !== null)
		wds[wds.length-1] = replacement;
	}
	const text = wds.join(" ");
	//console.log("doRecBreak new text", text);
	
	// stop recorder if it's running
	if (recorder.isRecording) {
	    recorder.sendAudio = true;
	    //console.log("recognition.onresult recorder.sendAudio", recorder.sendAudio);
	    try {
		await recorder.stop();
	    } catch(err) {}
	    await recognition.stop();
	}
	
	finalResponse.value = text.trim();
	finalResponse.focus();
	trackTextChanges();
	tempResponse.innerHTML = "";
	
	const isEdited = false;
	const overwrite = false;
	await textToServer(sessionField.value.trim(), filenameBase, text.trim(), isEdited, overwrite);
    }
    
    // on result from speech rec
    recognition.onresult = function(event) {
	//console.log("recognition.onresult");
	for (let i = event.resultIndex; i < event.results.length; ++i) {
	    const text = event.results[i][0].transcript.trim();	    
	    if (event.results[i].isFinal) {
		//console.log("recognition.onresult final", text);
		doRecBreak(text);
		recognition.restartable = true;
	    } else {
		tempResponse.innerHTML = text;
		const wds = text.split(/ +/);
		const lastWd = wds[wds.length-1];
		const replacement = breakKeywords[lastWd];
		if (replacement !== undefined && replacement !== null) {
		    //console.log("recognition.onresult received break keyword: " + text + " => " + replacement);
		    recognition.restartable = true;
		    recognition.stop();
		}
	    }
	}
    };    

    recognition.onnnomatch = function() { console.log("recognition.onnomatch"); }

    const startRecorder = function(caller) {
	//console.log("recognition." + caller);
    	if (!recorder.isRecording) {
	    try {
		recorder.start();
	    } catch(err) {}
	}
	recognition.isCancelled = false;
	recognition.restartable = false;
    }

    const stopRecorder = async function(caller, doSendAudio) {
	// console.log("recognition." + caller);
	// console.log("recognition.stopRecorder | already cancelled: " + recognition.isCancelled);
	if (!recognition.isCancelled) {
	    recorder.sendAudio = doSendAudio;
	    recognition.isCancelled = !doSendAudio;
	}
	//console.log("recognition.stopRecorder | recorder.sendAudio: " + recorder.sendAudio);
	if (recorder.isRecording) {
	    try {
		await recorder.stop();
	    } catch(err) {}
	}

	// AUTO RESTART
	if (recognition.restartable && document.getElementById("do_autostart").checked) {
	    //console.log("stopRecorder", "recognition.restartable", recognition.restartable, "autostart", true);
	    recognition.start();
	}

    }
    
    recognition.onstart = function() { 	startRecorder("onstart") };
    // recognition.onsoundstart = function() { startRecorder("onsoundstart") };
    // recognition.onspeechstart = function() { startRecorder("onspeechstart") };

    recognition.onend = function() { stopRecorder("onend", true); };
    // recognition.onsoundend = function() { stopRecorder("onsoundend", true) };
    // recognition.onspeechend = function() { stopRecorder("onspeechend", true) };
    
    recognition.onerror = function(event) {
	//console.log("recognition.onerror");
	recorder.sendAudio = false;
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
	try {
	    //console.log("recognition.onerror | recorder.sendAudio: " + recorder.sendAudio, event);
	    stopRecorder("onerror", false);
	} catch(err) {}
	enable(recStartButton);
	disable(recSendButton);
	disable(recCancelButton);
    };

    
}

function populateLanguages() {
    const langSelect = document.getElementById("lang_select");
    const langs = ["sv-SE",
		   "da-DK",
		   "de-DE",
		   "en-UK",
		   "en-US",
		   "fr-FR",
		   "nb-NO"];
    for (let i=0; i<langs.length;i++) {
	const lang = langs[i];
	const ele = document.createElement("option");
	ele.value=lang;
	ele.textContent=lang;
	if (i===0) {
	    recognition.lang = lang;
	    ele.selected = "selected";
	}
	langSelect.appendChild(ele);
    }
}

function populateShortcuts() {
    function globalKeyListener() {
	//console.log("keycode debug", event.keyCode, event.ctrlKey);
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
    };
    document.addEventListener("keydown", function() { globalKeyListener() });
    
    document.getElementById("shortcuts").innerHTML = "<table>" +
	"<tr><td style='text-align: right'>Ctrl-Space :</td><td>Start/Send recording</td></tr>" +
	"<tr><td style='text-align: right'>Ctrl-Enter :</td><td>Save text</td></tr>" +
	"<tr><td style='text-align: right'>Escape :</td><td>Cancel recording</td></tr>" + 
	"</table>";
}



// ------------------
// ABBREVS

async function loadAbbrevTable() {
    await fetch(baseURL+ "/abbrev/list").then(async function(r) {
	if (r.ok) {
	    const serverAbbrevs = await r.json();
	    abbrevMap = {};
	    for (let i = 0; i < serverAbbrevs.length; i++) {
		//console.log("i: ", i, serverAbbrevs[i]);
		const a = serverAbbrevs[i];
		abbrevMap[a.abbrev] = a.expansion;
	    };
	    updateAbbrevTable();
	} else {
	    logMessage("error","failed to list abbreviations");
	}
    });
};

function updateAbbrevTable() {
    const at = document.getElementById("abbrev_table_body");
    at.innerHTML = '';
    Object.keys(abbrevMap).forEach(function(k) {
    	const v = abbrevMap[k];
    	const tr = document.createElement('tr');
    	const td1 = document.createElement('td');
    	const td2 = document.createElement('td');
    	const td3 = document.createElement('td');

    	td1.innerText = k;
    	td2.innerText = v;
	td3.setAttribute("class","abbrev_row_delete");
	td3.setAttribute("style","vertical-align: middle; text-align: left");
	const del = document.createElement('button');
	del.innerHTML = "&#x274C;";
	del.setAttribute("class", "btn icon");
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
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const td2 = document.createElement('td');
    const td3 = document.createElement('td');
    
    td1.innerHTML = "<input id='abbrev_add_key' style='height: 20pt; font-size: 100%'/>";
    td2.innerHTML = "<input id='abbrev_add_value' style='height: 20pt; font-size: 100%'/>";
    td3.setAttribute("class","abbrev_row_add");
    td3.setAttribute("style","vertical-align: middle");
    const add = document.createElement('span');
    add.setAttribute("title", "add");
    add.setAttribute("class", "btn");
    add.setAttribute("style","vertical-align: middle; padding: .2rem .75rem;");
    add.innerHTML = "Add new";
    td3.appendChild(add);
    
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    at.appendChild(tr);

    const addThisAbbrev = function() {
	const from = document.getElementById("abbrev_add_key").value;
	const to = document.getElementById("abbrev_add_value").value;
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

    const nAbbrevs = Object.keys(abbrevMap).length;
    document.getElementById("abbrev_count").textContent = "(" + nAbbrevs + ")";

}

async function addAbbrev(abbrev, expansion) {
    await fetch(baseURL+ "/abbrev/add/"+ abbrev + "/" + expansion).then(function(r) {
	if (r.ok) {
	    logMessage("info", "added abbrev " + abbrev + " => " + expansion);
	} else {
	    logMessage("error","couldn't add abbrev " + abbrev + " => " + expansion);
	}
    });
};

async function deleteAbbrev(abbrev) {
    await fetch(baseURL + "/abbrev/delete/" + abbrev).then(function(r) {
	if (r.ok) {
	    logMessage("info", "deleted abbrev " + abbrev);
	    loadAbbrevTable();
	} else {
	    logMessage("error","couldn't delete abbrev " + abbrev);
	}
    });
};


const leftWordRE = /(?:^| +)([^ ]+)$/; // TODO Really no need for regexp,
				    // just pick off characters until
				    // space, etc, or end of string?

function checkForAbbrev(evt) {
    if ( evt.key === " ") {
	// Ugh... going in circles...
	const ta = document.getElementById("current-utt");
	const startPos = ta.selectionStart;
	const end = ta.selectionEnd;
	
	const text = ta.value;
	// -1 is to remove the trailing space
	const stringUp2Cursor = text.substring(0,startPos-1);
	
	// wordBeforeSpace will have a trailing space
	const regexRes = leftWordRE.exec(stringUp2Cursor);
	if (regexRes === null) {
	    return;
	};
	const wordBeforeSpace = regexRes[0]; 
	
	if (abbrevMap.hasOwnProperty(wordBeforeSpace.trim())) {
	    //console.log(wordBeforeSpace, abbrevMap[wordBeforeSpace]);
	    // Match found. Replace abbreviation with its expansion
	    const textBefore = text.substring(0,startPos - wordBeforeSpace.length);
	    const textAfter = text.substring(startPos);
	    const expansion = abbrevMap[wordBeforeSpace.trim()];
	    
	    
	    ta.value = textBefore.trim() + " " + expansion + " " + textAfter.trim();
	    // Move cursor to directly after expanded word + 1 (space)
	    ta.selectionEnd =  (textBefore.trim() + " " + expansion).length + 1;
	};	
	
    }
}


// -------------------
// VISUAL FEEDBACK (visual feedback on audio input; black pane with red bars)
function visualize() {

    const WIDTH = visCanvas.width;
    const HEIGHT = visCanvas.height;
        
    visAnalyser.fftSize = 256;
    const bufferLengthAlt = visAnalyser.frequencyBinCount;
    const dataArrayAlt = new Uint8Array(bufferLengthAlt);
    
    visCanvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    
    const draw = function() {
	if (recStartTime !== undefined && recStartTime !== null) {
	    const now = new Date();
	    const recDur = now.getTime() - recStartTime.getTime();
	    document.getElementById("rec_duration").textContent = Math.floor(recDur/1000) + "s";
	}
    
	const drawVisual = requestAnimationFrame(draw);
	
	visAnalyser.getByteFrequencyData(dataArrayAlt);
	
	visCanvasCtx.fillStyle = 'rgb(0, 0, 0)';
	visCanvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
	
	const barWidth = (WIDTH / bufferLengthAlt) * 2.5;
	let barHeight;
	let x = 0;
	
	if (recorder !== undefined && recorder.isRecording) { 
	    for(let i = 0; i < bufferLengthAlt; i++) {
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


// -----------------
// SAVE TO SERVER

// Send audio to server for saving (with metadata defined in json input)
// sample json input: {
// 	"session_id" : "default",
// 	"file_name" : "0e15b20e-cde8-4a17-93f3-c8322b873fb3"
// 	"data" : <audio data>,
// 	"file_extension" : "webm",
// 	"over_write" : "false",
// 	"start_time": "11/13/2018, 12:18:08 PM",
// 	"end_time": "11/13/2018, 12:18:10 PM"
// };
async function soundToServer(payload) {

    //console.log("soundToServer", payload);
    
    const url = baseURL + "/save_audio";
    
    const doSend = async function() {
	
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
	    //console.log(content);
	    try {
		const json = JSON.parse(content);
		logMessage("info", json.message);
	    } catch(err) {
		logMessage("error", "couldn't parse json: " + err, err);
	    }
	} else {
	    console.log(rawResponse);
	    const errMsg = await rawResponse.text();
	    logMessage("error", "couldn't save audio to server : " + errMsg);
	}
    };
    await doSend();
};


// Send a single text utterance to server for saving (with metadata)
async function textToServer(sessionName, fileName, text, isEdited, overwrite) {

    //console.log("textToServer", sessionName, fileName, text, isEdited, overwrite);
    
    const payload = {
	"session_id" : sessionName,
	"file_name" : fileName,
	"data" : text,
	"over_write" : overwrite,
    };
    let res = true;

    let url = baseURL + "/save_recogniser_text";
    if (isEdited)
	url = baseURL + "/save_edited_text";
    
    const f = (async () => {
	
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
	    //console.log(content);
	    try {
		const json = JSON.parse(content);
		logMessage("info", json.message);
		return true;
	    } catch (err) {
		logMessage("error", "couldn't parse json: " + err, err);
		res = false;
		return false;
	    }
	} else {
	    console.log(rawResponse);
	    const errMsg = await rawResponse.text();
	    logMessage("error", "couldn't save text to server : " + errMsg);
	    res = false;
	    return false;
	}
	
    });
    await f();

    // if (isEdited)
    // 	logMessage("info", "saved edited text '" + text + "' on server");
    // else
    // 	logMessage("info", "saved recogniser result '" + text + "' on server");
    return res;
};

// read text from server, and add to 'saved text' area with cached audio 
async function readFromServerAndAddToUttList(session, fName) {
    let text = await getEditedText(session, fName);
    if (text === "") { // if no edited text exists, take the auto-recognised text, if available
	text = await getRecognisedText(session, fName);
    }
    if (text !== "") {
	addToUttList(session, fName, text);
	return true;
    } else
	return false;
}

// save text on server, and add to 'saved text' area with cached audio 
async function saveAndAddToUttList(session, fName, text, isEdited) {
    if (fName !== undefined && fName !== null && text.length > 0) {
	const savedSpan = document.getElementById(fName);
	const savedIsUndefined = (savedSpan === undefined || savedSpan === null);
	const overwrite = !savedIsUndefined;

	console.log("saveAndAddToUttList", session, fName, text, isEdited, overwrite);

	if (await textToServer(session, fName, text, isEdited, overwrite)) {
	    await addToUttList(session, fName, text);	    
	}
    }
}

// add to 'saved text' area with cached audio 
function addToUttList(session, fName, text) {
    const savedSpan = document.getElementById(fName);
    const savedIsUndefined = (savedSpan === undefined || savedSpan === null);
    const overwrite = !savedIsUndefined;

    //console.log("addToUttList", session, fName, text);

    const saved = document.getElementById("saved-utts-table");
    let textSpan = null;
    if (overwrite) {
	textSpan = savedSpan;
    } else {
	const div = document.createElement("div");
	div.setAttribute("class","highlightonhover");
	div.setAttribute("title",fName);
	textSpan = document.createElement("span")
	textSpan.id = fName;
	textSpan.setAttribute("style","padding-left: 0.5em;");
	const idSpan = document.createElement("span");
	idSpan.textContent = " " + shortFilenameBaseFor(fName); // space to make it easier to copy id without text
	idSpan.setAttribute("style","vertical-align: top; float: right; text-align: right; font-family: monospace");
	const audioSpan = document.createElement("span");
	const audio = document.createElement("audio");
	const play = "&#9654;";
	const pause = "&#9646;&#9646;";
	audioSpan.innerHTML  = "<button style='width: 30px; text-align: center' class='btn black replay'>" + play + "</button>";
	const playChar = audioSpan.firstChild.innerHTML;
	audioSpan.style = "vertical-align: top; text-align: center";
	audioSpan.title = "Play";
	audioSpan.addEventListener("click", function () {
	    if (audioSpan.firstChild.innerText === playChar) {
		audio.play();
		audioSpan.firstChild.innerHTML = pause;
		audioSpan.title = "Pause";
	    } else {
		audio.pause();
		audioSpan.firstChild.innerHTML = play;
		audioSpan.title = "Play";
	    }
	});
	// audio.onplay = function() {	console.log("audio.onplay"); }
	// audio.onpause = function() { console.log("audio.onpause"); }
	audio.onended = function() {
	    //console.log("audio.onended");
	    audioSpan.firstChild.innerHTML = play;
	    audioSpan.title = "Play";
	};
	//await cacheAudio(audio, audioSpan.firstChild, baseURL + "/get_audio/" + sessionField.value.trim() + "/" + fName);
	audio.src = document.getElementById("audio").src;
	audioSpan.appendChild(audio);

	div.appendChild(audioSpan);
	div.appendChild(textSpan);
	div.appendChild(idSpan);
	saved.appendChild(div);
	scrollDown(document.getElementById("saved-utts-table"));
    }
    textSpan.textContent = text;
}


// -------------------
// MISC


// fetch edited text (.edi file) from server for the specified session and basename
function getEditedText(sessionName, fName) {
    return getText(sessionName, fName, "edi");
}

// fetch recognised text (.rec file) from server for the specified session and basename
function getRecognisedText(sessionName, fName) {
    return getText(sessionName, fName, "rec");
}

// fetch text from server for the specified session, basename and extension
async function getText(sessionName, fName, extension) {
    const url = baseURL + "/get_edited_text/" + sessionName + "/" + fName + "." + extension;
    let res = "";
    
    const func = async function() {
	
	const resp = await fetch(url);
	
	if (resp.ok) {
	    const content = await resp.text();
	    //console.log(content);
	    try {
		const json = JSON.parse(content);
		if (json.text === undefined || json.text === null || json.text === "" ) {
		    logMessage("error", "couldn't get text from server : " + json.message);
		} else {
		    res = json.text;
		}
	    } catch (err) {
	    	logMessage("error", err.message, err);
	    }
	} else {
	    console.log(resp);
	    const errMsg = await resp.text();
	    logMessage("error", "couldn't get text from server : " + errMsg);
	}

    }
    await func();
    return res;
}

// fetch audio from server, and cache for playback
function cacheAudio(audioElement, playPauseButton, url) {

    (async () => {
	
	const resp = await fetch(url, {
	});
	
	if (resp.ok) {
	    const content = await resp.text();
	    //console.log(content);
	    try {
		const json = JSON.parse(content);
		if (json.data === undefined || json.data === null || json.data === "" ) {
		    audioElement.setAttribute("disabled","disabled");
		    playPauseButton.setAttribute("disabled","disabled");
		    playPauseButton.setAttribute("title","No audio");
		    logMessage("error", "couldn't get audio from server : " + json.message);
		} else {

    		    // https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript#16245768
    		    const byteCharacters = atob(json.data);
		    
    		    const byteNumbers = new Array(byteCharacters.length);
    		    for (let i = 0; i < byteCharacters.length; i++) {
    			byteNumbers[i] = byteCharacters.charCodeAt(i);
    		    }
    		    const byteArray = new Uint8Array(byteNumbers);
		    
    		    const blob = new Blob([byteArray], {'type' : json.file_type});
    		    audioElement.src = URL.createObjectURL(blob);
		    
		}
	    } catch (err) {
		audioElement.setAttribute("disabled","disabled");
		playPauseButton.setAttribute("disabled","disabled");
		playPauseButton.setAttribute("title","No audio");
	    	logMessage("error", err.message, err);
	    }
	} else {
	    console.log(resp);
	    const errMsg = await resp.text();
	    logMessage("error", "couldn't get audio from server : " + errMsg);
	}
	
    })();

}

// validate session name text field
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

// track text changes and disable save button it the text is unchanged compared to the previously saved version
function trackTextChanges() {
    const savedSpan = document.getElementById(filenameBase);
    const text = document.getElementById("current-utt").value.trim();
    let savedText = "";
    if (savedSpan !== undefined && savedSpan !== null)
	savedText = savedSpan.textContent.trim();
    const textChanged = (savedText !== text);
    //console.log("trackTextChanges", savedText, text, textChanged, filenameBase);
    if (textChanged && filenameBase !== null) 
	enable(saveTextButton);
    else
     	disable(saveTextButton);
}

recStartButton.addEventListener("click", function() {
    //console.log("recStartButton clicked");
    recorder.start();
    recognition.start();
    trackTextChanges();
});

recCancelButton.addEventListener("click", function() {
    //console.log("recCancelButton clicked");
    recorder.sendAudio = false;
    recognition.abort();
    recorder.stop();
    trackTextChanges();
});


recSendButton.addEventListener("click", function() {    
    //console.log("recSendButton clicked");
    recorder.sendAudio = true;
    //console.log("recSendButton.clicked recorder.sendAudio", recorder.sendAudio);
    recognition.stop();
    recorder.stop();
    trackTextChanges();
});

sessionField.addEventListener("keyup", function() { validateSessionName() });
sessionField.addEventListener("change", function() { validateSessionName() });

document.getElementById("do_autostart").addEventListener("click", function(evt) {
    const ele = document.getElementById("autostart_on_off_text");
    if (evt.target.checked)
	ele.innerText = "on";
    else
	ele.innerText = "off";
});

document.getElementById("report_issue").addEventListener("click", function() { createIssueReport() });

document.getElementById("current-utt").addEventListener("keyup", function() { trackTextChanges() });
document.getElementById("current-utt").addEventListener("changed", function() { trackTextChanges() });

document.getElementById("current-utt").addEventListener("keyup", function() {
    if (event.ctrlKey && event.keyCode === keyCodeEnter) {
        saveTextButton.click();
    }
});

saveTextButton.addEventListener("click", function() {
    const src = document.getElementById("current-utt");
    const text = src.value.trim();
    saveAndAddToUttList(sessionField.value.trim(), filenameBase, text, true);
    trackTextChanges();
});

document.getElementById("clear_saved_text").addEventListener("click", function() {
    document.getElementById("saved-utts-table").textContent="";
    logMessage("info", "Cleared text view");
});

document.getElementById("reset_session_stopwatch").addEventListener("click", function() {
    sessionStart = new Date();
    updateSessionClock();
    logMessage("info", "Session stopwatch has been reset");
});


// list file basenames on server
function listBasenames(sessionName) {
    const url = baseURL + "/admin/list/basenames/" + sessionName;
    return listFromURL(url, "basenames");
}

// list file names on server
function listFiles(sessionName) {
    const url = baseURL + "/admin/list/files/" + sessionName;
    return listFromURL(url, "files");
}

// get list from server url
async function listFromURL(url, description) {
    const list = await fetch(url).then( r => {
	if (!r.ok) throw r
	return r.json();
    }).then(j => {
	if (j.error !== "") {
	    logMessage("error", "couldn't list " + description + ": " + j.error);
	    return null;
	} else {
	    return j.result;
	}
    }).catch( r => {
	logMessage("error", "couldn't list " + description + ": " + r.responseText, err);
	return null;
    });
    return list;
}

document.getElementById("load_saved_text").addEventListener("click", async function() {
    document.getElementById("saved-utts-table").textContent="";
    const sessionName = sessionField.value.trim();
    const names = await listFiles(sessionName);
    if (names !== null) {
	let nLoaded = 0;
	for (let i=0; i<names.length; i++) {
	    const fName = names[i];
	    if (fName.endsWith(".webm")) {
		const baseName = fName.replace(/[.][^.]+$/,"");
		//console.log(baseName);
		if (await readFromServerAndAddToUttList(sessionName, baseName)) {
		    nLoaded++;
		}
	    }
	}
	let utts = "utterance";
	if (nLoaded > 1)
	    utts = utts + "s";
	logMessage("info", "Loaded " + nLoaded + " " + utts + " from server");
    }
});


// Simple API documentation (server API and URL params). A bit messy.
document.getElementById("api_docs").addEventListener("click", async function() {

    // Server API
    const serverAPI = await fetch(baseURL+ "/doc").then(function(r) {
	if (r.ok)
	    return r.text();
	else {
	    const errMsg = r.text();
	    logMessage("error","couldn't retreive server docs: " + errMsg);
	}
    }).then(s => { return s.trim().split("\n") });
    

    // MAIN application
    const mainApp = [baseURL];
    
    // URL params
    const params = ["session - set session name", "load_from_server - load session's utterances from server"];

    const body = document.createElement("span");
    
    // Fill section
    let populate = (title, items, withLink) => {
	const h = document.createElement("b");
	h.textContent = title;
	const ul = document.createElement("ul");
	ul.style['list-style-type'] = "none";
	body.appendChild(h);
	body.appendChild(ul);
	for (let i=0; i<items.length; i++) {
	    const li = document.createElement("li");
	    if (withLink) {
		const a = document.createElement("a");
		a.textContent = items[i];
		a.href = items[i];
		li.appendChild(a);
		ul.appendChild(li);
	    } else {
		li.textContent = items[i];
		ul.appendChild(li);
	    }
	}
    };

    populate("Main application", mainApp, true);
    populate("URL params", params);    
    populate("Server API", serverAPI);

    // Modal
    modalDialog("API docs",body);
    
    // New window
    // const tab = window.open(baseURL);
    // tab.document.url = baseURL;
    // tab.document.write("<html><head><meta charset='utf-8'><link rel='stylesheet' type='text/css' href='layout.css'><link rel='stylesheet' type='text/css' href='look.css'><title>API docs</title><body id='body'/></html>");
    // tab.document.getElementById("body").appendChild(body);

});


// ------------------
// MODAL

document.getElementById("modal_close").onclick = closeModal;

function closeModal() {
    const modal = document.getElementById('modal_takeover');
    clearModal();
    modal.style["visibility"] = "hidden";
    modal.style["display"] = "none";
}

function openModal() {
    const modal = document.getElementById('modal_takeover');
    modal.style["visibility"] = "visible";
    modal.style["display"] = "grid";
}

function toggleModal() {
    const modal = document.getElementById('modal_takeover');
    if (modal.style["visibility"] === "hidden") {
	openModal();
    } else {
	closeModal();
    }
}

function clearModal() {
    document.getElementById("modal_title").innerHTML = "";
    document.getElementById("modal_body").innerHTML = "";
}

function modalDialog(title, content) {
    clearModal();
    document.getElementById("modal_title").textContent = title;
    const body = document.getElementById("modal_body");
    if (content.constructor.name === "String")
	body.textContent = content;
    else
	body.appendChild(content);
    openModal();
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
    const modal = document.getElementById('modal_takeover');
    if (event.target == modal) 
	closeModal();
}


// ------------------
// UTILS

function updateSessionClock() {
    const now = new Date();
    const durMillis = now.getTime() - sessionStart.getTime();
    const durSeconds = Math.floor(durMillis/1000);
    document.getElementById("session_duration").textContent = "[" + durSeconds + "s]";
    setTimeout(updateSessionClock, 500);
}

function addClass(element, className) {
    const classes = element.className.split(/ +/);
    if (!classes.includes(className)) {
	classes.push(className);
	element.className = classes.join(" ");
    }
}

function removeClass(element, className) {
    const classes = element.className.split(/ +/);
    var index = classes.indexOf(className);
    if (index > -1) {
	classes.splice(index, 1); // remove 1 items from index
	element.className = classes.join(" ");
    }
}

function scrollDown(element) {
    element.scrollTop = element.scrollHeight;
}

function logMessage(title, text, stacktrace) {
    if (stacktrace !== undefined) {
	//const stack = new Error().stack;
	console.log(title, text, stacktrace.stack);
    } else {	
	console.log(title, text);
    }
    document.getElementById("messages").textContent = title + ": " + text;    
}

// Create UUID | Snippet lifted from https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript#2117523:
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}

function createIssueReport() {
    const url = "https://github.com/stts-se/chromedictator/issues/new?body=";
    const prefix = "%0A";
    //const verticalBar = "%20%7C%20";
    window.open(url,'_blank');
}

function disable(element) {
    element.setAttribute("disabled","true");
}

function enable(element) {
    element.removeAttribute("disabled","false");
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shortFilenameBase() {
    shortFilenameBaseFor(filenameBase);
}

function shortFilenameBaseFor(fName) {
    return fName.substring(0,8);
}

function renewFilenameBase() {
    filenameBase = uuidv4();
    console.log(" === >>> filenameBase set to " + filenameBase + " <<< === ");
    return filenameBase;
}

// -----------------
// ... AND FINALLY SOME FUN!

function breakEverything() {
    const divs = document.querySelectorAll("div");
    for (let i = 1; i < divs.length; i++) {
	const d = divs[i];
	const c = d.getAttribute("class")
	if (c !== null && c.indexOf("nobreak") < 0)
	    d.style["transform"] =  "rotate("+ getRandomInt(-180,180) + "deg)";
    }
    document.getElementById("unbreak_everything").style["display"] = "";
    document.getElementById("break_everything").style["display"] = "none";
}

function unbreakEverything() {
    const divs = document.querySelectorAll("div");
    for (let i = 1; i < divs.length; i++) {
	const d = divs[i];
	d.style["transform"] =  "";
    }
    document.getElementById("break_everything").style["display"] = "";
    document.getElementById("unbreak_everything").style["display"] = "none";
}


function dontClick() {
    const divs = document.querySelectorAll("div");
    for (let i = 1; i < divs.length; i++) {
	const d = divs[i];
	const c = d.getAttribute("class")
	if (c !== null && c.indexOf("nobreak") < 0) {
	    let spin = "spin";
	    let s = getRandomInt(0,1);
	    if (s === 1) {
		spin = "spin_anti";
	    };
	    d.style["animation"] =  spin+ " "+ getRandomInt(4,12) + "s linear infinite";
	}
    }
    
    document.getElementById("dontclick").style["display"] = "none";
    document.getElementById("toldyouso").style["display"] = "";
}

function toldYouSo() {
    const divs = document.querySelectorAll("div");
    for (let i = 1; i < divs.length; i++) {
	const d = divs[i];
	const c = d.getAttribute("class")
	if (c !== null && c.indexOf("nobreak") < 0)
	    d.style["animation"] =  "";
    }
    
    document.getElementById("dontclick").style["display"] = "";
    document.getElementById("toldyouso").style["display"] = "none";

}

//document.getElementById("break_everything").addEventListener("click", function() { breakEverything();})
//document.getElementById("unbreak_everything").addEventListener("click", function() { unbreakEverything();})
document.getElementById("dontclick").addEventListener("click", function() { dontClick();})
document.getElementById("toldyouso").addEventListener("click", function() { toldYouSo();})

