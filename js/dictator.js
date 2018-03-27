var recognition;

// See e.g. https://developers.google.com/web/updates/2013/01/Voice-Driven-Web-Apps-Introduction-to-the-Web-Speech-API
// Cf https://webcaptioner.com/

if (!('webkitSpeechRecognition' in window)) {
    alert("This browser does not support webkit speech recognition");
} else {

    console.log(">>>>>>>>> YEY!")

    var resp = document.getElementById("response");
    
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'da-DK';

    recognition.onresult = function(event) {
	var interim_transcript = '';
	
	for (var i = event.resultIndex; i < event.results.length; ++i) {
	    if (event.results[i].isFinal) {
		resp.innerHTML = "";
		resp.innerHTML += event.results[i][0].transcript;
		//final_transcript += event.results[i][0].transcript;
		//console.log(event.results[i][0].transcript);
	    } else {
		resp.innerHTML = "";
		resp.innerHTML = event.results[i][0].transcript;
		//interim_transcript += event.results[i][0].transcript;
		//console.log(event.results[i][0].transcript);
	    }
	}
    };    
}


var sb = document.getElementById("startbutton").addEventListener("click", function(event) {

    console.log(">>> Someone clicked Start")
    recognition.start();
    
});
