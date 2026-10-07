// Leonardo + ESP-01S + HS-S77-PL. Keep the proven wiring.
// Automatically start, sync hourly, speak saved website content at HK 07:15.
#include <SoftwareSerial.h>
#include "http_response.h"
#include "time_state.h"

const char SERVER_HOST[] = "40.233.65.88";
const uint16_t SERVER_PORT = 8086;
const char SERVER_PATH[] = "/device/time";
const uint8_t BUTTON_PIN = 4;
const uint8_t HK_TIME_HOUR = 7, HK_TIME_MINUTE = 15;
SoftwareSerial voiceSerial(5, 6);
EspResponse esp;
bool autoconnectChecked = false;
unsigned long speechUntil = 0;
#include "device_io.h"

TimeState timer;
bool rawButton = HIGH, stableButton = HIGH, consoleOpen = false;
bool voiceBusy = false, manualPending = false;
unsigned long buttonChangedAt = 0, startupAt = 0, statusAt = 0;
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
    count = snprintf(path, capacity, "/device/time?mode=daily&hour=%u&minute=%u&board=%lu",
      HK_TIME_HOUR, HK_TIME_MINUTE, (unsigned long)timer.clock.epoch);
  else
    count = snprintf(path, capacity, "/device/time?mode=daily&hour=%u&minute=%u",
      HK_TIME_HOUR, HK_TIME_MINUTE);
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
  if (!timer.active) { Serial.println(F("[CLOCK] STOPPED; button or t to restart.")); return; }
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
    Serial.print(F("[SYNC OK] request_ms=")); Serial.println(elapsed);
    printStatus();
  } else Serial.println(F("[SYNC FAIL] Retain clock/slot; retry in 30s."));
  syncRetryAt = millis() + 30000UL;
}

void clearBriefing() {
  currentEvent = 0;
  snapshotId[0] = '\0';
  nextPart = partCount = 0;
}

void manualSpeech() {
  if (currentEvent || voiceBusy) {
    Serial.println(F("[BUTTON] Current briefing is still playing; no duplicate request."));
    return;
  }
  if (!timer.active) {
    timer = TimeState();
    timer.active = true;
    syncRetryAt = millis();
  }
  manualPending = true;
  speechRetryAt = millis();
  Serial.println(F("[BUTTON] Immediate saved briefing requested."));
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

void advanceBriefing() {
  if (!snapshotId[0]) {
    if (fetchText("/device/briefing") && readManifest(esp.http.text)) {
      Serial.print(F("[BRIEFING] parts=")); Serial.println(partCount);
      speechRetryAt = millis();
    } else {
      Serial.println(F("[PREPARING/FAIL] Retry manifest in 30s; no speech sent."));
      speechRetryAt = millis() + 30000UL;
    }
    return;
  }
  if (nextPart == partCount) {
    timer.clock.tick(millis());
    timer.handled(currentEvent);
    clearBriefing();
    Serial.println(F("[BRIEFING SENT] All parts sent and estimated playback wait finished."));
    return;
  }
  char path[72];
  snprintf(path, sizeof(path), "/device/briefing-part?id=%s&part=%u", snapshotId, nextPart);
  if (fetchText(path)) {
    speakReceivedText();
    voiceBusy = true;
    ++nextPart;
    speechRetryAt = millis();
  } else {
    // A failed part is retried at the same index; already sent parts stay sent.
    if (esp.http.status == 410) {
      snapshotId[0] = '\0';
      partCount = nextPart = 0;
      Serial.println(F("[EXPIRED] Server restarted/expired script; next request starts a new briefing."));
    }
    speechRetryAt = millis() + 30000UL;
    Serial.println(F("[PART FAIL] Retry in 30s."));
  }
  rawButton = stableButton = digitalRead(BUTTON_PIN);
  buttonChangedAt = millis();
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(115200);
  Serial1.begin(115200);
  voiceSerial.begin(115200);
  voiceSerial.stopListening();
  rawButton = stableButton = digitalRead(BUTTON_PIN);
  startupAt = millis();
  timer.active = true;  // No USB monitor or button is needed after power-on.
}

void loop() {
  receiveESP();
  timer.clock.tick(millis());
  if (Serial && !consoleOpen) {
    consoleOpen = true;
    Serial.println(F("Vox daily briefing: HK 07:15, hourly sync, HTTP 8086."));
    Serial.println(F("Button/t=immediate briefing; s=status; x=stop after current voice frame."));
  }
  if (!Serial) consoleOpen = false;
  const bool button = digitalRead(BUTTON_PIN);
  if (button != rawButton) { rawButton = button; buttonChangedAt = millis(); }
  if (millis() - buttonChangedAt >= 50 && stableButton != rawButton) {
    stableButton = rawButton;
    if (stableButton == LOW) manualSpeech();
  }
  if (Serial.available()) {
    const char value = Serial.read();
    if (value == 't' || value == 'T') manualSpeech();
    else if (value == 's' || value == 'S') printStatus();
    else if (value == 'x' || value == 'X') {
      timer.active = false;
      manualPending = false;
      clearBriefing();
      Serial.println(F("[STOP] No more parts; current voice frame may finish."));
    }
  }
  uint32_t now = millis();
  if (voiceBusy && ready(now, speechUntil)) voiceBusy = false;
  if (timer.active && !voiceBusy && millis() - startupAt >= 2000 &&
      (!timer.clock.valid || timer.clock.epoch >= timer.nextSync) && ready(now, syncRetryAt)) syncTime();
  timer.clock.tick(millis());
  now = millis();
  if (timer.active && timer.clock.valid && !currentEvent) {
    // A due daily slot takes priority and absorbs an immediate button request.
    currentEvent = timer.due();
    if (!currentEvent && manualPending) currentEvent = timer.clock.epoch;
    if (currentEvent) manualPending = false;
  }
  if (timer.active && currentEvent && !voiceBusy && ready(now, speechRetryAt)) advanceBriefing();
  if (Serial && millis() - statusAt >= 10000) { statusAt = millis(); printStatus(); }
}
