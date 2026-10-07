// Leonardo: USB Serial is separate from the D0/D1 hardware UART (Serial1).
// ESP TX -> D0; D1 -> converter B0; converter A0 -> ESP RX; common GND.
// This diagnostic sketch does not drive the TTS or button pins.
// Monitor: 115200, any line-ending setting that sends CR or LF.
// Local commands: !scan, !baud 9600, !baud 74880, !status, !help.
// Other input lines go to the ESP with exactly one trailing CR+LF.

#include <stdlib.h>
#include <string.h>

unsigned long espBaud = 115200;
unsigned long txCount = 0;
unsigned long rxCount = 0;
unsigned long lastSample = 0;
unsigned long lastStatus = 0;
uint8_t rxSample[64];
uint8_t sampleSize = 0;
unsigned long omitted = 0;
char inputLine[192];
uint8_t inputSize = 0;
bool inputOverflow = false;
bool consoleOpen = false;
bool scanSawOK = false;
uint8_t okPosition = 0;
constexpr char OK_REPLY[] = "\r\nOK\r\n";

void printVisible(uint8_t value) {
  if (value == ' ') Serial.print(F("<SP>"));
  else if (value == '\r') Serial.print(F("<CR>"));
  else if (value == '\n') Serial.print(F("<LF>"));
  else if (value >= 33 && value <= 126) Serial.write(value);
  else {
    Serial.print('<');
    if (value < 16) Serial.print('0');
    Serial.print(value, HEX);
    Serial.print('>');
  }
}

void flushSample() {
  if (!sampleSize && !omitted) return;
  Serial.print(F("[RX] HEX="));
  for (uint8_t i = 0; i < sampleSize; ++i) {
    if (rxSample[i] < 16) Serial.print('0');
    Serial.print(rxSample[i], HEX);
    Serial.print(' ');
  }
  Serial.print(F(" TEXT="));
  for (uint8_t i = 0; i < sampleSize; ++i) printVisible(rxSample[i]);
  if (omitted) {
    Serial.print(F(" [sample limit; omitted bytes="));
    Serial.print(omitted);
    Serial.print(']');
  }
  Serial.println();
  sampleSize = 0;
  omitted = 0;
}

void receiveESP() {
  // Bound work per loop so a noisy input cannot starve USB commands.
  for (uint8_t i = 0; i < 64 && Serial1.available(); ++i) {
    const uint8_t value = Serial1.read();
    ++rxCount;
    if (sampleSize < sizeof(rxSample)) rxSample[sampleSize++] = value;
    else ++omitted;
    if (value == OK_REPLY[okPosition]) ++okPosition;
    else okPosition = (value == '\r') ? 1 : 0;
    if (okPosition == sizeof(OK_REPLY) - 1) {
      scanSawOK = true;
      okPosition = 0;
    }
  }
  if (millis() - lastSample >= 250) {
    flushSample();
    lastSample = millis();
  }
}

void printStatus() {
  Serial.print(F("[STATUS] ESP baud="));
  Serial.print(espBaud);
  Serial.print(F(" TX bytes="));
  Serial.print(txCount);
  Serial.print(F(" RX bytes="));
  Serial.print(rxCount);
  Serial.print(F(" D0="));
  Serial.println(digitalRead(0) == HIGH ? F("HIGH") : F("LOW"));
}

void setBaud(unsigned long baud) {
  flushSample();
  Serial1.end();
  espBaud = baud;
  Serial1.begin(espBaud);
  okPosition = 0;
  scanSawOK = false;
  Serial.print(F("[BAUD] ESP UART now "));
  Serial.println(espBaud);
}

void sendLine(const char *line) {
  Serial.print(F("[TX] "));
  for (size_t i = 0; line[i]; ++i) printVisible(line[i]);
  Serial.println(F("<CR><LF>"));
  txCount += Serial1.print(line);
  txCount += Serial1.print("\r\n");
}

void scanBaud() {
  const unsigned long rates[] = {115200, 9600, 57600, 38400, 19200, 4800};
  const unsigned long previousBaud = espBaud;
  Serial.println(F("[SCAN] Probing AT only; about 12 seconds; no Wi-Fi commands."));
  for (uint8_t i = 0; i < sizeof(rates) / sizeof(rates[0]); ++i) {
    setBaud(rates[i]);
    // Finish any unterminated input left by the earlier raw bridge.
    sendLine("");
    unsigned long started = millis();
    while (millis() - started < 200) receiveESP();
    scanSawOK = false;
    okPosition = 0;
    sendLine("AT");
    started = millis();
    while (millis() - started < 1600 && !scanSawOK) receiveESP();
    flushSample();
    if (scanSawOK) {
      Serial.print(F("[SCAN OK] ESP replied OK at "));
      Serial.println(espBaud);
      return;
    }
  }
  setBaud(previousBaud);
  Serial.println(F("[SCAN NO OK] No valid OK at tested rates; send these logs for diagnosis."));
}

void handleLine() {
  inputLine[inputSize] = '\0';
  if (strcmp(inputLine, "!scan") == 0) scanBaud();
  else if (strcmp(inputLine, "!status") == 0) printStatus();
  else if (strcmp(inputLine, "!help") == 0) {
    Serial.println(F("[LOCAL] !scan | !baud 9600 | !baud 74880 | !status; AT goes to ESP."));
  } else if (strncmp(inputLine, "!baud ", 6) == 0) {
    char *end;
    const unsigned long baud = strtoul(inputLine + 6, &end, 10);
    if (*end == '\0' && (baud == 4800 || baud == 9600 || baud == 19200 ||
        baud == 38400 || baud == 57600 || baud == 74880 || baud == 115200)) setBaud(baud);
    else Serial.println(F("[LOCAL] Unsupported baud; use 9600, 19200, 38400, 57600, 74880 or 115200."));
  } else if (inputLine[0] == '!') {
    Serial.println(F("[LOCAL] Unknown command; type !help."));
  } else sendLine(inputLine);
  inputSize = 0;
}

void setup() {
  Serial.begin(115200);
  Serial1.begin(espBaud);
}

void loop() {
  if (Serial && !consoleOpen) {
    consoleOpen = true;
    Serial.println(F("[LOCAL] Vox ESP diagnostic ready. Keep Monitor at 115200. Type !scan."));
    printStatus();
  }
  if (!Serial) consoleOpen = false;
  while (Serial.available()) {
    const char value = Serial.read();
    if (value == '\r' || value == '\n') {
      if (inputOverflow) Serial.println(F("[LOCAL] Line too long; not sent."));
      else if (inputSize) handleLine();
      inputSize = 0;
      inputOverflow = false;
    } else if (!inputOverflow) {
      if (inputSize < sizeof(inputLine) - 1) inputLine[inputSize++] = value;
      else inputOverflow = true;
    }
  }
  receiveESP();
  if (Serial && millis() - lastStatus >= 5000) {
    printStatus();
    lastStatus = millis();
  }
}
