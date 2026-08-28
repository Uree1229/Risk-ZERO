# RISK-ZERO Door Hub 소프트웨어 설계

- 기준일: 2026-08-28
- 대상: ESP32-S3 Door Hub + Arty A7-100T + 웹·모바일 MVP
- 데이터 계약: `door-hub-event/1`

## 처리 흐름

```text
PIR event
→ ESP32-S3 Door Hub가 event_id 부여
→ Arty Vision wake / Camera capture
→ FPGA가 방문자·구역·체류·배경 변경·Snapshot 상태 계산
→ FPGA Safety Domain이 별도로 NONE/ALLOW/BLOCK/ABORT 판정
→ Door Hub가 두 결과를 같은 event_id로 묶음
→ POST /api/door-hub-events
→ D1 저장
→ 웹·모바일 조회
```

웹이나 모바일이 FPGA IP를 직접 조회하거나 액추에이터를 직접 켜는 경로는 현재 구조에서 사용하지 않는다. 첫 통합 출력은 `led`만 허용한다.

## 데이터 계약

| 영역 | 내용 |
| --- | --- |
| `session` | 단조 증가 `eventId`, PIR 상태, 단계, 시작·종료 시각 |
| `vision` | 방문자 존재, 객체 수, 3×3 구역, 체류, 배경 변경, Snapshot 메타데이터 |
| `safety` | heartbeat, auth, 직접 입력, NONE/ALLOW/BLOCK/ABORT, LED 출력 |

위험도 점수는 넣지 않았다. 현재 FPGA와 Safety가 만든 수치를 원본 의미 그대로 저장하며, 위험도 계산 로직은 나중에 별도 정책 계층으로 추가한다.

## 구현 위치

| 경로 | 구현 내용 |
| --- | --- |
| `firmware/door-hub/include`, `src` | 핀과 통신에서 독립된 event 상태 코어 |
| `edge/risk_zero_door_hub` | payload 기준 구현, event 상관관계와 stale result 거부 |
| `web/lib/door-hub-domain.ts` | 웹 도메인 타입과 이벤트 요약 |
| `web/app/api/door-hub-events` | D1 조회·upsert API |
| `web/db/schema.ts` | `door_hub_events` 테이블 |
| `web/app/DoorHubMonitor.tsx` | Door Hub 최신 상태·Vision 수치·Safety 상태 화면 |
| `mobile/src/door-hub.ts` | API 레코드와 모바일 이벤트 변환 |
| `mobile/src/storage` | SQLite v5 Door Hub 이벤트·사용자 검토 저장 |

## 안전 불변식

- `outputTarget`은 첫 통합에서 `led`만 허용한다.
- `outputActive=true`는 Safety 결정이 `allow`일 때만 허용한다.
- Tamper, E-stop 또는 fault latch가 있으면 LED 활성 상태를 거부한다.
- Door Hub는 현재 활성 `event_id`와 다른 FPGA 결과를 폐기한다.
- Vision 결과만으로 Safety 출력을 만들지 않는다.

## DEMO와 실제 입력 구분

웹·모바일은 API에 데이터가 없거나 연결할 수 없으면 결정론적 DEMO를 표시한다. 화면 상단에 `DEMO` 또는 `API`를 표시한다. D1 migration에는 캘린더·목록 동작을 확인할 Door Hub 이벤트 3개가 들어 있다.

## 남은 연결 작업

1. PIR 모델과 debounce·event 종료 조건 확정
2. Door Hub 보드 revision과 GPIO 확정
3. FPGA Vision SPI packet·CRC·DATA_READY 확정
4. `door_hub_state`를 ESP-IDF/Arduino GPIO·SPI·Wi-Fi 어댑터에 연결
5. Camera·Arty 실측 결과를 API로 송신
6. Snapshot 실제 파일 저장 위치 확정
7. LED 수직 통합 후에만 실제 actuator 검토

현재 소스는 소프트웨어 계약과 DEMO/API/DB 흐름까지 검증한 상태다. 실제 핀, SPI timing, Vivado 합성, 카메라와 보드 실측은 완료된 것으로 보지 않는다.
