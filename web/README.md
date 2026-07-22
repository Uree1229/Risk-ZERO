# RISK-ZERO Web Monitor

센서가 연결되기 전 고정된 시나리오로 데이터 흐름과 모니터링 UI를 검증하는 웹 MVP입니다.

## 핵심 파일

- `lib/domain.ts`: 센서 이벤트, 위험도 결과, 대응 계획 인터페이스
- `lib/demo-runtime.ts`: 계산식 없이 고정 결과만 전달하는 더미 런타임
- `app/api/snapshot/route.ts`: 웹·모바일 공용 스냅샷 API
- `app/api/sensor-events/route.ts`: 센서 이벤트 수신·조회 API
- `app/api/incidents/`: 사건 목록·상세·보호자 피드백 API
- `app/Dashboard.tsx`: 시나리오 제어와 모니터링 화면
- `db/schema.ts`: 센서·사고·위험 평가·대응 이력 D1 스키마
- `db/data-repository.ts`: 준비된 SQL을 사용하는 D1 저장·조회 계층
- `drizzle/`: 배포 가능한 SQLite/D1 마이그레이션
- `docs/api.md`: 센서 전송 예시와 API 명세

위험도 로직을 구현할 때는 `RiskEngine`의 새 구현체를 만들고 조립부에서 `DemoPassThroughRiskEngine` 대신 주입하세요.

데이터베이스 구조와 보존 정책은 상위 프로젝트의 `docs/database-design.md`에 정리되어 있습니다. 웹·모바일 스냅샷은 D1의 시연 데이터를 우선 사용하고, 로컬 DB가 준비되지 않았을 때만 기존 메모리 더미로 전환됩니다.
