Smart Parking System - Full Project Explanation

1) What this project does
- This is an RFID-based smart parking system.
- An ESP32 reads RFID cards from two readers:
  - Reader 1 for entry (IN)
  - Reader 2 for exit (OUT)
- ESP32 sends scan data to backend using MQTT.
- Backend validates the UID, assigns/releases parking spots, saves logs, and sends response back.
- Dashboard shows live activity and data from backend.

2) Hardware components
- ESP32 development board
- 2 x MFRC522 RFID readers
- OLED display (SSD1306, I2C)
- Potentiometer (zone selector 1-5)
- NeoPixel ring (status color)
- Buzzer (audio feedback)
- USB cable + power source

3) Main pin mapping used in firmware
- RFID1 CS: GPIO 5
- RFID2 CS: GPIO 4
- SPI SCK: GPIO 14
- SPI MISO: GPIO 12
- SPI MOSI: GPIO 13
- Potentiometer: GPIO 34
- Buzzer: GPIO 26
- NeoPixel: GPIO 27
- OLED: I2C default pins (ESP32 SDA/SCL)

4) Firmware flow (ESP32)
- On boot:
  - Initializes OLED, RFID readers, buzzer, neopixel, WiFi, MQTT client.
- In loop:
  - Keeps WiFi connected.
  - Keeps MQTT connected.
  - Reads IN reader and OUT reader.
  - Builds payload UID,location.
  - Publishes to MQTT topic:
    - rfid/in for entry scans
    - rfid/out for exit scans
- On MQTT response topic access/response:
  - Parses UID,STATUS,NAME,SPOT.
  - Updates OLED + buzzer + neopixel.

5) Backend and database
- Backend: Node.js + Express + Socket.IO + MQTT client
- Data store: Firebase Firestore
- Main Firestore collections:
  - users
  - logs
  - slots
  - activeSpots

6) Software architecture linking hardware to backend
- ESP32 scan -> MQTT publish (rfid/in or rfid/out)
- Node backend receives MQTT message
- Backend checks user in Firestore
- Backend assigns/release spot and records log
- Backend publishes decision on access/response
- ESP32 shows allowed/denied and spot info
- Backend emits Socket.IO event to dashboard
- Dashboard updates live activity and stats

7) Topics and payload contract
- Input topics from ESP32:
  - rfid/in with payload UID,location
  - rfid/out with payload UID,location
- Output topic from backend:
  - access/response with payload UID,STATUS,NAME,SPOT

8) Website behavior
- Dashboard: live feed, occupancy, stats
- Users page: register/edit/delete users and balances
- Logs page: filter and inspect all events
- Slots page: zone capacities and occupancy
- Simulate page: test flows without hardware

9) Important real issue found during debugging
- The major issue was not firmware logic.
- Phone hotspot had client limit of 1.
- Both ESP32 and laptop could not stay connected together.
- This caused WiFi/MQTT failures and misleading symptoms.

10) Current baseline after cleanup
- README.md is kept.
- This file is the single full explanation reference.
- Firmware main.cpp is simplified and commented function-by-function.
