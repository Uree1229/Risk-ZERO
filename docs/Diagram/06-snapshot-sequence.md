# Snapshot Sequence Diagram

웹·모바일의 스냅샷 조회와 D1·메모리·모바일 fixture fallback 순서를 보여줍니다.

![RISK-ZERO Snapshot Sequence](06-snapshot-sequence.png)

## Mermaid 원본

```mermaid
sequenceDiagram
    actor User as 사용자
    participant Client as Web 또는 Mobile
    participant API as Snapshot API
    participant Repo as Data Repository
    participant DB as Cloudflare D1
    participant Demo as Demo Runtime
    participant Fixture as Mobile Fixture

    User->>Client: 시나리오 선택
    Client->>API: GET /api/snapshot?scenario=...

    API->>Repo: buildDatabaseSnapshot()
    Repo->>DB: 시연 incident·평가·장치 조회

    alt D1 조회 성공
        DB-->>Repo: 저장된 시연 데이터
        Repo-->>API: SystemSnapshot
    else D1 사용 불가
        API->>Demo: buildDemoSnapshot()
        Demo-->>API: 메모리 SystemSnapshot
    end

    API-->>Client: snapshot + 데이터 출처 헤더

    alt API 응답 성공
        Client-->>User: 위험 단계·센서값·대응 표시
    else 모바일 API 연결 실패
        Client->>Fixture: fallbackSnapshot()
        Fixture-->>Client: 내장 시연 데이터
        Client-->>User: fallback 상태 표시
    else 웹 요청 실패
        Client-->>User: 연결 오류 표시
    end
```

> [!IMPORTANT]
> fallback 데이터는 실제 현관 상태가 아니라 화면 확인용 시연 데이터입니다. 실제 운영 전에는 마지막 성공 시각과 연결 실패 상태를 명확하게 표시해야 합니다.
