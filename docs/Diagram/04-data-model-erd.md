# Data Model ERD

Cloudflare D1에 구현된 핵심 테이블과 사건·평가·피드백 관계를 보여줍니다.

![RISK-ZERO Data Model ERD](04-data-model-erd.png)

## Mermaid 원본

```mermaid
erDiagram
    USERS ||--o{ HOUSEHOLD_MEMBERS : joins
    HOUSEHOLDS ||--o{ HOUSEHOLD_MEMBERS : has
    HOUSEHOLDS ||--o{ DEVICES : owns
    HOUSEHOLDS ||--o{ VISIT_EXPECTATIONS : schedules
    HOUSEHOLDS ||--o{ INCIDENTS : contains

    DEVICES ||--o{ SENSOR_EVENTS : produces
    INCIDENTS o|--o{ SENSOR_EVENTS : groups
    SENSOR_EVENTS ||--o{ SENSOR_READINGS : contains

    INCIDENTS ||--o{ RISK_ASSESSMENTS : receives
    SENSOR_EVENTS o|--o{ RISK_ASSESSMENTS : triggers
    RISK_ENGINE_VERSIONS o|--o{ RISK_ASSESSMENTS : evaluates

    RISK_ASSESSMENTS ||--o{ RISK_FACTOR_OBSERVATIONS : explains
    INCIDENTS ||--o{ RESPONSE_ACTIONS : has
    RISK_ASSESSMENTS o|--o{ RESPONSE_ACTIONS : plans

    INCIDENTS ||--o{ INCIDENT_FEEDBACK : reviewed
    USERS o|--o{ INCIDENT_FEEDBACK : writes
    USERS o|--o{ RESPONSE_ACTIONS : receives

    HOUSEHOLDS o|--o{ AUDIT_LOGS : records
```

> [!NOTE]
> 새로운 센서는 DB 열을 추가하는 대신 `sensor_readings.metric` 행을 추가합니다. 위험도 엔진 결과는 버전별로 새 평가를 저장하며 기존 평가를 덮어쓰지 않는 구조입니다.
