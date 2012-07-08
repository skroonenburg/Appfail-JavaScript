Appfail JavaScript Reporting Module
==================

**Development note**: appfail-reporting.js must pass [JSHint](http://jshint.com) Linting in order for it to be valid.


Documentation
==================

**Settings that can be configured, and their defaults:**
```
appfail.configure({
	slug: null, 			// your app slug
	processInterval: 10, 	// how often the errors should be sent to the server (try not to DDoS it!)
	daysToStore: 7,			// number of days before stored errors are invalidated
	onBeforeStore: null		// function to parse the report values before it's stored or sent to the server
});
```

**There following functions are exposed**

- `appfail.reporting.catchManual(e)` use with a `try {} catch(e) {}`
- `appfail.reporting.processQueue()` for manually sending the queue of errors
- `appfail.reporting.storeQueue()` push the current `messageQueue` to `localStorage`
- `appfail.reporting.loadStoredErrors()` restore the saved errors from `localStorage` to the internal `messageQueue`. **Note:** does not automatically run `processQueue`

Links & Resources
==================

See this page for more information:
http://appfail.net/OtherPlatforms

The REST API for Appfail is documented here:
http://support.appfail.net/kb/rest-api-for-reporting-failures/rest-api-documentation-for-failure-reporting