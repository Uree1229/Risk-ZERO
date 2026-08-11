# RISK-ZERO Edge Verifier

카메라·마이크 처리 계층과 문 모형 사이에 두는 시청각 검증 게이트의 기준 구현입니다. 현재 저장소에는 SyncNet·TalkNet 가중치와 실제 장치 드라이버가 없으므로, 정책·challenge·재전송 방지·fail-closed 동작을 결정론적 데모 증거로 검증합니다.

## 실행

외부 패키지 없이 실행할 수 있습니다.

```powershell
python -m edge.risk_zero_av --scenario live-pass
python -m edge.risk_zero_av --scenario audio-replay
python -m unittest discover -s edge/tests
```

## 수집 파일 확인

웹 `/capture`에서 내려받은 영상과 JSON을 같은 폴더에 둔 뒤 JSON 경로를 지정합니다.

```powershell
python -m edge.risk_zero_av --check-capture C:\capture\risk-zero_example.json
python -m edge.risk_zero_av --demo-sync C:\capture\risk-zero_example.json
python -m edge.risk_zero_av --index-dataset C:\capture --output C:\capture\dataset-index.json
```

`--check-capture`는 스키마, 파일명, 영상 존재 여부, 파일 크기와 촬영 시간을 검사합니다. `--demo-sync`는 같은 검사를 마친 뒤 `DemoAVSyncModelAdapter`의 고정값을 출력해 연결 흐름만 확인합니다. 이 값은 영상을 분석한 결과가 아니며 최종 PASS/BLOCK 판정을 만들지 않습니다.

`--index-dataset`은 하위 폴더의 `risk-zero_*.json`을 검사하고 유효한 촬영 쌍, 오류, 참여자 수와 시나리오별 개수를 정리합니다. 인덱스에는 원본 영상 내용과 컴퓨터의 절대경로를 넣지 않습니다. 자동 검사에서 오류가 하나라도 있을 때 실패 처리하려면 `--strict`를 추가합니다.

## 실제 모델 연결

`models.py`의 `CaptureAdapter`, `AVSyncModelAdapter`, `ActiveSpeakerModelAdapter`, `AudioSpoofModelAdapter`를 구현합니다. `DemoAVSyncModelAdapter`는 실제 구현 위치를 보여주는 연결 시험용이며 제품 코드에서 사용할 수 없습니다. 모델 구현은 `AnalysisEvidence`만 반환하며 문 제어 여부는 결정하지 않습니다. 최종 판정과 출력은 `VerificationPolicy`와 `ActuationGate`가 담당합니다.

처리 순서는 다음과 같습니다.

1. 같은 캡처 세션에서 영상·음성 타임스탬프 기록
2. 얼굴·입술 ROI와 발화 구간 추출
3. SyncNet·TalkNet·음성 위조 탐지 결과를 `AnalysisEvidence`로 정규화
4. challenge, nonce, 만료시간과 분석값을 정책 게이트에서 평가
5. `PASS`이고 유효한 요청만 문 모형 펄스 허용
6. 모바일에는 결과 수치와 후처리 영상 경로만 전달

실제 주거지 도어락에는 연결하지 않습니다.
