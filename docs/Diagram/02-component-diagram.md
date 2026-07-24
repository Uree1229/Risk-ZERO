# Component Diagram

센서 입력부터 DB 저장, 웹·모바일 모니터링과 데모 fallback까지의 실행 컴포넌트를 보여줍니다.

![RISK-ZERO Component Diagram](02-component-diagram.png)

## Mermaid 원본

```mermaid
flowchart LR
    Sensor["외부 센서·게이트웨이"]
    Browser["웹 브라우저"]
    Mobile["모바일 MVP"]

    subgraph RiskZero["RISK-ZERO 시스템"]
        SensorController["센서 이벤트 API"]
        Validator["Payload Validator"]
        IncidentController["사건·장치 API"]
        FeedbackController["피드백 API"]
        SnapshotController["Snapshot API"]

        Repository["Data Repository"]
        D1[("Cloudflare D1")]

        DemoGateway["DemoSensorGateway"]
        DemoEngine["DemoPassThroughRiskEngine"]
        Dashboard["Web Dashboard"]
        MobileFallback["Mobile Fixture"]
        RiskInterface["RiskEngine Interface"]
    end

    Sensor -->|"POST /api/sensor-events"| SensorController
    SensorController --> Validator
    Validator --> Repository

    Browser --> Dashboard
    Dashboard -->|"GET /api/snapshot"| SnapshotController
    Mobile -->|"GET /api/snapshot"| SnapshotController

    Browser --> IncidentController
    Browser --> FeedbackController

    IncidentController --> Repository
    FeedbackController --> Repository
    SnapshotController --> Repository
    Repository --> D1

    SnapshotController -. "D1 사용 불가" .-> DemoGateway
    DemoGateway --> DemoEngine
    DemoEngine --> SnapshotController

    Mobile -. "API 연결 실패" .-> MobileFallback
    RiskInterface -. "실제 구현체 미정" .-> Repository
```

> [!IMPORTANT]
> 실제 센서 사건은 DB에 저장되지만 활성 위험도 엔진이 없어 `pending`으로 남습니다. 현재 점수는 `DemoPassThroughRiskEngine`의 고정 시연 값입니다.
