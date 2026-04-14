# 🅿️ Smart Parking System

A full-stack RFID-based smart parking management system built with **ESP32** + **Node.js** + **MQTT**.

## Architecture

```
ESP32 (WiFi STA client)
  ├── RFID Reader 1 (Entry)          → publishes to  rfid/in
  ├── RFID Reader 2 (Exit)           → publishes to  rfid/out
  ├── OLED Display                   ← shows access result + spot
  ├── NeoPixel Ring                  ← green/red indicator
  ├── Buzzer                         ← audio feedback
  └── Potentiometer                  → selects zone (1-5)

WiFi network / internet
  ├── MQTT Broker (:1883)
  └── Node.js Server (:3000)
       ├── MQTT Client               ← subscribes rfid/in, rfid/out
       │                             → publishes access/response
  ├── Firebase Firestore         ← users, logs, slots, active spots
       ├── REST API                   ← /api/users, /api/logs, /api/slots
       ├── WebSocket (Socket.IO)      ← real-time dashboard updates
       └── Web Dashboard              ← admin dashboard for monitoring
```

## Prerequisites

1. **Node.js** v18+ installed on your laptop
2. **Firebase project** with Firestore enabled
  - Create a service account and provide credentials through environment variables
  - Supported variables: `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, or `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
3. **MQTT Broker** installed and running on the same network or internet-reachable host
   - Download: https://mosquitto.org/download/
   - Start with: `mosquitto -v`
4. **ESP32** flashed with the firmware (see `firmware/src/main.cpp`)

## Quick Start

### Run Commands By Folder

Use these exact folders before each command:

- Folder: `D:\~PES - S4\PROJECT\server`
  - `npm install`
  - `npm start`
  - `npm run dev`

- Folder: `D:\~PES - S4\PROJECT\firmware`
  - `& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run`
  - `& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run -t upload -e esp32dev`
  - `& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" device monitor -p COM3 -b 115200`

- Folder: `D:\~PES - S4\PROJECT`
  - Optional local broker: `mosquitto -v`

### Firebase Environment (server terminal)

Before `npm start`, set Firebase credentials in the same terminal session:

- `$env:GOOGLE_APPLICATION_CREDENTIALS = "D:\~PES - S4\keys\parking-firebase.json"`

Then run server:

- `cd "D:\~PES - S4\PROJECT\server"`
- `npm start`

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Start MQTT Broker
```bash
mosquitto -v
```

### 3. Configure Network Settings
Make sure the ESP32 firmware and the backend point to the same MQTT broker.

Also configure Firebase credentials for the backend before starting it.

- If you use a service-account JSON file, export it as `FIREBASE_SERVICE_ACCOUNT_JSON`.
- If you prefer separate fields, set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
- The backend writes users, logs, slots, and active spot assignments to Firestore.

- For the current code, the ESP32 connects as a WiFi client.
- If you keep the default firmware settings, update `firmware/src/main.cpp` to match your WiFi and broker.
- If you move to a remote-hosted broker, update both the ESP32 firmware and the backend host environment accordingly.

### 4. Start the Server
```bash
cd server
npm start
```

### 5. Open the Dashboard
Open the backend URL in your browser. If you are running locally, use `http://localhost:3000`.

## Testing Without Hardware

The dashboard includes a **Simulate Scan** page where you can test the backend flow without the ESP32:

1. Go to the **Users** page and register a test user with UID `A1B2C3D4`
2. Go to the **Simulate Scan** page
3. Enter `A1B2C3D4`, select a zone, and click **Simulate IN**
4. Watch the admin dashboard update in real-time.

## Admin Features

The website is for admin use. It currently lets you:

- register new RFID users
- edit or delete existing users
- block or reactivate users
- view live dashboard stats
- inspect entry and exit logs
- filter logs and export CSV
- view parking zone occupancy
- edit zone labels and capacities
- simulate RFID scans for testing

The backend data layer now uses Firestore instead of SQLite, while MQTT and Socket.IO still handle device messaging and live dashboard updates.

## User Experience

Regular drivers do not need to use the website during parking.

- The ESP32 reads the RFID card.
- The backend assigns the parking spot.
- The OLED tells the driver where to park.
- The buzzer confirms the scan.
- The admin dashboard is for monitoring and maintenance only.

## MQTT Topics

| Topic | Direction | Payload | Example |
|---|---|---|---|
| `rfid/in` | ESP32 → Server | `UID,location` | `A1B2C3D4,3` |
| `rfid/out` | ESP32 → Server | `UID,location` | `A1B2C3D4,3` |
| `access/response` | Server → ESP32 | `UID,STATUS,NAME,SPOT` | `A1B2C3D4,ALLOWED,Charan,A3` |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard` | Dashboard stats |
| `GET` | `/api/users` | List users |
| `POST` | `/api/users` | Register user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |
| `GET` | `/api/logs` | Filtered/paginated logs |
| `GET` | `/api/logs/export` | Download CSV |
| `GET` | `/api/slots` | Zone occupancy |
| `PUT` | `/api/slots/:loc` | Update zone |
| `POST` | `/api/simulate` | Simulate scan |

## Hardware Connections (ESP32)

| Component | Pin |
|---|---|
| RFID 1 (Entry) CS | GPIO 5 |
| RFID 2 (Exit) CS | GPIO 4 |
| SPI SCK | GPIO 14 |
| SPI MISO | GPIO 12 |
| SPI MOSI | GPIO 13 |
| OLED SDA | GPIO 21 (default I2C) |
| OLED SCL | GPIO 22 (default I2C) |
| Potentiometer | GPIO 34 |
| Buzzer | GPIO 26 |
| NeoPixel (8 LEDs) | GPIO 27 |
