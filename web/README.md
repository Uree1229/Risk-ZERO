# RISK-ZERO Web Monitor

ESP32-S3 Door Hub가 중계한 FPGA Vision·Safety 결과를 확인하고 저장하는 웹 MVP입니다. 이전 동선·시청각 검증 화면은 비교 시험용으로 유지합니다.

## 화면

- `/`: Door Hub 이벤트·Vision 수치·Safety 상태, D1 API 또는 DEMO
- `/trajectory`: 이전 6개 동선 DEMO와 로컬 Arty HTTP 참고 화면
- `/av`: PASS, 음성 재생, AV 싱크 불일치, 판단 불가 시청각 검증 DEMO
- `/capture`: 브라우저 카메라·마이크 동시 녹화와 challenge 문구 수집 시험

`/capture`의 영상은 브라우저 메모리에만 있으며 서버나 검증 모델로 전송하지 않습니다. 결과 표시는 `모델 입력 준비`까지만 제공합니다.

## 코드

- `lib/domain.ts`: `av-verification/1` 도메인 타입
- `lib/door-hub-domain.ts`: `door-hub-event/1` 도메인 타입
- `lib/trajectory-domain.ts`: `trajectory-observation/1` 동선 타입
- `lib/demo-runtime.ts`: 결정론적 공격 시나리오 fixture
- `lib/trajectory-demo.ts`: 결정론적 현관 동선 fixture
- `lib/fpga-motion.ts`: Arty `fpga-motion/1` 응답 검증과 화면 계약 변환
- `app/api/trajectory-snapshot/`: 웹 동선 시연 API
- `app/api/door-hub-events/`: Door Hub 결과 D1 조회·upsert API
- `app/api/verification-attempts/`: 검증 결과 저장·조회 API
- `app/api/sensor-events/`: 후처리 이벤트 저장·조회 API
- `app/DoorHubMonitor.tsx`: 기본 Door Hub 모니터
- `app/Dashboard.tsx`: 이전 시청각 검증 모니터
- `app/capture/`: 카메라·마이크 수집 테스트
- `db/schema.ts`: D1 20개 테이블
- `drizzle/0004_burly_mystique.sql`: Door Hub 결과와 DEMO seed 마이그레이션
- `drizzle/0003_amused_jubilee.sql`: 시청각 검증 테이블 마이그레이션
- `docs/api.md`: 요청 예시

기본 화면은 브라우저가 Arty IP를 직접 조회하지 않습니다. 실제 연결에서는 Door Hub가 `POST /api/door-hub-events`로 FPGA 후처리 결과를 보내고 웹·모바일이 API를 조회합니다. `/trajectory`의 직접 Arty 연결은 이전 개발 경로로만 남겨뒀습니다.
