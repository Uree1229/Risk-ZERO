# Data Model ERD

모바일 SQLite schema v3의 12개 앱 데이터 테이블 관계를 보여줍니다. 별도의 `schema_migrations` 테이블까지 포함하면 총 13개입니다.

![RISK-ZERO Data Model ERD](04-data-model-erd.png)

## Mermaid 원본

```mermaid
erDiagram
    DEVICES ||--o{ INCIDENTS : contains
    DEVICES ||--o{ SENSOR_EVENTS : produces
    DEVICES ||--o| DEVICE_STATUS : reports
    DEVICES ||--o| SYNC_STATES : syncs

    INCIDENTS ||--o{ SENSOR_EVENTS : groups
    SENSOR_EVENTS ||--o{ SENSOR_READINGS : contains
    SENSOR_EVENTS ||--o| PROCESSED_VIDEOS : has
    SENSOR_EVENTS ||--o| EVENT_REVIEWS : reviewed
    SENSOR_EVENTS ||--o| NOTIFICATION_DELIVERIES : notifies

    INCIDENTS ||--o{ RISK_ASSESSMENTS : receives
    SENSOR_EVENTS ||--o{ RISK_ASSESSMENTS : triggers
    INCIDENTS ||--o{ RESPONSE_ACTIONS : has
    RISK_ASSESSMENTS o|--o{ RESPONSE_ACTIONS : plans
```

새 센서는 `sensor_readings.metric` 행으로 확장합니다. 영상 파일은 DB 밖에 두고 `processed_videos.local_uri`만 저장합니다. 장치 삭제 시 외래키 cascade와 파일 정리를 함께 실행합니다.
