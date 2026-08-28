# ESP32-S3 Door Hub

현재 하드웨어 아키텍처에서 ESP32-S3 DevKitC가 맡는 제어·네트워크 역할이다. 카메라 프레임을 획득하거나 FPGA로 전송하지 않는다.

## 책임

- PIR 입력 debounce와 같은 방문 중 중복 event 방지
- 단조 증가 `event_id` 생성
- FPGA Vision Domain에 EVENT_START/END 전달
- FPGA heartbeat/auth/request toggle 출력과 ack/decision 수신
- FPGA result/status/Snapshot SPI read
- Wi-Fi를 통한 앱·서버 중계
- 타임아웃·재시도·과거 event result 폐기

## 책임이 아닌 것

- Camera DVP pixel capture
- background difference, bbox, zone, dwell 계산
- FPGA 직접 Reed #2, Tamper, E-stop 대체
- Safety Gate 우회 또는 actuator 직접 구동

## 상태 초안

```text
IDLE
→ PIR debounce
→ EVENT_ACTIVE(event_id)
→ FPGA EVENT_START
→ result/status 수신
→ PIR LOW + visitor absent N frames
→ EVENT_END
→ 최종 result/Snapshot 수신
→ IDLE
```

Safety heartbeat는 위 Vision 상태와 무관하게 계속 동작해야 한다.

## 구현 보류 조건

다음 P0 항목이 정해지기 전에는 실제 pin과 SPI initialization source를 만들지 않는다.

- 사용할 ESP32-S3 DevKitC 정확한 보드 revision
- PIR 모델·전압·출력 특성
- Safety toggle/ack GPIO 핀
- SPI mode·clock·CS·DATA_READY 핀
- Vision register/packet version과 CRC
- event 종료 시간과 연속 미검출 frame 수

확정 전 숫자를 임의로 넣지 않는다. 로컬 Wi-Fi, 장치 키와 참가자 정보는 Git에 커밋하지 않는다.

## 현재 소스

- `include/door_hub_state.h`: 핀·통신 라이브러리와 무관한 event 상태 및 FPGA/Safety 결과 계약
- `src/door_hub_state.cpp`: 단조 증가 event id, 중복 start 억제, 과거 event result 거부, LED Safety 불변식

이 코드는 실제 GPIO나 SPI를 초기화하지 않는다. 보드 revision, pin, SPI mode, debounce와 종료 조건이 확정되면 이 상태 코어 바깥에 ESP-IDF/Arduino 어댑터를 붙인다.

## 첫 시험

첫 수직 통합은 actuator 대신 LED를 사용한다.

```text
PIR → event_id → FPGA Vision wake → result Serial 출력
App request → auth/request toggle → FPGA Safety decision → LED
```

실제 Solenoid/Servo는 MOSFET driver, external pulldown, flyback protection, 별도 전원과 E-stop ABORT가 측정된 이후에만 연결한다.
