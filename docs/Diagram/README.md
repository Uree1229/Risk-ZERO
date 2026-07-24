# RISK-ZERO 소프트웨어 다이어그램

현재 구현된 웹·모바일·API·DB·도메인 인터페이스를 기준으로 작성한 다이어그램입니다. 각 문서에는 GitHub에서 바로 볼 수 있는 PNG와 수정 가능한 Mermaid 원본이 함께 들어 있습니다.

| 번호 | 다이어그램 | 이미지 | 설명 |
| --- | --- | --- | --- |
| 01 | [Package Diagram](01-package-diagram.md) | [PNG](01-package-diagram.png) | 소스 폴더와 패키지 의존 관계 |
| 02 | [Component Diagram](02-component-diagram.md) | [PNG](02-component-diagram.png) | 실행 컴포넌트와 대체 경로 |
| 03 | [Domain/Class Diagram](03-domain-class-diagram.md) | [PNG](03-domain-class-diagram.png) | 도메인 객체와 TypeScript 인터페이스 |
| 04 | [Data Model ERD](04-data-model-erd.md) | [PNG](04-data-model-erd.png) | D1 핵심 테이블 관계 |
| 05 | [Sensor Ingest Sequence](05-sensor-ingest-sequence.md) | [PNG](05-sensor-ingest-sequence.png) | 센서 이벤트 저장·중복 처리 흐름 |
| 06 | [Snapshot Sequence](06-snapshot-sequence.md) | [PNG](06-snapshot-sequence.png) | 웹·모바일 모니터링과 fallback 흐름 |
| 07 | [Deployment Diagram](07-deployment-diagram.md) | [PNG](07-deployment-diagram.png) | 장치, 클라이언트, Worker, D1 배치 |

## 표기 기준

- 실선: 현재 코드에서 호출하거나 저장하는 관계
- 점선: fallback 또는 인터페이스만 있고 실제 구현이 없는 관계
- `DEMO`: 고정 시나리오 데이터
- `pending`: 실제 위험도 계산 로직이 없어 평가를 보류한 상태
