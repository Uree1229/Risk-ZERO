# RISK-ZERO 소프트웨어 다이어그램

- 기준일: 2026-08-11
- 주제: 음성 도어락 제어의 시청각 발화 검증

| 문서 | 범위 |
| --- | --- |
| [Package Diagram](01-package-diagram.md) | Edge·모바일·웹 소스 패키지 |
| [Component Diagram](02-component-diagram.md) | 캡처·모델·정책·저장 컴포넌트 |
| [Domain/Class Diagram](03-domain-class-diagram.md) | challenge·요청·검증·게이트 도메인 |
| [Data Model ERD](04-data-model-erd.md) | 시청각 검증 핵심 DB 관계 |
| [Capture and Verification Sequence](05-sensor-ingest-sequence.md) | 발화부터 모형 제어까지 |
| [Module Sync Sequence](06-snapshot-sequence.md) | 영상·검증 저장과 ACK |
| [Deployment Diagram](07-deployment-diagram.md) | 현관 모듈·모바일·개발 웹 배치 |

각 문서는 PNG와 Mermaid 원본을 함께 둔다. 점선은 실제 모델, BLE/Wi-Fi 또는 개발용 대체 경로처럼 연결이 남은 경계다.
