var recognition;

var stopButton, startButton;

// See e.g. https://developers.google.com/web/updates/2013/01/Voice-Driven-Web-Apps-Introduction-to-the-Web-Speech-API
// Cf https://webcaptioner.com/

if (!('webkitSpeechRecognition' in window)) {
    alert("This browser does not support webkit speech recognition");
} else {
    

      
    startButton = document.getElementById("startbutton");
    startButton.disabled = false;
    
    startButton.addEventListener("click", function(event) {
	
	startButton.disabled = true;
	stopButton.disabled = false;

	document.getElementById("tempresponse").innerHTML = '';
	document.getElementById("finalresponse").innerHTML = '';
	
	recognition.start();
	
    });

    stopButton =  document.getElementById("stopbutton");
    stopButton.addEventListener("click", function(event) {
	
	startButton.disabled = false;
	stopButton.disabled = true;
	recognition.stop();
	
    });
    

    

    var tempResponse = document.getElementById("tempresponse");
    var finalResponse = document.getElementById("finalresponse");
    
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    //recognition.lang = 'da-DK';
    
    recognition.onresult = function(event) {
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
}


