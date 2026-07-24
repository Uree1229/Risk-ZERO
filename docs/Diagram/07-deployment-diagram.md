# Deployment Diagram

현관 센서, 웹 브라우저, Expo 모바일 앱과 Sites·Cloudflare Worker·D1의 배치 관계를 보여줍니다.

![RISK-ZERO Deployment Diagram](07-deployment-diagram.png)

## Mermaid 원본

```mermaid
flowchart TB
    subgraph Devices["사용자·장치 환경"]
        SensorDevice["현관 센서 장치<br/>HTTP / 향후 MQTT·BLE"]
        Browser["웹 브라우저"]
        Phone["모바일 기기<br/>Expo 앱"]
    end

    subgraph Hosting["Sites / Cloudflare 실행 환경"]
        Worker["vinext Cloudflare Worker"]
        Router["Next App Router"]
        WebUI["Dashboard"]
        APIs["REST API Routes"]
        ImageRuntime["Assets / Image Runtime"]
        D1[("Cloudflare D1<br/>DB binding")]
    end

    SensorDevice -->|"HTTPS POST<br/>sensor-events"| Worker
    Browser -->|"HTTPS"| Worker
    Phone -->|"EXPO_PUBLIC_API_BASE_URL"| Worker

    Worker --> Router
    Worker --> ImageRuntime
    Router --> WebUI
    Router --> APIs
    APIs --> D1

    WebUI -->|"브라우저 API 요청"| APIs
```

> [!NOTE]
> `.openai/hosting.json`은 D1 binding 이름을 `DB`로 지정합니다. 실제 센서와 모바일 앱은 배포된 Worker의 HTTPS API 주소를 사용해야 합니다.
