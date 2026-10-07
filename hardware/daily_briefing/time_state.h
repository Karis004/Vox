#ifndef VOX_TIME_STATE_H
#define VOX_TIME_STATE_H
#include <stdint.h>
#include <stdio.h>

struct TimePlan {
  unsigned long now, sync, next, period, delay;
  long drift;

  bool parse(const char *body, bool testMode) {
    int end = 0;
    if (sscanf(body, "v=1\nnow=%lu\nsync=%lu\nnext=%lu\nperiod=%lu\ndelay=%lu\ndrift=%ld\n%n",
               &now, &sync, &next, &period, &delay, &drift, &end) != 6 ||
        !end || body[end]) return false;
    if (now < 1577836800UL || now > 4102444800UL) return false;
    if (period != (testMode ? 120UL : 86400UL) || delay != (testMode ? 10UL : 0UL))
      return false;
    return sync > now && sync - now <= (testMode ? 300UL : 3600UL) &&
           next > now && next - now <= period + 40;
  }
};

// Tick regularly, including after blocking HTTP calls. Unsigned subtraction
// handles millis() rollover without restarting the clock or countdowns.
struct LocalClock {
  uint32_t epoch = 0, lastMillis = 0;
  uint16_t fraction = 0;
  bool valid = false;
  void tick(uint32_t ms) {
    const uint32_t elapsed = ms - lastMillis;
    lastMillis = ms;
    if (!valid) return;
    epoch += elapsed / 1000;
    const uint16_t remainder = fraction + elapsed % 1000;
    epoch += remainder / 1000;
    fraction = remainder % 1000;
  }
  void set(uint32_t value, uint32_t ms) {
    epoch = value;
    lastMillis = ms;
    fraction = 0;
    valid = true;
  }
};

struct TimeState {
  LocalClock clock;
  bool active = false;
  uint32_t nextSync = 0, firstSpeech = 0, nextSpeech = 0, period = 0;

  void apply(const TimePlan &plan, uint32_t receivedAt, uint32_t roundTrip) {
    const bool firstSync = !clock.valid;
    clock.set(plan.now + roundTrip / 2000, receivedAt);
    nextSync = plan.sync;
    if (firstSync) {
      period = plan.period;
      firstSpeech = plan.delay ? clock.epoch + plan.delay : 0;
      nextSpeech = plan.next;
    }
    // Retain outstanding speech slots across both forward and backward corrections.
  }
  uint32_t due() const {
    if (!active || !clock.valid) return 0;
    if (firstSpeech && clock.epoch >= firstSpeech) return firstSpeech;
    return clock.epoch >= nextSpeech ? nextSpeech : 0;
  }
  void handled(uint32_t event) {
    if (event == firstSpeech) firstSpeech = 0;
    // If we were offline, play one item then advance beyond all expired slots.
    if (clock.epoch >= nextSpeech)
      nextSpeech += ((clock.epoch - nextSpeech) / period + 1) * period;
  }
};
#endif
