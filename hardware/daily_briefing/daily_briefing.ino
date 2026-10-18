// Leonardo + ESP-01S + HS-S77-PL. Keep ESP/TTS wiring; rewire the matrix keypad.
// Automatically start, sync hourly, speak at the EEPROM time (default HK 07:15).
#include <SoftwareSerial.h>
#include <EEPROM.h>
#include "http_response.h"
#include "time_state.h"
#include "schedule_settings.h"
#include "keypad.h"

const char SERVER_HOST[] = "40.233.65.88";
const uint16_t SERVER_PORT = 8086;
const char SERVER_PATH[] = "/device/time";
DailySchedule schedule;
ScheduleEditor editor;
MatrixKeypad keypad;
SoftwareSerial voiceSerial(5, 6);
EspResponse esp;
bool autoconnectChecked = false;
unsigned long speechUntil = 0;
#include "device_io.h"

TimeState timer;
bool consoleOpen = false;
bool voiceBusy = false, manualPending = false;
bool prefetched = false, currentManual = false;
uint8_t syncReason = 0;  // boot/reset/save/hourly
uint32_t partSentAt = 0, lastPartWait = 0, lastFetchDuration = 0;
uint8_t feedback = NO_ACTION;
enum VoiceNotice : uint8_t {
  RESET_REQUESTED = HOUR_LOCKED + 1, SYNC_OK, SYNC_FAIL, WAIT_CLOCK,
  WAIT_BRIEFING, FETCH_FAIL, SCRIPT_EXPIRED, EDIT_BLOCKED, EDIT_TIMEOUT, KEY_OVERFLOW
};
bool syncFeedbackPending = false, syncFailureNotified = false, jobNoticeIssued = false;
unsigned long startupAt = 0, statusAt = 0;
uint32_t syncRetryAt = 0, speechRetryAt = 0, currentEvent = 0;
char snapshotId[13] = "";
uint16_t partCount = 0, nextPart = 0;
long lastDrift = 0;

bool ready(uint32_t now, uint32_t deadline) {
  return (int32_t)(now - deadline) >= 0;
}

bool makeTimePath(char *path, size_t capacity) {
  timer.clock.tick(millis());
  int count;
  if (timer.clock.valid)
    count = snprintf_P(path, capacity, PSTR("/device/time?mode=daily&hour=%u&minute=%u&board=%lu&fw=log1&reason=%s"),
      schedule.hour, schedule.minute, (unsigned long)timer.clock.epoch,
      syncReason == 0 ? "boot" : syncReason == 1 ? "reset" : syncReason == 2 ? "save" : "hourly");
  else
    count = snprintf_P(path, capacity, PSTR("/device/time?mode=daily&hour=%u&minute=%u&fw=log1&reason=%s"),
      schedule.hour, schedule.minute,
      syncReason == 0 ? "boot" : syncReason == 1 ? "reset" : syncReason == 2 ? "save" : "hourly");
  return count > 0 && count < (int)capacity;
}

void printTime(uint32_t epoch) {
  const uint32_t local = (epoch % 86400 + 8UL * 3600) % 86400;
  char label[9];
  snprintf(label, sizeof(label), "%02u:%02u:%02u", (unsigned)(local / 3600),
    (unsigned)(local / 60 % 60), (unsigned)(local % 60));
  Serial.print(label);
}

void printStatus() {
  timer.clock.tick(millis());
  Serial.print(F("[SCHEDULE] HK=")); Serial.print(schedule.hour); Serial.print(':');
  if (schedule.minute < 10) Serial.print('0');
  Serial.print(schedule.minute); Serial.print(F(" edit=")); Serial.println(editor.stage);
  if (!timer.active) { Serial.println(F("[CLOCK] STOPPED; key 8 to sync, key 7 to speak.")); return; }
  if (!timer.clock.valid) { Serial.println(F("[CLOCK] Waiting for first server sync.")); return; }
  Serial.print(F("[CLOCK] HK=")); printTime(timer.clock.epoch);
  Serial.print(F(" next=")); printTime(timer.nextSpeech);
  Serial.print(F(" sync_in="));
  Serial.print(timer.nextSync > timer.clock.epoch ? timer.nextSync - timer.clock.epoch : 0);
  Serial.print(F("s drift=")); Serial.print(lastDrift);
  Serial.print(F("s part=")); Serial.print(nextPart); Serial.print('/'); Serial.println(partCount);
}

void syncTime() {
  const bool fetched = fetchText(SERVER_PATH, makeTimePath);
  TimePlan plan;
  const uint32_t elapsed = httpReceivedAt - httpRequestBuiltAt;
  if (fetched && elapsed <= 5000 && plan.parse(esp.http.text, false)) {
    timer.apply(plan, httpReceivedAt, elapsed);
    timer.clock.tick(millis());
    lastDrift = plan.drift;
    syncFailureNotified = false;
    syncReason = 3;
    if (syncFeedbackPending) { feedback = SYNC_OK; syncFeedbackPending = false; }
    Serial.print(F("[SYNC OK] request_ms=")); Serial.println(elapsed);
    printStatus();
  } else {
    Serial.println(F("[SYNC FAIL] Retain clock/slot; retry in 30s."));
    if ((syncFeedbackPending || manualPending) && !syncFailureNotified) {
      feedback = SYNC_FAIL;
      syncFailureNotified = true;
    }
  }
  syncRetryAt = millis() + 30000UL;
}

void clearBriefing() {
  currentEvent = 0;
  prefetched = currentManual = false;
  partSentAt = lastPartWait = lastFetchDuration = 0;
  snapshotId[0] = '\0';
  nextPart = partCount = 0;
  jobNoticeIssued = false;
}

void manualSpeech() {
  if (currentEvent) {
    if (!snapshotId[0] && !voiceBusy) feedback = WAIT_BRIEFING;
    Serial.println(F("[BUTTON] Current briefing is still playing; no duplicate request."));
    return;
  }
  if (!timer.active) {
    timer = TimeState();
    timer.active = true;
    syncRetryAt = millis();
  }
  manualPending = true;
  jobNoticeIssued = false;
  syncFailureNotified = false;
  if (!timer.clock.valid) feedback = WAIT_CLOCK;
  speechRetryAt = millis();
  Serial.println(F("[BUTTON] Immediate saved briefing requested."));
}

void handleKey(uint8_t key) {
  Serial.print(F("[KEY] ")); Serial.println(key);
  if (key == 8) {
    // Reset the local clock/job and resync; preserve the EEPROM schedule.
    editor.cancel();
    feedback = RESET_REQUESTED;
    syncFeedbackPending = true;
    syncReason = 1;
    syncFailureNotified = false;
    manualPending = false;
    clearBriefing();
    timer = TimeState();
    timer.active = true;
    syncRetryAt = millis();
    Serial.println(F("[RESET/SYNC] Retain saved time; current voice frame may finish."));
    return;
  }
  if (key == 7) {
    editor.cancel();
    feedback = NO_ACTION;
    manualSpeech();
    return;
  }
  if (key != 1 && key != 5 && key != 6) return;
  if (currentEvent) {
    feedback = EDIT_BLOCKED;
    Serial.println(F("[EDIT] Briefing active; key 8 stops future parts before editing."));
    return;
  }
  const ScheduleAction action = editor.press(key, millis(), schedule);
  if (action == NO_ACTION) return;
  feedback = action;  // Keep the latest feedback if keys are pressed quickly.
  if (action == HOUR_CHANGED) manualPending = false;
  if (action == HOUR_CONFIRMED || action == TIME_CONFIRMED) {
    schedule.save(EEPROM);
    timer.clock.tick(millis());
    timer.reschedule(schedule.hour, schedule.minute);
    timer.active = true;
    timer.nextSync = 0;
    syncReason = 2;
    syncRetryAt = millis();  // Advertise the changed time to server prewarming.
    printStatus();
  }
}

void processKeys() {
  uint8_t key;
  while ((key = keypad.take())) handleKey(key);
  if (keypad.overflowed) {
    Serial.println(F("[KEY] Queue full; re-enter time after network wait."));
    editor.cancel();
    feedback = KEY_OVERFLOW;
    keypad.overflowed = false;
  }
}

void speakFeedback() {
  if (!feedback || voiceBusy) return;  // Notices may speak while a job waits for a script.
  prefetched = false;  // The shared HTTP text buffer will hold this notice instead.
  if (feedback == HOUR_CHANGED)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("小时%u点。"), editor.hour);
  else if (feedback == MINUTE_CHANGED)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("分钟%u分。"), editor.minute);
  else if (feedback == HOUR_CONFIRMED)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("已保存为每天%u点整。五号设分钟，一号确认。"), schedule.hour);
  else if (feedback == START_WITH_HOUR)
    snprintf_P(esp.http.text, sizeof(esp.http.text), editor.stage == EDIT_HOUR
      ? PSTR("先按一号确认小时，再用五号设分钟。") : PSTR("按六号开始设小时。"));
  else if (feedback == HOUR_LOCKED)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("小时已确认。五号设分钟，一号保存。"));
  else if (feedback == RESET_REQUESTED)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("正在重新校时，请稍候。"));
  else if (feedback == SYNC_OK)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("校时完成。每天%u点%u分播报。"), schedule.hour, schedule.minute);
  else if (feedback == SYNC_FAIL)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("校时暂未成功，正在等待网络，稍后重试。"));
  else if (feedback == WAIT_CLOCK)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("正在校时，请稍候，完成后播放晨报。"));
  else if (feedback == WAIT_BRIEFING)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("晨报正在准备，请稍候。"));
  else if (feedback == FETCH_FAIL)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("暂时取不到晨报，稍后自动重试。"));
  else if (feedback == SCRIPT_EXPIRED)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("晨报已过期，正在重新准备。"));
  else if (feedback == EDIT_BLOCKED)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("请先按八号停止播报，再设时间。"));
  else if (feedback == EDIT_TIMEOUT)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("设置结束，保留每天%u点%u分。"), schedule.hour, schedule.minute);
  else if (feedback == KEY_OVERFLOW)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("按键过快，请重新设定时间。"));
  else if (feedback == SHOW_SCHEDULE)
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("每天%u点%u分播报。"), schedule.hour, schedule.minute);
  else
    snprintf_P(esp.http.text, sizeof(esp.http.text), PSTR("已保存为每天%u点%u分。"), schedule.hour, schedule.minute);
  esp.http.textSize = strlen(esp.http.text);
  feedback = NO_ACTION;
  speakReceivedText();
  voiceBusy = true;
}

bool readManifest(const char *body) {
  char id[13];
  unsigned parts;
  int end = 0;
  if (sscanf(body, "v=1\nid=%12[0-9a-f]\nparts=%u\n%n", id, &parts, &end) != 2 ||
      !end || body[end] || strlen(id) != 12 || parts < 1 || parts > 128) return false;
  strcpy(snapshotId, id);
  partCount = parts;
  nextPart = 0;
  return true;
}

bool makeManifestPath(char *path, size_t capacity) {
  const int count = snprintf_P(path, capacity, PSTR("/device/briefing?fw=log1&trigger=%s&event=%lu"),
    currentManual ? "button" : "daily", (unsigned long)currentEvent);
  return count > 0 && count < (int)capacity;
}

void sendPart() {
  Serial.print(F("[PART SEND] index=")); Serial.print(nextPart);
  Serial.print(F(" bytes=")); Serial.print(esp.http.textSize);
  Serial.print(F(" fetch_ms=")); Serial.print(lastFetchDuration);
  Serial.print(F(" preloaded=")); Serial.print(prefetched);
  if (partSentAt) { Serial.print(F(" frame_interval_ms=")); Serial.print(millis() - partSentAt); }
  Serial.println();
  speakReceivedText();
  partSentAt = millis();
  lastPartWait = speechUntil - partSentAt;
  Serial.print(F(" estimated_wait_ms=")); Serial.println(lastPartWait);
  voiceBusy = true;
  prefetched = false;
  ++nextPart;
  speechRetryAt = millis();
}

void advanceBriefing() {
  if (!snapshotId[0]) {
    const bool fetched = fetchText("/device/briefing", makeManifestPath);
    processKeys();
    if (!currentEvent) return;  // A reset during the request cancels this job.
    if (fetched && readManifest(esp.http.text)) {
      jobNoticeIssued = false;
      Serial.print(F("[BRIEFING] parts=")); Serial.println(partCount);
      speechRetryAt = millis();
    } else {
      Serial.println(F("[PREPARING/FAIL] Retry manifest in 30s; no speech sent."));
      speechRetryAt = millis() + 30000UL;
      if (!jobNoticeIssued) {
        feedback = esp.http.status == 503 ? WAIT_BRIEFING : FETCH_FAIL;
        jobNoticeIssued = true;
      }
    }
    return;
  }
  if (nextPart == partCount) {
    if (voiceBusy) return;
    // Report after playback's estimated wait, never add an HTTP request between frames.
    char path[152];
    snprintf_P(path, sizeof(path), PSTR("/device/event?name=finished&id=%s&sent=%u&sent_ms=%lu&wait_ms=%lu&fetch_ms=%lu&fw=log1"),
      snapshotId, nextPart - 1, (unsigned long)partSentAt, (unsigned long)lastPartWait,
      (unsigned long)lastFetchDuration);
    fetchText(path);
    processKeys();
    if (!currentEvent) return;
    timer.clock.tick(millis());
    timer.handled(currentEvent);
    clearBriefing();
    Serial.println(F("[BRIEFING SENT] All parts sent and estimated playback wait finished."));
    return;
  }
  if (prefetched) {
    if (!voiceBusy) sendPart();
    return;
  }
  char path[152];
  if (nextPart)
    snprintf_P(path, sizeof(path), PSTR("/device/briefing-part?id=%s&part=%u&fw=log1&sent=%u&sent_ms=%lu&wait_ms=%lu&fetch_ms=%lu&preload=%u"),
      snapshotId, nextPart, nextPart - 1, (unsigned long)partSentAt,
      (unsigned long)lastPartWait, (unsigned long)lastFetchDuration, voiceBusy ? 1 : 0);
  else
    snprintf_P(path, sizeof(path), PSTR("/device/briefing-part?id=%s&part=%u&fw=log1"), snapshotId, nextPart);
  const uint32_t started = millis();
  const bool fetched = fetchText(path);
  lastFetchDuration = millis() - started;
  processKeys();
  if (!currentEvent) return;
  if (fetched) {
    jobNoticeIssued = false;
    prefetched = true;  // Reuse the existing 192-byte buffer; no second text buffer.
    if (voiceBusy && ready(millis(), speechUntil)) voiceBusy = false;
    if (!voiceBusy) sendPart();
    speechRetryAt = millis();
  } else {
    // A failed part is retried at the same index; already sent parts stay sent.
    if (esp.http.status == 410) {
      snapshotId[0] = '\0';
      partCount = nextPart = 0;
      Serial.println(F("[EXPIRED] Server restarted/expired script; next request starts a new briefing."));
    }
    speechRetryAt = millis() + 30000UL;
    if (!jobNoticeIssued) {
      feedback = esp.http.status == 410 ? SCRIPT_EXPIRED : FETCH_FAIL;
      jobNoticeIssued = true;
    }
    Serial.println(F("[PART FAIL] Retry in 30s."));
  }
}

void setup() {
  Serial.begin(115200);
  Serial1.begin(115200);
  voiceSerial.begin(115200);
  voiceSerial.stopListening();
  schedule.load(EEPROM);
  keypad.begin();
  startupAt = millis();
  timer.active = true;  // No USB monitor or button is needed after power-on.
}

void loop() {
  receiveESP();
  timer.clock.tick(millis());
  if (Serial && !consoleOpen) {
    consoleOpen = true;
    Serial.println(F("Vox daily briefing: EEPROM time, hourly sync, HTTP 8086."));
    Serial.println(F("8=reset/sync; 7/t=briefing; 6=hour; 5=+5min; 1=confirm/status; x=stop."));
    printStatus();
  }
  if (!Serial) consoleOpen = false;
  processKeys();
  if (editor.expire(millis())) {
    feedback = EDIT_TIMEOUT;
    Serial.println(F("[EDIT] Timeout; discard unconfirmed changes, retain saved time."));
  }
  if (Serial.available()) {
    const char value = Serial.read();
    if (value >= '1' && value <= '8') handleKey(value - '0');
    else if (value == 't' || value == 'T') handleKey(7);
    else if (value == 's' || value == 'S') printStatus();
    else if (value == 'x' || value == 'X') {
      timer.active = false;
      editor.cancel();
      feedback = NO_ACTION;
      syncFeedbackPending = false;
      manualPending = false;
      clearBriefing();
      Serial.println(F("[STOP] No more parts; current voice frame may finish."));
    }
  }
  uint32_t now = millis();
  if (voiceBusy && ready(now, speechUntil)) voiceBusy = false;
  speakFeedback();
  if (timer.active && editor.stage == EDIT_IDLE && !voiceBusy && !currentEvent && millis() - startupAt >= 2000 &&
      (!timer.clock.valid || timer.clock.epoch >= timer.nextSync) && ready(now, syncRetryAt)) syncTime();
  processKeys();
  speakFeedback();  // Announce sync results before any ready news part is sent.
  timer.clock.tick(millis());
  now = millis();
  if (timer.active && editor.stage == EDIT_IDLE && timer.clock.valid && !currentEvent) {
    // A due daily slot takes priority and absorbs an immediate button request.
    currentEvent = timer.due();
    if (!currentEvent && manualPending) { currentEvent = timer.clock.epoch; currentManual = true; }
    if (currentEvent) manualPending = false;
  }
  if (timer.active && editor.stage == EDIT_IDLE && currentEvent && ready(now, speechRetryAt) &&
      (!voiceBusy || (!prefetched && snapshotId[0] && nextPart < partCount))) advanceBriefing();
  if (Serial && millis() - statusAt >= 10000) { statusAt = millis(); printStatus(); }
}
