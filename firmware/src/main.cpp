#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_NeoPixel.h>
#include <limits.h>

// OLED Setup
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// SPI and RFID Pins
#define RFID1_CS 5
#define RFID2_CS 4
#define RFID_RST_PIN UINT8_MAX
#define SCK_PIN 14
#define MISO_PIN 12
#define MOSI_PIN 13

// Pin setup
#define POT_PIN      34   
#define BUZZER_PIN   26   
#define NEOPIXEL_PIN 27   
#define NUM_PIXELS    8   
#define USE_POTENTIOMETER 0
#define DEFAULT_ZONE 1
Adafruit_NeoPixel pixel(NUM_PIXELS, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

// RFID Instances
MFRC522 rfid1(RFID1_CS, RFID_RST_PIN);
MFRC522 rfid2(RFID2_CS, RFID_RST_PIN);
bool rfid1Ready = false;
bool rfid2Ready = false;

// Network settings
// Keep these in one place and update only these values when network changes.
#ifndef WIFI_SSID
#define WIFI_SSID "arya"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "arya2606"
#endif

#ifndef MQTT_BROKER_HOST
#define MQTT_BROKER_HOST "test.mosquitto.org"
#endif

#ifndef MQTT_BROKER_PORT
#define MQTT_BROKER_PORT 1883
#endif
WiFiClient espClient;
PubSubClient client(espClient);

// Timing Variables for Non-Blocking Delays
unsigned long lastWiFiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastRfid1Scan = 0;
unsigned long lastRfid2Scan = 0;
const unsigned long SCAN_COOLDOWN = 1500;
const unsigned long WIFI_RETRY_MS = 10000;
const unsigned long MQTT_RETRY_MS = 5000;
const int BUZZER_CHANNEL = 0;
const int BUZZER_RESOLUTION = 8;

// Function Prototypes
void setupWiFiConnection();
void ensureWiFiConnected();
void connectToMQTT();
void mqtt_callback(char *topic, byte *payload, unsigned int length);
void getTagID(MFRC522 *rfid, char *tagID);
void showDisplay(const char* prefix, const char* message);
void indicateStatus(bool granted);
int getLocationFromPot();
void scanI2C();
bool initRfidReader(MFRC522 &reader, const char *name);
void handleReader(MFRC522 &reader, bool ready, unsigned long &lastScanTime, const char *topic, const char *prefix);
void beep(int frequency, int durationMs);

// Initialize hardware, network, and feedback devices.
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\nStarting setup...");

  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN);
  Wire.begin();

  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    scanI2C();
    while (true) { delay(100); }
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.println("Initializing...");
  display.display();

  pinMode(RFID1_CS, OUTPUT);
  pinMode(RFID2_CS, OUTPUT);
  digitalWrite(RFID1_CS, HIGH);
  digitalWrite(RFID2_CS, HIGH);
  rfid1Ready = initRfidReader(rfid1, "RFID1");
  rfid2Ready = initRfidReader(rfid2, "RFID2");

#if USE_POTENTIOMETER
  pinMode(POT_PIN, INPUT);
#endif
  pinMode(BUZZER_PIN, OUTPUT);
  ledcSetup(BUZZER_CHANNEL, 1000, BUZZER_RESOLUTION);
  ledcAttachPin(BUZZER_PIN, BUZZER_CHANNEL);
  pixel.begin();
  pixel.clear();
  pixel.show();

  WiFi.setSleep(false);
  setupWiFiConnection();

  client.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  client.setCallback(mqtt_callback);

  if (!rfid1Ready && !rfid2Ready) {
    showDisplay("RFID", "Reader check failed");
  } else {
    showDisplay("SYS", "Tap RFID Card");
  }
  beep(1000, 200);
  delay(250);
  beep(1500, 200);
}

// Maintain network links and process both RFID readers.
void loop() {
  ensureWiFiConnected();

  if (!client.connected()) {
    if (millis() - lastMqttAttempt > MQTT_RETRY_MS) {
      lastMqttAttempt = millis();
      connectToMQTT();
    }
  } else {
    client.loop();
  }

  handleReader(rfid1, rfid1Ready, lastRfid1Scan, "rfid/in", "IN");
  handleReader(rfid2, rfid2Ready, lastRfid2Scan, "rfid/out", "OUT");
}

// Initialize one RFID reader and verify SPI communication.
bool initRfidReader(MFRC522 &reader, const char *name) {
  reader.PCD_Init();
  delay(10);

  byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);
  if (version == 0x00 || version == 0xFF) {
    Serial.printf("%s init failed (VersionReg=0x%02X). Check CS/SCK/MISO/MOSI/GND/3V3.\n", name, version);
    return false;
  }

  Serial.printf("%s ready (VersionReg=0x%02X).\n", name, version);
  return true;
}

// Poll one reader, publish scan, and show immediate local feedback.
void handleReader(MFRC522 &reader, bool ready, unsigned long &lastScanTime, const char *topic, const char *prefix) {
  if (!ready) return;
  if (millis() - lastScanTime <= SCAN_COOLDOWN) return;
  if (!reader.PICC_IsNewCardPresent()) return;
  if (!reader.PICC_ReadCardSerial()) return;

  char tag[32];
  getTagID(&reader, tag);
  if (strlen(tag) > 0) {
    int location = getLocationFromPot();
    char payload[64];
    snprintf(payload, sizeof(payload), "%s,%d", tag, location);

    bool published = false;
    if (client.connected()) {
      published = client.publish(topic, payload);
    }

    beep(2000, 80);
    char displayMsg[64];
    if (published) {
      snprintf(displayMsg, sizeof(displayMsg), "%s @L%d", tag, location);
    } else {
      snprintf(displayMsg, sizeof(displayMsg), "%s (offline)", tag);
    }
    showDisplay(prefix, displayMsg);

    Serial.printf("%s Tag: %s Location: %d Published: %s\n", prefix, tag, location, published ? "yes" : "no");
    lastScanTime = millis();
  }

  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}

// Scan I2C bus for troubleshooting display issues.
void scanI2C() {
  Serial.println("Scanning I2C devices...");
  byte error, address;
  int nDevices = 0;
  for (address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("I2C device found at address 0x%02X\n", address);
      nDevices++;
    }
  }
  if (nDevices == 0) Serial.println("No I2C devices found!");
}

// Perform initial WiFi connection attempt.
void setupWiFiConnection() {
  Serial.printf("Connecting to WiFi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiAttempt = millis();

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nFailed to connect to WiFi");
  }
}

// Retry WiFi periodically when disconnected.
void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWiFiAttempt < WIFI_RETRY_MS) return;

  lastWiFiAttempt = millis();
  Serial.println("WiFi disconnected, retrying...");
  WiFi.disconnect();
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// Connect MQTT and subscribe response topic.
void connectToMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.println("Connecting to MQTT...");
  if (client.connect("ESP32Client_Parking")) {
    Serial.println("Connected to MQTT broker");
    client.subscribe("access/response");
  } else {
    Serial.print("Failed. rc=");
    Serial.println(client.state());
  }
}

// Process backend response and update OLED feedback.
void mqtt_callback(char *topic, byte *payload, unsigned int length) {
  char message[100];
  memset(message, 0, sizeof(message));
  memcpy(message, payload, length);
  message[length] = '\0';

  if (strcmp(topic, "access/response") != 0) return;

  char *uid = strtok(message, ",");
  char *status = strtok(NULL, ",");
  char *name = strtok(NULL, ",");
  char *spot = strtok(NULL, ",");

  if (!uid || !status || !name) return;

  bool allowed = (strcmp(status, "ALLOWED") == 0);
  indicateStatus(allowed);

  char displayMsg[100];
  if (allowed) {
    if (spot && strlen(spot) > 0 && strcmp(spot, "-") != 0) {
      snprintf(displayMsg, sizeof(displayMsg), "ALLOWED - %s", spot);
    } else {
      snprintf(displayMsg, sizeof(displayMsg), "ALLOWED - %s", name);
    }
    showDisplay("OK", displayMsg);
  } else {
    showDisplay("X", "DENIED - Access Denied");
  }
}

// Convert RFID bytes into uppercase UID string.
void getTagID(MFRC522 *rfid, char *tagID) {
  tagID[0] = '\0';
  for (byte i = 0; i < rfid->uid.size; i++) {
    char byteStr[3];
    snprintf(byteStr, sizeof(byteStr), "%02X", rfid->uid.uidByte[i]);
    strncat(tagID, byteStr, 2);
  }
}

// Render a simple status message on OLED.
void showDisplay(const char* prefix, const char* message) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.print(prefix);
  display.print(": ");
  display.println(message);
  display.display();
}

// Map potentiometer reading into zone location.
int getLocationFromPot() {
#if USE_POTENTIOMETER
  int analogVal = analogRead(POT_PIN);
  int location = map(analogVal, 0, 4095, 1, 5);
  if (location < 1) location = 1;
  if (location > 5) location = 5;
  return location;
#else
  return DEFAULT_ZONE;
#endif
}

// Flash LEDs and buzzer for access result.
void indicateStatus(bool granted) {
  uint32_t color = granted ? pixel.Color(0, 255, 0) : pixel.Color(255, 0, 0);
  for (int i = 0; i < pixel.numPixels(); i++) {
    pixel.setPixelColor(i, color);
  }
  pixel.show();
  beep(granted ? 1000 : 300, granted ? 200 : 500);
  delay(250);
  pixel.clear();
  pixel.show();
}

// ESP32 buzzer helper using LEDC PWM.
void beep(int frequency, int durationMs) {
  if (frequency <= 0 || durationMs <= 0) return;
  ledcWriteTone(BUZZER_CHANNEL, frequency);
  delay(durationMs);
  ledcWriteTone(BUZZER_CHANNEL, 0);
}