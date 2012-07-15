/*global appfail, console, tempTestingFunction*/
/*jshint bitwise:false*/

// create appfail object unless already created by overlay script
window.appfail = window.appfail || {};

appfail.reporting = (function() {

	"use strict";

	var defaults = {
		slug: null,
		processInterval: 10,
		daysToStore: 7,
		onBeforeStore: null
	};
	var report = {
		RequestUrl: "",
		HttpVerb: "",
		ReferrerUrl: document.referrer,
		OccurrenceTimeUtc: null,
		User: 'Anonymous',
		PostValuePairs: [],
		QueryValuePairs: [],
		Cookies: [],
		UniqueId: null,
		UserAgent: navigator.userAgent,
		HttpStatus: null,
		Exceptions: [],
		IsXHRFailure: false,
		XHRResponseText: null
	};
	var exception = {
		ExceptionType: "",
		ExceptionMessage: "",
		StackTrace: ""
	};
	var XHRException = {
		Code: null,
		Message: "",
		Name: "",
		ReadyState: "",
		Status: "",
		StatusText: ""
	};
	var settings = {};
	var messageQueue = [];
	var processInterval;
	var hasOfflineEvents = ("ononline" in window && "onoffline" in window) ? true: false;
	var hasOnlineBool = (typeof navigator.onLine === "boolean") ? true : false;
	var hasJSON = ("JSON" in window) ? true : false;
	var hasLocalStorage = ("localStorage" in window) ? true : false;

	// helper - clone a JSON object
	var cloneObject = function(obj) {
		var clone =  !obj ? null : (obj instanceof Array ? [] : {});
		for (var i in obj) {
			if(typeof(obj[i]) === "object") {
				clone[i] = cloneObject(obj[i]);
			} else {
				clone[i] = obj[i];
			}
		}
		return clone;
	};

	// helper - merge two objects together, without using $.extend
	var merge = function(obj1,obj2) {
		var obj3 = {};
		for (var attrOne in obj1) { obj3[attrOne] = obj1[attrOne]; }
		for (var attrTwo in obj2) { obj3[attrTwo] = obj2[attrTwo]; }
		return obj3;
	};

	// helper - cross browser add event listener
	var addHandler = function(obj, evnt, handler) {
		if (obj.addEventListener) {
			obj.addEventListener(evnt.replace(/^on/, ''), handler, false);
		} else {
			if (obj[evnt]) {
				var origHandler = obj[evnt];
				obj[evnt] = function(evt) {
					origHandler(evt);
					handler(evt);
				};
			} else {
				obj[evnt] = function(evt) {
					handler(evt);
				};
			}
		}
	};

	// helper - generate fake guid
	// this is why we need jshint bitwise because of the bitwise operator in here
	var guid = function() {
		function S4() {
			return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
		}
		return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
	};

	// xhr intercept script
	(function(XHR) {

		var send = XHR.prototype.send;

		XHR.prototype.send = function(data) {
			var self = this;
			var exposeData = data;
			var oldOnReadyStateChange;
			var onReadyStateChange = function() {
				console.log(self);
				// should only really call this if status is not 300? 200? 0? dunno.
				// also, responseText is way too big if it's returning full page html
				// so it was dropped for now
				handleXHRError({
					ReadyState: self.readyState,
					Status: self.status,
					StatusText: self.statusText
				});
				if(oldOnReadyStateChange) {
					oldOnReadyStateChange();
				}
			};

			if (this.addEventListener) {
				this.addEventListener("readystatechange", onReadyStateChange, false);
			} else {
				oldOnReadyStateChange = this.onreadystatechange; 
				this.onreadystatechange = onReadyStateChange;
			}

			try {
				send.call(this,data);
			} catch(e) {
				console.log(e);
				handleXHRError({
					Code: e.code,
					Message: e.message,
					Name: e.name
				});
			}
		};

	})(XMLHttpRequest);



	var attachListeners = function() {

		// attach error listener
		addHandler(window, "onerror", function (msg, url, num) {
			handleError(msg,url,num);
			return true;
		});

		// attach loop to send to server
		processInterval = window.setInterval(function() {
			if (messageQueue.length) {
				processQueue();
			}
		}, settings.processInterval*1000);

		if (hasOfflineEvents) {
			addHandler(window, "ononline", function() {
				loadStoredErrors();
				processQueue();
			});
		}

	};

	var handleError = function(msg, url, num) {
		console.log(msg, url, num);
		var newReport = cloneObject(report);
		newReport.RequestUrl = document.location.href;
		newReport.OccurrenceTimeUtc = msg.timeStamp || +new Date();
		newReport.UniqueId = guid();

		var newException = cloneObject(exception);
		newException.ExceptionMessage = msg.message;
		newException.StackTrace = msg.filename + " --- line " + msg.lineno;
		newReport.Exceptions = [];
		newReport.Exceptions.push(newException);

		// common
		newReport.UserAgent = navigator.userAgent;
		newReport.Cookies = [];
		newReport.ReferrerUrl = document.referrer;

		if (settings.onBeforeStore) {
			settings.onBeforeStore(newReport);
		}

		messageQueue.push(newReport);

		tempTestingFunction(newReport);
	};

	var handleXHRError = function(params) {
		console.log(params);
		var newReport = cloneObject(report);
		newReport.Exceptions = [];
		newReport.IsXHRFailure = true;
		
		var newException = cloneObject(XHRException);
		newException = merge(newException,params);
		newReport.Exceptions.push(newException);

		//common
		newReport.UserAgent = navigator.userAgent;
		newReport.Cookies = [];
		newReport.ReferrerUrl = document.referrer;

		if (settings.onBeforeStore) {
			settings.onBeforeStore(newReport);
		}

		messageQueue.push(newReport);
	};

	var catchManual = function(e) {
		console.log(e);
		var newReport = cloneObject(report);
		newReport.RequestUrl = document.location.href;
		newReport.OccurrenceTimeUtc = +new Date();
		newReport.UniqueId = guid();

		var newException = cloneObject(exception);
		newException.StackTrace = e.stack || "";
		newException.ExceptionType = e.type;
		newException.ExceptionMessage = e.message;
		newReport.Exceptions = [];
		newReport.Exceptions.push(newException);

		// common
		newReport.UserAgent = navigator.userAgent;
		newReport.Cookies = [];
		newReport.ReferrerUrl = document.referrer;

		if (settings.onBeforeStore) {
			settings.onBeforeStore(newReport);
		}

		messageQueue.push(newReport);

		tempTestingFunction(newReport);

	};

	var processQueue = function() {
		if (messageQueue.length && hasOnlineBool && !navigator.onLine) {
			printError("No connection found, stored reports to localStorage");
			storeQueue();
			messageQueue = [];
			return;
		}
		var toSend = {
			Slug: 'Demo-App',
			ModuleVersion: '1.0.0.0',
			ApplicationType: 'Javascript',
			FailOccurrences: []
		};

		while (messageQueue.length) {
			var thisItem  = messageQueue.shift(); 
			toSend.FailOccurrences.push(thisItem);
			var img = new Image();
			img.src = 'https://api.appfail.net/JsFail/v1?json=' + encodeURIComponent(JSON.stringify(toSend));
		}
	};

	var storeQueue = function() {
		if (hasJSON) {
			var existingErrors = window.localStorage.getItem("appfail-errors");
			if (existingErrors !== "" && existingErrors !== null) {
				var errorArray = JSON.parse(existingErrors);
				for (var i = 0, len = errorArray.length; i < len; i++) {
					messageQueue.push(errorArray[i]);
				}
			}
			window.localStorage.setItem("appfail-errors", JSON.stringify(messageQueue));
		}
	};

	var loadStoredErrors = function() {
		var storedObj;
		var stored = window.localStorage.getItem("appfail-errors");
		if (stored === "" || stored === null) {
			return;
		}
		storedObj = JSON.parse(stored);
		var now = +new Date();
		var day = 86400000;
		var gap = settings.daysToStore * day;
		var cleanedObject = [];
		for (var i = 0, len = storedObj.length; i < len; i++) {
			if (now - gap > storedObj[i].OccurrenceTimeUtc) {
				printError("Dropping an old error");
			} else {
				cleanedObject.push(storedObj[i]);
			}
		}
		messageQueue = cleanedObject;
		window.localStorage.removeItem("appfail-errors");
	};

	var loadOptions = function() {
		if (appfail.config) {
			settings = merge(defaults,appfail.config);
			return;
		}
		var scripts = document.getElementsByTagName("script");
		var thisScript;
		for (var i = 0, len = scripts.length; i < len; i++) {
			if (scripts[i].src.indexOf("appfail-reporting.js") > -1) {
				thisScript = scripts [i];
				break;
			}
		}
		if (thisScript.src.indexOf("?") === -1) {
			return;
		}
		var queryString = thisScript.src.split("?")[1];
		var queryStringVars = queryString.split("&");
		var queryObj = {};
		for (var j = 0, lenj = queryStringVars.length; j < lenj; j++) {
			var splitObj = queryStringVars[j].split("=");
			queryObj[splitObj[0]] = splitObj[1];
		}
		settings = merge(defaults,queryObj);
	};

	// IIFE function
	var init = (function() {
		loadOptions();
		if (!settings.slug) {
			printError("No application slug was found.");
			return;
		}
		if (hasOnlineBool && navigator.onLine) {
			loadStoredErrors();			
		}
		attachListeners();
	})();

	var printError = function(str) {
		if (console && console.error) {
			console.error("appfail: " + str);
		}
	};

	// development only
	var runTests = function() {
		console.log("hasOnlineBool: ",hasOnlineBool);
		console.log("hasOfflineEvents: ",hasOfflineEvents);
		console.log("hasJSON: ",hasJSON);
		console.log("hasLocalStorage: ",hasLocalStorage);
	};

	return {
		catchManual: catchManual,
		processQueue: processQueue,
		storeQueue: storeQueue,
		loadStoredErrors: loadStoredErrors,
		runTests: runTests // development only
	};

})();