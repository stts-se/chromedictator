var recognition;



var stopButton, startButton;

// See e.g. https://developers.google.com/web/updates/2013/01/Voice-Driven-Web-Apps-Introduction-to-the-Web-Speech-API
// Cf https://webcaptioner.com/

if (!('webkitSpeechRecognition' in window)) {
    alert("This browser does not support webkit speech recognition");
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
	
	startButton.disabled = true;
	stopButton.disabled = false;

	// TODO Ok to nick gif from https://www.google.com/intl/en/chrome/demos/speech.html?
	document.getElementById("micimage").src = "js/mic-animate.gif";
	
	document.getElementById("tempresponse").innerHTML = '';
	document.getElementById("finalresponse").innerHTML = '';
	
	recognition.start();
	console.log("Started lang ", recognition.lang)
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
    
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    //recognition.lang = 'da-DK';
    console.log("LANG: ", recognition.lang);
    langSelect.value = recognition.lang; 
    
    recognition.onresult = function(event) {

	//console.log("Event ", event);
	//console.log("Timestamp ", event.timeStamp);
	
	var interim_transcript = '';
	
	for (var i = event.resultIndex; i < event.results.length; ++i) {
	    if (event.results[i].isFinal) {
		//finalResponse.innerHTML = "";
		finalResponse.innerHTML += event.results[i][0].transcript + '<br>';
		tempResponse.innerHTML = '';
		//final_transcript += event.results[i][0].transcript;
		//console.log(event.results[i][0].transcript);
	    } else {
		//.innerHTML = "";
		tempResponse.innerHTML = event.results[i][0].transcript;
		//interim_transcript += event.results[i][0].transcript;
		//console.log(event.results[i][0].transcript);
	    }
	}
    };    

    recognition.onerror = function(event) {
	console.log("Error: ", event);
	
	if (event.error == 'no-speech') {
	    document.getElementById("micimage").src = "js/mic.gif";
	    // TODO msg user
	    
	    //ignore_onend = true;
	}
	if (event.error == 'audio-capture') {
	    document.getElementById("micimage").src = "js/mic.gif";
	    // TODO msg user
	    
	    //showInfo('info_no_microphone');
	    //ignore_onend = true;
	}
	if (event.error == 'not-allowed') {
	    if (event.timeStamp - start_timestamp < 100) {
		//showInfo('info_blocked');
	    } else {
		//showInfo('info_denied');
	    }
	    //ignore_onend = true;
	}
    };
}


