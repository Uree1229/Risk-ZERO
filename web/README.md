# RISK-ZERO Web Monitor

음성 도어락 제어 요청의 시청각 검증 흐름을 시험하는 웹 MVP입니다.

## 화면

- `/`: PASS, 음성 재생, AV 싱크 불일치, 판단 불가 DEMO 모니터
- `/capture`: 브라우저 카메라·마이크 동시 녹화와 challenge 문구 수집 시험

`/capture`의 영상은 브라우저 메모리에만 있으며 서버나 검증 모델로 전송하지 않습니다. 결과 표시는 `모델 입력 준비`까지만 제공합니다.

## 코드

- `lib/domain.ts`: `av-verification/1` 도메인 타입
- `lib/demo-runtime.ts`: 결정론적 공격 시나리오 fixture
- `app/api/verification-attempts/`: 검증 결과 저장·조회 API
- `app/api/sensor-events/`: 후처리 이벤트 저장·조회 API
- `app/Dashboard.tsx`: 검증 모니터
- `app/capture/`: 카메라·마이크 수집 테스트
- `db/schema.ts`: D1 19개 테이블
- `drizzle/0003_amused_jubilee.sql`: 시청각 검증 테이블 마이그레이션
- `docs/api.md`: 요청 예시

실제 모델은 연결되어 있지 않습니다. `edge/risk_zero_av/models.py`의 어댑터 결과를 `POST /api/verification-attempts` 계약으로 보내는 방식으로 통합합니다.
