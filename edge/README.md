# RISK-ZERO Edge Verifier

카메라·마이크 처리 계층과 문 모형 사이에 두는 시청각 검증 게이트의 기준 구현입니다. 현재 저장소에는 SyncNet·TalkNet 가중치와 실제 장치 드라이버가 없으므로, 정책·challenge·재전송 방지·fail-closed 동작을 결정론적 데모 증거로 검증합니다.

## 실행

외부 패키지 없이 실행할 수 있습니다.

```powershell
python -m edge.risk_zero_av --scenario live-pass
python -m edge.risk_zero_av --scenario audio-replay
python -m unittest discover -s edge/tests
```

## 실제 모델 연결

`models.py`의 `CaptureAdapter`, `AVSyncModelAdapter`, `ActiveSpeakerModelAdapter`, `AudioSpoofModelAdapter`를 구현합니다. 모델 구현은 `AnalysisEvidence`만 반환하며 문 제어 여부는 결정하지 않습니다. 최종 판정과 출력은 `VerificationPolicy`와 `ActuationGate`가 담당합니다.

처리 순서는 다음과 같습니다.

1. 같은 캡처 세션에서 영상·음성 타임스탬프 기록
2. 얼굴·입술 ROI와 발화 구간 추출
3. SyncNet·TalkNet·음성 위조 탐지 결과를 `AnalysisEvidence`로 정규화
4. challenge, nonce, 만료시간과 분석값을 정책 게이트에서 평가
5. `PASS`이고 유효한 요청만 문 모형 펄스 허용
6. 모바일에는 결과 수치와 후처리 영상 경로만 전달

실제 주거지 도어락에는 연결하지 않습니다.
