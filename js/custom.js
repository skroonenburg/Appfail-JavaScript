/*global $, appfail*/

var tempTestingFunction;

$(function() {

	"use strict";

	$("#error0").on("click", function() {
		blah();
	});

	$("#error1").on("click", function() {
		try {
			blah();
		} catch(e) {
			appfail.reporting.catchManual(e);
		}
	});

	$("#error2").on("click", function() {
		var req = new XMLHttpRequest();
		req.open("POST", "non-existant-page", false);
		req.send();
	});

        $("#error3").on("click", function() {
                var objToPopulate = {};
		var req = new XMLHttpRequest();
                req.onreadystatechange = function() { if (req.readyState == 4) { var errorFunc = setTimeout(function() { var readProp = objToPopulate.invalidProperty.property; }, 100); } };
		req.open("POST", "non-existant-page", false);

		req.send();

                
	});

	var cnt = 0;
	
	tempTestingFunction = function(obj) {
		var output = "";
		for (var prop in obj) {
			var classStr = (obj[prop] !== null && (obj[prop].length || obj[prop] > 0)) ? 'hasValue' : '';
			output += '<div class="' + classStr + '">';
			output += '<strong>' + prop + ':</strong> ' + obj[prop];
			output += '</div>';
		}
		$("<div>").attr("data-cnt",cnt++).html(output).prependTo("#output");
	};


});