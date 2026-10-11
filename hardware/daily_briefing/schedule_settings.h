#ifndef VOX_SCHEDULE_SETTINGS_H
#define VOX_SCHEDULE_SETTINGS_H
#include <stdint.h>

// EEPROM is written only on confirmation, never for each button press.
struct DailySchedule {
  uint8_t hour = 7, minute = 15;

  template <typename Storage> void load(Storage &storage) {
    const uint8_t h = storage.read(2), m = storage.read(3);
    if (storage.read(0) == 0x56 && storage.read(1) == 1 && h < 24 && m < 60 &&
        storage.read(4) == (uint8_t)(0xA5 ^ h ^ m)) {
      hour = h;
      minute = m;
    }
  }
  template <typename Storage> void save(Storage &storage) const {
    if (storage.read(0) == 0x56 && storage.read(1) == 1 && storage.read(2) == hour &&
        storage.read(3) == minute && storage.read(4) == (uint8_t)(0xA5 ^ hour ^ minute)) return;
    // Invalidate first; an interrupted write will use the safe 07:15 default.
    storage.update(0, 0);
    storage.update(1, 1);
    storage.update(2, hour);
    storage.update(3, minute);
    storage.update(4, (uint8_t)(0xA5 ^ hour ^ minute));
    storage.update(0, 0x56);
  }
};

enum EditStage : uint8_t { EDIT_IDLE, EDIT_HOUR, EDIT_MINUTE };
enum ScheduleAction : uint8_t { NO_ACTION, HOUR_CHANGED, MINUTE_CHANGED, HOUR_CONFIRMED, TIME_CONFIRMED, SHOW_SCHEDULE, START_WITH_HOUR, HOUR_LOCKED };

struct ScheduleEditor {
  EditStage stage = EDIT_IDLE;
  uint8_t hour = 0, minute = 0;
  uint32_t lastPress = 0;

  ScheduleAction press(uint8_t key, uint32_t now, DailySchedule &saved) {
    if (key != 1 && key != 5 && key != 6) return NO_ACTION;
    lastPress = now;
    if (key == 6) {
      if (stage == EDIT_MINUTE) return HOUR_LOCKED;
      if (stage == EDIT_IDLE) { stage = EDIT_HOUR; hour = minute = 0; }
      hour = (hour + 1) % 24;
      return HOUR_CHANGED;
    }
    if (key == 5) {
      if (stage != EDIT_MINUTE) return START_WITH_HOUR;
      minute = (minute + 5) % 60;
      return MINUTE_CHANGED;
    }
    if (stage == EDIT_IDLE) return SHOW_SCHEDULE;
    saved.hour = hour;
    saved.minute = minute;
    if (stage == EDIT_HOUR) {
      stage = EDIT_MINUTE;
      return HOUR_CONFIRMED;  // HH:00 is already valid if no minute is entered.
    }
    stage = EDIT_IDLE;
    return TIME_CONFIRMED;
  }
  bool expire(uint32_t now) {
    if (stage == EDIT_IDLE || now - lastPress < 30000UL) return false;
    stage = EDIT_IDLE;
    return true;  // Discard unconfirmed edits; confirmed HH:00 remains saved.
  }
  void cancel() { stage = EDIT_IDLE; }
};
#endif
