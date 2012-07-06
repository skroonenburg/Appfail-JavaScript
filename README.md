Appfail JavaScript Reporting Module
==================

**Development note**: appfail-reporting.js must pass [JSHint](http://jshint.com) Linting in order for it to be valid.


Documentation
==================

**Settings that can be configured, and their defaults:**
```
appfail.configure({
	slug: null, 			// your app slug
	processInterval: 30, 	// how often the errors should be sent to the server (try not to do DDoS it!)
	onBeforeStore: null		// function to parse the report values before it's stored or sent to the server
});
```

**There are only two public methods available**

- `appfail.catchManual(e)` use with a `try {} catch(e) {}`
- `appfail.processQueue()` for manually sending the queue of errors

Links & Resources
==================

See this page for more information:
http://appfail.net/OtherPlatforms

The REST API for Appfail is documented here:
http://support.appfail.net/kb/rest-api-for-reporting-failures/rest-api-documentation-for-failure-reporting