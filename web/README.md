# RISK-ZERO Web Monitor

ESP32-CAM 현관 동선과 음성 도어락 제어 요청의 시청각 검증 흐름을 시험하는 웹 MVP입니다.

## 화면

- `/`: 6개 동선 DEMO 또는 로컬 Arty A7-100T HTTP 상태 연결
- `/av`: PASS, 음성 재생, AV 싱크 불일치, 판단 불가 시청각 검증 DEMO
- `/capture`: 브라우저 카메라·마이크 동시 녹화와 challenge 문구 수집 시험

`/capture`의 영상은 브라우저 메모리에만 있으며 서버나 검증 모델로 전송하지 않습니다. 결과 표시는 `모델 입력 준비`까지만 제공합니다.

## 코드

- `lib/domain.ts`: `av-verification/1` 도메인 타입
- `lib/trajectory-domain.ts`: `trajectory-observation/1` 동선 타입
- `lib/demo-runtime.ts`: 결정론적 공격 시나리오 fixture
- `lib/trajectory-demo.ts`: 결정론적 현관 동선 fixture
- `lib/fpga-motion.ts`: Arty `fpga-motion/1` 응답 검증과 화면 계약 변환
- `app/api/trajectory-snapshot/`: 웹 동선 시연 API
- `app/api/verification-attempts/`: 검증 결과 저장·조회 API
- `app/api/sensor-events/`: 후처리 이벤트 저장·조회 API
- `app/Dashboard.tsx`: 검증 모니터
- `app/capture/`: 카메라·마이크 수집 테스트
- `db/schema.ts`: D1 19개 테이블
- `drizzle/0003_amused_jubilee.sql`: 시청각 검증 테이블 마이그레이션
- `docs/api.md`: 요청 예시

Arty 연결 모드는 로컬 HTTP 페이지에서 같은 네트워크의 보드 IP를 직접 조회합니다. HTTPS로 배포된 화면에서는 브라우저의 mixed-content 정책 때문에 HTTP 보드에 연결할 수 없습니다. Arty 출력은 사람 분류가 아닌 움직임 후보 중심점입니다.
