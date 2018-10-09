"use strict";

var baseURL = window.location;
var recognition;

//console.log("baseURL", baseURL);


var stopButton, startButton;
var start_timestamp;

// See e.g.:
//   https://developers.google.com/web/updates/2013/01/Voice-Driven-Web-Apps-Introduction-to-the-Web-Speech-API
//   https://www.google.com/intl/en/chrome/demos/speech.html
//
// Cf https://webcaptioner.com/


// TODO Put this somewhere it belongs
// This is going to be code for automatically expanding abbreviations as you type.
// The user specifies a list of abbreviations and their expansions.


var abbrevMap = {"tstg": "testing", "tst":"test"};

var leftWordRE = /(?:^| )([^ ]+)$/; // TODO Really no need for regexp,
				    // just pick off characters until
				    // space, etc, or end of string?

function checkForAbbrev(evt) {
    if ( evt.key === " ") {
	// Ugh... going in circles...
	let ta = document.getElementById("finalresponse");
	var startPos = ta.selectionStart;
	
	let text = ta.value;
	// -1 is to remove the trailing space
	let stringUp2Cursor = text.substring(0,startPos-1);
	
	// wordBeforeSpace will have a trailing space
	let wordBeforeSpace = leftWordRE.exec(stringUp2Cursor)[0];
	
	if (abbrevMap.hasOwnProperty(wordBeforeSpace.trim())) {
	    //console.log(wordBeforeSpace, abbrevMap[wordBeforeSpace]);
	    // Match found. Replace abbreviation with its expansion
	    let textBefore = text.substring(0,startPos - wordBeforeSpace.length);
	    let textAfter = text.substring(startPos);
	    let expansion = abbrevMap[wordBeforeSpace.trim()];
	    
	    // TODO Move cursor to directly after expanded word
	    ta.value = textBefore.trim() + " " + expansion + " " + textAfter.trim();
	    
	};
	
	
	// TODO Take wordBeforeSpace and look up in abbrev dictionary.
	// If abbrev found, expand abbrev in place into target word
	
    }
}


// TODO Split init into sub functions
// TODO refactor multiple calls to document.getElementById for the same element
var init = function () {

    
    if (!('webkitSpeechRecognition' in window)) {
	alert("This browser does not support webkit speech recognition");
	return;
    } else {
	
	
	
	var langSelect = document.getElementById("lang");
	langSelect.addEventListener("change", function(event) {
	    
	    var i  = langSelect.selectedIndex
	    var lang = langSelect.options[i].value
	    if (startButton.disabled) {
		stopButton.click();
	    };
	    recognition.lang = lang;
	    
	});
	
	
	
	
	startButton = document.getElementById("startbutton");
	startButton.disabled = false;
	
	startButton.addEventListener("click", function(event) {
	    document.getElementById("msg").innerHTML = '';
	    startButton.disabled = true;
	    stopButton.disabled = false;

	    // Ok to nick gif from https://www.google.com/intl/en/chrome/demos/speech.html?
	    document.getElementById("micimage").src = "js/mic-animate.gif";
	    
	    document.getElementById("tempresponse").innerHTML = '';
	    document.getElementById("finalresponse").value = '';
	    
	    start_timestamp = event.timeStamp;
	    recognition.start();
	    console.log("Started lang", recognition.lang)
	});

	stopButton =  document.getElementById("stopbutton");
	stopButton.addEventListener("click", function(event) {
	    
	    startButton.disabled = false;
	    stopButton.disabled = true;
	    // TODO Ok to nick gif from https://www.google.com/intl/en/chrome/demos/speech.html?
	    document.getElementById("micimage").src = "js/mic.gif";
	    recognition.stop();
	    
	});
	

	

	var tempResponse = document.getElementById("tempresponse");
	var finalResponse = document.getElementById("finalresponse");

	finalResponse.addEventListener('keyup', keyupAutosize);
	finalResponse.addEventListener('keyup', checkForAbbrev);

	function keyupAutosize(){
	    //console.log("keyup event called");
	    var el = this;
	    setTimeout(function(){
		autosize(el);
	    },0);
	}

	function autosize(area){
	    area.style.cssText = 'width: 100%; border: none; height:' + area.scrollHeight + 'px';
	}

	recognition = new webkitSpeechRecognition();
	recognition.lang = langSelect.value;
	recognition.continuous = true;
	recognition.interimResults = true;
	//langSelect.value = recognition.lang; 
	
	recognition.onresult = function(event) {


	    
	    for (var i = event.resultIndex; i < event.results.length; ++i) {
		if (event.results[i].isFinal) {
		    let full = finalResponse.value + '\n' + event.results[i][0].transcript.trim(); // + '<br>';
		    finalResponse.value = full.trim();
		    autosize(finalResponse);
		    tempResponse.innerHTML = '';

		} else {
		    tempResponse.innerHTML = event.results[i][0].transcript;
		}
	    }
	};    

	recognition.onend = function() { // No 'event' arg?
	    startButton.disabled = false;
	    stopButton.disabled = true;
	    document.getElementById("micimage").src = "js/mic.gif";
	    //console.log("'onend' called!");
	};
	
	recognition.onerror = function(event) {
	    console.log("Error: ", event);
	    
	    if (event.error == 'no-speech') {
		document.getElementById("micimage").src = "js/mic.gif";
		// TODO msg user
		document.getElementById("msg").innerHTML = 'No speech<br>';
		
	    };
	    if (event.error == 'audio-capture') {
		document.getElementById("micimage").src = "js/mic.gif";
		document.getElementById("msg").innerHTML = 'No microphone<br>';
		
	    };
	    if (event.error == 'not-allowed') {
		if (event.timeStamp - start_timestamp < 100) {
		    document.getElementById("msg").innerHTML = 'Blocked<br>';
		} else {
		    document.getElementById("msg").innerHTML = 'Denied<br>';
		}
		
	    };
	    if (event.error == 'network') {
		document.getElementById("msg").innerHTML = 'Network error<br>';
	    }
	};
    };

    
    // Init abbrev hash table from server
    loadAbbrevTable();
    
    
    // Bootstrap already has JQuery as a dependancy

    
    $("#abbrev_table").on('click', 'tr', function(evt) {
	let row = $(this);
	//let row = row0[0];
	let dts = row.children('td');
	//console.log("KLIKKETIKLIKK ++", dts);
	//console.log("KLIKKETIKLIKK --", dts[0]);
	//console.log("KLIKKETIKLIKK --", dts[1]);
	//console.log("---------------------");
    } );
    
    
    $("#add_abbrev_button").on('click', function(evt) {
	let abbrev = document.getElementById("input_abbrev").value.trim();
	let expansion = document.getElementById("input_expansion").value.trim();
	
	// TODO add button should be disablem without text in both input fields, etc
	// TODO proper validation
	if (abbrev === "") {
	    document.getElementById("msg").innerText = "Cannot add empty abbreviation";
	    return;
	};
	if (expansion === "") {
	    document.getElementById("msg").innerText = "Cannot add empty expansion";
	    return;
	};
	
	abbrevMap[abbrev] = expansion;
	
	// TODO Nested async calls: NOT NICE, change to promises instead
	//addAbbrev contains a(n async) call to loadAbbrevTable();
	
	addAbbrev(abbrev, expansion);	

	
	//console.log("abbrev", abbrev);
	//console.log("expansion", expansion);
    });
    
    $("#delete_abbrev_button").on('click', function(evt) {
	let abbrev = document.getElementById("input_abbrev").value.trim();
	
	
	// TODO add button should be disablem without text in both input fields, etc
	// TODO proper validation
	if (abbrev === "") {
	    document.getElementById("msg").innerText = "Cannot delete empty abbreviation";
	    return;
	};
	
	delete abbrevMap[abbrev];
	
	// TODO Nested async calls: NOT NICE, change to promises instead
	//addAbbrev contains a(n async) call to loadAbbrevTable();
	
	deleteAbbrev(abbrev);	

	
	//console.log("abbrev", abbrev);
	//console.log("expansion", expansion);
    });
    
    
};


// Asks sever for list of persited abbrevisations, and fills in the
// clients hashmap
function loadAbbrevTable() {
    let xhr = new XMLHttpRequest();
    
    xhr.onload = function() {
	if ( xhr.readyState === 4 && 
     	     xhr.status === 200) {
	    
	    // TODO Catch errors here
	    let serverAbbrevs = JSON.parse(xhr.responseText);
	    //console.log("#######", serverAbbrevs);
	    abbrevMap = {};
	    for (var i = 0; i < serverAbbrevs.length; i++) {
		//console.log("i: ", i, serverAbbrevs[i]);
		let a = serverAbbrevs[i];
		abbrevMap[a.abbrev] = a.expansion;
	    };
	    updateAbbrevTable();
	    
	};
    };
    
    xhr.open("GET", baseURL+ "list_abbrevs" , true)
    xhr.send();
};

function updateAbbrevTable() {
    let at = document.getElementById("abbrev_table_body");
    at.innerHTML = '';
    Object.keys(abbrevMap).forEach(function(k) {
	let v = abbrevMap[k];
	let tr = document.createElement('tr');
	let td1 = document.createElement('td');
	let td2 = document.createElement('td');

	td1.innerText = k;
	td2.innerText = v;
	
	tr.appendChild(td1);
	tr.appendChild(td2);
	at.appendChild(tr);
    });
    
    
}

function addAbbrev(abbrev, expansion) {
    let xhr = new XMLHttpRequest();
    
    //TODO Notify user of response
    // TODO error handling
    
    xhr.onload = function(resp) {
	//console.log("RESP", resp);

	// TODO Show response in client
	
	// TODO Nested async calls: NOT NICE, change to promises instead
	loadAbbrevTable();
    };
    
    xhr.open("GET", baseURL+ "/add_abbrev/"+ abbrev + "/"+ expansion , true)
    xhr.send();
};
function deleteAbbrev(abbrev) {
    let xhr = new XMLHttpRequest();
    
    //TODO Notify user of response
    // TODO error handling
    
    xhr.onload = function(resp) {
	//console.log("RESP", resp);

	// TODO Show response in client
	
	// TODO Nested async calls: NOT NICE, change to promises instead
	loadAbbrevTable();
    };
    
    xhr.open("GET", baseURL+ "/delete_abbrev/"+ abbrev, true)
    xhr.send();
};




window.onload = init();
