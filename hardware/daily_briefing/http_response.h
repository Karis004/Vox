#ifndef VOX_HTTP_RESPONSE_H
#define VOX_HTTP_RESPONSE_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

#ifdef ARDUINO
typedef const __FlashStringHelper *VoxError;
#define VOX_ERROR(message) F(message)
#else
typedef const char *VoxError;
#define VOX_ERROR(message) message
#endif

// Small streaming HTTP parser: headers need not fit in the text buffer.
// Used only for an HTTP/1.0, Content-Length, text/plain response.
class HttpResponse {
 public:
  static const uint16_t TEXT_CAPACITY = 192;
  char text[TEXT_CAPACITY + 1];
  uint16_t textSize;
  uint16_t status;
  VoxError error;

  HttpResponse() { reset(); }

  void reset() {
    text[0] = '\0';
    textSize = status = lineSize = 0;
    expectedLength = -1;
    headersDone = plainText = chunked = false;
    firstLine = true;
    error = NULL;
  }

  void feed(uint8_t value) {
    if (error) return;
    if (!headersDone) {
      if (value == '\n') {
        if (lineSize && line[lineSize - 1] == '\r') --lineSize;
        line[lineSize] = '\0';
        finishHeaderLine();
        lineSize = 0;
      } else if (lineSize < sizeof(line) - 1) {
        line[lineSize++] = (char)value;
      } else error = VOX_ERROR("HTTP header line too long");
      return;
    }
    if (value == 0) { error = VOX_ERROR("HTTP text contains a zero byte"); return; }
    if (textSize >= TEXT_CAPACITY || textSize >= expectedLength) {
      error = VOX_ERROR("HTTP body exceeds declared length or text limit");
      return;
    }
    text[textSize++] = (char)value;
    text[textSize] = '\0';
  }

  bool complete() const {
    return !error && headersDone && expectedLength > 0 && textSize == expectedLength;
  }

 private:
  char line[128];
  uint8_t lineSize;
  int16_t expectedLength;
  bool headersDone, firstLine, plainText, chunked;

  static bool startsWithIgnoreCase(const char *value, const char *prefix) {
    while (*prefix) {
      if (!*value || tolower((unsigned char)*value++) != tolower((unsigned char)*prefix++)) return false;
    }
    return true;
  }

  void finishHeaderLine() {
    if (firstLine) {
      firstLine = false;
      if (strncmp(line, "HTTP/1.", 7) != 0 || strlen(line) < 12 || line[8] != ' ' ||
          !isdigit((unsigned char)line[9]) || !isdigit((unsigned char)line[10]) ||
          !isdigit((unsigned char)line[11])) {
        error = VOX_ERROR("Invalid HTTP status line");
        return;
      }
      status = (line[9] - '0') * 100 + (line[10] - '0') * 10 + line[11] - '0';
      return;
    }
    if (!lineSize) {
      headersDone = true;
      if (status != 200) error = VOX_ERROR("Server returned a non-200 HTTP status");
      else if (chunked) error = VOX_ERROR("Chunked HTTP is not supported by this short-text test");
      else if (!plainText) error = VOX_ERROR("Expected text/plain, not JSON or HTML");
      else if (expectedLength <= 0) error = VOX_ERROR("Missing or empty Content-Length");
      return;
    }
    char *colon = strchr(line, ':');
    if (!colon) { error = VOX_ERROR("Invalid HTTP header"); return; }
    *colon = '\0';
    char *value = colon + 1;
    while (*value == ' ' || *value == '\t') ++value;
    if (strcmpIgnoreCase(line, "content-length")) {
      char *end;
      const long count = strtol(value, &end, 10);
      while (*end == ' ' || *end == '\t') ++end;
      if (!*value || *end || count < 1 || count > TEXT_CAPACITY)
        error = VOX_ERROR("Content-Length must be between 1 and 192 UTF-8 bytes");
      else if (expectedLength != -1 && expectedLength != count)
        error = VOX_ERROR("Conflicting Content-Length headers");
      else expectedLength = (int16_t)count;
    } else if (strcmpIgnoreCase(line, "content-type")) {
      plainText = startsWithIgnoreCase(value, "text/plain") &&
                  (value[10] == '\0' || value[10] == ';' || value[10] == ' ');
    } else if (strcmpIgnoreCase(line, "transfer-encoding")) chunked = true;
  }

  static bool strcmpIgnoreCase(const char *left, const char *right) {
    while (*left && *right) {
      if (tolower((unsigned char)*left++) != tolower((unsigned char)*right++)) return false;
    }
    return *left == *right;
  }
};

enum EspEvent {
  ESP_OK = 1, ESP_ERROR = 2, ESP_PROMPT = 4, ESP_CLOSED = 8, ESP_SEND_OK = 16
};

// Separate +IPD payload from AT replies, even when headers/body span packets.
class EspResponse {
 public:
  HttpResponse http;
  uint8_t events;
  bool hasIP;
  char detail[96];
  VoxError error;

  EspResponse() { reset(); }

  void reset() {
    http.reset();
    events = lineSize = 0;
    hasIP = ipdLength = false;
    remaining = 0;
    detail[0] = '\0';
    error = NULL;
  }

  void clearEvents() {
    events = 0;
    detail[0] = '\0';
  }

  void feed(uint8_t value) {
    if (!ipdLength && remaining) {
      http.feed(value);
      --remaining;
      return;
    }
    if (ipdLength) {
      if (value >= '0' && value <= '9') {
        const uint32_t count = (uint32_t)remaining * 10 + value - '0';
        if (count > 8192) { error = VOX_ERROR("Invalid +IPD length"); ipdLength = false; remaining = 0; }
        else remaining = (uint16_t)count;
      } else if (value == ':') {
        ipdLength = false;
      } else {
        error = VOX_ERROR("Unexpected +IPD format (single active connection required)");
        ipdLength = false;
        remaining = 0;
      }
      return;
    }
    if (value == '>') { events |= ESP_PROMPT; lineSize = 0; return; }
    if (value == '\n') {
      if (lineSize && line[lineSize - 1] == '\r') --lineSize;
      line[lineSize] = '\0';
      finishLine();
      lineSize = 0;
      return;
    }
    if (lineSize < sizeof(line) - 1) line[lineSize++] = (char)value;
    // Ignore an oversized unrelated line, but still recognize the next newline.
    if (lineSize == 5 && memcmp(line, "+IPD,", 5) == 0) {
      ipdLength = true;
      remaining = 0;
      lineSize = 0;
    }
  }

 private:
  char line[96];
  uint8_t lineSize;
  uint16_t remaining;
  bool ipdLength;

  void finishLine() {
    if (strcmp(line, "OK") == 0) events |= ESP_OK;
    else if (strcmp(line, "SEND OK") == 0) events |= ESP_SEND_OK;
    else if (strcmp(line, "CLOSED") == 0) events |= ESP_CLOSED;
    else if (strcmp(line, "ERROR") == 0 || strcmp(line, "FAIL") == 0 ||
             strstr(line, "SEND FAIL") || strstr(line, "busy") ||
             strstr(line, "link is not valid") || strstr(line, "WIFI DISCONNECT")) {
      events |= ESP_ERROR;
      strncpy(detail, line, sizeof(detail) - 1);
      detail[sizeof(detail) - 1] = '\0';
    } else if (strncmp(line, "+CIFSR:STAIP,\"", 14) == 0) {
      hasIP = strstr(line, "\"0.0.0.0\"") == NULL;
    }
  }
};

#endif
