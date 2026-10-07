#ifndef VOX_DEVICE_IO_H
#define VOX_DEVICE_IO_H
// Shared, tested AT/HTTP/TTS transport. Included after the sketch's pin/constants.
unsigned long httpRequestBuiltAt = 0;
unsigned long httpReceivedAt = 0;

void receiveESP() {
  for (uint8_t i = 0; i < 64 && Serial1.available(); ++i) esp.feed(Serial1.read());
}

void waitAndReceive(unsigned long duration) {
  const unsigned long started = millis();
  while (millis() - started < duration) receiveESP();
}

bool waitFor(uint8_t wanted, unsigned long timeout) {
  const unsigned long started = millis();
  while (millis() - started < timeout) {
    receiveESP();
    if (esp.events & ESP_ERROR) return false;
    if (esp.events & wanted) return true;
  }
  return false;
}

void reportATFailure() {
  Serial.print(F("[ERROR] ESP: "));
  if (esp.detail[0]) Serial.println(esp.detail);
  else Serial.println(F("response timed out"));
}

bool command(const __FlashStringHelper *value, unsigned long timeout = 2500,
             bool required = true) {
  receiveESP();
  esp.clearEvents();
  Serial.print(F("[AT] "));
  Serial.println(value);
  Serial1.println(value);
  const bool ok = waitFor(ESP_OK, timeout);
  if (!ok && required) reportATFailure();
  return ok;
}

bool command(const char *value, uint8_t wanted, unsigned long timeout) {
  receiveESP();
  esp.clearEvents();
  Serial.print(F("[AT] "));
  Serial.println(value);
  Serial1.println(value);
  if (waitFor(wanted, timeout)) return true;
  reportATFailure();
  return false;
}

bool queryIP() {
  esp.hasIP = false;
  return command(F("AT+CIFSR"), 2500, false) && esp.hasIP;
}

bool ensureWiFi() {
  // Set once per Leonardo boot; reuse the credentials already held by ESP.
  if (!autoconnectChecked) {
    if (!command(F("AT+CWAUTOCONN=1"), 2500, false))
      Serial.println(F("[WIFI] Firmware did not accept auto-connect setting."));
    autoconnectChecked = true;
  }
  if (queryIP()) return true;
  Serial.println(F("[WIFI] Waiting for saved Wi-Fi to reconnect..."));
  waitAndReceive(8000);
  if (queryIP()) return true;
  // Newer AT firmware supports joining with its last configuration.
  command(F("AT+CWJAP"), 20000, false);
  if (queryIP()) return true;
  Serial.println(F("[ERROR] No Wi-Fi IP. Set the new Wi-Fi with esp_at_bridge first."));
  return false;
}

void closeSocket() {
  command(F("AT+CIPCLOSE"), 1000, false);  // ERROR is normal if already closed.
}

bool fetchText(const char *path = SERVER_PATH,
               bool (*makePath)(char *, size_t) = NULL) {
  esp.reset();
  if (!command(F("AT"))) return false;
  if (!command(F("ATE0"))) return false;
  if (!command(F("AT+CWMODE=1"))) return false;
  if (!ensureWiFi()) return false;
  closeSocket();
  if (!command(F("AT+CIPMODE=0"))) return false;
  if (!command(F("AT+CIPMUX=0"))) return false;
  // Old firmware may lack these options; its defaults are active mode/no IP detail.
  command(F("AT+CIPDINFO=0"), 2500, false);
  command(F("AT+CIPRECVMODE=0"), 2500, false);

  char atCommand[96];
  snprintf(atCommand, sizeof(atCommand), "AT+CIPSTART=\"TCP\",\"%s\",%u",
           SERVER_HOST, SERVER_PORT);
  if (!command(atCommand, ESP_OK, 8000)) {
    Serial.println(F("[ERROR] Cannot reach computer. Check server IP, port 8000 and LAN/firewall."));
    closeSocket();
    return false;
  }

  char generatedPath[96];
  if (makePath) {
    if (!makePath(generatedPath, sizeof(generatedPath))) {
      closeSocket();
      return false;
    }
    path = generatedPath;
  }
  httpRequestBuiltAt = millis();
  char request[224];
  const int requestLength = snprintf(request, sizeof(request),
    "GET %s HTTP/1.0\r\nHost: %s:%u\r\nConnection: close\r\n\r\n",
    path, SERVER_HOST, SERVER_PORT);
  if (requestLength <= 0 || requestLength >= (int)sizeof(request)) {
    Serial.println(F("[ERROR] HTTP request is too long."));
    closeSocket();
    return false;
  }
  esp.http.reset();
  snprintf(atCommand, sizeof(atCommand), "AT+CIPSEND=%u", (unsigned)requestLength);
  if (!command(atCommand, ESP_PROMPT, 3000)) {
    closeSocket();
    return false;
  }
  Serial.println(F("[HTTP] Sending request; receiving complete UTF-8 text..."));
  esp.clearEvents();
  Serial1.write((const uint8_t *)request, requestLength);
  // Do not print each RX byte: that can overflow the UART buffer at 115200.
  const unsigned long started = millis();
  while (millis() - started < 12000 && !(esp.events & (ESP_CLOSED | ESP_ERROR))) {
    receiveESP();
    if (esp.http.complete()) {
      httpReceivedAt = millis();
      break;
    }
    if (esp.error || esp.http.error) break;
  }
  if (!(esp.events & ESP_CLOSED)) closeSocket();
  if (esp.error || esp.http.error || !esp.http.complete()) {
    Serial.print(F("[ERROR] HTTP status="));
    Serial.print(esp.http.status);
    Serial.print(F("; received text bytes="));
    Serial.print(esp.http.textSize);
    Serial.print(F("; "));
    if (esp.error) Serial.println(esp.error);
    else if (esp.http.error) Serial.println(esp.http.error);
    else Serial.println(F("incomplete response/timeout; no speech sent"));
    return false;
  }
  Serial.print(F("[HTTP OK] "));
  Serial.print(esp.http.textSize);
  Serial.print(F(" bytes: "));
  Serial.println(esp.http.text);
  return true;
}

void speakReceivedText() {
  // Wi-Fi UART is idle before SoftwareSerial temporarily masks interrupts.
  waitAndReceive(100);
  const uint8_t volume[] = {0xFD, 0x00, 0x06, 0x01, 0x01, 0x5B, 0x76, 0x37, 0x5D};
  voiceSerial.write(volume, sizeof(volume));
  delay(100);
  const uint16_t frameLength = esp.http.textSize + 2;
  const uint8_t header[] = {0xFD, (uint8_t)(frameLength >> 8),
                          (uint8_t)frameLength, 0x01, 0x05};
  voiceSerial.write(header, sizeof(header));
  delay(2);
  voiceSerial.write((const uint8_t *)esp.http.text, esp.http.textSize);
  uint16_t characters = 0;
  for (uint16_t i = 0; i < esp.http.textSize; ++i)
    if (((uint8_t)esp.http.text[i] & 0xC0) != 0x80) ++characters;
  // TTS TX is not connected, so this is an estimated wait, not a completion report.
  speechUntil = millis() + (unsigned long)characters * 300 + 1000;
  Serial.println(F("[TTS] Server text sent to voice module. Wait for speech before pressing again."));
}


#endif
