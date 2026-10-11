#ifndef VOX_KEYPAD_H
#define VOX_KEYPAD_H
#include <Arduino.h>

// Two columns L1/L2, four rows R1/R2/R3/R4. Remove the old L2->GND wire.
const uint8_t KEY_COL_PINS[2] = {7, 8};
const uint8_t KEY_ROW_PINS[4] = {9, 10, 11, 4};
const uint8_t KEY_NUMBERS[2][4] = {{1, 2, 3, 4}, {5, 6, 7, 8}};

struct MatrixKeypad {
  uint8_t raw = 0, stable = 0, head = 0, tail = 0;
  uint8_t events[40];
  bool armed = true, overflowed = false;
  uint32_t changedAt = 0, scannedAt = 0;

  uint8_t read() {
    uint8_t key = 0;
    for (uint8_t col = 0; col < 2; ++col) {
      digitalWrite(KEY_COL_PINS[col], LOW);
      pinMode(KEY_COL_PINS[col], OUTPUT);
      delayMicroseconds(5);
      for (uint8_t row = 0; row < 4; ++row) {
        if (digitalRead(KEY_ROW_PINS[row]) == LOW)
          key = key ? 9 : KEY_NUMBERS[col][row];  // Ignore multi-key/ghost presses.
      }
      pinMode(KEY_COL_PINS[col], INPUT);  // Hi-Z, never drive the other column high.
    }
    return key;
  }
  void begin() {
    for (uint8_t col = 0; col < 2; ++col) {
      digitalWrite(KEY_COL_PINS[col], LOW);
      pinMode(KEY_COL_PINS[col], INPUT);
    }
    for (uint8_t row = 0; row < 4; ++row) pinMode(KEY_ROW_PINS[row], INPUT_PULLUP);
    raw = stable = read();
    armed = raw == 0;
    changedAt = scannedAt = millis();
  }
  void poll(uint32_t now) {
    if (now - scannedAt < 5) return;
    scannedAt = now;
    const uint8_t key = read();
    if (key != raw) { raw = key; changedAt = now; }
    if (now - changedAt < 50 || stable == raw) return;
    stable = raw;
    if (!stable) { armed = true; return; }
    if (!armed) return;
    armed = false;  // One event per press, and release all keys before the next.
    if (stable > 8) return;
    const uint8_t next = (head + 1) % sizeof(events);
    if (next == tail) { overflowed = true; return; }
    events[head] = stable;
    head = next;
  }
  uint8_t take() {
    if (head == tail) return 0;
    const uint8_t key = events[tail];
    tail = (tail + 1) % sizeof(events);
    return key;
  }
};
#endif
