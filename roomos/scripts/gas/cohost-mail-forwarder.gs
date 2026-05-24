/**
 * CoHost Mail Forwarder — RoomOS real-time email ingest (thin forwarder; no parsing here).
 *
 * Deploy:
 *  1. script.google.com → New project → paste this file.
 *  2. Project Settings → Script Properties: set
 *       INGEST_URL    = https://<your-railway-app>/api/ingest/email
 *       INGEST_SECRET = <same value as the web app's EMAIL_INGEST_SECRET>
 *  3. Gmail → create a filter that applies the label "RoomOS-Ingest" to the platform
 *     notification senders (e.g. from:(padsplit.com OR automated@airbnb.com)).
 *  4. Triggers → add a time-driven trigger: forwardLabeledMail, every 1 minute.
 *
 * Run it on EACH Google account that receives platform mail (PadSplit →
 * jordanrealtor21@gmail.com, Airbnb → ELITEBNB@millenniarealtors.com), or funnel both
 * into one inbox and run it there.
 */
function forwardLabeledMail() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INGEST_URL');
  var secret = props.getProperty('INGEST_SECRET');
  if (!url || !secret) { Logger.log('Missing INGEST_URL / INGEST_SECRET'); return; }

  var label = GmailApp.getUserLabelByName('RoomOS-Ingest');
  if (!label) { Logger.log('No RoomOS-Ingest label — create it + a Gmail filter first'); return; }
  var done = GmailApp.getUserLabelByName('RoomOS-Done') || GmailApp.createLabel('RoomOS-Done');

  var threads = label.getThreads(0, 25); // bounded per run; 1-min cadence drains backlog
  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    var allOk = true;
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      var payload = {
        messageId: m.getId(),       // RoomOS idempotency key
        from: m.getFrom(),
        subject: m.getSubject(),
        body: m.getPlainBody(),
        receivedAt: m.getDate().toISOString()
      };
      var res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ingest-secret': secret },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code < 200 || code >= 300) { allOk = false; Logger.log('POST ' + code + ': ' + m.getSubject()); }
    }
    // Only mark done when every message in the thread was accepted → non-2xx retries next run.
    if (allOk) { threads[i].removeLabel(label); threads[i].addLabel(done); }
  }
}
