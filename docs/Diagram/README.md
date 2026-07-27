# RISK-ZERO 소프트웨어 다이어그램

- 기준 구현: Mobile v0.2.0
- 갱신일: 2026-07-27

| 문서 | 범위 |
| --- | --- |
| [Package Diagram](01-package-diagram.md) | 웹·모바일 소스 패키지와 의존 관계 |
| [Component Diagram](02-component-diagram.md) | 하드웨어 입력, 모바일 저장·알림, 웹 API 컴포넌트 |
| [Domain/Class Diagram](03-domain-class-diagram.md) | 모듈·이벤트·평가·분류·알림 도메인 |
| [Data Model ERD](04-data-model-erd.md) | 모바일 SQLite v3 핵심 관계 |
| [Module Sync Sequence](05-sensor-ingest-sequence.md) | 영상·수치 저장, ACK, 알림 순서 |
| [Event View Sequence](06-snapshot-sequence.md) | API/fallback, SQLite 저장, 캘린더·상세 조회 |
| [Deployment Diagram](07-deployment-diagram.md) | 현관 모듈, 모바일 로컬 저장소, 웹 Worker·D1 배치 |

각 문서에는 PNG와 Mermaid 원본을 함께 둔다. PNG는 발표 자료에 바로 사용할 수 있고 Mermaid는 구조가 바뀔 때 수정한다.

## 표기 기준

- 실선: 현재 코드에 있는 직접 호출 또는 데이터 흐름
- 점선: 교체 가능한 구현, fallback 또는 아직 연결하지 않은 경계
- `DEMO`: 고정 시연 데이터
- `pending`: 위험도 계산식이 연결되지 않은 실제 이벤트

실제 BLE/Wi-Fi 어댑터, 검증된 위험도 엔진, 원격 보호자 푸시, 사용자·장치 인증은 아직 구현하지 않았다.
