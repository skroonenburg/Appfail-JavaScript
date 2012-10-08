Appfail JavaScript Reporting Module
==================

**Development note**: appfail-reporting.js must pass [JSHint](http://jshint.com) Linting in order for it to be valid.

Installation
==================
To begin reporting Javascript failures to appfail, add the following script tag into your page:
```
<script type="text/javascript" src="https://s3.amazonaws.com/appfail-us/appfail.reporting.min.js?slug=abc123" />
```

Configuration
==================

Appfail's reporting module can be configured by modifying the query string of the URL in the <script /> tag, or by calling a javascript function.

**Settings that can be configured, and their defaults:**
```
appfail.configure({
	slug: 'abc123', 			// your app slug
	processInterval: 10, 	// how often the errors should be sent to the server (try not to DDoS it!)
	daysToStore: 7,			// number of days before stored errors are invalidated
	onBeforeStore: null		// function to parse the report values before it's stored or sent to the server
});
```

** Query string **
Each of these settings can be configured via the query string of the URL in the <script /> include.
```
<script type="text/javascript" src="https://s3.amazonaws.com/appfail-us/appfail.reporting.min.js?slug=abc123" />
```

**The following functions are exposed**

- `appfail.reporting.catchManual(e)` use with a `try {} catch(e) {}`
- `appfail.reporting.processQueue()` for manually sending the queue of errors
- `appfail.reporting.storeQueue()` push the current `messageQueue` to `localStorage`
- `appfail.reporting.loadStoredErrors()` restore the saved errors from `localStorage` to the internal `messageQueue`. **Note:** This does not automatically run `processQueue`, and will need to be manually triggered.

Links & Resources
==================

The REST API for Appfail is documented here:
http://support.appfail.net/kb/rest-api-for-reporting-failures/rest-api-documentation-for-failure-reporting