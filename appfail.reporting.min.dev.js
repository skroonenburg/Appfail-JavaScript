/*global appfail, console*/
/*jshint bitwise:false*/

// create appfail object unless already created by overlay script
window.appfail = window.appfail || {};

appfail.reporting = (function () {

    "use strict";

    // helper - generate fake guid
    // this is why we need jshint bitwise because of the bitwise operator in here
    var guid = function () {
        function S4() {
            return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
        }
        return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
    };

    // Define default settings for appfail.reporting.js
    var defaults = {
        slug: null,
        processInterval: 4,
        daysToStore: 7,
        onBeforeStore: null,
        appfailApiRoot: 'https://api.appfail.net'
    };

    // Empty error report object
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
        PageCorrelationId: guid(),
        IsXHRFailure: false,
        XHRRequestURL: null,
        ConnectionStatus: 'online',
        IsStandalone: false,
        TimeOnPage: 0
    };

    // Empty exception object
    var exception = {
        ExceptionType: "Javascript Error",
        ExceptionMessage: "",
        StackTrace: ""
    };

    var settings = {};
    var messageQueue = [];
    var processInterval;
    var hasOfflineEvents = ("ononline" in window && "onoffline" in window) ? true : false;
    function hasJSON() {
        return "JSON" in window && window.JSON;
    }
    var hasLocalStorage = ("localStorage" in window && window.localStorage) ? true : false;
    var pageLoadTime = new Date();
    var ignoreConnectionStatus = false; // Browser connection status can be ignored to force reporting during testing
    var urlOverride = null; // Use a URL override for testing purposes, to override the reported failure URL
    var enableLogging = false;
    var scriptfilename = 'appfail.reporting.min.dev.js';
    var json2Url = 'https://s3.amazonaws.com/appfail-us/json2.min.js';

    /* Local Testing Setup */
    // ignoreConnectionStatus = true;
    // urlOverride = "http://demo.appfail.local/testURL"

    var hasOnlineBool = ignoreConnectionStatus ? false : (typeof navigator.onLine === "boolean") ? true : false;

    // helper - deep clone a JSON object
    var cloneObject = function (obj) {
        var clone = !obj ? null : (obj instanceof Array ? [] : {});
        for (var i in obj) {
            if (typeof (obj[i]) === "object") {
                clone[i] = cloneObject(obj[i]);
            } else {
                clone[i] = obj[i];
            }
        }
        return clone;
    };

    // helper - merge two objects together, without using $.extend
    var merge = function (obj1, obj2) {
        var obj3 = {};
        for (var attrOne in obj1) { if (obj1.hasOwnProperty(attrOne)) { obj3[attrOne] = obj1[attrOne]; } }
        for (var attrTwo in obj2) { if (obj2.hasOwnProperty(attrTwo)) { obj3[attrTwo] = obj2[attrTwo]; } }
        return obj3;
    };

    var logToConsole = function (obj) {
        if (enableLogging && typeof console === "object") {
            console.log(obj);
        }
    };

    // helper - cross browser add event listener
    var addHandler = function (obj, evnt, handler) {
        if (obj.addEventListener) {
            obj.addEventListener(evnt.replace(/^on/, ''), handler, false);
        } else {
            if (obj[evnt]) {
                var origHandler = obj[evnt];
                obj[evnt] = function (evt) {
                    origHandler(evt);
                    handler(evt);
                };
            } else {
                obj[evnt] = function (evt) {
                    handler(evt);
                };
            }
        }
    };

    // xhr intercept script
    (function (XHR) {

        var send = XHR.prototype.send;

        XHR.prototype.send = function (data) {
            var self = this;
            var oldOnReadyStateChange;
            var onReadyStateChange = function () {

                if (self.readyState === 4) {
                    logToConsole(self);
                    var appfailData = self.appfailData;
                    // should only really call this if status is not 300? 200? 0? dunno.
                    if (self.status && self.status >= 400) {
                        handleXHRError({
                            ReadyState: self.readyState,
                            Status: self.status,
                            StatusText: self.statusText,
                            Method: appfailData ? appfailData.method : null,
                            Url: appfailData ? appfailData.url : null
                        });
                    }
                }

                if (oldOnReadyStateChange) {
                    oldOnReadyStateChange();
                }
            };

            if (this.addEventListener) {
                this.addEventListener("readystatechange", onReadyStateChange, false);
            } else {
                oldOnReadyStateChange = this.onreadystatechange;
                this.onreadystatechange = onReadyStateChange;
            }

            send.call(this, data);
        };

        var open = XHR.prototype.open;

        XHR.prototype.open = function (method, url, async) {
            this.appfailData = { method: method, url: url };
            open.call(this, method, url, async);
        };

    })(XMLHttpRequest);

    var attachListeners = function () {

        // attach error listener
        addHandler(window, "onerror", function (msg, url, num) {
            handleError(msg, url, num);
            return true;
        });

        // attach loop to send to server
        processInterval = window.setInterval(function () {
            if (messageQueue.length) {
                processQueue();
            }
        }, settings.processInterval * 1000);

        if (hasOfflineEvents) {
            addHandler(window, "ononline", function () {
                loadStoredErrors();
                processQueue();
            });
        }

    };

    // Gets the time spent on the page since it loaded
    var getCurrentTimeOnPage = function() {
        return (new Date() - pageLoadTime);
    };

    var queryStringParams = [];
    (function () {
        var match,
            pl     = /\+/g,  // Regex for replacing addition symbol with a space
            search = /([^&=]+)=?([^&]*)/g,
            decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
            query  = window.location.search.substring(1);

        match = search.exec(query);
        while (match) {
           queryStringParams.push([decode(match[1]),decode(match[2])]); 
           match = search.exec(query);
        }
    })();

    var populateFailureOccurrenceReport = function (repObj) {
        repObj.RequestUrl = urlOverride ? urlOverride : document.location.href;

        if (!repObj.OccurrenceTimeUtc) {
            repObj.OccurrenceTimeUtc = new Date().getTime();
        }

        repObj.UniqueId = guid();
        repObj.TimeOnPage = getCurrentTimeOnPage();
        repObj.UserAgent = navigator.userAgent;
        repObj.Cookies = [];
        repObj.ReferrerUrl = document.referrer;
        repObj.QueryValuePairs = queryStringParams;
    };

    // Handles a window.onerror event
    var handleError = function (msg, url, num) {
        logToConsole(msg, url, num);
        var newReport = cloneObject(report);
        newReport.OccurrenceTimeUtc = (msg && msg.timeStamp) ? new Date(msg.timeStamp).getTime() : null;

        var newException = cloneObject(exception);
        newException.ExceptionMessage = msg.message;
        newException.StackTrace = msg.filename + " --- line " + msg.lineno;
        newReport.Exceptions.push(newException);

        populateFailureOccurrenceReport(newReport);

        if (settings.onBeforeStore) {
            settings.onBeforeStore(newReport);
        }

        messageQueue.push(newReport);
    };


    // Handles an XHR error
    var handleXHRError = function (params) {
        logToConsole(params);
        
        if (!params.Url) {
            return;
        }

        var newReport = cloneObject(report);
        newReport.XHRRequestUrl = params.Url; // Put failed XHR url here
        newReport.IsXHRFailure = true;

        //newReport.HttpVerb = XHR HTTP VERB HERE 'GET' OR 'POST' etc
        newReport.HttpStatus = params.Status;
        newReport.HttpVerb = params.Method;

        populateFailureOccurrenceReport(newReport);

        if (settings.onBeforeStore) {
            settings.onBeforeStore(newReport);
        }

        messageQueue.push(newReport);
    };

    // Handles a manually caught error
    var catchManual = function (e) {
        logToConsole(e);
        var newReport = cloneObject(report);

        var newException = cloneObject(exception);
        newException.StackTrace = e.stack || "";
        if (e.type) {
            newException.ExceptionType = e.type;
        }
        newException.ExceptionMessage = e.message;
        newReport.Exceptions.push(newException);

        populateFailureOccurrenceReport(newReport);

        if (settings.onBeforeStore) {
            settings.onBeforeStore(newReport);
        }

        messageQueue.push(newReport);
    };

    var processQueue = function () {
        if (messageQueue.length && ( (hasOnlineBool && !navigator.onLine) || !hasJSON())) {
            if (!hasJSON()) {
                printError("JSON parser has not yet loaded. Stored failure reports to local storage.");
            } else {
                printError("No connection found, stored failure reports to local storage");
            }
            storeQueue();
            messageQueue = [];
            return;
        }

        // Generate the base transfer DTO
        var toSend = {
            Slug: settings.slug,
            ModuleVersion: '1.0.0.0',
            ApplicationType: 'Javascript',
            FailOccurrences: []
        };

        // Push failure occurrences into the DTO
        while (messageQueue.length) {
            var thisItem = messageQueue.shift();
            toSend.FailOccurrences.push(thisItem);

        }

        messageQueue.length = 0;

        // Transer for appfail in the query string by fetching an 'image'
        // This is a cross browser compatible way of reporting errors
        // Which can have limitations on older browsers that supported limited
        // query string lengths
        var img = new Image();
        img.src = settings.appfailApiRoot + '/JsFail/v1?json=' + encodeURIComponent(JSON.stringify(toSend));
    };

    var storeQueue = function () {
        if (hasJSON() && hasLocalStorage) {
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

    var loadStoredErrors = function () {

        if (!hasLocalStorage) {
            return;
        }

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

    var loadOptions = function () {
        if (appfail.config) {
            settings = merge(defaults, appfail.config);
            return;
        }
        var scripts = document.getElementsByTagName("script");
        var thisScript;
        for (var i = 0, len = scripts.length; i < len; i++) {
            if (scripts[i].src.indexOf(scriptfilename) > -1) {
                thisScript = scripts[i];
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
        settings = merge(defaults, queryObj);
    };

    function getQueryStringParameterByName(name) {
        var match = new RegExp('[?&]' + name + '=([^&]*)')
                         .exec(window.location.search);
        return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
    }
    function includeJson2() {
        var script = document.createElement( 'script' );
        script.type = 'text/javascript';
        script.src = json2Url;
        document.body.appendChild(script);
    }
    // IIFE function
    (function () {
        if (!hasJSON())
        {
            // include json2 for older browsers
            includeJson2();
        }

        loadOptions();
        if (!settings.slug) {
            printError("No application slug was found.");
            return;
        }
        if (hasOnlineBool && navigator.onLine) {
            loadStoredErrors();
        }
        attachListeners();

        // should we send a test error?
        if (getQueryStringParameterByName('appfail-report-test-exception')) {
           try {
               throw new Error('This is an Appfail test exception. Congratulations, your web-site is successfully reporting javascript errors to Appfail');
           }
           catch (e) {
               // send this test error to Appfail
               catchManual(e);
           }
        }
    })();

    var printError = function (str) {
        if (console && console.error) {
            console.error("appfail: " + str);
        }
    };

    // development only
    var runTests = function () {
        logToConsole("hasOnlineBool: ", hasOnlineBool);
        logToConsole("hasOfflineEvents: ", hasOfflineEvents);
        logToConsole("hasJSON: ", hasJSON());
        logToConsole("hasLocalStorage: ", hasLocalStorage);
    };

    return {
        catchManual: catchManual,
        processQueue: processQueue,
        storeQueue: storeQueue,
        loadStoredErrors: loadStoredErrors,
        runTests: runTests // development only
    };

})();