var recognition;


var stopButton, startButton;
var start_timestamp;

// See e.g.:
//   https://developers.google.com/web/updates/2013/01/Voice-Driven-Web-Apps-Introduction-to-the-Web-Speech-API
//   https://www.google.com/intl/en/chrome/demos/speech.html
//
// Cf https://webcaptioner.com/




// TODO Slit init into sub functions
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

	function keyupAutosize(){
	    console.log("keyup event called");
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
	    console.log("'onend' called!");
	};
	
	recognition.onerror = function(event) {
	    console.log("Error: ", event);
	    
	    if (event.error == 'no-speech') {
		document.getElementById("micimage").src = "js/mic.gif";
		// TODO msg user
		document.getElementById("msg").innerHTML = 'No speech<br>';
		
	    }
	    if (event.error == 'audio-capture') {
		document.getElementById("micimage").src = "js/mic.gif";
		document.getElementById("msg").innerHTML = 'No microphone<br>';

	    }
	    if (event.error == 'not-allowed') {
		if (event.timeStamp - start_timestamp < 100) {
		    document.getElementById("msg").innerHTML = 'Blocked<br>';
		} else {
		    document.getElementById("msg").innerHTML = 'Denied<br>';
		}
		
	    }
	    if (event.error == 'network') {
		document.getElementById("msg").innerHTML = 'Network error<br>';
	    }
	};
    }

};


window.onload = init();
