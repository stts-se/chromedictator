"use strict";

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();

var analyser = audioCtx.createAnalyser();
analyser.minDecibels = -90;
analyser.maxDecibels = -10;
analyser.smoothingTimeConstant = 0.85;

var visCanvas = document.querySelector('.visualizer');
var visCanvasCtx = visCanvas.getContext("2d");

var recStart;

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
	// recorder = new MediaRecorder(stream);
	// recorder.addEventListener('dataavailable', function (evt) {
	//     updateAudio(evt.data);
	//     sendAndReceiveBlob();
	// });
	
    });
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
});

document.getElementById("rec_cancel").addEventListener("click", function() {
    enable(document.getElementById("rec_start"));
    disable(document.getElementById("rec_cancel"));
    disable(document.getElementById("rec_send"));
    recStart = null;
});

document.getElementById("rec_send").addEventListener("click", function() {
    enable(document.getElementById("rec_start"));
    disable(document.getElementById("rec_cancel"));
    disable(document.getElementById("rec_send"));
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
	var style = d.getAttribute("style");
	if (style === null || style === undefined) {
	    style = "";
	}
	style = style + "; transform: rotate("+ getRandomInt(-45,45) + "deg);";
	d.setAttribute("style", style);
    }
}

document.getElementById("break_everything").addEventListener("click", function() { breakEverything();})
