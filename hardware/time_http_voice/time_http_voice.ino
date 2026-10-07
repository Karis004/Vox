// Leonardo: same working wiring, no new components needed.
// Button D4 starts the timer; ESP Serial1 D0/D1; TTS RX D6.
#include <SoftwareSerial.h>
#include "http_response.h"
#include "time_state.h"

// Local test: computer IPv4/8000. Public Vox HTTP: 40.233.65.88:8086.
// after Vox is deployed there. Host excludes http:// and any path; no HTTPS yet.
const char SERVER_HOST[] = "192.168.6.53";
const uint16_t SERVER_PORT = 8000;
const char SERVER_PATH[] = "/device/time";
const uint8_t BUTTON_PIN = 4;
const bool CLOCK_TEST_MODE = true;  // false: daily HK_TIME_HOUR:HK_TIME_MINUTE, hourly sync.
const uint8_t HK_TIME_HOUR = 8;
const uint8_t HK_TIME_MINUTE = 30;
SoftwareSerial voiceSerial(5, 6);
EspResponse esp;
bool autoconnectChecked = false, consoleOpen = false;
bool rawButton = HIGH, stableButton = HIGH;
unsigned long buttonChangedAt = 0, speechUntil = 0;
#include "device_io.h"

TimeState timer;
bool voiceBusy = false;
uint32_t syncRetryAt = 0, speechRetryAt = 0, statusAt = 0, syncedAt = 0;
long lastDrift = 0;

bool retryReady(uint32_t now, uint32_t deadline) {
  return (int32_t)(now - deadline) >= 0;
}

bool makeTimePath(char *path, size_t capacity) {
  timer.clock.tick(millis());
  int count;
  if (timer.clock.valid)
    count = snprintf(path, capacity, "/device/time?mode=%s&hour=%u&minute=%u&board=%lu",
      CLOCK_TEST_MODE ? "test" : "daily", HK_TIME_HOUR, HK_TIME_MINUTE,
      (unsigned long)timer.clock.epoch);
  else
    count = snprintf(path, capacity, "/device/time?mode=%s&hour=%u&minute=%u",
      CLOCK_TEST_MODE ? "test" : "daily", HK_TIME_HOUR, HK_TIME_MINUTE);
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
  if (!timer.active) { Serial.println(F("[CLOCK] STOPPED; press button to start.")); return; }
  if (!timer.clock.valid) { Serial.println(F("[CLOCK] Waiting for first server sync; no speech yet.")); return; }
  Serial.print(F("[CLOCK] HK="));
  printTime(timer.clock.epoch);
  const uint32_t target = timer.firstSpeech ? timer.firstSpeech : timer.nextSpeech;
  Serial.print(F(" speech_in="));
  Serial.print(target > timer.clock.epoch ? target - timer.clock.epoch : 0);
  Serial.print(F("s sync_in="));
  Serial.print(timer.nextSync > timer.clock.epoch ? timer.nextSync - timer.clock.epoch : 0);
  Serial.print(F("s drift="));
  Serial.print(lastDrift);
  Serial.print(F("s sync_age="));
  Serial.print((uint32_t)(millis() - syncedAt) / 1000);
  Serial.println(F("s"));
}

void syncTime() {
  Serial.println(F("[SYNC] Asking computer for time and schedule..."));
  bool success = fetchText(SERVER_PATH, makeTimePath);
  TimePlan plan;
  uint32_t elapsed = httpReceivedAt - httpRequestBuiltAt;
  if (success && (elapsed > 5000 || !plan.parse(esp.http.text, CLOCK_TEST_MODE))) {
    Serial.println(F("[ERROR] Invalid clock response or request took over 5s; clock unchanged."));
    success = false;
  }
  if (success) {
    const bool initial = !timer.clock.valid;
    timer.apply(plan, httpReceivedAt, elapsed);
    timer.clock.tick(millis());
    // First countdown starts after the successful transaction, including cleanup.
    if (initial && plan.delay) timer.firstSpeech = timer.clock.epoch + plan.delay;
    lastDrift = plan.drift;
    syncedAt = millis();
    Serial.print(F("[SYNC OK] server_minus_board="));
    Serial.print(lastDrift);
    Serial.print(F("s request_ms="));
    Serial.println(elapsed);
    printStatus();
  } else Serial.println(F("[SYNC FAIL] Retry in 30s; retaining last clock/speech slot."));
  syncRetryAt = millis() + 30000UL;
}

void startOrSync() {
  if (!timer.active) {
    timer = TimeState();
    timer.active = true;
    speechRetryAt = millis();
    Serial.println(F("[START] Button started timer; requesting initial clock sync."));
  } else Serial.println(F("[BUTTON] Manual sync; existing schedule stays active."));
  syncTime();
  rawButton = stableButton = digitalRead(BUTTON_PIN);
  buttonChangedAt = millis();
}

void scheduledSpeech(uint32_t event) {
  Serial.print(F("[DUE] Scheduled HK="));
  printTime(event);
  Serial.print(F("; board HK="));
  printTime(timer.clock.epoch);
  Serial.println();
  char path[48];
  snprintf(path, sizeof(path), "/device/time-speech?event=%lu", (unsigned long)event);
  if (fetchText(path)) {
    speakReceivedText();
    voiceBusy = true;
    timer.clock.tick(millis());
    timer.handled(event);
    Serial.println(F("[EVENT SENT] No backlog replay. Next slot retained."));
  } else Serial.println(F("[SPEECH FAIL] Retry this slot in 30s; no AI involved."));
  speechRetryAt = millis() + 30000UL;
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
}

void loop() {
  receiveESP();
  timer.clock.tick(millis());
  if (Serial && !consoleOpen) {
    consoleOpen = true;
    Serial.println(F("Vox time test: press D4 button to START; press again to sync."));
    Serial.println(F("Monitor 115200. Commands: t=start/sync, s=status, x=stop."));
  }
  if (!Serial) consoleOpen = false;
  const bool button = digitalRead(BUTTON_PIN);
  if (button != rawButton) { rawButton = button; buttonChangedAt = millis(); }
  if (millis() - buttonChangedAt >= 50 && stableButton != rawButton) {
    stableButton = rawButton;
    if (stableButton == LOW) startOrSync();
  }
  if (Serial.available()) {
    const char value = Serial.read();
    if (value == 't' || value == 'T') startOrSync();
    else if (value == 's' || value == 'S') printStatus();
    else if (value == 'x' || value == 'X') {
      timer.active = false;
      Serial.println(F("[STOP] Timer stopped; already sent speech may finish."));
    }
  }
  timer.clock.tick(millis());
  uint32_t now = millis();
  if (timer.active && (!timer.clock.valid || timer.clock.epoch >= timer.nextSync) &&
      retryReady(now, syncRetryAt)) syncTime();
  timer.clock.tick(millis());
  now = millis();
  if (voiceBusy && retryReady(now, speechUntil)) voiceBusy = false;
  const uint32_t event = timer.due();
  if (event && retryReady(now, speechRetryAt) && !voiceBusy)
    scheduledSpeech(event);
  if (Serial && millis() - statusAt >= 1000) {
    statusAt = millis();
    printStatus();
  }
}
